/**
 * 認証付き `/api/*` のクライアント。
 * - 401 はブラウザ標準の BasicAuth ダイアログに任せる (UI 側で handle しない)
 * - 200 系以外は `ApiError` を投げる
 */

import { notifyApiUnreachable } from '../shell/OfflineBar';
import type {
  ActorWindow,
  AppVersionResponse,
  AutoGuardResponse,
  InvestigateRequest,
  InvestigateResponse,
  IpActorDetail,
  IpActorRow,
  NpubActorDetail,
  NpubActorRow,
  ConnectionLogRow,
  DryRunResult,
  EventRejectionLogRow,
  FilterRow,
  IpAccessControlRow,
  PostPolicyResponse,
  PutAutoGuardBody,
  QuarantineRow,
  RelayConfigRow,
  RelayEventLogRow,
  RelayInfoRow,
  RelayStatus,
  ReqKindBlacklistRow,
  SafelistRow,
  SimpleBanRuleRow,
  StatsPeriod,
  StatsResponse,
  StatsTimeseriesBucket,
  SystemInfoResponse,
  TelemetryStatusResponse,
  TelemetryTestResponse,
  ValidationResult,
} from './types';

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`${status}: ${body || '(empty)'}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (init?.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init?.method ?? (init?.json !== undefined ? 'POST' : 'GET'),
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
      body,
      signal: init?.signal,
    });
  } catch (e) {
    // 「fetch 自体が失敗」= サーバ不達 / ネット切断。AbortError はそのまま投げる。
    if ((e as Error).name !== 'AbortError') notifyApiUnreachable();
    throw e;
  }
  // 5xx もサーバ不調なので Offline バーを点ける。
  if (res.status >= 500) notifyApiUnreachable();
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text);
  }
  if (res.status === 204) return undefined as unknown as T;
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return undefined as unknown as T;
  return (await res.json()) as T;
}

type Sig = AbortSignal | undefined;

/** ──────── Relays ──────── */
export const Relays = {
  list:        (s?: Sig) => request<RelayConfigRow[]>('/relay', { signal: s }),
  put:         (relays: RelayConfigRow[]) =>
                 request<void>('/relay', { method: 'PUT', json: { relays } }),
  status:      (s?: Sig) => request<{ relays: RelayStatus[] }>('/relay-status', { signal: s }),
  fetchNip11:  (url: string, s?: Sig) =>
                 request<unknown>(`/relay-nip11?url=${encodeURIComponent(url)}`, { signal: s }),
};

/** ──────── Safelist (npub) ──────── */
export const Safelist = {
  list:    (s?: Sig) => request<SafelistRow[]>('/safelist', { signal: s }),
  upsert:  (row: SafelistRow) => request<void>('/safelist', { json: row }),
  remove:  (npub: string) =>
             request<void>(`/safelist/${encodeURIComponent(npub)}`, { method: 'DELETE' }),
  ban:     (npub: string) =>
             request<void>(`/safelist/${encodeURIComponent(npub)}/ban`, { method: 'PUT' }),
  unban:   (npub: string) =>
             request<void>(`/safelist/${encodeURIComponent(npub)}/unban`, { method: 'PUT' }),
};

/** ──────── DSL Filters ──────── */
export const Filters = {
  list:     (s?: Sig) => request<FilterRow[]>('/filters', { signal: s }),
  create:   (body: { name: string; nl_text: string; apply_to_post?: boolean; apply_to_backend?: boolean }) =>
              request<{ success: boolean; error?: string; id?: number }>('/filters', { json: body }),
  update:   (id: number, body: { name: string; nl_text: string; enabled: boolean; rule_order: number; apply_to_post?: boolean; apply_to_backend?: boolean }) =>
              request<{ success: boolean; error?: string; id?: number }>(`/filters/${id}`, { method: 'PUT', json: body }),
  remove:   (id: number) =>
              request<void>(`/filters/${id}`, { method: 'DELETE' }),
  validate: (query: string) =>
              request<ValidationResult>('/filters/validate', { json: { query } }),
};

/** ──────── IP ACL ──────── */
export const IpAcl = {
  list:    (s?: Sig) => request<IpAccessControlRow[]>('/ip-access-control', { signal: s }),
  create:  (body: { ip_address: string; mode: string; memo: string }) =>
             request<void>('/ip-access-control', { json: body }),
  update:  (id: number, body: { ip_address: string; mode: string; memo: string }) =>
             request<void>(`/ip-access-control/${id}`, { method: 'PUT', json: body }),
  remove:  (id: number) =>
             request<void>(`/ip-access-control/${id}`, { method: 'DELETE' }),
};

/** ──────── Kind Blocklist ──────── */
export const KindBlocklist = {
  list:    (s?: Sig) => request<ReqKindBlacklistRow[]>('/req-kind-blacklist', { signal: s }),
  create:  (body: { kind_value: number | null; kind_min: number | null; kind_max: number | null; enabled: boolean }) =>
             request<void>('/req-kind-blacklist', { json: body }),
  update:  (id: number, body: { kind_value: number | null; kind_min: number | null; kind_max: number | null; enabled: boolean }) =>
             request<void>(`/req-kind-blacklist/${id}`, { method: 'PUT', json: body }),
  remove:  (id: number) =>
             request<void>(`/req-kind-blacklist/${id}`, { method: 'DELETE' }),
};

/** ──────── Logs / Stats ──────── */
export const Logs = {
  connection: (params: { limit?: number; offset?: number; ip_address?: string; from?: string; to?: string }, s?: Sig) =>
                request<ConnectionLogRow[]>('/connection-logs' + qs(params), { signal: s }),
  rejection:  (params: { limit?: number; offset?: number; npub?: string; kind?: number; reason?: string; from?: string; to?: string }, s?: Sig) =>
                request<EventRejectionLogRow[]>('/event-rejection-logs' + qs(params), { signal: s }),
  backend:    (params: { limit?: number; relay_url?: string; event_type?: string; from?: string; to?: string }, s?: Sig) =>
                request<RelayEventLogRow[]>('/relay-event-logs' + qs(params), { signal: s }),
};

export const Stats = {
  current:    (s?: Sig) => request<StatsResponse>('/stats', { signal: s }),
  timeseries: (period: StatsPeriod, s?: Sig) =>
                request<StatsTimeseriesBucket[]>('/stats/timeseries' + qs({ period }), { signal: s }),
};

/** ──────── NIP-11 ──────── */
export const Nip11 = {
  get: (s?: Sig) => request<RelayInfoRow>('/relay-info', { signal: s }),
  put: (body: RelayInfoRow) => request<void>('/relay-info', { method: 'PUT', json: body }),
};

/** ──────── App version ──────── */
export const AppVersion = {
  get: (s?: Sig) => request<AppVersionResponse>('/app-version', { signal: s }),
};

/** ──────── Simple BAN (Quick BAN) ──────── */
export const SimpleBan = {
  list:    (s?: Sig) => request<SimpleBanRuleRow[]>('/simple-ban-rules', { signal: s }),
  create:  (body: Partial<SimpleBanRuleRow> & { rule_type: string }) =>
             request<SimpleBanRuleRow>('/simple-ban-rules', { json: body }),
  update:  (id: number, body: Partial<SimpleBanRuleRow> & { rule_type: string }) =>
             request<void>(`/simple-ban-rules/${id}`, { method: 'PUT', json: body }),
  remove:  (id: number) =>
             request<void>(`/simple-ban-rules/${id}`, { method: 'DELETE' }),
};

/** ──────── Quarantine ──────── */
export const Quarantine = {
  list:   (s?: Sig) => request<QuarantineRow[]>('/quarantine', { signal: s }),
  create: (body: { npub: string; scope?: string; reason?: string; duration_secs?: number | null }) =>
            request<QuarantineRow>('/quarantine', { json: body }),
  remove: (id: number) =>
            request<void>(`/quarantine/${id}`, { method: 'DELETE' }),
};

/** ──────── POST Policy ──────── */
export const PostPolicy = {
  get: (s?: Sig) => request<PostPolicyResponse>('/post-policy', { signal: s }),
  put: (body: { policy: string; backend_strategy?: string; write_routing?: string }) =>
         request<PostPolicyResponse>('/post-policy', { method: 'PUT', json: body }),
};

/** ──────── Actors (ui_redesign §14.2) ──────── */
export const Actors = {
  topIps: (window: ActorWindow, sort: 'connections' | 'events' | 'rejections' = 'connections', s?: Sig) =>
    request<{ actors: IpActorRow[] }>(`/stats/actors?by=ip&window=${window}&sort=${sort}`, { signal: s })
      .then((r) => r.actors),
  topNpubs: (window: ActorWindow, s?: Sig) =>
    request<{ actors: NpubActorRow[] }>(`/stats/actors?by=npub&window=${window}`, { signal: s })
      .then((r) => r.actors),
  ipDetail: (ip: string, s?: Sig) =>
    request<IpActorDetail>(`/actors/ip/${encodeURIComponent(ip)}`, { signal: s }),
  npubDetail: (npub: string, s?: Sig) =>
    request<NpubActorDetail>(`/actors/npub/${encodeURIComponent(npub)}`, { signal: s }),
};

/** ──────── Investigate (Issue #31) ──────── */
export const Investigate = {
  run: (body: InvestigateRequest) =>
    request<InvestigateResponse>('/investigate', { json: body }),
};

/** ──────── Auto Guard (spec §5.14) ──────── */
export const AutoGuard = {
  get: (s?: Sig) => request<AutoGuardResponse>('/auto-guard', { signal: s }),
  put: (body: PutAutoGuardBody) =>
         request<AutoGuardResponse>('/auto-guard', { method: 'PUT', json: body }),
  clearContentMutes: () =>
         request<{ cleared: number }>('/auto-guard/content-mutes', { method: 'DELETE' }),
};

/** ──────── Translate / Dry-Run ──────── */
export const Translate = {
  simpleToDsl: (rule: unknown) =>
                 request<{ dsl: string }>('/translate/simple-to-dsl', { json: { rule } }),
  dslToSimple: (dsl: string) =>
                 request<{ ok: boolean; rule?: unknown; error?: string }>('/translate/dsl-to-simple', { json: { dsl } }),
  dryRun:      (dsl: string, event: unknown) =>
                 request<DryRunResult>('/translate/dry-run', { json: { dsl, event } }),
};

/** ──────── System / Telemetry (Phase 2.6 — 新規エンドポイント) ──────── */
export const System = {
  info: (s?: Sig) => request<SystemInfoResponse>('/system/info', { signal: s }),
};

export const Telemetry = {
  status: (s?: Sig) => request<TelemetryStatusResponse>('/telemetry/status', { signal: s }),
  test:   () => request<TelemetryTestResponse>('/telemetry/test', { method: 'POST' }),
};

/** ──────── helper: query-string ──────── */
function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
