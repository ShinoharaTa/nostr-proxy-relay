//! NIP-19 (bech32) エンティティのデコード（Issue #35 P1）。
//!
//! 調査機能の入力を hex に正規化するためのもの。エンコードは npub_key.rs 参照。
//!
//! 対応: npub / note / nevent / nprofile / naddr
//! 拒否: **nsec**（秘密鍵の誤貼り付け事故を防ぐ。値はエラーにもログにも含めない）

use anyhow::{bail, Context};

/// デコード結果。relays は nevent / nprofile / naddr の TLV に入っているリレーヒント。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Nip19Entity {
    /// npub / nprofile → 32 byte pubkey (hex)
    Pubkey { hex: String, relays: Vec<String> },
    /// note / nevent → 32 byte event id (hex)
    EventId { hex: String, relays: Vec<String> },
    /// naddr → addressable event の座標
    Addr {
        kind: u32,
        author_hex: String,
        identifier: String,
        relays: Vec<String>,
    },
}

/// 入力 1 トークンをデコードする。bech32 でなければ Err（呼び出し側で hex として扱う）。
pub fn decode(input: &str) -> anyhow::Result<Nip19Entity> {
    let s = input.trim();
    // nostr: URI プレフィックスは剥がして受け付ける（クライアントのコピー形式差異）
    let s = s.strip_prefix("nostr:").unwrap_or(s);

    let (hrp, data) = bech32::decode(s).context("bech32 decode failed")?;
    match hrp.as_str() {
        "nsec" => {
            // 値は絶対に出力しない
            bail!("nsec（秘密鍵）は受け付けません。npub / note / nevent を使ってください")
        }
        "npub" => Ok(Nip19Entity::Pubkey {
            hex: bytes32_hex(&data).context("npub payload")?,
            relays: Vec::new(),
        }),
        "note" => Ok(Nip19Entity::EventId {
            hex: bytes32_hex(&data).context("note payload")?,
            relays: Vec::new(),
        }),
        "nevent" => {
            let tlv = parse_tlv(&data)?;
            let id = tlv_required_32(&tlv, 0).context("nevent: special (event id) がありません")?;
            Ok(Nip19Entity::EventId {
                hex: id,
                relays: tlv_relays(&tlv),
            })
        }
        "nprofile" => {
            let tlv = parse_tlv(&data)?;
            let pk = tlv_required_32(&tlv, 0).context("nprofile: special (pubkey) がありません")?;
            Ok(Nip19Entity::Pubkey {
                hex: pk,
                relays: tlv_relays(&tlv),
            })
        }
        "naddr" => {
            let tlv = parse_tlv(&data)?;
            let identifier = tlv
                .iter()
                .find(|(t, _)| *t == 0)
                .map(|(_, v)| String::from_utf8_lossy(v).to_string())
                .context("naddr: special (identifier) がありません")?;
            let author_hex = tlv_required_32(&tlv, 2).context("naddr: author がありません")?;
            let kind = tlv
                .iter()
                .find(|(t, _)| *t == 3)
                .and_then(|(_, v)| v.as_slice().try_into().ok().map(u32::from_be_bytes))
                .context("naddr: kind がありません")?;
            Ok(Nip19Entity::Addr {
                kind,
                author_hex,
                identifier,
                relays: tlv_relays(&tlv),
            })
        }
        other => bail!("未対応の bech32 プレフィックス: {other}"),
    }
}

/// hex(64 桁) / NIP-19 の両対応で「pubkey の hex」に正規化する。
pub fn normalize_pubkey(input: &str) -> anyhow::Result<(String, Vec<String>)> {
    let s = input.trim();
    if is_hex64(s) {
        return Ok((s.to_lowercase(), Vec::new()));
    }
    match decode(s)? {
        Nip19Entity::Pubkey { hex, relays } => Ok((hex, relays)),
        _ => bail!("pubkey ではありません: 先頭 npub1 / nprofile1 か 64 桁 hex を指定してください"),
    }
}

/// hex(64 桁) / NIP-19 の両対応で「event id の hex」に正規化する。
pub fn normalize_event_id(input: &str) -> anyhow::Result<(String, Vec<String>)> {
    let s = input.trim();
    if is_hex64(s) {
        return Ok((s.to_lowercase(), Vec::new()));
    }
    match decode(s)? {
        Nip19Entity::EventId { hex, relays } => Ok((hex, relays)),
        _ => bail!("event id ではありません: 先頭 note1 / nevent1 か 64 桁 hex を指定してください"),
    }
}

fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit())
}

fn bytes32_hex(data: &[u8]) -> anyhow::Result<String> {
    if data.len() != 32 {
        bail!("payload は 32 bytes である必要があります (got {})", data.len());
    }
    Ok(hex::encode(data))
}

