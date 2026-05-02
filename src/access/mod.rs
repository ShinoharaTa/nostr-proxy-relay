//! クライアント単位のアクセス制御（IP / npub / Quarantine）。
//!
//! - `IpDecision`: 接続段階で hard_ban / shadow_ban / whitelist を決める
//! - `PostDecision`: EVENT を受けたときに通すかどうかを決める（policy + ban + quarantine）
//! - `ReqDecision`: REQ を受けたときに転送するかどうかを決める（IP shadow / 全体 quarantine）

pub mod ip;
pub mod npub_key;
pub mod post_policy;
pub mod quarantine;

pub use ip::{IpAclCache, IpDecision};
pub use npub_key::pubkey_hex_to_npub;
pub use post_policy::{evaluate_post, PostDecision};
pub use quarantine::{evaluate_quarantine, QuarantineDecision, QuarantineScope};
