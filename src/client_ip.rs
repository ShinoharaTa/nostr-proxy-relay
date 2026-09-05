//! クライアント実 IP の解決（Issue #37）。
//!
//! Cloudflare Tunnel（cloudflared → localhost）配下では、TCP ピアはすべて
//! 127.0.0.1 になり、IP ACL / TOP SOURCES / 自動ガード / ロックアウトが機能しない。
//! Cloudflare は実クライアント IP を `CF-Connecting-IP` ヘッダで渡すため、
//! **ピアが loopback のときに限り**ヘッダを信頼して実 IP とする。
//!
//! ピアが loopback でない（= 直接続の）場合はヘッダを一切信頼しない。
//! 外部から `CF-Connecting-IP` を付けて偽装されても無視される。

use axum::http::HeaderMap;
use std::net::IpAddr;

/// 信頼するヘッダの優先順。cloudflared は CF-Connecting-IP を必ず付ける。
/// X-Real-IP / X-Forwarded-For は将来 nginx 等を手前に置いた場合のフォールバック。
const TRUSTED_HEADERS: [&str; 3] = ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"];

/// TCP ピアとリクエストヘッダから、記録・判定に使うクライアント IP を決める。
pub fn resolve_client_ip(peer: IpAddr, headers: &HeaderMap) -> String {
    if !peer.is_loopback() {
        return peer.to_string();
    }
    for name in TRUSTED_HEADERS {
        let Some(value) = headers.get(name).and_then(|v| v.to_str().ok()) else {
            continue;
        };
        // X-Forwarded-For は "client, proxy1, proxy2" 形式。先頭がクライアント
        let candidate = value.split(',').next().unwrap_or("").trim();
        if let Ok(ip) = candidate.parse::<IpAddr>() {
            // ヘッダに loopback が入っていたら意味が無いのでピアのまま扱う
            if !ip.is_loopback() {
                return ip.to_string();
            }
        }
    }
    peer.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn hm(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut h = HeaderMap::new();
        for (k, v) in pairs {
            h.insert(
                axum::http::HeaderName::from_bytes(k.as_bytes()).unwrap(),
                HeaderValue::from_str(v).unwrap(),
            );
        }
        h
    }

    const LO: IpAddr = IpAddr::V4(std::net::Ipv4Addr::LOCALHOST);

    #[test]
    fn tunnel_peer_uses_cf_connecting_ip() {
        let h = hm(&[("cf-connecting-ip", "203.0.113.9")]);
        assert_eq!(resolve_client_ip(LO, &h), "203.0.113.9");
    }

    #[test]
    fn direct_peer_ignores_headers_entirely() {
        // 直接続でヘッダ偽装されても無視 → スプーフィング不可
        let h = hm(&[("cf-connecting-ip", "10.0.0.99"), ("x-forwarded-for", "10.0.0.98")]);
        let peer: IpAddr = "198.51.100.7".parse().unwrap();
        assert_eq!(resolve_client_ip(peer, &h), "198.51.100.7");
    }

    #[test]
    fn falls_back_through_header_priority() {
        let h = hm(&[("x-forwarded-for", "203.0.113.5, 172.16.0.1")]);
        assert_eq!(resolve_client_ip(LO, &h), "203.0.113.5");
        // ヘッダ無し → ピアのまま
        assert_eq!(resolve_client_ip(LO, &HeaderMap::new()), "127.0.0.1");
    }

    #[test]
    fn garbage_and_loopback_headers_are_rejected() {
        let h = hm(&[("cf-connecting-ip", "not-an-ip")]);
        assert_eq!(resolve_client_ip(LO, &h), "127.0.0.1");
        let h = hm(&[("cf-connecting-ip", "127.0.0.1")]);
        assert_eq!(resolve_client_ip(LO, &h), "127.0.0.1");
    }

    #[test]
    fn ipv6_supported() {
        let h = hm(&[("cf-connecting-ip", "2001:db8::1")]);
        let lo6: IpAddr = "::1".parse().unwrap();
        assert_eq!(resolve_client_ip(lo6, &h), "2001:db8::1");
    }
}