/// TLV (type/length/value の繰り返し) をパースする。
fn parse_tlv(data: &[u8]) -> anyhow::Result<Vec<(u8, Vec<u8>)>> {
    let mut out = Vec::new();
    let mut i = 0usize;
    while i < data.len() {
        if i + 2 > data.len() {
            bail!("TLV が途中で終わっています");
        }
        let t = data[i];
        let l = data[i + 1] as usize;
        i += 2;
        if i + l > data.len() {
            bail!("TLV の length が payload を超えています");
        }
        out.push((t, data[i..i + l].to_vec()));
        i += l;
    }
    Ok(out)
}

fn tlv_required_32(tlv: &[(u8, Vec<u8>)], t: u8) -> anyhow::Result<String> {
    tlv.iter()
        .find(|(ty, v)| *ty == t && v.len() == 32)
        .map(|(_, v)| hex::encode(v))
        .context("TLV entry not found")
}

fn tlv_relays(tlv: &[(u8, Vec<u8>)]) -> Vec<String> {
    tlv.iter()
        .filter(|(t, _)| *t == 1)
        .filter_map(|(_, v)| String::from_utf8(v.clone()).ok())
        .filter(|s| s.starts_with("wss://") || s.starts_with("ws://"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // NIP-19 仕様書のテストベクタ
    const NPUB: &str = "npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg";
    const NPUB_HEX: &str = "7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e";
    const NSEC: &str = "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5";
    const NPROFILE: &str = "nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpp4mhxue69uhhytnc9e3k7mgpz4mhxue69uhkg6nzv9ejuumpv34kytnrdaksjlyr9p";
    const NPROFILE_HEX: &str = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

    #[test]
    fn decodes_npub() {
        let e = decode(NPUB).unwrap();
        assert_eq!(e, Nip19Entity::Pubkey { hex: NPUB_HEX.into(), relays: vec![] });
    }

    #[test]
    fn rejects_nsec_without_leaking_value() {
        let err = decode(NSEC).unwrap_err().to_string();
        assert!(err.contains("秘密鍵"), "err = {err}");
        // 秘密鍵の中身がエラーメッセージに混入していないこと
        assert!(!err.contains("vl029"), "secret leaked in error: {err}");
    }

    #[test]
    fn decodes_nprofile_with_relay_hints() {
        let e = decode(NPROFILE).unwrap();
        match e {
            Nip19Entity::Pubkey { hex, relays } => {
                assert_eq!(hex, NPROFILE_HEX);
                assert_eq!(relays, vec!["wss://r.x.com".to_string(), "wss://djbas.sadkb.com".to_string()]);
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn decodes_note_roundtrip() {
        // note1 は自前エンコードで往復確認
        let id = "aebe917a224983504fd0f54a71cbb0b3ba62e8f83b87c9e17dfa2c04a2d4b4f1";
        let hrp = bech32::Hrp::parse("note").unwrap();
        let encoded = bech32::encode::<bech32::Bech32>(hrp, &hex::decode(id).unwrap()).unwrap();
        let e = decode(&encoded).unwrap();
        assert_eq!(e, Nip19Entity::EventId { hex: id.into(), relays: vec![] });
    }

    #[test]
    fn nevent_roundtrip_with_tlv() {
        // nevent を TLV から組み立てて往復確認 (special=id, relay hint 1 本)
        let id = hex::decode("f536e110ae61b5a4ffffffffffffffffffffffffffffffffffffffffffffffff").unwrap();
        let relay = b"wss://yabu.me";
        let mut payload = vec![0u8, 32];
        payload.extend_from_slice(&id);
        payload.push(1);
        payload.push(relay.len() as u8);
        payload.extend_from_slice(relay);
        let hrp = bech32::Hrp::parse("nevent").unwrap();
        let encoded = bech32::encode::<bech32::Bech32>(hrp, &payload).unwrap();
        match decode(&encoded).unwrap() {
            Nip19Entity::EventId { hex: h, relays } => {
                assert_eq!(h, hex::encode(&id));
                assert_eq!(relays, vec!["wss://yabu.me".to_string()]);
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn normalize_accepts_hex_and_bech32_and_nostr_uri() {
        assert_eq!(normalize_pubkey(NPUB_HEX).unwrap().0, NPUB_HEX);
        assert_eq!(normalize_pubkey(NPUB).unwrap().0, NPUB_HEX);
        assert_eq!(normalize_pubkey(&format!("nostr:{NPUB}")).unwrap().0, NPUB_HEX);
        // 型違いは拒否
        assert!(normalize_event_id(NPUB).is_err());
        assert!(normalize_pubkey("not-a-key").is_err());
    }
}
