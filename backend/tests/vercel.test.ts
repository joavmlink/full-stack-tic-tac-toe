import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { startLocalPostgres, type LocalPostgres } from '../src/db/local-postgres.js';
import { captureLogger, listen, type ErrorBody } from './helpers.js';

describe('Vercel entry point', () => {
  let postgres: LocalPostgres;
  let createVercelApp: typeof import('../src/vercel.js').createVercelApp;
  const originalEnv = { ...process.env };

  before(async () => {
    // A brand-new database without tables: the entry point must create the schema itself.
    postgres = await startLocalPostgres('memory://');
    // Importing the module builds its default export from the current env, so point it at the
    // local database first (each test then builds its own app with createVercelApp).
    process.env.DATABASE_URL = postgres.connectionString;
    ({ createVercelApp } = await import('../src/vercel.js'));
  });

  after(async () => {
    process.env = originalEnv;
    await postgres.stop();
  });

  /** Builds the Vercel app with the given env changes applied only while it's created. */
  function vercelAppWith(env: Record<string, string | undefined>) {
    const previous = { ...process.env };
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const logger = captureLogger();
    try {
      return { app: createVercelApp(logger), logger };
    } finally {
      process.env = previous;
    }
  }

  for (const [name, env] of [
    ['DATABASE_URL is missing', { DATABASE_URL: undefined, NODE_ENV: 'production' }],
    ['DATABASE_URL is missing (even outside production)', { DATABASE_URL: undefined, NODE_ENV: undefined }],
    ['DATABASE_URL is invalid', { DATABASE_URL: 'mysql://user:pass@host/db', NODE_ENV: 'production' }],
  ] as const) {
    test(`responds with a JSON 503 when ${name}, and logs why`, async () => {
      const { app, logger } = vercelAppWith(env);
      assert.equal(logger.errors()[0]?.message, 'server misconfigured');

      const server = await listen(app);
      try {
        for (const [method, path] of [
          ['GET', '/api/matches'],
          ['POST', '/api/matches'],
          ['GET', '/api/health'],
        ]) {
          const res = await fetch(`${server.baseUrl}${path}`, { method });
          assert.equal(res.status, 503, `${method} ${path}`);
          assert.equal(res.headers.get('retry-after'), '60');
          assert.equal(((await res.json()) as ErrorBody).error.code, 'SERVER_MISCONFIGURED');
        }
      } finally {
        await server.close();
      }
    });
  }

  test('creates the schema on the first request and serves the API', async () => {
    const { app } = vercelAppWith({ DATABASE_URL: postgres.connectionString, RATE_LIMIT_WRITES_PER_MINUTE: '1' });
    const server = await listen(app);
    try {
      const created = await fetch(`${server.baseUrl}/api/matches`, {
        method: 'POST',
        headers: { 'X-Forwarded-For': '198.51.100.7' },
      });
      assert.equal(created.status, 201);

      const list = await fetch(`${server.baseUrl}/api/matches`);
      assert.equal(((await list.json()) as unknown[]).length, 1);

      // trust proxy = 1: the rate limit uses the client IP sent by Vercel's proxy.
      const sameClient = await fetch(`${server.baseUrl}/api/matches`, {
        method: 'POST',
        headers: { 'X-Forwarded-For': '198.51.100.7' },
      });
      assert.equal(sameClient.status, 429);
      const otherClient = await fetch(`${server.baseUrl}/api/matches`, {
        method: 'POST',
        headers: { 'X-Forwarded-For': '198.51.100.8' },
      });
      assert.equal(otherClient.status, 201);
    } finally {
      await server.close();
    }
  });
});
