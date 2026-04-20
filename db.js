import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attempts (
      attempt_id      TEXT PRIMARY KEY,
      query_embedding FLOAT8[],
      created_at      TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS attempt_results (
      attempt_id  TEXT REFERENCES attempts(attempt_id),
      vector_id   TEXT,
      PRIMARY KEY (attempt_id, vector_id)
    );

    CREATE TABLE IF NOT EXISTS votes (
      attempt_id  TEXT REFERENCES attempts(attempt_id),
      vector_id   TEXT,
      vote_type   TEXT CHECK(vote_type IN ('up', 'down')),
      created_at  TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (attempt_id, vector_id)
    );
  `);
}
