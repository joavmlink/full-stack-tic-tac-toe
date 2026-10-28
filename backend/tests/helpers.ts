import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { createApp, type AppOptions } from '../src/app.js';
import { openDatabase, type Database } from '../src/db/database.js';
import { ensureSchema } from '../src/db/schema.js';
import type { Logger } from '../src/logger.js';

export const FRONTEND_URL = 'http://localhost:5173';

export interface TestDatabase extends Database {
  /** Empties every table and restarts ids (call before each test). */
  reset(): Promise<void>;
}

/** Real PostgreSQL (in-memory PGlite) accessed through the same `pg` driver used in production. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const database = await openDatabase({ pgliteDir: 'memory://' });
  await ensureSchema(database.pool);
  return {
    ...database,
    reset: async () => {
      await database.pool.query('TRUNCATE matches, rate_limit_hits RESTART IDENTITY');
    },
  };
}

export interface TestServer {
  baseUrl: string;
  close(): Promise<void>;
}

/** Listens on a free port; works with any Express app (e.g. the Vercel entry point). */
export async function listen(app: Express): Promise<TestServer> {
  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve(s)));
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        // fetch reuses keep-alive connections: close them so close() doesn't hang.
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export function startTestServer(
  database: TestDatabase,
  options: Partial<Omit<AppOptions, 'pool'>> = {},
): Promise<TestServer> {
  return listen(
    createApp({
      pool: database.pool,
      frontendUrls: [FRONTEND_URL],
      writeLimitPerMinute: 1000,
      readLimitPerMinute: 100_000,
      ...options,
    }),
  );
}

export interface LogEntry {
  level: 'info' | 'error';
  message: string;
  fields: Record<string, unknown>;
}

/** Logger that records entries in memory so tests can assert what gets logged. */
export function captureLogger(): Logger & { entries: LogEntry[]; errors: () => LogEntry[] } {
  const entries: LogEntry[] = [];
  return {
    entries,
    errors: () => entries.filter((entry) => entry.level === 'error'),
    info: (message, fields = {}) => entries.push({ level: 'info', message, fields }),
    error: (message, fields = {}) => entries.push({ level: 'error', message, fields }),
  };
}

export function jsonBody(data: unknown): RequestInit {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}

export interface ErrorBody {
  error: { code: string; message: string };
}
