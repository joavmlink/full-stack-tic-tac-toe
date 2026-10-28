import type { Express } from 'express';
import { createApp } from './app.js';
import type { Config } from './config.js';
import { openDatabase, type Database } from './db/database.js';
import { ensureSchema } from './db/schema.js';
import type { Logger } from './logger.js';

/**
 * Initialization for long-running servers (local development, `npm run preview`, any Node host):
 * opens the database (Neon or local PGlite), creates the schema and builds the app.
 * Serverless (Vercel) has its own lazy variant in vercel.ts.
 */
export async function bootstrap(config: Config, logger: Logger): Promise<{ app: Express; database: Database }> {
  const database = await openDatabase(config, logger);
  try {
    await ensureSchema(database.pool);
  } catch (error) {
    await database.close();
    throw error;
  }

  const app = createApp({
    pool: database.pool,
    frontendUrls: config.frontendUrls,
    writeLimitPerMinute: config.writeLimitPerMinute,
    readLimitPerMinute: config.readLimitPerMinute,
    logger,
  });
  return { app, database };
}
