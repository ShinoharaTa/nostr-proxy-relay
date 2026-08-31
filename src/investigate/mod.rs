//! イベント調査（Issue #31）。
//!
//! 方針: **証跡を保存しない**。調査を実行したその場で上流リレーへ REQ を投げ、
//! 集めたイベントをメモリ内で解析し、結果を返したら破棄する。
//! ストレージレス設計（イベント本文を持たない）を崩さないための選択。
//!
//! 得られないもの:
//! - **IP はリレー応答からは分からない**（Nostr イベントに IP は含まれない）。
//!   IP 相関は自分の `event_rejection_logs` と突き合わせて補う（`local` フィールド）。
//! - 上流が既に削除・期限切れにしたイベントは取れない。

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use crate::nostr::event::Event;
use crate::relay_pool::RelayPool;

/// 1 リレーあたりの収集上限。異常な量を返す上流から自衛する。
const MAX_EVENTS_PER_RELAY: usize = 1000;
/// タイムアウトの上限（UI から極端な値を渡されても伸ばさない）。
const MAX_TIMEOUT_MS: u64 = 20_000;

#[derive(Debug, Deserialize)]
pub struct InvestigateRequest {
    #[serde(default)]
    pub ids: Vec<String>,
    #[serde(default)]
    pub authors: Vec<String>,
    #[serde(default)]
    pub kinds: Vec<i64>,
    #[serde(default)]
    pub since: Option<i64>,
    #[serde(default)]
    pub limit: Option<usize>,
    /// 省略時は接続中のリレー全部
    #[serde(default)]
    pub relays: Vec<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

impl InvestigateRequest {
    /// NIP-01 のフィルタ JSON を組み立てる。
    pub fn to_filter(&self) -> serde_json::Value {
        let mut f = serde_json::Map::new();
        if !self.ids.is_empty() {
            f.insert("ids".into(), serde_json::json!(self.ids));
        }
        if !self.authors.is_empty() {
            f.insert("authors".into(), serde_json::json!(self.authors));
        }
        if !self.kinds.is_empty() {
            f.insert("kinds".into(), serde_json::json!(self.kinds));
        }
        if let Some(since) = self.since {
            f.insert("since".into(), serde_json::json!(since));
        }
        f.insert(
            "limit".into(),
            serde_json::json!(self.limit.unwrap_or(200).min(MAX_EVENTS_PER_RELAY)),
        );
        serde_json::Value::Object(f)
    }

