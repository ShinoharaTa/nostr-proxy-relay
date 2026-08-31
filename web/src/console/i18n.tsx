/* Console 用の軽量 i18n。
 * LP (web/src/landing/i18n.tsx) と同じ方式:
 *   URL ?lang= → localStorage → ブラウザ言語 の順で初期言語を決定し、
 *   React Context + useI18n() で辞書を配る。外部ライブラリは使わない。
 *
 * ナビラベルや PROFILER の HUD トークン (DASHBOARD / SAVE / uplink ok 等) は
 * テーマの一部として英語のまま両言語共通。翻訳対象は説明文・確認・トースト類のみ。
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ConsoleLang = 'ja' | 'en';

export const CONSOLE_LANG_KEY = 'nostr-proxy-relay.console.lang';
/** LP 側で選んだ言語を初期値として尊重するためのキー */
const LANDING_LANG_KEY = 'nostr-proxy-relay.landing.lang';

export function isConsoleLang(v: string | null | undefined): v is ConsoleLang {
  return v === 'ja' || v === 'en';
}

export function detectInitialLang(): ConsoleLang {
  if (typeof window === 'undefined') return 'ja';

  const urlLang = new URLSearchParams(window.location.search).get('lang');
  if (isConsoleLang(urlLang)) return urlLang;

  try {
    const saved = localStorage.getItem(CONSOLE_LANG_KEY);
    if (isConsoleLang(saved)) return saved;
    const landing = localStorage.getItem(LANDING_LANG_KEY);
    if (isConsoleLang(landing)) return landing;
  } catch {
    // localStorage が使えない環境ではブラウザ言語へ fall back
  }

  const navLang = navigator.language.toLowerCase();
  return navLang.startsWith('ja') ? 'ja' : 'en';
}

export function persistLang(lang: ConsoleLang): void {
  try {
    localStorage.setItem(CONSOLE_LANG_KEY, lang);
  } catch {
    // noop
  }
}

