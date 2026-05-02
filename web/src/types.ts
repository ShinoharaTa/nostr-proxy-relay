export type IpMode = 'normal' | 'hard_ban' | 'shadow_ban' | 'whitelist';

export interface IpAccessControl {
  id?: number;
  ip_address: string;
  mode: IpMode;
  is_cidr: boolean;
  memo: string;
}

export interface SafelistEntry {
  npub: string;
  flags: number;
  memo: string;
  banned?: boolean;
}

export interface ReqKindBlacklist {
  id: number;
  kind_value?: number;
  kind_min?: number;
  kind_max?: number;
  enabled: boolean;
}

export interface FilterRule {
  id: number;
  name: string;
  nl_text: string;
  parsed_json: string;
  enabled: boolean;
  rule_order: number;
  apply_to_post: boolean;
  apply_to_backend: boolean;
}

export interface RelayConfig {
  url: string;
  enabled: boolean;
  role?: string;
  weight?: number;
  read_enabled?: boolean;
  write_enabled?: boolean;
}

export interface ConnectionLog {
  id: number;
  ip_address: string;
  connected_at: string;
  disconnected_at?: string;
  event_count: number;
  rejected_event_count: number;
}

export interface EventRejectionLog {
  id: number;
  event_id: string;
  pubkey_hex: string;
  npub: string;
  ip_address?: string;
  kind: number;
  reason: string;
  created_at: string;
}

export interface RelayEventLog {
  id: number;
  relay_url: string;
  event_type: string;
  detail: string;
  created_at: string;
}

export interface Stats {
  total_connections: number;
  active_connections: number;
  total_rejections: number;
  rejections_by_reason: { reason: string; count: number }[];
  top_npubs_by_rejections: { npub: string; count: number }[];
  top_ips_by_rejections: { ip_address: string; count: number }[];
}

export interface RelayInfo {
  name?: string;
  description?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: string;
  software?: string;
  version?: string;
  limitation_max_limit?: number;
  limitation_max_message_length?: number;
  limitation_max_subscriptions?: number;
  limitation_max_filters?: number;
  limitation_max_event_tags?: number;
  limitation_max_content_length?: number;
  limitation_auth_required: boolean;
  limitation_payment_required: boolean;
  icon?: string;
  negentropy?: number;
}

export type Tab =
  | 'dashboard'
  | 'live'
  | 'relays'
  | 'relay-info'
  | 'safelist'
  | 'ip'
  | 'quarantine'
  | 'kind'
  | 'filters'
  | 'simple-ban'
  | 'logs'
  | 'metrics';

export interface RelayStatusPoint {
  timestamp: string;
  status: string;
  latency_ms?: number;
}

export interface RelayStatusItem {
  url: string;
  status: string;
  enabled: boolean;
  uptime_history: RelayStatusPoint[];
  last_error: string | null;
  connected_since: string | null;
}

export interface RelayStatusResponse {
  relays: RelayStatusItem[];
}

export interface StatsTimeseriesBucket {
  time: string;
  posted: number;
  delivered: number;
  rejections: number;
}

export interface SimpleBanRule {
  id: number;
  rule_type: string;
  npub_list: string | null;
  kind_list: string | null;
  tag_name: string | null;
  tag_value_pattern: string | null;
  enabled: boolean;
  apply_to_post: boolean;
  apply_to_backend: boolean;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuarantineEntry {
  id: number;
  npub: string;
  scope: 'post' | 'req' | 'all';
  reason: string;
  created_at: string;
  expires_at?: string | null;
  active: boolean;
}

export interface PostPolicy {
  policy: 'allowlist' | 'denylist';
  backend_strategy: string;
}

export type LiveEvent =
  | { type: 'event_accepted'; ts: string; kind: number; npub: string; ip?: string }
  | { type: 'event_rejected'; ts: string; kind: number; npub: string; ip?: string; reason: string }
  | { type: 'event_delivered'; ts: string; kind: number; npub: string; sub_id: string }
  | { type: 'event_dropped'; ts: string; kind: number; npub: string; sub_id: string; reason: string }
  | { type: 'connection_opened'; ts: string; ip: string }
  | { type: 'connection_closed'; ts: string; ip: string };
