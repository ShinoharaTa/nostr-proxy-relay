use anyhow::Context;
use sqlx::SqlitePool;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite:data/app.sqlite".to_string());
    
    let pool = sqlx::SqlitePool::connect(&db_url).await?;
    
    println!("=== Safelist ===");
    let safelist_rows: Vec<(String, i64, String)> = sqlx::query_as(
        "SELECT npub, flags, memo FROM safelist ORDER BY created_at DESC"
    )
    .fetch_all(&pool)
    .await?;
    
    if safelist_rows.is_empty() {
        println!("(empty)");
    } else {
        for (npub, flags, memo) in safelist_rows {
            let post_allowed = (flags & 1) == 1;
            let filter_bypass = (flags & 2) == 2;
            let banned = (flags & 4) == 4;
            println!("npub: {}, flags: {} (post_allowed: {}, filter_bypass: {}, banned: {}), memo: {}", 
                npub, flags, post_allowed, filter_bypass, banned, memo);
        }
    }
    
    println!("\n=== Event Rejection Logs (last 20) ===");
    let rejection_rows: Vec<(i64, String, String, String, Option<String>, i64, String, String)> = sqlx::query_as(
        "SELECT id, event_id, pubkey_hex, npub, ip_address, kind, reason, created_at 
         FROM event_rejection_logs 
         ORDER BY created_at DESC 
         LIMIT 20"
    )
    .fetch_all(&pool)
    .await?;
    
    if rejection_rows.is_empty() {
        println!("(empty)");
    } else {
        for (id, event_id, pubkey_hex, npub, ip_address, kind, reason, created_at) in rejection_rows {
            println!("[{}] {} - event_id: {}, npub: {}, pubkey_hex: {}, kind: {}, reason: {}, ip: {:?}", 
                created_at, id, event_id, npub, pubkey_hex, kind, reason, ip_address);
        }
    }
    
    println!("\n=== Connection Logs (last 10) ===");
    let connection_rows: Vec<(i64, String, String, Option<String>, i64, i64)> = sqlx::query_as(
        "SELECT id, ip_address, connected_at, disconnected_at, event_count, rejected_event_count 
         FROM connection_logs 
         ORDER BY connected_at DESC 
         LIMIT 10"
    )
    .fetch_all(&pool)
    .await?;
    
    if connection_rows.is_empty() {
        println!("(empty)");
    } else {
        for (id, ip_address, connected_at, disconnected_at, event_count, rejected_event_count) in connection_rows {
            println!("id: {}, ip: {}, connected: {}, disconnected: {:?}, events: {}, rejected: {}", 
                id, ip_address, connected_at, disconnected_at, event_count, rejected_event_count);
        }
    }
    
    Ok(())
}
