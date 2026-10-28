import assert from 'node:assert/strict';
import net from 'node:net';
import { describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { CONNECTION_TIMEOUT_MS, QUERY_TIMEOUT_MS, createPool, type Pool } from '../src/db/pool.js';
import type { Logger } from '../src/logger.js';
import { FRONTEND_URL, captureLogger, listen, type ErrorBody } from './helpers.js';

const VERCEL_MAX_DURATION_MS = 10_000;

/**
 * A "database" that accepts TCP connections and drops them immediately. It stays bound during the
 * test, so no other process can take the port (unlike picking a free port and releasing it).
 */
function startBrokenDatabase(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => socket.destroy()).listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({ port, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}

const appWith = (pool: Pool, logger: Logger) =>
  listen(createApp({ pool, frontendUrls: [FRONTEND_URL], writeLimitPerMinute: 10, readLimitPerMinute: 1000, logger }));

/** A pool whose every query fails with the given error. */
const failingPool = (error: Error) => ({ query: () => Promise.reject(error) }) as unknown as Pool;

async function expectServiceUnavailable(res: Response) {
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('retry-after'), '5');
  const body = (await res.json()) as ErrorBody;
  assert.equal(body.error.code, 'SERVICE_UNAVAILABLE');
  // No internal details (driver errors, hosts, ports) reach the client.
  assert.doesNotMatch(JSON.stringify(body), /ECONNREFUSED|127\.0\.0\.1|timeout|pg/i);
}

describe('Database availability', () => {
  test('database timeouts stay below the Vercel Function limit', () => {
    assert.ok(CONNECTION_TIMEOUT_MS < VERCEL_MAX_DURATION_MS);
    assert.ok(QUERY_TIMEOUT_MS < VERCEL_MAX_DURATION_MS);
    const pool = createPool('postgresql://app_user:not-a-real-password@127.0.0.1:5432/db');
    assert.equal(pool.options.connectionTimeoutMillis, CONNECTION_TIMEOUT_MS);
    assert.equal(pool.options.query_timeout, QUERY_TIMEOUT_MS);
    void pool.end();
  });

  test('an unreachable database returns a JSON 503 for reads and writes, and logs it', async () => {
    const database = await startBrokenDatabase();
    const pool = createPool(`postgresql://app_user:not-a-real-password@127.0.0.1:${database.port}/db?sslmode=disable`);
    const logger = captureLogger();
    const server = await appWith(pool, logger);
    try {
      await expectServiceUnavailable(await fetch(`${server.baseUrl}/api/matches`));
      await expectServiceUnavailable(await fetch(`${server.baseUrl}/api/matches/1`));
      await expectServiceUnavailable(await fetch(`${server.baseUrl}/api/matches`, { method: 'POST' }));
      // The health check doesn't touch the database.
      assert.equal((await fetch(`${server.baseUrl}/api/health`)).status, 200);

      const failures = logger.errors().filter((entry) => entry.message === 'request failed');
      assert.equal(failures.length, 3);
      assert.ok(failures.every((entry) => entry.fields.status === 503 && entry.fields.code === 'SERVICE_UNAVAILABLE'));
    } finally {
      await server.close();
      await pool.end();
      await database.close();
    }
  });

  for (const message of [
    'Query read timeout',
    'timeout exceeded when trying to connect',
    'Connection terminated unexpectedly',
  ]) {
    test(`maps "${message}" to a JSON 503`, async () => {
      const server = await appWith(failingPool(new Error(message)), captureLogger());
      try {
        await expectServiceUnavailable(await fetch(`${server.baseUrl}/api/matches`));
      } finally {
        await server.close();
      }
    });
  }

  test('PostgreSQL "too many connections" (53300) maps to a JSON 503', async () => {
    const error = Object.assign(new Error('sorry, too many clients already'), { code: '53300' });
    const server = await appWith(failingPool(error), captureLogger());
    try {
      await expectServiceUnavailable(await fetch(`${server.baseUrl}/api/matches`));
    } finally {
      await server.close();
    }
  });

  test('other database errors are a generic JSON 500; the details only go to the log', async () => {
    const error = Object.assign(new Error('relation "matches" does not exist'), { code: '42P01' });
    const logger = captureLogger();
    const server = await appWith(failingPool(error), logger);
    try {
      const res = await fetch(`${server.baseUrl}/api/matches?limit=5`);
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });

      const [failure] = logger.errors();
      assert.equal(failure?.message, 'request failed');
      assert.equal(failure?.fields.path, '/api/matches'); // no query string in the logs
      assert.match(JSON.stringify(failure?.fields.error), /relation \\"matches\\" does not exist/);
      assert.match(JSON.stringify(failure?.fields.error), /stack/);
    } finally {
      await server.close();
    }
  });
});
