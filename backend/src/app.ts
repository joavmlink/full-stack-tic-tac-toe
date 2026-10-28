import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Pool } from './db/pool.js';
import { silentLogger, type Logger } from './logger.js';
import { createErrorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { createReadLimiter, createWriteLimiter } from './middlewares/rate-limit.js';
import { requestLogger } from './middlewares/request-logger.js';
import { methodNotAllowed } from './middlewares/validate.js';
import { createMatchModel } from './models/match.js';
import { createMatchesRouter } from './routes/matches.js';

export interface AppOptions {
  pool: Pool;
  /** Frontend origins allowed by CORS (e.g. "http://localhost:5173" during development). */
  frontendUrls: string[];
  /** Max match creations/updates per client IP per minute (shared by every instance). */
  writeLimitPerMinute: number;
  /** Max reads per client IP per minute (per server instance). */
  readLimitPerMinute: number;
  /**
   * Express "trust proxy" setting. Behind Vercel's proxy use 1 so `req.ip` is the client IP
   * from X-Forwarded-For (Vercel overwrites that header, so it can't be spoofed).
   */
  trustProxy?: number | boolean;
  /** Awaited before handling each request (e.g. lazy schema creation on Vercel). */
  ready?: () => Promise<void>;
  logger?: Logger;
}

/**
 * Builds the Express app without listening on a port: startup lives in server.ts (local server)
 * and vercel.ts (serverless), and tests mount it with their own database.
 */
export function createApp({
  pool,
  frontendUrls,
  writeLimitPerMinute,
  readLimitPerMinute,
  trustProxy = false,
  ready,
  logger = silentLogger,
}: AppOptions): Express {
  const app = express();
  app.set('trust proxy', trustProxy);

  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(
    cors({
      origin: frontendUrls,
      methods: ['GET', 'POST', 'PATCH'],
      allowedHeaders: ['Content-Type'],
      // Lets a frontend on another origin (Vite dev server) read the pagination header.
      exposedHeaders: ['Link'],
    }),
  );
  app.use(express.json({ limit: '10kb' }));

  // Liveness probe: no rate limit and no database access (it would wake Neon up).
  app
    .route('/api/health')
    .get((_req, res) => {
      res.json({ status: 'ok' });
    })
    .all(methodNotAllowed('GET'));

  // Before anything that touches the database, so rejected reads cost nothing.
  app.use('/api', createReadLimiter(readLimitPerMinute));

  if (ready) {
    app.use(async (_req, _res, next) => {
      await ready();
      next();
    });
  }

  app.use('/api', createWriteLimiter(pool, writeLimitPerMinute));
  app.use('/api/matches', createMatchesRouter(createMatchModel(pool)));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
