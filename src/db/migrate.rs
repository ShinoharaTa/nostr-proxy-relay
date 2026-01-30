use anyhow::Context;
use sqlx::SqlitePool;

/// Apply migrations from `./migrations`.
pub async fn migrate(pool: &SqlitePool) -> anyhow::Result<()> {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .context("failed to run migrations")?;
    Ok(())
}

