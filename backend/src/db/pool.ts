import pg from 'pg';
import { silentLogger, type Logger } from '../logger.js';

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

/**
 * Timeouts stay below the Vercel Function limit (maxDuration 10 s in vercel.json): if the
 * database hangs, the app answers with a JSON 503 instead of Vercel cutting the request off.
 */
export const CONNECTION_TIMEOUT_MS = 5_000;
export const QUERY_TIMEOUT_MS = 8_000;

export function createPool(
  connectionString: string,
  { max = 5, logger = silentLogger }: { max?: number; logger?: Logger } = {},
): Pool {
  const pool = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  });
  // An idle client can fail (e.g. the server closes the connection). Without a listener
  // the 'error' event would crash the process; the pool simply replaces the client.
  pool.on('error', (error) => {
    logger.error('idle PostgreSQL client error', { error: error.message });
  });
  return pool;
}

/**
 * Server-side limits of a transaction, set inside it because the Neon pooler doesn't take them as
 * connection parameters. Unlike query_timeout, which only stops waiting, they end the work in
 * Postgres: its locks are released even if the function was cut off with the transaction open.
 */
const BEGIN_TRANSACTION = `BEGIN;
  SET LOCAL statement_timeout = '7s';
  SET LOCAL idle_in_transaction_session_timeout = '8s'`;

/** Runs `work` inside a transaction on a dedicated client. */
export async function withTransaction<T>(pool: Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query(BEGIN_TRANSACTION);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // If the rollback fails too (e.g. the connection was cut), the client is discarded instead of
    // going back to the pool, where the next request would inherit a broken session.
    await client.query('ROLLBACK').catch((rollbackError: Error) => {
      broken = rollbackError;
    });
    throw error;
  } finally {
    client.release(broken);
  }
}
