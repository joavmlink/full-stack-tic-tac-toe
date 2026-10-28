import type { Config } from '../config.js';
import { silentLogger, type Logger } from '../logger.js';
import { startLocalPostgres } from './local-postgres.js';
import { createPool, type Pool } from './pool.js';

export interface Database {
  pool: Pool;
  /** Human-readable description for logs (never includes credentials). */
  description: string;
  close(): Promise<void>;
}

/** PostgreSQL from DATABASE_URL (Neon) or, if it's not set, a local PGlite database. */
export async function openDatabase(
  config: Pick<Config, 'databaseUrl' | 'pgliteDir'>,
  logger: Logger = silentLogger,
): Promise<Database> {
  if (config.databaseUrl) {
    const pool = createPool(config.databaseUrl, { logger });
    return {
      pool,
      description: `PostgreSQL at ${new URL(config.databaseUrl).hostname}`,
      close: () => pool.end(),
    };
  }

  const local = await startLocalPostgres(config.pgliteDir);
  const pool = createPool(local.connectionString, { max: 1, logger });
  return {
    pool,
    description: `local PGlite (${config.pgliteDir})`,
    close: async () => {
      await pool.end();
      await local.stop();
    },
  };
}
