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
      confirmDelete: '削除しますか？',
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
      confirmRelease: (npub: string) => `${npub} の隔離を解除しますか？`,
      released: '解除しました',
      created: '隔離しました',
      emptyHint: 'QUARANTINE で時限ミュートを追加できます',
    },
    ipacl: {
      emptyHint: 'ADD で IP / CIDR を追加してください',
      hardBanTitle: 'HARD BAN を実行しますか？',
      hardBanBody: (ip: string) => (
        <p>{ip} を Hard BAN します。<strong>該当 IP の既存 WS 接続は強制切断</strong>され、以後の接続も拒否します。</p>
      ),
      hardBanNote: (when: string) => `CIDR の場合、範囲内の全てのセッションが切断されます。実行は記録されます (${when} 予定)。`,
    },
    npub: {
      confirmDelete: (npub: string) => `${npub} を削除しますか？`,
      banned: 'BAN しました',
      unbanned: 'unban しました',
      emptyHint: 'ADD で公開鍵を追加してください',
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
      confirmDelete: (url: string) => `backend relay "${url}" を削除しますか？`,
      updated: 'backend relays を更新しました',
      duplicateUrl: 'すでに登録済みの URL です',
      queued: '追加候補に積みました。SAVE で確定。',
      saveTitle: '変更を保存しますか？',
      saveBody: 'backend relay 構成を更新します。接続中のセッションは新構成に切り替わるまで一瞬切断される可能性があります。',
      emptyHint: 'ADD ボタンで wss URL を追加してください',
      nip11ProbeFailed: (msg: string) => `NIP-11 取得失敗: ${msg}`,
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
      confirmDelete: 'Delete this entry?',
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
      confirmRelease: (npub: string) => `Release quarantine for ${npub}?`,
      released: 'Released',
      created: 'Quarantined',
      emptyHint: 'Add a timed mute with QUARANTINE',
    },
    ipacl: {
      emptyHint: 'Use ADD to register an IP / CIDR',
      hardBanTitle: 'Execute HARD BAN?',
      hardBanBody: (ip: string) => (
        <p>Hard-ban {ip}. <strong>Existing WS connections from this IP are force-disconnected</strong> and future connections are rejected.</p>
      ),
      hardBanNote: (when: string) => `For CIDR, every session in the range is disconnected. The action is logged (scheduled ${when}).`,
    },
    npub: {
      confirmDelete: (npub: string) => `Delete ${npub}?`,
      banned: 'Banned',
      unbanned: 'Unbanned',
      emptyHint: 'Use ADD to register a public key',
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
      confirmDelete: (url: string) => `Delete backend relay "${url}"?`,
      updated: 'Backend relays updated',
      duplicateUrl: 'This URL is already registered',
      queued: 'Queued for addition. Press SAVE to apply.',
      saveTitle: 'Save changes?',
      saveBody: 'Updates the backend relay set. Connected sessions may be briefly disconnected while switching to the new configuration.',
      emptyHint: 'Use the ADD button to register a wss URL',
      nip11ProbeFailed: (msg: string) => `NIP-11 probe failed: ${msg}`,
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
