use anyhow::Context;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};

pub mod migrate;

pub async fn connect(db_url: &str) -> anyhow::Result<SqlitePool> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(db_url)
        .await
        .with_context(|| format!("failed to connect sqlite db: {db_url}"))?;
    
    // WALモードを有効にして、同時読み書きを可能にする
    // また、同期モードをFULLにして、データの永続化を保証する
    sqlx::query("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;")
        .execute(&pool)
        .await
        .with_context(|| "failed to set SQLite pragmas")?;
    
    tracing::info!("SQLite database connected with WAL mode and FULL synchronous");
    Ok(pool)
}

