import { sha256Hex } from '../lib/hash.js';
import { withTransaction, type Pool, type PoolClient } from './pool.js';

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
  -- locks the table exclusively even when IF NOT EXISTS makes it a no-op.
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

  CREATE TABLE IF NOT EXISTS schema_version (
    id   BOOLEAN PRIMARY KEY DEFAULT true,
    hash TEXT NOT NULL,
    CONSTRAINT schema_version_one_row CHECK (id)
  );
`;

/** Identifies these statements, so changing any of them makes the next start run them. */
const SCHEMA_HASH = sha256Hex(SCHEMA_SQL);

/** The hash is a constant of this file, so it can share the round trip with the statements. */
const APPLY_SCHEMA_SQL = `${SCHEMA_SQL}
  INSERT INTO schema_version (id, hash) VALUES (true, '${SCHEMA_HASH}')
  ON CONFLICT (id) DO UPDATE SET hash = EXCLUDED.hash;
`;

/** Arbitrary constant that identifies this app's schema lock. */
const SCHEMA_LOCK_ID = 7_421_337;

const UNDEFINED_TABLE = '42P01';

async function holdsCurrentHash(database: Pick<Pool, 'query'>): Promise<boolean> {
  const { rows } = await database.query<{ hash: string }>('SELECT hash FROM schema_version');
  return rows[0]?.hash === SCHEMA_HASH;
}

async function isSchemaCurrent(pool: Pool): Promise<boolean> {
  try {
    return await holdsCurrentHash(pool);
  } catch (error) {
    if ((error as { code?: unknown }).code === UNDEFINED_TABLE) return false;
    throw error;
  }
}

/** The same check inside a transaction, where a failed statement would abort it. */
async function isSchemaCurrentInTransaction(client: PoolClient): Promise<boolean> {
  const { rows } = await client.query<{ present: boolean }>(
    `SELECT to_regclass('schema_version') IS NOT NULL AS present`,
  );
  return rows[0]!.present && (await holdsCurrentHash(client));
}

/**
 * Creates the schema idempotently, only when these statements haven't run yet: they lock the
 * tables until they commit, which a new instance must not do to the writes in progress. A current
 * schema costs one read and takes no locks. The advisory lock makes a second instance wait instead
 * of racing the first one on CREATE statements; when its turn comes the work may be done. All the
 * statements share one round trip, so their locks last as little as possible.
 */
export async function ensureSchema(pool: Pool): Promise<void> {
  if (await isSchemaCurrent(pool)) return;
  await withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK_ID]);
    if (await isSchemaCurrentInTransaction(client)) return;
    await client.query(APPLY_SCHEMA_SQL);
  });
}
