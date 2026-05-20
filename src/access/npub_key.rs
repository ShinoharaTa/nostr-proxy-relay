use anyhow::Context;

pub fn pubkey_hex_to_npub(pubkey_hex: &str) -> anyhow::Result<String> {
    let bytes = hex::decode(pubkey_hex).context("pubkey hex decode")?;
    let hrp = bech32::Hrp::parse("npub").context("invalid bech32 hrp")?;
    Ok(bech32::encode::<bech32::Bech32>(hrp, &bytes)?)
}