    pub fn is_empty(&self) -> bool {
        self.ids.is_empty() && self.authors.is_empty() && self.kinds.is_empty()
    }
}

/// 収集した 1 件。同じイベントが複数リレーから来るので `relays` は集合。
#[derive(Debug, Clone)]
pub struct CollectedEvent {
    pub event: Event,
    pub relays: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct RelayStat {
    pub url: String,
    pub count: usize,
    pub latency_ms: u64,
    /// EOSE を受け取れたか（false ならタイムアウト打ち切り）
    pub completed: bool,
}

#[derive(Debug, Serialize)]
pub struct Counted {
    pub value: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct TagStat {
    pub name: String,
    pub value: String,
    pub count: usize,
    /// 全件に対する網羅率 0.0〜1.0
    pub coverage: f64,
}

#[derive(Debug, Serialize)]
pub struct TimingStat {
    /// 最古〜最新の秒数
    pub span_secs: i64,
    /// 連続イベントの間隔の中央値（秒）
    pub median_interval_secs: i64,
    /// 間隔がどれだけ均一か 0.0〜1.0（1.0 に近いほど機械的）
    pub regularity: f64,
}

#[derive(Debug, Serialize)]
pub struct Verdict {
    /// single_npub / throwaway_keys / duplicate_content / common_tag / single_relay / machine_timing
    pub kind: &'static str,
    pub confidence: &'static str,
    pub detail: String,
    /// そのまま Quick BAN / DSL へ渡せる形の提案（人間の確認とドライランを必ず経る）
    pub suggested_rule: Option<serde_json::Value>,
}

/// 調査結果として返す 1 イベント。**保存はしない**（レスポンスに乗せるだけ）。
/// content 本文は返さず、同一性判定用のハッシュ先頭だけを返す。
#[derive(Debug, Serialize)]
pub struct EventRow {
    pub id: String,
    pub pubkey: String,
    pub kind: i64,
    pub created_at: i64,
    /// このイベントを返した上流リレー
    pub relays: Vec<String>,
    /// content SHA-256 の先頭 16 文字（同一内容のグルーピング用）
    pub content_hash: String,
    pub content_len: usize,
    pub tag_count: usize,
}

#[derive(Debug, Serialize)]
pub struct Analysis {
    pub fetched: usize,
    pub unique_events: usize,
    pub by_relay: Vec<RelayStat>,
    pub authors_unique: usize,
    pub top_authors: Vec<Counted>,
    /// 投稿者ごとの出現回数（全件）。UI 側でソート・絞り込みして使う
    pub author_counts: Vec<Counted>,
    /// 取得したイベント一覧（新しい順）
    pub events: Vec<EventRow>,
    pub content_unique: usize,
    pub top_contents: Vec<Counted>,
    pub common_tags: Vec<TagStat>,
    pub timing: Option<TimingStat>,
    pub verdicts: Vec<Verdict>,
}

/// 各リレーへ並列に REQ を投げてイベントを集める。
/// 収集は EOSE か timeout のどちらか早い方で打ち切る。
pub async fn collect(
    relay_pool: &Arc<RelayPool>,
    urls: &[String],
    filter: serde_json::Value,
    timeout_ms: u64,
) -> (Vec<CollectedEvent>, Vec<RelayStat>) {
    let timeout = Duration::from_millis(timeout_ms.min(MAX_TIMEOUT_MS));
    let mut tasks = Vec::new();

    for url in urls {
        let url = url.clone();
        let pool = Arc::clone(relay_pool);
        let filter = filter.clone();
        tasks.push(tokio::spawn(async move {
            collect_from_relay(pool, url, filter, timeout).await
        }));
    }

    // event_id -> (Event, 返してきたリレー)
    let mut merged: HashMap<String, CollectedEvent> = HashMap::new();
    let mut stats = Vec::new();

    for task in tasks {
        let Ok((url, events, latency_ms, completed)) = task.await else {
            continue;
        };
        stats.push(RelayStat {
            url: url.clone(),
            count: events.len(),
            latency_ms,
            completed,
        });
        for ev in events {
            merged
                .entry(ev.id.clone())
                .and_modify(|c| {
                    if !c.relays.contains(&url) {
                        c.relays.push(url.clone());
                    }
                })
                .or_insert_with(|| CollectedEvent {
                    event: ev,
                    relays: vec![url.clone()],
                });
        }
    }

    stats.sort_by(|a, b| b.count.cmp(&a.count));
    let mut out: Vec<CollectedEvent> = merged.into_values().collect();
    out.sort_by_key(|c| c.event.created_at);
    (out, stats)
}

async fn collect_from_relay(
    pool: Arc<RelayPool>,
    url: String,
    filter: serde_json::Value,
    timeout: Duration,
) -> (String, Vec<Event>, u64, bool) {
    let started = std::time::Instant::now();
    // 購読を先に張ってから REQ を送る（先に送ると応答を取りこぼす）
    let Some(mut rx) = pool.subscribe(&url).await else {
        return (url, Vec::new(), 0, false);
    };
    let sub_id = format!("investigate-{}", uuid::Uuid::new_v4());
    pool.send(&url, serde_json::json!(["REQ", sub_id, filter]).to_string())
        .await;

    let mut events = Vec::new();
    let mut completed = false;
    let deadline = tokio::time::Instant::now() + timeout;

    loop {
        let recv = tokio::time::timeout_at(deadline, rx.recv()).await;
        let Ok(Ok(text)) = recv else {
            break; // タイムアウト or チャネル終了
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        let Some(arr) = v.as_array() else { continue };
        // 自分の sub_id 宛だけを拾う（同じリレーの他購読と混ざるため）
        if arr.get(1).and_then(|s| s.as_str()) != Some(sub_id.as_str()) {
            continue;
        }
        match arr.first().and_then(|s| s.as_str()) {
            Some("EVENT") => {
                if let Some(ev) = arr.get(2).and_then(|e| serde_json::from_value::<Event>(e.clone()).ok()) {
                    events.push(ev);
                    if events.len() >= MAX_EVENTS_PER_RELAY {
                        break;
                    }
                }
            }
            Some("EOSE") | Some("CLOSED") => {
                completed = true;
                break;
            }
            _ => {}
        }
    }

    pool.send(&url, serde_json::json!(["CLOSE", sub_id]).to_string())
        .await;
    (url, events, started.elapsed().as_millis() as u64, completed)
}

fn top_n(counts: HashMap<String, usize>, n: usize) -> Vec<Counted> {
    let mut v: Vec<Counted> = counts
        .into_iter()
        .map(|(value, count)| Counted { value, count })
        .collect();
    v.sort_by(|a, b| b.count.cmp(&a.count).then(a.value.cmp(&b.value)));
    v.truncate(n);
    v
}

/// 集めたイベント群からパターンを判定する。
pub fn analyze(collected: &[CollectedEvent], stats: Vec<RelayStat>) -> Analysis {
    let total = collected.len();

    let mut authors: HashMap<String, usize> = HashMap::new();
    let mut contents: HashMap<String, usize> = HashMap::new();
    let mut tags: HashMap<(String, String), usize> = HashMap::new();
    let mut times: Vec<i64> = Vec::with_capacity(total);

    for c in collected {
        *authors.entry(c.event.pubkey.clone()).or_default() += 1;
        let mut h = Sha256::new();
        h.update(c.event.content.as_bytes());
        *contents.entry(hex::encode(h.finalize())).or_default() += 1;
        times.push(c.event.created_at);
        // 同一イベント内の重複タグは 1 回として数える
        let mut seen = std::collections::HashSet::new();
        for t in &c.event.tags {
            let (Some(name), Some(value)) = (t.first(), t.get(1)) else { continue };
            if seen.insert((name.clone(), value.clone())) {
                *tags.entry((name.clone(), value.clone())).or_default() += 1;
            }
        }
    }

    let authors_unique = authors.len();
    let content_unique = contents.len();
    let top_authors = top_n(authors.clone(), 5);
    let top_contents = top_n(contents.clone(), 5);
    // 全件の重複回数（上位 5 件だけでは「この npub が何回出たか」を追えないため）
    let author_counts = top_n(authors.clone(), usize::MAX);

    // イベント一覧（新しい順）。本文は返さずハッシュ先頭のみ
    let mut events: Vec<EventRow> = collected
        .iter()
        .map(|c| {
            let mut h = Sha256::new();
            h.update(c.event.content.as_bytes());
            let hash = hex::encode(h.finalize());
            EventRow {
                id: c.event.id.clone(),
                pubkey: c.event.pubkey.clone(),
                kind: c.event.kind,
                created_at: c.event.created_at,
                relays: c.relays.clone(),
                content_hash: hash[..16].to_string(),
                content_len: c.event.content.chars().count(),
                tag_count: c.event.tags.len(),
            }
        })
        .collect();
    events.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    // 網羅率 50% 以上のタグだけを「共通タグ」として出す
    let mut common_tags: Vec<TagStat> = tags
        .into_iter()
        .filter(|(_, c)| total > 0 && (*c as f64 / total as f64) >= 0.5)
        .map(|((name, value), count)| TagStat {
            name,
            value,
            count,
            coverage: count as f64 / total as f64,
        })
        .collect();
    common_tags.sort_by(|a, b| b.count.cmp(&a.count));
    common_tags.truncate(10);

    let timing = compute_timing(&mut times);
    let verdicts = build_verdicts(total, authors_unique, &top_authors, content_unique, &top_contents, &common_tags, &stats, &timing);

    Analysis {
        fetched: total,
        unique_events: total,
        by_relay: stats,
        authors_unique,
        top_authors,
        author_counts,
        events,
        content_unique,
        top_contents,
        common_tags,
        timing,
        verdicts,
    }
}

fn compute_timing(times: &mut Vec<i64>) -> Option<TimingStat> {
    if times.len() < 3 {
        return None;
    }
    times.sort_unstable();
    let span = times[times.len() - 1] - times[0];
    let mut intervals: Vec<i64> = times.windows(2).map(|w| w[1] - w[0]).collect();
    intervals.sort_unstable();
    let median = intervals[intervals.len() / 2];
    // 中央値と等しい間隔がどれだけ多いか = 機械的な均一さ
    let same = intervals.iter().filter(|i| **i == median).count();
    Some(TimingStat {
        span_secs: span,
        median_interval_secs: median,
        regularity: same as f64 / intervals.len() as f64,
    })
}

#[allow(clippy::too_many_arguments)]
fn build_verdicts(
    total: usize,
    authors_unique: usize,
    top_authors: &[Counted],
    content_unique: usize,
    top_contents: &[Counted],
    common_tags: &[TagStat],
    stats: &[RelayStat],
    timing: &Option<TimingStat>,
) -> Vec<Verdict> {
    let mut out = Vec::new();
    if total == 0 {
        return out;
    }

    // 単一 npub に集中
    if let Some(top) = top_authors.first() {
        let share = top.count as f64 / total as f64;
        if share >= 0.8 && authors_unique <= 2 {
            out.push(Verdict {
                kind: "single_npub",
                confidence: if share >= 0.95 { "high" } else { "medium" },
                detail: format!("{} 件中 {} 件（{:.0}%）が単一の pubkey から", total, top.count, share * 100.0),
                suggested_rule: Some(serde_json::json!({
                    "rule_type": "npub", "npub_list": [top.value], "apply_to_post": true, "apply_to_backend": true
                })),
            });
        }
    }

    // 捨て鍵パターン: 投稿者はばらけているのに内容が使い回されている
    let author_spread = authors_unique as f64 / total as f64;
    if author_spread >= 0.7 && content_unique <= (total / 4).max(1) {
        out.push(Verdict {
            kind: "throwaway_keys",
            confidence: "high",
            detail: format!(
                "pubkey は {} 種類とばらけているが、content は {} 種類しかない（使い回し）。捨て鍵スパムの典型",
                authors_unique, content_unique
            ),
            suggested_rule: None,
        });
    }

    // 同一内容の連投
    if let Some(top) = top_contents.first() {
        let share = top.count as f64 / total as f64;
        if share >= 0.5 && total >= 5 {
            out.push(Verdict {
                kind: "duplicate_content",
                confidence: if share >= 0.8 { "high" } else { "medium" },
                detail: format!("同一 content が {} 件（{:.0}%）。自動ガードの重複検知が有効", top.count, share * 100.0),
                suggested_rule: None,
            });
        }
    }

    // 共通タグ
    if let Some(tag) = common_tags.iter().find(|t| t.coverage >= 0.9) {
        out.push(Verdict {
            kind: "common_tag",
            confidence: "high",
            detail: format!(
                "全体の {:.0}% が タグ {}={} を持つ。タグ条件で一括ブロックできる",
                tag.coverage * 100.0, tag.name, tag.value
            ),
            suggested_rule: Some(serde_json::json!({
                "rule_type": "tag_contains", "tag_name": tag.name, "tag_value_pattern": tag.value,
                "apply_to_post": true, "apply_to_backend": true
            })),
        });
    }

    // 特定リレーだけが持っている
    let responded: Vec<&RelayStat> = stats.iter().filter(|s| s.count > 0).collect();
    if responded.len() == 1 && stats.len() > 1 {
        out.push(Verdict {
            kind: "single_relay",
            confidence: "medium",
            detail: format!("{} だけが返した。この上流に固有の流入", responded[0].url),
            suggested_rule: None,
        });
    }

    // 機械的な等間隔
    if let Some(t) = timing {
        if t.regularity >= 0.6 && t.median_interval_secs <= 60 && total >= 5 {
            out.push(Verdict {
                kind: "machine_timing",
                confidence: "medium",
                detail: format!(
                    "投稿間隔の {:.0}% が {} 秒で一定。人手ではなく自動投稿の可能性が高い",
                    t.regularity * 100.0, t.median_interval_secs
                ),
                suggested_rule: None,
            });
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(id: &str, pubkey: &str, content: &str, created_at: i64, tags: Vec<Vec<String>>) -> CollectedEvent {
        CollectedEvent {
            event: Event {
                id: id.into(),
                pubkey: pubkey.into(),
                created_at,
                kind: 1,
                tags,
                content: content.into(),
                sig: "sig".into(),
            },
            relays: vec!["wss://a".into()],
        }
    }

    fn stats() -> Vec<RelayStat> {
        vec![RelayStat { url: "wss://a".into(), count: 10, latency_ms: 10, completed: true }]
    }

    #[test]
    fn detects_single_npub() {
        let evs: Vec<CollectedEvent> = (0..10)
            .map(|i| ev(&format!("e{i}"), "pk-same", &format!("content {i}"), 1000 + i * 7, vec![]))
            .collect();
        let a = analyze(&evs, stats());
        assert_eq!(a.authors_unique, 1);
        assert!(a.verdicts.iter().any(|v| v.kind == "single_npub"));
        // npub 単体ルールが提案される
        assert!(a.verdicts.iter().any(|v| v.suggested_rule.is_some()));
    }

    #[test]
    fn detects_throwaway_keys() {
        // pubkey は全部違うが content は 1 種類 = 捨て鍵スパム
        let evs: Vec<CollectedEvent> = (0..12)
            .map(|i| ev(&format!("e{i}"), &format!("pk{i}"), "buy now", 1000 + i * 3, vec![]))
            .collect();
        let a = analyze(&evs, stats());
        assert_eq!(a.authors_unique, 12);
        assert_eq!(a.content_unique, 1);
        assert!(a.verdicts.iter().any(|v| v.kind == "throwaway_keys"));
        assert!(a.verdicts.iter().any(|v| v.kind == "duplicate_content"));
    }

    #[test]
    fn detects_common_tag_and_suggests_rule() {
        let evs: Vec<CollectedEvent> = (0..10)
            .map(|i| ev(&format!("e{i}"), &format!("pk{i}"), &format!("c{i}"), 1000 + i * 11,
                        vec![vec!["t".into(), "spam-campaign".into()]]))
            .collect();
        let a = analyze(&evs, stats());
        assert_eq!(a.common_tags.len(), 1);
        assert_eq!(a.common_tags[0].value, "spam-campaign");
        let v = a.verdicts.iter().find(|v| v.kind == "common_tag").expect("common_tag verdict");
        let rule = v.suggested_rule.as_ref().unwrap();
        assert_eq!(rule["rule_type"], "tag_contains");
        assert_eq!(rule["tag_value_pattern"], "spam-campaign");
    }

    #[test]
    fn detects_machine_timing() {
        // 5 秒等間隔
        let evs: Vec<CollectedEvent> = (0..10)
            .map(|i| ev(&format!("e{i}"), &format!("pk{i}"), &format!("c{i}"), 1000 + i * 5, vec![]))
            .collect();
        let a = analyze(&evs, stats());
        let t = a.timing.as_ref().unwrap();
        assert_eq!(t.median_interval_secs, 5);
        assert!(a.verdicts.iter().any(|v| v.kind == "machine_timing"));
    }

    #[test]
    fn clean_traffic_yields_no_verdict() {
        // 投稿者も内容もばらけ、間隔も不規則
        let gaps = [13, 47, 5, 91, 23, 60, 8, 120, 34];
        let mut t = 1000;
        let mut evs = Vec::new();
        for (i, g) in gaps.iter().enumerate() {
            t += g;
            evs.push(ev(&format!("e{i}"), &format!("pk{i}"), &format!("unique content {i}"), t, vec![]));
        }
        let a = analyze(&evs, stats());
        assert!(a.verdicts.is_empty(), "unexpected verdicts: {:?}", a.verdicts);
    }

    #[test]
    fn reports_full_author_counts_and_event_rows() {
        // pk-a が 3 回、pk-b が 2 回、pk-c が 1 回
        let mut evs = Vec::new();
        for (i, pk) in ["pk-a", "pk-a", "pk-a", "pk-b", "pk-b", "pk-c"].iter().enumerate() {
            evs.push(ev(&format!("e{i}"), pk, &format!("content {i}"), 1000 + i as i64 * 17, vec![]));
        }
        let a = analyze(&evs, stats());

        // 全件分布が回数付きで降順に出る
        assert_eq!(a.author_counts.len(), 3);
        assert_eq!(a.author_counts[0].value, "pk-a");
        assert_eq!(a.author_counts[0].count, 3);
        assert_eq!(a.author_counts[1].count, 2);
        assert_eq!(a.author_counts[2].count, 1);

        // イベント一覧は新しい順、本文は含めずハッシュのみ
        assert_eq!(a.events.len(), 6);
        assert!(a.events[0].created_at >= a.events[1].created_at);
        assert_eq!(a.events[0].content_hash.len(), 16);
        assert_eq!(a.events[0].relays, vec!["wss://a".to_string()]);
    }

    #[test]
    fn empty_input_is_safe() {
        let a = analyze(&[], vec![]);
        assert_eq!(a.fetched, 0);
        assert!(a.verdicts.is_empty());
        assert!(a.timing.is_none());
    }

    #[test]
    fn filter_builds_nip01_shape() {
        let req = InvestigateRequest {
            ids: vec!["abc".into()], authors: vec![], kinds: vec![1],
            since: Some(100), limit: Some(50), relays: vec![], timeout_ms: None,
        };
        let f = req.to_filter();
        assert_eq!(f["ids"][0], "abc");
        assert_eq!(f["kinds"][0], 1);
        assert_eq!(f["since"], 100);
        assert_eq!(f["limit"], 50);
        assert!(f.get("authors").is_none());
    }
}