export const consoleText = {
  ja: {
    common: {
      confirmDelete: { title: '削除しますか？', body: 'この操作は取り消せません。', confirmLabel: '削除する' },
      deleted: '削除しました',
      deleteFailed: (msg: string) => `削除失敗: ${msg}`,
      failed: (msg: string) => `失敗: ${msg}`,
      saved: '保存しました',
      saveFailed: (msg: string) => `保存失敗: ${msg}`,
      added: '追加しました',
      applied: '反映しました',
      opFailed: (msg: string) => `操作失敗: ${msg}`,
    },
    offline: {
      browserOffline: 'OFFLINE — ブラウザがネットワークから切断されています',
      apiUnreachable: 'API に到達できません — リレーが停止中か、ネットワーク経路に問題があります',
    },
    sparkline: {
      empty: '選択期間にイベントが記録されていません',
    },
    dashboard: {
      noClients: '現在接続中のクライアントはありません',
      noRecentRejects: '直近のイベント拒否はありません',
      noRejectLogs: 'まだ拒否ログがありません',
      noBackendEvents: 'backend イベントは記録されていません',
    },
    live: {
      pausedHint: 'pause を解除するとストリームが再開します',
      emptyHint: 'まだイベントが届いていません',
    },
    quarantine: {
      confirmRelease: (npub: string) => ({
        title: '隔離を解除しますか？',
        body: `${npub} の Quarantine を即時解除し、POST を再び受け付けます。`,
        confirmLabel: '解除する',
      }),
      released: '解除しました',
      created: '隔離しました',
      emptyHint: 'QUARANTINE で時限ミュートを追加できます',
      autoGuardBadge: '自動ガードによる時限 Quarantine です。誤検知なら即解除できます。',
    },
    investigate: {
      title: 'イベント調査',
      noStore: '保存しません',
      intro: 'イベント ID や pubkey を投げると、上流リレーへその場で問い合わせて出所とパターンを解析します。取得した内容は解析にのみ使い、保存しません。IP はリレー応答に含まれないため、自分の拒否ログと突き合わせて補完します。',
      idsLabel: 'event id',
      authorsLabel: 'pubkey (hex)',
      run: '調査する',
      running: '問い合わせ中…',
      needInput: 'event id か pubkey を入力してください',
      verdictTitle: '判定',
      noPattern: '目立ったパターンは検出されませんでした',
      applyRule: 'このルールを Quick BAN に登録',
      applyTitle: 'このルールを登録しますか？',
      applyConfirm: '登録する',
      banIp: 'この IP を HARD BAN',
      singleIp: (ip: string, n: number) => `拒否ログ ${n} 件がすべて ${ip} から。捨て鍵スパムでも IP は共通しているため、IP 単位のブロックが有効です。`,
      breakdown: '内訳',
      authors: '投稿者',
      contents: '内容',
      timing: '時間分布',
      localIps: 'ローカル観測 IP',
      byRelay: 'リレー別',
      commonTags: '共通タグ',
      topAuthors: '投稿者 上位',
      authorDist: '投稿者の重複回数',
      dupCount: '回数',
      eventList: '取得イベント',
      suspend1h: '1時間 停止',
      suspendTitle: 'この上流を一時的に切り離しますか？',
      suspendBody: (url: string) => `${url} を 1 時間だけ無効化します。期限が来たら自動で復帰します（再起動は不要）。有効なリレーが 1 本しかない場合は実行できません。`,
      suspendConfirm: '1時間 停止する',
      suspended: (url: string, until: string) => `${url} を停止しました（${until} まで）`,
    },
    block: {
      title: 'ブロック',
      npubHint: '公開鍵単位で止めます。上のランキングは拒否の多い順。BAN は恒久、一時的に止めるなら「一時停止」を使ってください。',
      ipHint: 'IP / CIDR 単位で止めます。HARD BAN は接続を拒否、SHADOW BAN は接続を受けつつ投稿を無効化します。',
    },
    rules: {
      title: 'DSL ルール',
      dslHint: '条件式でイベントを弾きます。POST（投稿）と backend（配信）のどちらに適用するかを選べます。',
      quickHint: 'GUI で組める簡易ルールです。npub / kind / タグで指定でき、DSL に変換して確認できます。',
    },
    deck: {
      liveEmpty: 'イベント待機中…',
      stackEmpty: '対象期間にアクターがいません',
      queueEmpty: '対応待ちはありません — ALL CLEAR',
      permanentBan: '恒久BAN',
      falsePositive: '誤検知解除',
      rateWhy: (n: number, w: string) => `拒否 ${n} 件 / ${w} — 未対処`,
      confirmIp: (mode: string, ip: string) => ({
        title: mode === 'hard_ban' ? 'HARD BAN を実行しますか？' : 'SHADOW BAN を実行しますか？',
        body: mode === 'hard_ban'
          ? `${ip} からの既存接続を強制切断し、以後の接続も拒否します。`
          : `${ip} は接続を受理しつつ、投稿を無効化します（相手には成功したように見えます）。`,
        confirmLabel: mode === 'hard_ban' ? 'HARD BAN する' : 'SHADOW BAN する',
      }),
      confirmNpubBan: (npub: string) => ({
        title: '恒久 BAN を実行しますか？',
        body: `${npub} の投稿を恒久的に拒否します。解除は NPUB 画面から行えます。`,
        confirmLabel: 'BAN する',
      }),
      confirmQuarantine: (npub: string) => ({
        title: '24 時間 Quarantine しますか？',
        body: `${npub} の POST を 24 時間停止します。期限が来ると自動で解除されます。`,
        confirmLabel: 'QUARANTINE する',
      }),
    },
    autoGuard: {
      intro: '検知は自動、恒久制裁はしません。発火時は時限 Quarantine を自動発行するだけで、失効後は自動復帰します。IP whitelist / safelist フラグ持ちの npub には一切発火しません。',
      burstTitle: 'バースト投稿レート',
      burstDesc: 'pubkey ごとの sliding window。窓内の POST が上限を超えたら発火。ephemeral / replaceable / 除外 kind はカウントされません。',
      dupTitle: '同一イベント検知',
      dupDesc: '異なる接続 (IP) から同一 content が閾値以上 POST されたら発火し、その内容を npub 不問で一時 mute します（捨て鍵対策）。',
      enabledLabel: '自動ガードを有効にする',
      windowSecs: '窓 (秒)',
      maxEvents: '窓内の上限件数',
      excludeKinds: '除外 kind (CSV)',
      dupThreshold: 'IP 数の閾値',
      dupWindowSecs: '観測窓 (秒)',
      quarantineSecs: 'Quarantine / mute 期間 (秒)',
      mutesTitle: 'アクティブな content mute',
      mutesEmpty: 'アクティブな content mute はありません',
      clearMutes: '全クリア',
      confirmClear: {
        title: 'content mute を全てクリアしますか？',
        body: '自動ガードが一時ミュートしている内容をすべて解除します。誤検知時の緊急操作です。',
        confirmLabel: 'クリアする',
      },
      cleared: (n: number) => `${n} 件クリアしました`,
      savedOn: '自動ガードを有効化しました',
      savedOff: '自動ガードを無効化しました',
    },
    ipacl: {
      emptyHint: 'ADD で IP / CIDR を追加してください',
      hardBanTitle: 'HARD BAN を実行しますか？',
      hardBanBody: (ip: string) => (
        <p>{ip} を Hard BAN します。<strong>該当 IP の既存 WS 接続は強制切断</strong>され、以後の接続も拒否します。</p>
      ),
      hardBanNote: 'CIDR を指定した場合、範囲内の全セッションが切断されます。実行内容は接続ログに記録されます。',
    },
    npub: {
      confirmDelete: (npub: string) => ({
        title: 'safelist から削除しますか？',
        body: `${npub} のエントリを削除します。allow / broadcast などのフラグも失われます。`,
        confirmLabel: '削除する',
      }),
      banned: 'BAN しました',
      unbanned: 'unban しました',
      emptyHint: 'ADD で公開鍵を追加してください',
      broadcastOn: 'BROADCAST を付与しました（全リレーへ fan-out）',
      broadcastOff: 'BROADCAST を解除しました',
    },
    kind: {
      emptyHint: '特定 kind を REQ レベルで弾けます。kind 番号を指定して追加してください。',
    },
    dsl: {
      emptyHint: 'Filter Query Language で複雑な拒否条件を書けます',
      dryRunNote: 'サンプル Event JSON を編集して、現在の DSL がマッチするかを確認できます。',
    },
    quickban: {
      emptyHint: 'GUI で組める単純ルール (npub / kind / tag) を Quick BAN に登録できます',
      dslPreviewNote: 'この Quick BAN ルールを DSL に変換するとこうなります。',
    },
    backend: {
      confirmDelete: (url: string) => ({
        title: 'backend relay を削除しますか？',
        body: `${url} を構成から外します。SAVE で確定するまで実際の接続は変わりません。`,
        confirmLabel: '削除する',
      }),
      updated: 'backend relays を更新しました',
      duplicateUrl: 'すでに登録済みの URL です',
      queued: '追加候補に積みました。SAVE で確定。',
      saveTitle: '変更を保存しますか？',
      saveBody: 'backend relay 構成を更新します。接続中のセッションは新構成に切り替わるまで一瞬切断される可能性があります。',
      emptyHint: 'ADD ボタンで wss URL を追加してください',
      nip11ProbeFailed: (msg: string) => `NIP-11 取得失敗: ${msg}`,
      resume: '今すぐ復帰',
    },
    nip11: {
      saved: 'NIP-11 を保存しました',
    },
    telemetry: {
      influxNote: (
        <>
          InfluxDB 2.x への書き込み設定。値は環境変数 (<code>INFLUXDB_URL</code> / <code>INFLUXDB_BUCKET</code> /
          {' '}<code>INFLUXDB_ORG</code> / <code>INFLUXDB_TOKEN</code>) から読み込まれます。サーバ再起動が必要です。
        </>
      ),
      testNote: 'テスト用の 1 行 (`relay_telemetry_test`) を書き込んで、レスポンスを確認します。',
    },
    postPolicy: {
      allowlistDesc: '原則 deny。allowlist にある npub からの POST のみ受け付ける。閉じた運用向き。',
      denylistDesc: '原則 allow。denylist にある npub だけ拒否。広く公開する一般運用向き。',
      routingAllDesc: '全ての write 有効リレーへ送信（従来どおり）。',
      routingPrimaryDesc: 'BROADCAST フラグを持つ npub のみ全リレーへ。他は primary リレーだけに送信。',
      routingNote: 'primary_default では、Npub 画面で BROADCAST を付けた npub（自分など）だけが全リレーへ fan-out されます。',
      strategyDescs: {
        failover: '優先度順に 1 つだけ送信、失敗時に次へ',
        fan_out_event: '受け取った POST を複数 backend に同送',
        fan_in_req: '複数 backend からの REQ 結果を集約',
        sharded: 'kind / pubkey で backend を振り分け',
      } as Record<string, string>,
      confirmPolicyTitle: 'POST policy を切り替えますか？',
      confirmStrategyTitle: 'backend strategy を更新しますか？',
      policyBody: (from: string, to: string) => (
        <p>POST policy を <strong>{from}</strong> から <strong>{to}</strong> に切り替えます。</p>
      ),
      policyNote: 'この操作は通過するイベント全体に影響します。Npub allow/deny リストの整備状況を確認してください。',
      strategyBody: (from: string, to: string) => (
        <p>backend strategy を <strong>{from}</strong> から <strong>{to}</strong> に変更します。</p>
      ),
    },
    system: {
      lockoutNote: (
        <>
          設定変更は <code>ADMIN_LOCKOUT_THRESHOLD</code> / <code>ADMIN_LOCKOUT_WINDOW_SECS</code> /
          {' '}<code>ADMIN_LOCKOUT_DURATION_SECS</code> 環境変数で行い、再起動してください。
        </>
      ),
      retentionNote: (
        <>変更は <code>LOG_RETENTION_DAYS</code> 環境変数で。</>
      ),
      noEnvOverrides: 'env からの上書きはありません',
      reducedMotionNote: (
        <>
          <code>prefers-reduced-motion</code> が有効です。
          UI 設定にかかわらずアニメーションは自動で停止されます。
        </>
      ),
      fabUnused: '緊急アクション FAB はまだ使用されていません。',
      fabStorageNote: '利用回数はブラウザの localStorage に保存されます（個人情報は含まれません）。',
    },
    fab: {
      disconnectHeading: 'Hard BAN は既存接続を強制切断します。同等扱いとして実行します。',
      policyToggleNote: 'POST policy を切り替えます。allowlist は閉じた運用 (allow リストのみ)、denylist は広く公開で deny だけ拒否です。',
    },
  },
  en: {
    common: {
      confirmDelete: { title: 'Delete this entry?', body: 'This action cannot be undone.', confirmLabel: 'DELETE' },
      deleted: 'Deleted',
      deleteFailed: (msg: string) => `Delete failed: ${msg}`,
      failed: (msg: string) => `Failed: ${msg}`,
      saved: 'Saved',
      saveFailed: (msg: string) => `Save failed: ${msg}`,
      added: 'Added',
      applied: 'Applied',
      opFailed: (msg: string) => `Operation failed: ${msg}`,
    },
    offline: {
      browserOffline: 'OFFLINE — the browser is disconnected from the network',
      apiUnreachable: 'API unreachable — the relay may be down or there is a network issue',
    },
    sparkline: {
      empty: 'No events recorded in the selected period',
    },
    dashboard: {
      noClients: 'No clients are currently connected',
      noRecentRejects: 'No recent event rejections',
      noRejectLogs: 'No rejection logs yet',
      noBackendEvents: 'No backend events recorded',
    },
    live: {
      pausedHint: 'Unpause to resume the stream',
      emptyHint: 'No events received yet',
    },
    quarantine: {
      confirmRelease: (npub: string) => ({
        title: 'Release quarantine?',
        body: `${npub} is released immediately and can POST again.`,
        confirmLabel: 'RELEASE',
      }),
      released: 'Released',
      created: 'Quarantined',
      emptyHint: 'Add a timed mute with QUARANTINE',
      autoGuardBadge: 'Timed quarantine issued by Auto Guard. Release immediately if it is a false positive.',
    },
    investigate: {
      title: 'Investigate',
      noStore: 'nothing stored',
      intro: 'Give event ids or pubkeys and the proxy queries upstream relays right now, then analyses provenance and patterns. Fetched content is used for analysis only and never stored. IPs are not in relay responses, so they are filled in from your own rejection logs.',
      idsLabel: 'event id',
      authorsLabel: 'pubkey (hex)',
      run: 'INVESTIGATE',
      running: 'querying…',
      needInput: 'Enter at least one event id or pubkey',
      verdictTitle: 'Verdict',
      noPattern: 'No notable pattern detected',
      applyRule: 'Register as Quick BAN',
      applyTitle: 'Register this rule?',
      applyConfirm: 'REGISTER',
      banIp: 'HARD BAN this IP',
      singleIp: (ip: string, n: number) => `All ${n} matching rejections came from ${ip}. Even with throwaway keys the IP is shared, so an IP-level block is effective.`,
      breakdown: 'Breakdown',
      authors: 'Authors',
      contents: 'Contents',
      timing: 'Timing',
      localIps: 'Locally observed IPs',
      byRelay: 'By relay',
      commonTags: 'Common tags',
      topAuthors: 'Top authors',
      authorDist: 'Author duplicate counts',
      dupCount: 'COUNT',
      eventList: 'Fetched events',
      suspend1h: 'SUSPEND 1h',
      suspendTitle: 'Temporarily detach this upstream?',
      suspendBody: (url: string) => `${url} is disabled for one hour and restored automatically when it expires (no restart needed). Cannot be used when only one relay is enabled.`,
      suspendConfirm: 'SUSPEND 1h',
      suspended: (url: string, until: string) => `Suspended ${url} until ${until}`,
    },
    block: {
      title: 'Block',
      npubHint: 'Block by public key. The ranking above is sorted by rejections. BAN is permanent — use Quarantine for a temporary stop.',
      ipHint: 'Block by IP / CIDR. HARD BAN rejects the connection; SHADOW BAN accepts it but silently voids the posts.',
    },
    rules: {
      title: 'DSL Rules',
      dslHint: 'Reject events with a condition expression. Choose whether it applies to POST, backend delivery, or both.',
      quickHint: 'Simple GUI-built rules by npub / kind / tag. You can preview the equivalent DSL.',
    },
    deck: {
      liveEmpty: 'Waiting for events…',
      stackEmpty: 'No actors in the selected window',
      queueEmpty: 'Nothing pending — ALL CLEAR',
      permanentBan: 'PERMANENT BAN',
      falsePositive: 'FALSE POSITIVE',
      rateWhy: (n: number, w: string) => `${n} rejections / ${w} — unhandled`,
      confirmIp: (mode: string, ip: string) => ({
        title: mode === 'hard_ban' ? 'Execute HARD BAN?' : 'Execute SHADOW BAN?',
        body: mode === 'hard_ban'
          ? `Existing connections from ${ip} are force-disconnected and future ones rejected.`
          : `${ip} stays connected but its posts are silently voided (it looks successful to them).`,
        confirmLabel: mode === 'hard_ban' ? 'HARD BAN' : 'SHADOW BAN',
      }),
      confirmNpubBan: (npub: string) => ({
        title: 'Permanently ban this npub?',
        body: `Posts from ${npub} will be rejected. You can undo this from the NPUB page.`,
        confirmLabel: 'BAN',
      }),
      confirmQuarantine: (npub: string) => ({
        title: 'Quarantine for 24 hours?',
        body: `POSTs from ${npub} are blocked for 24 hours, then automatically released.`,
        confirmLabel: 'QUARANTINE',
      }),
    },
    autoGuard: {
      intro: 'Detection is automatic; punishment never is permanent. On trigger it only issues a timed quarantine that expires on its own. Npubs with IP whitelist / safelist flags are always exempt.',
      burstTitle: 'Burst posting rate',
      burstDesc: 'Sliding window per pubkey. Fires when POSTs within the window exceed the limit. Ephemeral / replaceable / excluded kinds are not counted.',
      dupTitle: 'Identical event detection',
      dupDesc: 'Fires when the same content is POSTed from a threshold number of distinct connections (IPs); the content is then temporarily muted regardless of npub (throwaway-key defense).',
      enabledLabel: 'Enable Auto Guard',
      windowSecs: 'Window (sec)',
      maxEvents: 'Max events per window',
      excludeKinds: 'Excluded kinds (CSV)',
      dupThreshold: 'Distinct IP threshold',
      dupWindowSecs: 'Observation window (sec)',
      quarantineSecs: 'Quarantine / mute duration (sec)',
      mutesTitle: 'Active content mutes',
      mutesEmpty: 'No active content mutes',
      clearMutes: 'CLEAR ALL',
      confirmClear: {
        title: 'Clear all content mutes?',
        body: 'Releases every content currently muted by Auto Guard. Emergency action for false positives.',
        confirmLabel: 'CLEAR',
      },
      cleared: (n: number) => `Cleared ${n} mute(s)`,
      savedOn: 'Auto Guard enabled',
      savedOff: 'Auto Guard disabled',
    },
    ipacl: {
      emptyHint: 'Use ADD to register an IP / CIDR',
      hardBanTitle: 'Execute HARD BAN?',
      hardBanBody: (ip: string) => (
        <p>Hard-ban {ip}. <strong>Existing WS connections from this IP are force-disconnected</strong> and future connections are rejected.</p>
      ),
      hardBanNote: 'For a CIDR, every session in the range is disconnected. The action is recorded in the connection log.',
    },
    npub: {
      confirmDelete: (npub: string) => ({
        title: 'Remove from safelist?',
        body: `The entry for ${npub} is deleted, including its allow / broadcast flags.`,
        confirmLabel: 'DELETE',
      }),
      banned: 'Banned',
      unbanned: 'Unbanned',
      emptyHint: 'Use ADD to register a public key',
      broadcastOn: 'BROADCAST granted (fan-out to all relays)',
      broadcastOff: 'BROADCAST revoked',
    },
    kind: {
      emptyHint: 'Block specific kinds at the REQ level. Add rules by kind number.',
    },
    dsl: {
      emptyHint: 'Write complex rejection rules with the Filter Query Language',
      dryRunNote: 'Edit the sample event JSON to check whether the current DSL matches.',
    },
    quickban: {
      emptyHint: 'Register simple GUI-built rules (npub / kind / tag) as Quick BAN',
      dslPreviewNote: 'This Quick BAN rule translates to the following DSL.',
    },
    backend: {
      confirmDelete: (url: string) => ({
        title: 'Delete backend relay?',
        body: `${url} is removed from the configuration. Nothing changes until you press SAVE.`,
        confirmLabel: 'DELETE',
      }),
      updated: 'Backend relays updated',
      duplicateUrl: 'This URL is already registered',
      queued: 'Queued for addition. Press SAVE to apply.',
      saveTitle: 'Save changes?',
      saveBody: 'Updates the backend relay set. Connected sessions may be briefly disconnected while switching to the new configuration.',
      emptyHint: 'Use the ADD button to register a wss URL',
      nip11ProbeFailed: (msg: string) => `NIP-11 probe failed: ${msg}`,
      resume: 'RESUME NOW',
    },
    nip11: {
      saved: 'NIP-11 saved',
    },
    telemetry: {
      influxNote: (
        <>
          Write settings for InfluxDB 2.x. Values are read from environment variables (<code>INFLUXDB_URL</code> / <code>INFLUXDB_BUCKET</code> /
          {' '}<code>INFLUXDB_ORG</code> / <code>INFLUXDB_TOKEN</code>). A server restart is required.
        </>
      ),
      testNote: 'Writes a single test row (`relay_telemetry_test`) and shows the response.',
    },
    postPolicy: {
      allowlistDesc: 'Deny by default. Only POSTs from npubs on the allowlist are accepted. For closed deployments.',
      denylistDesc: 'Allow by default. Only npubs on the denylist are rejected. For open, public deployments.',
      routingAllDesc: 'Send to every write-enabled relay (legacy behavior).',
      routingPrimaryDesc: 'Only npubs with the BROADCAST flag fan out to all relays; everyone else writes to primary relays only.',
      routingNote: 'With primary_default, only npubs given BROADCAST on the Npub page (e.g. yourself) fan out to all relays.',
      strategyDescs: {
        failover: 'Send to one backend by priority; fall through on failure',
        fan_out_event: 'Duplicate incoming POSTs to multiple backends',
        fan_in_req: 'Aggregate REQ results from multiple backends',
        sharded: 'Route to backends by kind / pubkey',
      } as Record<string, string>,
      confirmPolicyTitle: 'Switch POST policy?',
      confirmStrategyTitle: 'Update backend strategy?',
      policyBody: (from: string, to: string) => (
        <p>Switches POST policy from <strong>{from}</strong> to <strong>{to}</strong>.</p>
      ),
      policyNote: 'This affects every event passing through. Review your npub allow/deny lists first.',
      strategyBody: (from: string, to: string) => (
        <p>Changes backend strategy from <strong>{from}</strong> to <strong>{to}</strong>.</p>
      ),
    },
    system: {
      lockoutNote: (
        <>
          Configure via the <code>ADMIN_LOCKOUT_THRESHOLD</code> / <code>ADMIN_LOCKOUT_WINDOW_SECS</code> /
          {' '}<code>ADMIN_LOCKOUT_DURATION_SECS</code> environment variables, then restart.
        </>
      ),
      retentionNote: (
        <>Change via the <code>LOG_RETENTION_DAYS</code> environment variable.</>
      ),
      noEnvOverrides: 'No overrides from env',
      reducedMotionNote: (
        <>
          <code>prefers-reduced-motion</code> is enabled.
          Animations are stopped automatically regardless of UI settings.
        </>
      ),
      fabUnused: 'The emergency action FAB has not been used yet.',
      fabStorageNote: 'Usage counts are stored in the browser\u2019s localStorage (no personal data).',
    },
    fab: {
      disconnectHeading: 'Hard BAN force-disconnects existing connections. Executed as the equivalent action.',
      policyToggleNote: 'Switches the POST policy. allowlist = closed operation (allow list only); denylist = open to the public, rejecting only denied npubs.',
    },
  },
} as const;

export type ConsoleDict = typeof consoleText.ja;

interface I18nContextValue {
  lang: ConsoleLang;
  setLang: (lang: ConsoleLang) => void;
  t: ConsoleDict;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function ConsoleI18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<ConsoleLang>(() => detectInitialLang());

  const setLang = useCallback((next: ConsoleLang) => {
    setLangState(next);
    persistLang(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ lang, setLang, t: consoleText[lang] as ConsoleDict }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within <ConsoleI18nProvider>');
  }
  return ctx;
}
