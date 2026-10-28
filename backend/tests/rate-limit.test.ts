import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { createTestDatabase, jsonBody, startTestServer, type ErrorBody, type TestDatabase } from './helpers.js';

const LIMIT = 3;

describe('Write rate limiting', () => {
  let database: TestDatabase;

  before(async () => {
    database = await createTestDatabase();
  });

  after(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  const createMatch = (baseUrl: string, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}/api/matches`, { method: 'POST', headers });

  test(`allows ${LIMIT} writes per minute and then responds 429`, async () => {
    const server = await startTestServer(database, { writeLimitPerMinute: LIMIT });
    try {
      for (let i = 0; i < LIMIT; i++) assert.equal((await createMatch(server.baseUrl)).status, 201);

      const blocked = await createMatch(server.baseUrl);
      assert.equal(blocked.status, 429);
      assert.equal(((await blocked.json()) as ErrorBody).error.code, 'RATE_LIMITED');
      assert.match(blocked.headers.get('ratelimit-policy') ?? '', new RegExp(`q=${LIMIT}`));

      // PATCH counts as a write too.
      const patch = await fetch(`${server.baseUrl}/api/matches/1`, { method: 'PATCH', ...jsonBody({ winner: 'You' }) });
      assert.equal(patch.status, 429);
    } finally {
      await server.close();
    }
  });

  test('reads have their own limit, independent from writes', async () => {
    const server = await startTestServer(database, { writeLimitPerMinute: 1, readLimitPerMinute: 5 });
    try {
      // The single allowed write isn't affected by reads, and reads aren't affected by writes.
      assert.equal((await createMatch(server.baseUrl)).status, 201);
      for (let i = 0; i < 5; i++) assert.equal((await fetch(`${server.baseUrl}/api/matches`)).status, 200);

      const blocked = await fetch(`${server.baseUrl}/api/matches/1`);
      assert.equal(blocked.status, 429);
      assert.equal(((await blocked.json()) as ErrorBody).error.code, 'RATE_LIMITED');
      assert.match(blocked.headers.get('ratelimit-policy') ?? '', /q=5/);
    } finally {
      await server.close();
    }
  });

  test('blocked reads never touch the database', async () => {
    const server = await startTestServer(database, { readLimitPerMinute: 1 });
    try {
      assert.equal((await fetch(`${server.baseUrl}/api/matches`)).status, 200);
      const before = await database.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM rate_limit_hits');
      for (let i = 0; i < 5; i++) assert.equal((await fetch(`${server.baseUrl}/api/matches`)).status, 429);
      const afterRows = await database.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM rate_limit_hits');
      // Read counters live in memory: nothing was written to PostgreSQL.
      assert.equal(afterRows.rows[0]!.n, before.rows[0]!.n);
    } finally {
      await server.close();
    }
  });

  test('the health check is never limited', async () => {
    const server = await startTestServer(database, { readLimitPerMinute: 1 });
    try {
      for (let i = 0; i < 5; i++) assert.equal((await fetch(`${server.baseUrl}/api/health`)).status, 200);
    } finally {
      await server.close();
    }
  });

  test('the limit is shared by every server instance (stored in PostgreSQL)', async () => {
    const first = await startTestServer(database, { writeLimitPerMinute: 2 });
    const second = await startTestServer(database, { writeLimitPerMinute: 2 });
    try {
      assert.equal((await createMatch(first.baseUrl)).status, 201);
      assert.equal((await createMatch(second.baseUrl)).status, 201);
      assert.equal((await createMatch(first.baseUrl)).status, 429);
      assert.equal((await createMatch(second.baseUrl)).status, 429);
    } finally {
      await first.close();
      await second.close();
    }
  });

  test('a new window starts after the previous one expires', async () => {
    const server = await startTestServer(database, { writeLimitPerMinute: 1 });
    try {
      assert.equal((await createMatch(server.baseUrl)).status, 201);
      assert.equal((await createMatch(server.baseUrl)).status, 429);

      await database.pool.query("UPDATE rate_limit_hits SET reset_at = now() - interval '1 second'");
      assert.equal((await createMatch(server.baseUrl)).status, 201);
    } finally {
      await server.close();
    }
  });

  test('stores a hash of the client IP, never the IP itself', async () => {
    const server = await startTestServer(database, { writeLimitPerMinute: 5 });
    try {
      await createMatch(server.baseUrl);
      const { rows } = await database.pool.query<{ key: string }>('SELECT key FROM rate_limit_hits');
      assert.equal(rows.length, 1);
      assert.match(rows[0]!.key, /^writes:[0-9a-f]{64}$/);
      assert.doesNotMatch(rows[0]!.key, /127\.0\.0\.1/);
    } finally {
      await server.close();
    }
  });

  test('behind a trusted proxy each client (X-Forwarded-For) has its own limit', async () => {
    const server = await startTestServer(database, { writeLimitPerMinute: 1, trustProxy: 1 });
    try {
      assert.equal((await createMatch(server.baseUrl, { 'X-Forwarded-For': '203.0.113.1' })).status, 201);
      assert.equal((await createMatch(server.baseUrl, { 'X-Forwarded-For': '203.0.113.1' })).status, 429);
      assert.equal((await createMatch(server.baseUrl, { 'X-Forwarded-For': '203.0.113.2' })).status, 201);
    } finally {
      await server.close();
    }
  });
});
