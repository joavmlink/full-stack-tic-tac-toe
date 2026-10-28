import pg from 'pg';
import { silentLogger, type Logger } from '../logger.js';

export type Pool = pg.Pool;

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
