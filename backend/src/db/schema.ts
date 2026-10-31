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
  -- SHA-256 of the token that finishes the match. Added separately so existing databases get it;
  -- rows created before it have no token and can't be finished. Checked first because ALTER TABLE
  -- locks the table exclusively even when IF NOT EXISTS makes it a no-op, and this runs on every
  -- cold start.
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'matches' AND column_name = 'finish_token_hash'
    ) THEN
      ALTER TABLE matches ADD COLUMN finish_token_hash TEXT;
    END IF;
  END $$;

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
