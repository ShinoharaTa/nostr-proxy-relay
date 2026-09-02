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
    /// この event id 群への**反応**（リプライ / リアクション / リポスト / 引用 / zap）を集める。
    /// `#e` / `#q` / `#E`(NIP-22) を 1 つの REQ に複数フィルタ（OR）で載せる。
    #[serde(default)]
    pub refs: Vec<String>,
    #[serde(default)]
    pub kinds: Vec<i64>,
    #[serde(default)]
    pub since: Option<i64>,
    /// ページング用。前回結果の最古 created_at - 1 を渡すと続きが取れる（実リレーで検証済み）
    #[serde(default)]
    pub until: Option<i64>,
    #[serde(default)]
    pub limit: Option<usize>,
    /// 省略時は接続中のリレー全部
    #[serde(default)]
    pub relays: Vec<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

impl InvestigateRequest {
    fn common(&self, f: &mut serde_json::Map<String, serde_json::Value>) {
        if let Some(since) = self.since {
            f.insert("since".into(), serde_json::json!(since));
        }
        if let Some(until) = self.until {
            f.insert("until".into(), serde_json::json!(until));
        }
        f.insert(
            "limit".into(),
            serde_json::json!(self.limit.unwrap_or(200).min(MAX_EVENTS_PER_RELAY)),
        );
    }

    /// NIP-01 のフィルタ群を組み立てる。REQ には複数フィルタを載せられ、**OR** で評価される。
    /// refs（反応収集）は `#e` / `#q` / `#E` の 3 フィルタに展開する
    /// （実測: `#e` 1 本で kind 1/6/7/9735 が混在して返る。kind 分離はローカルで行う）。
    pub fn to_filters(&self) -> Vec<serde_json::Value> {
        let mut filters = Vec::new();

        if !self.ids.is_empty() || !self.authors.is_empty() || !self.kinds.is_empty() {
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
            self.common(&mut f);
            filters.push(serde_json::Value::Object(f));
        }

        if !self.refs.is_empty() {
            for tag in ["#e", "#q", "#E"] {
                let mut f = serde_json::Map::new();
                f.insert(tag.into(), serde_json::json!(self.refs));
                self.common(&mut f);
                filters.push(serde_json::Value::Object(f));
            }
        }

        filters
    }

