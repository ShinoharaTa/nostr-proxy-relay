/**
 * バックエンド `/api/*` のレスポンス型定義。
 * Rust 側 (src/api/routes.rs) と一致させる。
 */

export interface RelayConfigRow {
  url: string;
  enabled: boolean;
  role: string;
  weight: number;
  read_enabled: boolean;
  write_enabled: boolean;
}

export interface RelayStatus {
  url: string;
  status: string;
  connected_since?: string | null;
  last_event_at?: string | null;
}

export interface SafelistRow {
  npub: string;
  flags: number;
  memo: string;
  banned: boolean;
}

export interface FilterRow {
  id: number;
  name: string;
  nl_text: string;
  parsed_json: string;
  enabled: boolean;
  rule_order: number;
  apply_to_post: boolean;
  apply_to_backend: boolean;
}

export type IpAclMode = 'hard_ban' | 'shadow_ban' | 'whitelist' | 'normal';

export interface IpAccessControlRow {
  id?: number | null;
  ip_address: string;
  mode: IpAclMode;
  is_cidr: boolean;
  memo: string;
}

export interface ReqKindBlacklistRow {
  id: number;
  kind_value: number | null;
  kind_min: number | null;
  kind_max: number | null;
  enabled: boolean;
}

export interface ConnectionLogRow {
  id: number;
  ip_address: string;
  connected_at: string;
  disconnected_at: string | null;
  event_count: number;
  rejected_event_count: number;
}

export interface EventRejectionLogRow {
  id: number;
  event_id: string;
  pubkey_hex: string;
  npub: string;
  ip_address: string | null;
  kind: number;
  reason: string;
  created_at: string;
}

export interface RelayEventLogRow {
  id: number;
  relay_url: string;
  event_type: string;
  detail: string;
  created_at: string;
}

export interface RejectionReasonCount { reason: string; count: number; }
export interface NpubRejectionCount    { npub: string;   count: number; }
export interface IpRejectionCount      { ip_address: string; count: number; }

export interface StatsResponse {
  total_connections: number;
  active_connections: number;
  total_rejections: number;
  rejections_by_reason: RejectionReasonCount[];
  top_npubs_by_rejections: NpubRejectionCount[];
  top_ips_by_rejections: IpRejectionCount[];
}

export interface StatsTimeseriesBucket {
  time: string;
  posted: number;
  delivered: number;
  rejections: number;
}

export type StatsPeriod = '15m' | '1h' | '6h' | '24h' | '7d';

export interface SimpleBanRuleRow {
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

export type QuarantineScope = 'post' | 'req' | 'all';

export interface QuarantineRow {
  id: number;
  npub: string;
  scope: QuarantineScope;
  reason: string;
  created_at: string;
  expires_at: string | null;
  active: boolean;
}

export type PostPolicyValue = 'allowlist' | 'denylist';
export type BackendStrategy = 'failover' | 'fan_out_event' | 'fan_in_req' | 'sharded';

export interface PostPolicyResponse {
  policy: PostPolicyValue;
  backend_strategy: BackendStrategy;
}

export interface RelayInfoRow {
  name: string | null;
  description: string | null;
  pubkey: string | null;
  contact: string | null;
  supported_nips: string | null;
  software: string | null;
  version: string | null;
  limitation_max_limit: number | null;
  limitation_max_message_length: number | null;
  limitation_max_subscriptions: number | null;
  limitation_max_filters: number | null;
  limitation_max_event_tags: number | null;
  limitation_max_content_length: number | null;
  limitation_auth_required: boolean;
  limitation_payment_required: boolean;
  icon: string | null;
  negentropy: number | null;
}

export interface AppVersionResponse { version: string; }

/** SSE: live event bus payload (`/api/events/stream`) */
export interface LiveEvent {
  ts: string;
  /** "accepted" | "delivered" | "rejected" | "dropped" | etc. */
  kind: string;
  npub?: string | null;
  ip?: string | null;
  reason?: string | null;
  detail?: string | null;
  event_kind?: number | null;
  /** 任意の追加フィールド (互換のため緩く受ける) */
  [k: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  parsed_query?: unknown;
}

export interface DryRunResult {
  matched: boolean;
  reason?: string | null;
  parsed?: unknown;
}

export interface SystemInfoResponse {
  version: string;
  uptime_sec: number;
  auth_throttle: {
    threshold: number;
    window_secs: number;
    lock_duration_secs: number;
    locked_ips_count: number;
  };
  retention: {
    log_retention_days: number | null;
    overrides: Record<string, string>;
  };
  disk: {
    db_path: string;
    db_size_bytes: number | null;
  };
  env_overrides: string[];
}

export interface TelemetryStatusResponse {
  configured: boolean;
  url: string | null;
  bucket: string | null;
  org: string | null;
  /** token is masked: last 4 chars only */
  token_hint: string | null;
}

export interface TelemetryTestResponse {
  ok: boolean;
  status_code: number | null;
  message: string;
}
