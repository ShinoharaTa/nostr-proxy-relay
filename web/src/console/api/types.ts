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
export type WriteRouting = 'all' | 'primary_default';

export interface PostPolicyResponse {
  policy: PostPolicyValue;
  backend_strategy: BackendStrategy;
  write_routing: WriteRouting;
}

/** アクター集約 (ui_redesign §14.2) — `/api/stats/actors` */
export type ActorWindow = '1h' | '24h' | '7d' | 'all';

export interface IpActorRow {
  ip: string;
  connections: number;
  events: number;
  rejections: number;
  last_seen: string;
  mode: IpAclMode;
  active_connections: number;
}

export interface NpubActorRow {
  npub: string;
  rejections: number;
  kinds: string;
  last_seen: string;
  safelist_flags: number | null;
  banned: boolean;
  quarantined: boolean;
}

export interface ActorRecentRejection {
  event_id: string;
  npub: string;
  ip_address: string | null;
  kind: number;
  reason: string;
  created_at: string;
}

export interface IpActorDetail {
  type: 'ip';
  id: string;
  mode: IpAclMode;
  active_connections: number;
  connections: number;
  events: number;
  rejections: number;
  first_seen: string | null;
  last_seen: string | null;
  recent_rejections: ActorRecentRejection[];
  acl_entries: { id: number; ip_address: string; mode: string; memo: string }[];
}

export interface NpubActorDetail {
  type: 'npub';
  id: string;
  rejections: number;
  first_seen: string | null;
  last_seen: string | null;
  recent_rejections: ActorRecentRejection[];
  safelist: { flags: number; banned: boolean; memo: string } | null;
  quarantine_entries: { id: number; scope: string; reason: string; expires_at: string | null }[];
}

/** イベント調査 (Issue #31) — `/api/investigate`。保存はせず上流に都度問い合わせる */
export interface InvestigateRequest {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  limit?: number;
  relays?: string[];
  timeout_ms?: number;
}

export interface RelayStat { url: string; count: number; latency_ms: number; completed: boolean }
export interface Counted { value: string; count: number }
export interface TagStat { name: string; value: string; count: number; coverage: number }
export interface TimingStat { span_secs: number; median_interval_secs: number; regularity: number }
export interface Verdict {
  kind: string;
  confidence: string;
  detail: string;
  suggested_rule: unknown | null;
}

export interface Analysis {
  fetched: number;
  unique_events: number;
  by_relay: RelayStat[];
  authors_unique: number;
  top_authors: Counted[];
  content_unique: number;
  top_contents: Counted[];
  common_tags: TagStat[];
  timing: TimingStat | null;
  verdicts: Verdict[];
}

export interface InvestigateResponse {
  analysis: Analysis;
  local: {
    matched: number;
    ips: { ip: string; count: number }[];
    reasons: { reason: string; count: number }[];
    suggested_ip_ban: string | null;
  };
  relays_queried: string[];
}

/** 自動ガード (spec §5.14) — `/api/auto-guard` */
export interface AutoGuardMute {
  content_hash: string;
  /** unix 秒 */
  expires_at: number;
}

export interface AutoGuardResponse {
  enabled: boolean;
  burst_window_secs: number;
  burst_max_events: number;
  /** CSV (例 "6,7") */
  exclude_kinds: string;
  duplicate_threshold: number;
  duplicate_window_secs: number;
  quarantine_secs: number;
  content_mutes: AutoGuardMute[];
  content_mute_total: number;
}

export interface PutAutoGuardBody {
  enabled: boolean;
  burst_window_secs: number;
  burst_max_events: number;
  exclude_kinds: string;
  duplicate_threshold: number;
  duplicate_window_secs: number;
  quarantine_secs: number;
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
