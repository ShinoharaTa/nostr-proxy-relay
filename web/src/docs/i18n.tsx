import type { ReactNode } from 'react';

export const docsText = {
  ja: {
    nav: {
      overview: 'Overview',
      start: 'Getting Started',
      architecture: 'Architecture',
      filtering: 'Filtering',
      dsl: 'DSL',
      operations: 'Operations',
      api: 'API',
      legacy: 'Legacy Markdown',
    },
    hero: {
      eyebrow: 'OPEN SOURCE MANAGED RELAY GATEWAY',
      title: '複数の Nostr relay を、1 つの managed endpoint に。',
      lead: (
        <>
          Proxy Nostr Relay は、relay 本体の前段に置く gateway / control plane です。
          backend relay を束ね、failover、POST / REQ policy、filtering、logs、telemetry、
          admin console を後付けできます。
        </>
      ),
      primary: 'Linux サーバーで起動する',
      secondary: 'Filtering / DSL を見る',
    },
    overview: {
      title: 'これは relay 本体ではなく、relay 運用の add-on です。',
      body: [
        '単体の relay を置き換えるのではなく、既存 relay 群の前に挟みます。',
        'ユーザーには 1 つの wss:// endpoint だけを案内し、裏側の relay 追加・停止・差し替えは運用者が吸収します。',
        'filtering は主役ではなく、gateway に後付けできる policy / safety layer の 1 つです。',
      ],
      cards: [
        ['1 endpoint', '複数 backend relay を束ね、クライアント設定を増やさない。'],
        ['Control plane', 'POST / REQ / npub / IP / kind / DSL を gateway 側で管理。'],
        ['Operations', 'Live Events、Logs、Telemetry、System 情報を /console に集約。'],
      ] as const,
    },
    start: {
      title: 'Linux サーバーで最短起動する',
      steps: [
        ['1. Rust を用意', 'Rust toolchain を入れ、cargo が使える状態にします。'],
        ['2. 環境変数を設定', 'ADMIN_USER / ADMIN_PASS / DATABASE_URL / RUST_LOG を設定します。'],
        ['3. 起動', 'cargo run または release binary で起動します。既定では 127.0.0.1:8080 を listen します。'],
        ['4. backend relay を登録', '/console/backend/relays で backend relay を追加し、接続状態を確認します。'],
        ['5. Nginx で wss 化', '外部公開する場合は Nginx 等で TLS 終端し、WebSocket upgrade を proxy します。'],
      ] as const,
      envTitle: '最小 .env 例',
      commandTitle: '起動コマンド例',
    },
    architecture: {
      title: 'Architecture',
      lead: 'クライアントと backend relay pool の間に gateway を 1 枚挟みます。',
      flow: [
        ['Clients', 'Nostr clients register a single wss:// endpoint.'],
        ['Gateway', 'Policy, filtering, logs, counters, and failover decisions happen here.'],
        ['Backend relays', 'Actual relay servers keep doing relay work.'],
      ] as const,
      patternsTitle: '運用パターン',
      patterns: [
        ['Public gateway', '公開 relay の前段として使い、荒れた時の遮断・隔離・観測を追加。'],
        ['Private / allowlist gateway', '個人・チーム用 relay 群を allowlist mode で閉じて運用。'],
        ['Managed relay add-on', 'サービス側で backend relay を差し替えつつ、ユーザーには同じ endpoint を提供。'],
      ] as const,
    },
    filtering: {
      title: 'Filtering / Access Control',
      lead: 'POST と REQ を gateway で評価し、relay 本体を改造せずに安全装置を追加します。',
      items: [
        ['POST Policy', 'allowlist / denylist と per-npub override で投稿可否を制御。'],
        ['IP ACL', 'hard_ban / shadow_ban / whitelist / normal。CIDR にも対応。'],
        ['Npub', 'allow / deny / BAN を同じ画面で管理。'],
        ['Quarantine', '一定時間だけ npub を隔離。緊急時の一時対応に使う。'],
        ['Kind Blocklist', 'REQ kind の単発・範囲ブロック。'],
        ['Quick BAN', 'GUI から単純なルールを作り、DSL に変換して確認。'],
      ] as const,
    },
    dsl: {
      title: 'DSL Filter Rules',
      lead: '高度な条件は DSL で記述します。GUI で表現しきれない複合条件や正規表現に使います。',
      examples: [
        ['kind == 1', 'kind 1 のみを対象にする'],
        ['kind == 1 AND content matches "spam"', '本文に spam を含む kind 1 を対象にする'],
        ['npub == "npub1..." AND kind in [1, 6, 7]', '特定 npub の複数 kind を対象にする'],
      ] as const,
      link: '既存の詳細 DSL 仕様 (Markdown) を開く',
    },
    operations: {
      title: 'Operations',
      lead: '運用時に見るべきものは /console に寄せています。',
      items: [
        ['Dashboard', 'KPI、時系列、backend incidents、拒否理由 top を確認。'],
        ['Live Events', 'SSE で accepted / delivered / rejected / dropped をリアルタイム表示。'],
        ['Logs', 'Connection / Rejection / Backend Relay の履歴を検索。'],
        ['Telemetry', 'InfluxDB 設定と test write。'],
        ['System', 'version、uptime、auth throttle、disk、UI prefs を確認。'],
      ] as const,
    },
    api: {
      title: 'API / Integration',
      lead: '公開 LP 用の public API と、BasicAuth 配下の admin API を分けています。',
      items: [
        ['GET /api/public/status', '認証なし。LP 用の aggregate status。IP / npub は出しません。'],
        ['GET /api/system/info', 'version、uptime、auth throttle、retention、disk。'],
        ['GET /api/telemetry/status', 'InfluxDB 設定状態。token は last4 のみ。'],
        ['GET /api/events/stream', 'Live Events 用 SSE。'],
      ] as const,
      link: 'API Reference (legacy markdown) を開く',
    },
  },
  en: {
    nav: {
      overview: 'Overview',
      start: 'Getting Started',
      architecture: 'Architecture',
      filtering: 'Filtering',
      dsl: 'DSL',
      operations: 'Operations',
      api: 'API',
      legacy: 'Legacy Markdown',
    },
    hero: {
      eyebrow: 'OPEN SOURCE MANAGED RELAY GATEWAY',
      title: 'Bundle multiple Nostr relays into one managed endpoint.',
      lead: (
        <>
          Proxy Nostr Relay is a gateway / control plane placed in front of relay backends.
          It adds backend aggregation, failover, POST / REQ policies, filtering, logs, telemetry,
          and an admin console without replacing the relay servers themselves.
        </>
      ),
      primary: 'Run it on Linux',
      secondary: 'Read Filtering / DSL',
    },
    overview: {
      title: 'This is not a relay replacement. It is an add-on for relay operations.',
      body: [
        'Place it in front of existing relay backends instead of replacing them.',
        'Users configure one wss:// endpoint while operators can add, remove, or replace backends behind it.',
        'Filtering is one policy / safety layer in the gateway, not the whole product.',
      ],
      cards: [
        ['1 endpoint', 'Aggregate backend relays without making clients configure more URLs.'],
        ['Control plane', 'Manage POST / REQ / npub / IP / kind / DSL rules at the gateway.'],
        ['Operations', 'Live events, logs, telemetry, and system status are centralized in /console.'],
      ] as const,
    },
    start: {
      title: 'Run it on a Linux server',
      steps: [
        ['1. Install Rust', 'Prepare a Rust toolchain and make sure cargo is available.'],
        ['2. Configure environment', 'Set ADMIN_USER, ADMIN_PASS, DATABASE_URL, and RUST_LOG.'],
        ['3. Start the process', 'Run cargo run or the release binary. By default it listens on 127.0.0.1:8080.'],
        ['4. Add backend relays', 'Open /console/backend/relays and register backend relay URLs.'],
        ['5. Put Nginx in front', 'For public access, terminate TLS and proxy WebSocket upgrade requests.'],
      ] as const,
      envTitle: 'Minimal .env example',
      commandTitle: 'Start command example',
    },
    architecture: {
      title: 'Architecture',
      lead: 'Insert one gateway layer between clients and a backend relay pool.',
      flow: [
        ['Clients', 'Nostr clients register a single wss:// endpoint.'],
        ['Gateway', 'Policy, filtering, logs, counters, and failover decisions happen here.'],
        ['Backend relays', 'Actual relay servers keep doing relay work.'],
      ] as const,
      patternsTitle: 'Operation patterns',
      patterns: [
        ['Public gateway', 'Add moderation, isolation, and observability in front of a public relay service.'],
        ['Private / allowlist gateway', 'Operate personal or team relay backends in allowlist mode.'],
        ['Managed relay add-on', 'Replace backend relays behind the scenes while users keep the same endpoint.'],
      ] as const,
    },
    filtering: {
      title: 'Filtering / Access Control',
      lead: 'Evaluate POST and REQ traffic at the gateway without modifying relay backends.',
      items: [
        ['POST Policy', 'allowlist / denylist plus per-npub override.'],
        ['IP ACL', 'hard_ban / shadow_ban / whitelist / normal with CIDR support.'],
        ['Npub', 'Manage allow / deny / BAN in one place.'],
        ['Quarantine', 'Temporarily isolate an npub during incidents.'],
        ['Kind Blocklist', 'Block single REQ kinds or ranges.'],
        ['Quick BAN', 'Create simple GUI rules and preview their DSL output.'],
      ] as const,
    },
    dsl: {
      title: 'DSL Filter Rules',
      lead: 'Use DSL for complex conditions that do not fit into simple GUI rules.',
      examples: [
        ['kind == 1', 'Target kind 1 events'],
        ['kind == 1 AND content matches "spam"', 'Target kind 1 events whose content matches spam'],
        ['npub == "npub1..." AND kind in [1, 6, 7]', 'Target multiple kinds from one npub'],
      ] as const,
      link: 'Open detailed DSL spec (legacy markdown)',
    },
    operations: {
      title: 'Operations',
      lead: 'Operational views live in /console.',
      items: [
        ['Dashboard', 'KPIs, time series, backend incidents, and top rejection reasons.'],
        ['Live Events', 'SSE stream for accepted / delivered / rejected / dropped events.'],
        ['Logs', 'Search connection, rejection, and backend relay history.'],
        ['Telemetry', 'InfluxDB configuration and test write.'],
        ['System', 'Version, uptime, auth throttle, disk, and UI preferences.'],
      ] as const,
    },
    api: {
      title: 'API / Integration',
      lead: 'Public status APIs are separated from BasicAuth-protected admin APIs.',
      items: [
        ['GET /api/public/status', 'No auth. Aggregate LP status without IPs or npubs.'],
        ['GET /api/system/info', 'Version, uptime, auth throttle, retention, and disk info.'],
        ['GET /api/telemetry/status', 'InfluxDB configuration state with token last4 only.'],
        ['GET /api/events/stream', 'SSE stream used by Live Events.'],
      ] as const,
      link: 'Open API Reference (legacy markdown)',
    },
  },
} satisfies Record<'ja' | 'en', Record<string, unknown>>;

export type DocsText = typeof docsText.ja;

export function DocsCode({ children }: { children: ReactNode }) {
  return <code>{children}</code>;
}
