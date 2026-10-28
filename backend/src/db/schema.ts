import type { Pool } from './pool.js';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS matches (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    winner      TEXT CHECK (winner IN ('You', 'AI', 'Draw')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    CONSTRAINT matches_winner_finished_at_consistency CHECK ((winner IS NULL) = (finished_at IS NULL))
  );
  CREATE INDEX IF NOT EXISTS matches_created_at_id_idx ON matches (created_at DESC, id DESC);

  CREATE TABLE IF NOT EXISTS rate_limit_hits (
    key      TEXT PRIMARY KEY,
    hits     INTEGER NOT NULL,
    reset_at TIMESTAMPTZ NOT NULL
  );
`;

/** Arbitrary constant that identifies this app's schema lock. */
const SCHEMA_LOCK_ID = 7_421_337;

/**
 * Creates the tables if they don't exist. Safe to run on every cold start: the advisory
 * lock prevents two instances (e.g. two Vercel Functions) from racing on CREATE TABLE.
 */
export async function ensureSchema(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK_ID]);
    await client.query(SCHEMA_SQL);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
