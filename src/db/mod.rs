use anyhow::Context;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};

pub mod migrate;

pub async fn connect(db_url: &str) -> anyhow::Result<SqlitePool> {
    SqlitePoolOptions::new()
        .max_connections(5)
        .connect(db_url)
        .await
        .with_context(|| format!("failed to connect sqlite db: {db_url}"))
}

