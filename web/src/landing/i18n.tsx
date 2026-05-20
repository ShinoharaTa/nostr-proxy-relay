export type LandingLang = 'ja' | 'en';

export const LANDING_LANG_KEY = 'nostr-proxy-relay.landing.lang';

export function isLandingLang(v: string | null | undefined): v is LandingLang {
  return v === 'ja' || v === 'en';
}

export function detectInitialLang(): LandingLang {
  if (typeof window === 'undefined') return 'ja';

  const urlLang = new URLSearchParams(window.location.search).get('lang');
  if (isLandingLang(urlLang)) return urlLang;

  try {
    const saved = localStorage.getItem(LANDING_LANG_KEY);
    if (isLandingLang(saved)) return saved;
  } catch {
    // localStorage が使えない環境ではブラウザ言語へ fall back
  }

  const navLang = navigator.language.toLowerCase();
  return navLang.startsWith('ja') ? 'ja' : 'en';
}

export function persistLang(lang: LandingLang): void {
  try {
    localStorage.setItem(LANDING_LANG_KEY, lang);
  } catch {
    // noop
  }
}

export const landingText = {
  ja: {
    langLabel: 'Language',
    loading: 'profiler uplink — loading',
    unavailable: 'uplink unavailable',
    down: 'uplink down',
    degraded: 'uplink degraded',
    operational: 'uplink operational',
    stale: (time: string) => `stale — last update ${time}`,
    refreshed: (time: string) => `refreshed ${time}`,
    copied: 'Copied',
    copyUrl: 'Copy URL',
    docs: 'Architecture docs',
    hero: {
      title: 'Nostr Relay Gateway',
      subtitle: '— managed relay add-on',
      lead: (
        <>
          複数の Nostr リレー本体を束ね、1 つの <code>wss://</code> エンドポイントとして提供する
          マネージド運用向けの集約レイヤです。リレー本体を置き換えるのではなく、
          前段に追加してフェイルオーバー、アクセス制御、フィルタリング、監視をまとめて扱えます。
        </>
      ),
      hint: (
        <>
          既存 relay 群の前に置くだけで、クライアントからは単一 relay のように見えます。
          運用者は backend relay、POST / REQ ポリシー、BAN / Quarantine、ログを管理コンソールから制御できます。
        </>
      ),
    },
    kpi: {
      uptime: 'UPTIME',
      connNow: 'CONN NOW',
      connDelta: 'active clients',
      eventsPerMin: 'EVENTS / MIN',
      eventsDelta: 'gateway throughput',
      rejectRate: 'REJECT RATE',
    },
    useCases: {
      tag: 'WHEN TO USE',
      title: 'relay 本体を増やすほど、運用が散らばるときに。',
      lead: (
        <>
          Nostr relay を単体で公開するだけなら、この gateway は必須ではありません。
          価値が出るのは、複数の relay 本体を使い分けたい、でもユーザーには 1 つの
          endpoint だけを案内したい、という managed service 的な運用です。
        </>
      ),
      items: [
        {
          title: '複数 relay を束ねたい',
          body: <>地域別・用途別・冗長化用の backend relay を、1 つの <code>wss://</code> に集約。</>,
        },
        {
          title: 'ユーザーに設定を増やさせたくない',
          body: <>クライアント側には単一 URL だけを配布。裏側の relay 追加・停止・差し替えは運用側で吸収。</>,
        },
        {
          title: 'relay 本体を改造せず制御したい',
          body: <>POST / REQ の制御、BAN、Quarantine、kind 制限、DSL フィルタを gateway 側で後付け。</>,
        },
        {
          title: '障害時に逃がしたい',
          body: <>backend が落ちても別 relay へ退避。状態確認と復旧判断を管理コンソールで行えます。</>,
        },
      ],
    },
    solves: {
      tag: 'WHAT IT SOLVES',
      title: 'relay 運用で面倒になる部分を、前段に集める。',
      lead: (
        <>
          relay 本体はシンプルに保ち、運用ポリシー・観測・緊急対応を gateway に寄せます。
          「relay を置き換える」のではなく、マネージド運用のための制御面を追加します。
        </>
      ),
      items: [
        ['1 endpoint', 'ユーザーへ案内する URL は 1 つ。backend 構成変更を利用者に見せない。'],
        ['Policy edge', '投稿・購読・IP・npub・kind のルールを relay 本体の外側で統一管理。'],
        ['Operational visibility', '接続、拒否、backend の生死、incident を dashboard / live log で追跡。'],
        ['Emergency controls', '荒れた時は Quarantine / Hard BAN / POST policy 切替をすばやく実行。'],
      ] as const,
    },
    features: [
      {
        title: 'RELAY AGGREGATION',
        tag: 'gateway',
        body: <>複数 backend relay を束ね、クライアントには単一の <code>wss://</code> として公開。追加・停止・重み付けを前段で管理できます。</>,
      },
      {
        title: 'FAILOVER POOL',
        tagSuffix: 'nodes',
        body: <>backend 障害時は別 relay へ退避。読み取り・書き込みの役割や weight を分けて、managed relay service の前段として安定運用できます。</>,
      },
      {
        title: 'POLICY LAYER',
        tag: 'access control',
        body: <>POST / REQ、npub、IP、kind、DSL ルールを gateway 側で制御。フィルタリングは主機能ではなく、リレー運用に後付けできる安全装置です。</>,
      },
      {
        title: 'OPERATIONS',
        tag: 'live',
        body: <>Dashboard、Live Events、Telemetry、System 情報を管理コンソールに集約。障害・拒否・接続状況を見ながら即時対応できます。</>,
      },
    ],
    flow: {
      tag: 'HOW IT WORKS',
      title: 'クライアントと relay 群の間に、運用レイヤを 1 枚挟む。',
      steps: [
        ['01', 'Clients connect to gateway', <>Nostr クライアントはこのページの <code>wss://</code> だけを relay として登録します。</>],
        ['02', 'Gateway applies policy', <>REQ / POST、npub、IP、kind、DSL ルールを前段で判定し、必要なら遮断・隔離します。</>],
        ['03', 'Backend relays do relay work', <>通過した通信を backend relay pool へ中継。障害時は別 backend へ逃がします。</>],
      ] as const,
      ctaTitle: 'Managed relay service の add-on として設計。',
      ctaBody: 'relay 本体、gateway、管理コンソールを分けて考えることで、運用変更を安全に進められます。',
      cta: '設計ドキュメントを見る',
    },
    statusLog: (n: number) => `recent ${n}`,
    footerName: 'Proxy Nostr Relay Gateway (PROFILER)',
  },
  en: {
    langLabel: 'Language',
    loading: 'profiler uplink — loading',
    unavailable: 'uplink unavailable',
    down: 'uplink down',
    degraded: 'uplink degraded',
    operational: 'uplink operational',
    stale: (time: string) => `stale — last update ${time}`,
    refreshed: (time: string) => `refreshed ${time}`,
    copied: 'Copied',
    copyUrl: 'Copy URL',
    docs: 'Architecture docs',
    hero: {
      title: 'Nostr Relay Gateway',
      subtitle: '— managed relay add-on',
      lead: (
        <>
          A managed aggregation layer that bundles multiple Nostr relay backends and exposes them as
          one <code>wss://</code> endpoint. It does not replace your relay servers; it sits in front of them
          and adds failover, access control, filtering, and operational visibility.
        </>
      ),
      hint: (
        <>
          Place it in front of existing relay backends, and clients see a single relay endpoint.
          Operators manage backend relays, POST / REQ policies, BAN / Quarantine, and logs from the console.
        </>
      ),
    },
    kpi: {
      uptime: 'UPTIME',
      connNow: 'CONN NOW',
      connDelta: 'active clients',
      eventsPerMin: 'EVENTS / MIN',
      eventsDelta: 'gateway throughput',
      rejectRate: 'REJECT RATE',
    },
    useCases: {
      tag: 'WHEN TO USE',
      title: 'Use it when relay operations start to spread across multiple backends.',
      lead: (
        <>
          If you only run a single public relay, this gateway is optional. It becomes valuable when you want
          to operate several relay backends while giving users one endpoint to configure.
        </>
      ),
      items: [
        {
          title: 'Bundle multiple relays',
          body: <>Aggregate regional, purpose-specific, or redundant backend relays behind one <code>wss://</code> endpoint.</>,
        },
        {
          title: 'Keep client setup simple',
          body: <>Publish one URL to clients while operators handle backend additions, removals, and replacements behind the scenes.</>,
        },
        {
          title: 'Control traffic without modifying relays',
          body: <>Add POST / REQ policies, BAN, Quarantine, kind limits, and DSL filters at the gateway layer.</>,
        },
        {
          title: 'Fail over when a backend breaks',
          body: <>Route around backend outages and make recovery decisions from the management console.</>,
        },
      ],
    },
    solves: {
      tag: 'WHAT IT SOLVES',
      title: 'Move the operational pain of relay management to the edge.',
      lead: (
        <>
          Keep relay servers focused on relay work, and move policy, observability, and emergency controls into
          the gateway. It adds a managed control plane without replacing the relay backend.
        </>
      ),
      items: [
        ['1 endpoint', 'Give users one URL while hiding backend topology changes.'],
        ['Policy edge', 'Manage post, subscription, IP, npub, kind, and DSL rules outside relay servers.'],
        ['Operational visibility', 'Track connections, rejections, backend health, and incidents from live dashboards.'],
        ['Emergency controls', 'Quickly apply Quarantine, Hard BAN, or POST policy changes when traffic gets noisy.'],
      ] as const,
    },
    features: [
      {
        title: 'RELAY AGGREGATION',
        tag: 'gateway',
        body: <>Bundle multiple backend relays and expose them as a single <code>wss://</code> endpoint. Add, disable, or weight backends at the edge.</>,
      },
      {
        title: 'FAILOVER POOL',
        tagSuffix: 'nodes',
        body: <>Move traffic to another backend during outages. Split read/write roles and weights to operate a managed relay service more safely.</>,
      },
      {
        title: 'POLICY LAYER',
        tag: 'access control',
        body: <>Apply POST / REQ, npub, IP, kind, and DSL rules at the gateway. Filtering is an add-on safety layer, not the whole product.</>,
      },
      {
        title: 'OPERATIONS',
        tag: 'live',
        body: <>Dashboard, Live Events, Telemetry, and System views are centralized in the console for fast operational response.</>,
      },
    ],
    flow: {
      tag: 'HOW IT WORKS',
      title: 'Insert one operational layer between clients and relay backends.',
      steps: [
        ['01', 'Clients connect to gateway', <>Nostr clients only register the <code>wss://</code> endpoint shown on this page.</>],
        ['02', 'Gateway applies policy', <>REQ / POST, npub, IP, kind, and DSL rules are evaluated before traffic reaches backend relays.</>],
        ['03', 'Backend relays do relay work', <>Allowed traffic is forwarded to the backend relay pool, with failover when a backend is unavailable.</>],
      ] as const,
      ctaTitle: 'Designed as an add-on for managed relay services.',
      ctaBody: 'Separating relay backends, gateway policy, and the console makes operational changes safer.',
      cta: 'Read architecture docs',
    },
    statusLog: (n: number) => `recent ${n}`,
    footerName: 'Proxy Nostr Relay Gateway (PROFILER)',
  },
} as const;
