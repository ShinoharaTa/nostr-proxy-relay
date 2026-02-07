import type {
  Stats,
  RelayConfig,
  RelayInfo,
  RelayStatusResponse,
  StatsTimeseriesBucket,
  SimpleBanRule,
  SafelistEntry,
  IpAccessControl,
  ReqKindBlacklist,
  FilterRule,
  ConnectionLog,
  EventRejectionLog,
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
    if (!params?.period && !params?.from && !params?.to) {
      return get<StatsTimeseriesBucket[]>('/stats/timeseries');
    }
    const sp = new URLSearchParams();
    if (params?.period) sp.set('period', params.period);
    if (params?.from) sp.set('from', params.from);
    if (params?.to) sp.set('to', params.to);
    return get<StatsTimeseriesBucket[]>(`/stats/timeseries?${sp}`);
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
  postIpAccessControl: (body: { ip_address: string; banned: boolean; whitelisted: boolean; memo: string }) =>
    post<unknown>('/ip-access-control', body),
  putIpAccessControl: (id: number, body: IpAccessControl) => put<unknown>(`/ip-access-control/${id}`, body),
  deleteIpAccessControl: (id: number) => del(`/ip-access-control/${id}`),
  getReqKindBlacklist: () => get<ReqKindBlacklist[]>('/req-kind-blacklist'),
  postReqKindBlacklist: (body: unknown) => post<unknown>('/req-kind-blacklist', body),
  putReqKindBlacklist: (id: number, body: ReqKindBlacklist) => put<unknown>(`/req-kind-blacklist/${id}`, body),
  deleteReqKindBlacklist: (id: number) => del(`/req-kind-blacklist/${id}`),
  getFilters: () => get<FilterRule[]>('/filters'),
  postFilters: (body: { name: string; nl_text: string }) => post<unknown>('/filters', body),
  putFilters: (id: number, body: FilterRule) => put<unknown>(`/filters/${id}`, body),
  deleteFilters: (id: number) => del(`/filters/${id}`),
  getSimpleBanRules: () => get<SimpleBanRule[]>('/simple-ban-rules'),
  postSimpleBanRule: (body: { rule_type: string; npub_list?: string; kind_list?: string; tag_name?: string; tag_value_pattern?: string; enabled?: boolean; memo?: string }) =>
    post<SimpleBanRule>('/simple-ban-rules', body),
  putSimpleBanRule: (id: number, body: { rule_type: string; npub_list?: string; kind_list?: string; tag_name?: string; tag_value_pattern?: string; enabled?: boolean; memo?: string }) =>
    put<unknown>(`/simple-ban-rules/${id}`, body),
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
};
