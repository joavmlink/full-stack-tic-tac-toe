import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Options } from 'express-rate-limit';
import { openDatabase } from '../src/db/database.js';
import { startLocalPostgres, type LocalPostgres } from '../src/db/local-postgres.js';
import { ensureSchema } from '../src/db/schema.js';
import { PostgresRateLimitStore } from '../src/models/rate-limit-store.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';

describe('openDatabase with DATABASE_URL (the production path, e.g. Neon)', () => {
  let postgres: LocalPostgres;

  before(async () => {
    postgres = await startLocalPostgres('memory://');
  });

  after(async () => {
    await postgres.stop();
  });

  test('connects through the pg pool and describes the host without credentials', async () => {
    const database = await openDatabase({ databaseUrl: postgres.connectionString, pgliteDir: 'unused' });
    try {
      assert.equal(database.description, 'PostgreSQL at 127.0.0.1');
      assert.doesNotMatch(database.description, /postgres:postgres/);
      const { rows } = await database.pool.query<{ ok: number }>('SELECT 1 AS ok');
      assert.equal(rows[0]?.ok, 1);
    } finally {
      await database.close();
    }
  });
});

describe('PostgresRateLimitStore', () => {
  let database: TestDatabase;
  let store: PostgresRateLimitStore;

  before(async () => {
    database = await createTestDatabase();
    await ensureSchema(database.pool);
    store = new PostgresRateLimitStore(database.pool, 'test:');
    store.init({ windowMs: 60_000 } as Options);
  });

  after(async () => {
    await database.close();
  });

  test('increment counts hits within the window', async () => {
    assert.equal((await store.increment('client-a')).totalHits, 1);
    const second = await store.increment('client-a');
    assert.equal(second.totalHits, 2);
    assert.ok(second.resetTime && second.resetTime.getTime() > Date.now());
  });

  test('get returns the current counter, or undefined when there is none', async () => {
    assert.equal((await store.get('client-a'))?.totalHits, 2);
    assert.equal(await store.get('nobody'), undefined);
  });

  test('decrement never goes below zero', async () => {
    await store.decrement('client-a');
    assert.equal((await store.get('client-a'))?.totalHits, 1);
    await store.decrement('client-a');
    await store.decrement('client-a');
    assert.equal((await store.get('client-a'))?.totalHits, 0);
  });

  test('resetKey removes the counter', async () => {
    await store.resetKey('client-a');
    assert.equal(await store.get('client-a'), undefined);
  });

  test('keys are namespaced by the prefix', async () => {
    await store.increment('client-b');
    const { rows } = await database.pool.query<{ key: string }>("SELECT key FROM rate_limit_hits WHERE key LIKE 'test:%'");
    assert.deepEqual(
      rows.map((row) => row.key),
      ['test:client-b'],
    );
  });
});
