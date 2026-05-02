import type {
  Stats,
  RelayConfig,
  RelayInfo,
  RelayStatusResponse,
  StatsTimeseriesBucket,
  SimpleBanRule,
  SafelistEntry,
  IpAccessControl,
  IpMode,
  ReqKindBlacklist,
  FilterRule,
  ConnectionLog,
  EventRejectionLog,
  RelayEventLog,
  QuarantineEntry,
  PostPolicy,
} from './types';

const apiBase = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase}${path}`);
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  await fetch(`${apiBase}${path}`, { method: 'DELETE' });
}

export const api = {
  getStats: () => get<Stats>('/stats'),
  getStatsTimeseries: (params?: { period?: string; from?: string; to?: string }) => {
    const sp = new URLSearchParams();
    if (params?.period) sp.set('period', params.period);
    if (params?.from) sp.set('from', params.from);
    if (params?.to) sp.set('to', params.to);
    const qs = sp.toString();
    return get<StatsTimeseriesBucket[]>(qs ? `/stats/timeseries?${qs}` : '/stats/timeseries');
  },
  getRelay: () => get<RelayConfig[]>('/relay'),
  getRelayStatus: () => get<RelayStatusResponse>('/relay-status'),
  getRelayNip11: (url: string) => get<Record<string, unknown>>(`/relay-nip11?url=${encodeURIComponent(url)}`),
  putRelay: (relays: { relays: RelayConfig[] }) => put<unknown>('/relay', relays),
  getRelayInfo: () => get<RelayInfo>('/relay-info'),
  putRelayInfo: (info: RelayInfo) => put<unknown>('/relay-info', info),
  getSafelist: () => get<SafelistEntry[]>('/safelist'),
  postSafelist: (entry: { npub: string; flags: number; memo: string }) => post<unknown>('/safelist', entry),
  deleteSafelist: (npub: string) => del(`/safelist/${encodeURIComponent(npub)}`),
  banSafelist: (npub: string) => put<unknown>(`/safelist/${encodeURIComponent(npub)}/ban`, {}),
  unbanSafelist: (npub: string) => put<unknown>(`/safelist/${encodeURIComponent(npub)}/unban`, {}),
  getIpAccessControl: () => get<IpAccessControl[]>('/ip-access-control'),
  postIpAccessControl: (body: { ip_address: string; mode: IpMode; memo: string }) =>
    post<unknown>('/ip-access-control', body),
  putIpAccessControl: (id: number, body: { ip_address: string; mode: IpMode; memo: string }) =>
    put<unknown>(`/ip-access-control/${id}`, body),
  deleteIpAccessControl: (id: number) => del(`/ip-access-control/${id}`),
  getReqKindBlacklist: () => get<ReqKindBlacklist[]>('/req-kind-blacklist'),
  postReqKindBlacklist: (body: unknown) => post<unknown>('/req-kind-blacklist', body),
  putReqKindBlacklist: (id: number, body: ReqKindBlacklist) => put<unknown>(`/req-kind-blacklist/${id}`, body),
  deleteReqKindBlacklist: (id: number) => del(`/req-kind-blacklist/${id}`),
  getFilters: () => get<FilterRule[]>('/filters'),
  postFilters: (body: { name: string; nl_text: string; apply_to_post?: boolean; apply_to_backend?: boolean }) =>
    post<unknown>('/filters', body),
  putFilters: (id: number, body: FilterRule) => put<unknown>(`/filters/${id}`, body),
  deleteFilters: (id: number) => del(`/filters/${id}`),
  getSimpleBanRules: () => get<SimpleBanRule[]>('/simple-ban-rules'),
  postSimpleBanRule: (body: {
    rule_type: string;
    npub_list?: string;
    kind_list?: string;
    tag_name?: string;
    tag_value_pattern?: string;
    enabled?: boolean;
    apply_to_post?: boolean;
    apply_to_backend?: boolean;
    memo?: string;
  }) => post<SimpleBanRule>('/simple-ban-rules', body),
  putSimpleBanRule: (
    id: number,
    body: {
      rule_type: string;
      npub_list?: string;
      kind_list?: string;
      tag_name?: string;
      tag_value_pattern?: string;
      enabled?: boolean;
      apply_to_post?: boolean;
      apply_to_backend?: boolean;
      memo?: string;
    },
  ) => put<unknown>(`/simple-ban-rules/${id}`, body),
  deleteSimpleBanRule: (id: number) => del(`/simple-ban-rules/${id}`),
  getConnectionLogs: (params?: { limit?: number; offset?: number; ip_address?: string; from?: string; to?: string }) => {
    const sp = new URLSearchParams();
    sp.set('limit', String(params?.limit ?? 100));
    if (params?.offset != null) sp.set('offset', String(params.offset));
    if (params?.ip_address) sp.set('ip_address', params.ip_address);
    if (params?.from) sp.set('from', params.from);
    if (params?.to) sp.set('to', params.to);
    return get<ConnectionLog[]>(`/connection-logs?${sp}`);
  },
  getRelayEventLogs: (params?: { limit?: number; relay_url?: string; event_type?: string; from?: string; to?: string }) => {
    const sp = new URLSearchParams();
    sp.set('limit', String(params?.limit ?? 100));
    if (params?.relay_url) sp.set('relay_url', params.relay_url);
    if (params?.event_type) sp.set('event_type', params.event_type);
    if (params?.from) sp.set('from', params.from);
    if (params?.to) sp.set('to', params.to);
    return get<RelayEventLog[]>(`/relay-event-logs?${sp}`);
  },
  getAppVersion: () => get<{ version: string }>('/app-version'),
  getEventRejectionLogs: (params?: { limit?: number; offset?: number; npub?: string; kind?: number; reason?: string; from?: string; to?: string }) => {
    const sp = new URLSearchParams();
    sp.set('limit', String(params?.limit ?? 100));
    if (params?.offset != null) sp.set('offset', String(params.offset));
    if (params?.npub) sp.set('npub', params.npub);
    if (params?.kind != null) sp.set('kind', String(params.kind));
    if (params?.reason) sp.set('reason', params.reason);
    if (params?.from) sp.set('from', params.from);
    if (params?.to) sp.set('to', params.to);
    return get<EventRejectionLog[]>(`/event-rejection-logs?${sp}`);
  },
  // 新規: POST policy / Quarantine / translate
  getPostPolicy: () => get<PostPolicy>('/post-policy'),
  putPostPolicy: (body: PostPolicy) => put<PostPolicy>('/post-policy', body),
  getQuarantine: () => get<QuarantineEntry[]>('/quarantine'),
  postQuarantine: (body: { npub: string; scope?: 'post' | 'req' | 'all'; reason?: string; duration_secs?: number | null }) =>
    post<QuarantineEntry>('/quarantine', body),
  deleteQuarantine: (id: number) => del(`/quarantine/${id}`),
  translateSimpleToDsl: (rule: {
    rule_type: string;
    npub_list?: string | null;
    kind_list?: string | null;
    tag_name?: string | null;
    tag_value_pattern?: string | null;
  }) => post<{ dsl: string }>('/translate/simple-to-dsl', { rule }),
  translateDslToSimple: (dsl: string) =>
    post<{ ok: boolean; rule?: unknown; error?: string }>('/translate/dsl-to-simple', { dsl }),
  dryRunFilter: (dsl: string, event: unknown) =>
    post<{ ok: boolean; matched: boolean; error?: string }>('/translate/dry-run', { dsl, event }),
};