    pub fn is_empty(&self) -> bool {
        self.ids.is_empty() && self.authors.is_empty() && self.kinds.is_empty() && self.refs.is_empty()
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
pub struct KindCount {
    pub kind: i64,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct Analysis {
    pub fetched: usize,
    pub unique_events: usize,
    /// kind ごとの件数（反応マトリクスのチップ表示用）
    pub kind_counts: Vec<KindCount>,
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
    filters: Vec<serde_json::Value>,
    timeout_ms: u64,
) -> (Vec<CollectedEvent>, Vec<RelayStat>) {
    let timeout = Duration::from_millis(timeout_ms.min(MAX_TIMEOUT_MS));
    let mut tasks = Vec::new();

    for url in urls {
        let url = url.clone();
        let pool = Arc::clone(relay_pool);
        let filters = filters.clone();
        tasks.push(tokio::spawn(async move {
            collect_from_relay(pool, url, filters, timeout).await
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
    filters: Vec<serde_json::Value>,
    timeout: Duration,
) -> (String, Vec<Event>, u64, bool) {
    let started = std::time::Instant::now();
    // 購読を先に張ってから REQ を送る（先に送ると応答を取りこぼす）
    let Some(mut rx) = pool.subscribe(&url).await else {
        return (url, Vec::new(), 0, false);
    };
    let sub_id = format!("investigate-{}", uuid::Uuid::new_v4());
    let mut req = vec![serde_json::json!("REQ"), serde_json::json!(sub_id)];
    req.extend(filters);
    pool.send(&url, serde_json::Value::Array(req).to_string()).await;

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
/// `structural_values` = 調査対象の event id（refs）と root 投稿者の pubkey。
/// リプライは構造上「root への e タグ」と「root 投稿者への p タグ」を全件共有するため、
/// これらを共通タグ判定から除外する。除外しないと大規模リプライ爆撃で
/// 「p=被害者 をブロック」という最悪の誤提案になる（実リレー検証で確認）。
pub fn analyze(
    collected: &[CollectedEvent],
    stats: Vec<RelayStat>,
    structural_values: &[String],
) -> Analysis {
    let total = collected.len();

    let mut authors: HashMap<String, usize> = HashMap::new();
    let mut kinds_map: HashMap<i64, usize> = HashMap::new();
    let mut contents: HashMap<String, usize> = HashMap::new();
    let mut tags: HashMap<(String, String), usize> = HashMap::new();
    let mut times: Vec<i64> = Vec::with_capacity(total);

    for c in collected {
        *authors.entry(c.event.pubkey.clone()).or_default() += 1;
        *kinds_map.entry(c.event.kind).or_default() += 1;
        let mut h = Sha256::new();
        h.update(c.event.content.as_bytes());
        *contents.entry(hex::encode(h.finalize())).or_default() += 1;
        times.push(c.event.created_at);
        // 同一イベント内の重複タグは 1 回として数える
        let mut seen = std::collections::HashSet::new();
        for t in &c.event.tags {
            let (Some(name), Some(value)) = (t.first(), t.get(1)) else { continue };
            // スレッド構造タグ（e/E/q/a=対象 id、p/P=root 投稿者）は除外
            if matches!(name.as_str(), "e" | "E" | "q" | "a" | "p" | "P")
                && structural_values.iter().any(|r| r == value)
            {
                continue;
            }
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

    let mut kind_counts: Vec<KindCount> = kinds_map
        .into_iter()
        .map(|(kind, count)| KindCount { kind, count })
        .collect();
    kind_counts.sort_by(|a, b| b.count.cmp(&a.count));

    Analysis {
        fetched: total,
        unique_events: total,
        kind_counts,
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
        let a = analyze(&evs, stats(), &[]);
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
        let a = analyze(&evs, stats(), &[]);
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
        let a = analyze(&evs, stats(), &[]);
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
        let a = analyze(&evs, stats(), &[]);
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
        let a = analyze(&evs, stats(), &[]);
        assert!(a.verdicts.is_empty(), "unexpected verdicts: {:?}", a.verdicts);
    }

    #[test]
    fn reports_full_author_counts_and_event_rows() {
        // pk-a が 3 回、pk-b が 2 回、pk-c が 1 回
        let mut evs = Vec::new();
        for (i, pk) in ["pk-a", "pk-a", "pk-a", "pk-b", "pk-b", "pk-c"].iter().enumerate() {
            evs.push(ev(&format!("e{i}"), pk, &format!("content {i}"), 1000 + i as i64 * 17, vec![]));
        }
        let a = analyze(&evs, stats(), &[]);

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
    fn common_tag_excludes_structural_refs() {
        // 全リプライが root への e タグを持つ（スレッド構造）+ 9 割がキャンペーンタグ
        let root = "rootid00".to_string();
        let mut evs = Vec::new();
        for i in 0..10 {
            let mut tags = vec![vec!["e".to_string(), root.clone(), String::new(), "root".to_string()]];
            if i < 9 { tags.push(vec!["t".to_string(), "spam-campaign".to_string()]); }
            evs.push(ev(&format!("e{i}"), &format!("pk{i}"), &format!("c{i}"), 1000 + i as i64 * 13, tags));
        }
        // 全リプライに被害者（root 投稿者）への p タグも付ける
        for e in &mut evs {
            e.event.tags.push(vec!["p".to_string(), "victim-pubkey".to_string()]);
        }
        let a = analyze(&evs, stats(), &[root.clone(), "victim-pubkey".to_string()]);
        // root への e タグ / 被害者への p タグは共通タグに出ない
        assert!(!a.common_tags.iter().any(|t| t.value == root), "structural e-tag leaked: {:?}", a.common_tags);
        assert!(!a.common_tags.iter().any(|t| t.value == "victim-pubkey"), "victim p-tag leaked: {:?}", a.common_tags);
        // 本物のキャンペーンタグは検出される
        assert!(a.common_tags.iter().any(|t| t.value == "spam-campaign"));
        // refs 無しで解析すると e タグも出る（従来動作の確認）
        let b = analyze(&evs, stats(), &[]);
        assert!(b.common_tags.iter().any(|t| t.value == root));
    }

    #[test]
    fn empty_input_is_safe() {
        let a = analyze(&[], vec![], &[]);
        assert_eq!(a.fetched, 0);
        assert!(a.verdicts.is_empty());
        assert!(a.timing.is_none());
    }

    #[test]
    fn filters_build_nip01_shape_with_refs_and_until() {
        let req = InvestigateRequest {
            ids: vec!["abc".into()], authors: vec![], refs: vec![], kinds: vec![1],
            since: Some(100), until: Some(900), limit: Some(50), relays: vec![], timeout_ms: None,
        };
        let fs = req.to_filters();
        assert_eq!(fs.len(), 1);
        assert_eq!(fs[0]["ids"][0], "abc");
        assert_eq!(fs[0]["kinds"][0], 1);
        assert_eq!(fs[0]["since"], 100);
        assert_eq!(fs[0]["until"], 900);
        assert_eq!(fs[0]["limit"], 50);
        assert!(fs[0].get("authors").is_none());

        // refs は #e / #q / #E の 3 フィルタ（OR）に展開される
        let req = InvestigateRequest {
            ids: vec![], authors: vec![], refs: vec!["rootid".into()], kinds: vec![],
            since: None, until: None, limit: None, relays: vec![], timeout_ms: None,
        };
        let fs = req.to_filters();
        assert_eq!(fs.len(), 3);
        assert_eq!(fs[0]["#e"][0], "rootid");
        assert_eq!(fs[1]["#q"][0], "rootid");
        assert_eq!(fs[2]["#E"][0], "rootid");
        // ids/authors が無いとき、余計な全量フィルタが混ざらないこと
        assert!(fs.iter().all(|f| f.get("ids").is_none()));
    }

    #[test]
    fn analysis_reports_kind_distribution() {
        // リプライ 3 + リアクション 2 + リポスト 1（実測の混在パターンを模す）
        let mut evs = Vec::new();
        for (i, k) in [1i64, 1, 1, 7, 7, 6].iter().enumerate() {
            let mut e = ev(&format!("e{i}"), &format!("pk{i}"), &format!("c{i}"), 1000 + i as i64 * 13, vec![]);
            e.event.kind = *k;
            evs.push(e);
        }
        let a = analyze(&evs, stats(), &[]);
        assert_eq!(a.kind_counts[0].kind, 1);
        assert_eq!(a.kind_counts[0].count, 3);
        assert_eq!(a.kind_counts[1].kind, 7);
        assert_eq!(a.kind_counts[1].count, 2);
        assert_eq!(a.kind_counts[2].kind, 6);
    }
}
