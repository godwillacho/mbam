use sqlx::{postgres::PgPoolOptions, PgPool};

/// Creates a PostgreSQL connection pool.
///
/// A pool is shared across requests so each handler can acquire database
/// connections efficiently without opening a new connection for every request.
pub async fn connect_database(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
}
