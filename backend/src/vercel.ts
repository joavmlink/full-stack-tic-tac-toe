// Serverless entry point (re-exported by /api/index.js): the whole Express app becomes one
// Vercel Function. Initialization runs once per cold instance and is reused across invocations,
// so the pool lives at module level and the schema is created lazily on the first request.
import express, { type Express } from 'express';
import helmet from 'helmet';
import { createApp } from './app.js';
import { loadConfig, type Config } from './config.js';
import { createPool } from './db/pool.js';
import { ensureSchema } from './db/schema.js';
import { createLogger, type Logger } from './logger.js';

/**
 * Used when the environment is missing or invalid: instead of crashing at startup (which makes
 * Vercel serve its own non-JSON error page), every request gets a JSON 503 and the real reason
 * is written to the function logs.
 */
function createMisconfiguredApp(reason: string, logger: Logger): Express {
  logger.error('server misconfigured', { reason });
  const app = express();
  app.use(helmet());
  app.use((_req, res) => {
    res
      .status(503)
      .set('Retry-After', '60')
      .json({
        error: { code: 'SERVER_MISCONFIGURED', message: 'The server is not configured correctly, please try again later' },
      });
  });
  return app;
}

export function createVercelApp(logger: Logger = createLogger()): Express {
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    return createMisconfiguredApp(error instanceof Error ? error.message : String(error), logger);
  }
  if (!config.databaseUrl) {
    return createMisconfiguredApp(
      'DATABASE_URL is not set. Add your Neon connection string in the Vercel project settings.',
      logger,
    );
  }

  const pool = createPool(config.databaseUrl, { max: 3, logger });

  // Created once per function instance; retried on the next request if it fails.
  let schemaReady: Promise<void> | undefined;
  const ensureSchemaOnce = (): Promise<void> => {
    schemaReady ??= ensureSchema(pool).catch((error: unknown) => {
      schemaReady = undefined;
      throw error;
    });
    return schemaReady;
  };

  return createApp({
    pool,
    frontendUrls: config.frontendUrls,
    writeLimitPerMinute: config.writeLimitPerMinute,
    readLimitPerMinute: config.readLimitPerMinute,
    trustProxy: 1,
    ready: ensureSchemaOnce,
    logger,
  });
}

export default createVercelApp();
