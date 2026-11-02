import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { openDatabase } from '../src/db/database.js';
import { withTransaction, type Pool } from '../src/db/pool.js';
import { ensureSchema } from '../src/db/schema.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';

/** Records what `ensureSchema` sends on a client; `failOn` makes matching statements fail. */
function recordingPool(failOn: (sql: string) => Error | undefined = () => undefined) {
  const sent: string[] = [];
  const released: unknown[] = [];
  let connections = 0;
  const client = {
    query: (sql: string) => {
      sent.push(sql);
      const error = failOn(sql);
      if (error) return Promise.reject(error);
      return Promise.resolve({ rows: sql.includes('to_regclass') ? [{ present: false }] : [] });
    },
    release: (error?: unknown) => released.push(error),
  };
  const pool = {
    // No schema_version table yet: the quick check outside the transaction says "not current".
    query: () => Promise.reject(Object.assign(new Error('relation does not exist'), { code: '42P01' })),
    connect: () => {
      connections += 1;
      return Promise.resolve(client);
    },
  } as unknown as Pool;
  return { pool, sent, released, connections: () => connections };
}

describe('Schema transaction', () => {
  test('the first thing a transaction sends sets its server-side time limits', async () => {
    const { pool, sent } = recordingPool();
    await ensureSchema(pool);
    assert.match(sent[0]!, /^BEGIN/);
    assert.match(sent[0]!, /SET LOCAL statement_timeout = '7s'/);
    assert.match(sent[0]!, /SET LOCAL idle_in_transaction_session_timeout = '8s'/);
  });

  test('a client goes back to the pool after a clean rollback', async () => {
    const failure = new Error('DDL failed');
    const { pool, sent, released } = recordingPool((sql) => (sql.includes('CREATE TABLE') ? failure : undefined));
    await assert.rejects(ensureSchema(pool), failure);
    assert.ok(sent.includes('ROLLBACK'));
    assert.deepEqual(released, [undefined]);
  });

  test('a client whose rollback fails is discarded, and the original error is reported', async () => {
    const failure = new Error('DDL failed');
    const rollbackFailure = new Error('connection lost');
    const { pool, released } = recordingPool((sql) => {
      if (sql === 'ROLLBACK') return rollbackFailure;
      return sql.includes('CREATE TABLE') ? failure : undefined;
    });
    await assert.rejects(ensureSchema(pool), failure);
    assert.deepEqual(released, [rollbackFailure]);
  });

  test('the limits apply on a real connection, only for that transaction', async () => {
    const database = await createTestDatabase();
    try {
      const inside = await withTransaction(database.pool, async (client) => {
        const statement = await client.query<{ statement_timeout: string }>('SHOW statement_timeout');
        const idle = await client.query<{ idle_in_transaction_session_timeout: string }>(
          'SHOW idle_in_transaction_session_timeout',
        );
        return [statement.rows[0]!.statement_timeout, idle.rows[0]!.idle_in_transaction_session_timeout];
      });
      assert.deepEqual(inside, ['7s', '8s']);

      const { rows } = await database.pool.query<{ statement_timeout: string }>('SHOW statement_timeout');
      assert.equal(rows[0]!.statement_timeout, '0');
    } finally {
      await database.close();
    }
  });
});

describe('Database schema', () => {
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

  const storedHash = async () => {
    const { rows } = await database.pool.query<{ hash: string }>('SELECT hash FROM schema_version');
    return rows.map((row) => row.hash);
  };

  test('a current schema costs one read: no transaction and no client taken from the pool', async () => {
    await ensureSchema(database.pool);
    let queries = 0;
    let connections = 0;
    const counting = {
      query: (...args: Parameters<Pool['query']>) => {
        queries += 1;
        return database.pool.query(...args);
      },
      connect: () => {
        connections += 1;
        return database.pool.connect();
      },
    } as unknown as Pool;

    await ensureSchema(counting);

    assert.equal(connections, 0);
    assert.equal(queries, 1);
  });

  test('an instance that waited for the lock runs no DDL if another one already finished', async () => {
    await ensureSchema(database.pool);
    const [hash] = await storedHash();
    const sent: string[] = [];
    const client = {
      query: (sql: string) => {
        sent.push(sql);
        if (sql.includes('to_regclass')) return Promise.resolve({ rows: [{ present: true }] });
        if (sql.includes('FROM schema_version')) return Promise.resolve({ rows: [{ hash }] });
        return Promise.resolve({ rows: [] });
      },
      release: () => {},
    };
    // The check before the lock still saw an old database; the one after it sees the finished work.
    const waited = {
      query: () => Promise.reject(Object.assign(new Error('relation does not exist'), { code: '42P01' })),
      connect: () => Promise.resolve(client),
    } as unknown as Pool;

    await ensureSchema(waited);

    assert.ok(sent.some((sql) => sql.includes('pg_advisory_xact_lock')));
    assert.ok(!sent.some((sql) => sql.includes('CREATE TABLE')));
    assert.equal(sent.at(-1), 'COMMIT');
  });

  test('after the lock, the version is read only if its table exists', async () => {
    const { pool, sent } = recordingPool();
    await ensureSchema(pool);
    const check = sent.findIndex((sql) => sql.includes('to_regclass'));
    assert.ok(check > sent.findIndex((sql) => sql.includes('pg_advisory_xact_lock')));
    assert.ok(!sent.some((sql) => /SELECT hash FROM schema_version/.test(sql)));
  });

  test('the statements and the version share one round trip', async () => {
    const { pool, sent } = recordingPool();
    await ensureSchema(pool);
    const trips = sent.filter((sql) => sql.includes('CREATE TABLE') || sql.includes('INTO schema_version'));
    assert.equal(trips.length, 1);
    assert.match(trips[0]!, /CREATE TABLE[\s\S]*INSERT INTO schema_version/);
  });

  test('changed or missing version information applies the schema again', async () => {
    await ensureSchema(database.pool);
    const [current] = await storedHash();

    await database.pool.query("UPDATE schema_version SET hash = 'previous'");
    await ensureSchema(database.pool);
    assert.deepEqual(await storedHash(), [current]);

    await database.pool.query('DELETE FROM schema_version');
    await ensureSchema(database.pool);
    assert.deepEqual(await storedHash(), [current]);
  });

  test('errors other than a missing version table stop the start', async () => {
    const failure = Object.assign(new Error('too many clients'), { code: '53300' });
    const pool = { query: () => Promise.reject(failure) } as unknown as Pool;
    await assert.rejects(ensureSchema(pool), failure);
  });

  test('the version table can only hold one row', async () => {
    await assert.rejects(database.pool.query("INSERT INTO schema_version (id, hash) VALUES (false, 'x')"), /check constraint/);
  });

  test('ensureSchema is idempotent and keeps existing data', async () => {
    await database.pool.query('INSERT INTO matches DEFAULT VALUES');
    await ensureSchema(database.pool);
    await Promise.all([ensureSchema(database.pool), ensureSchema(database.pool)]);
    const { rows } = await database.pool.query<{ count: number }>('SELECT count(*)::int AS count FROM matches');
    assert.equal(rows[0]!.count, 1);
  });

  test('upgrades a database created before match tokens, keeping its rows', async () => {
    // The matches table as it was before finish_token_hash existed (e.g. an existing Neon database).
    const old = await openDatabase({ pgliteDir: 'memory://' });
    try {
      await old.pool.query(`
        CREATE TABLE matches (
          id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          winner      TEXT CHECK (winner IN ('You', 'AI', 'Draw')),
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          finished_at TIMESTAMPTZ
        );
        INSERT INTO matches (winner, finished_at) VALUES ('You', now());
        INSERT INTO matches DEFAULT VALUES;
      `);

      await ensureSchema(old.pool);

      const { rows } = await old.pool.query<{ winner: string | null; finish_token_hash: string | null }>(
        'SELECT winner, finish_token_hash FROM matches ORDER BY id',
      );
      assert.deepEqual(rows, [
        { winner: 'You', finish_token_hash: null },
        { winner: null, finish_token_hash: null },
      ]);
    } finally {
      await old.close();
    }
  });

  test('uses snake_case columns with native timestamps', async () => {
    const { rows } = await database.pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'matches' ORDER BY ordinal_position`,
    );
    assert.deepEqual(rows, [
      { column_name: 'id', data_type: 'integer' },
      { column_name: 'winner', data_type: 'text' },
      { column_name: 'created_at', data_type: 'timestamp with time zone' },
      { column_name: 'finished_at', data_type: 'timestamp with time zone' },
      { column_name: 'finish_token_hash', data_type: 'text' },
    ]);
  });

  test('rejects winners outside You / AI / Draw', async () => {
    await assert.rejects(
      database.pool.query("INSERT INTO matches (winner, finished_at) VALUES ('Nobody', now())"),
      /check constraint/,
    );
  });

  test('rejects a winner without finished_at and vice versa', async () => {
    await assert.rejects(database.pool.query("INSERT INTO matches (winner) VALUES ('You')"), /check constraint/);
    await assert.rejects(database.pool.query('INSERT INTO matches (finished_at) VALUES (now())'), /check constraint/);
  });

  test('the local database keeps working right after failed queries', async () => {
    for (let i = 0; i < 5; i++) {
      await assert.rejects(database.pool.query('SELEC 1'), /syntax error/);
      const { rows } = await database.pool.query<{ ok: number }>('SELECT 1 AS ok');
      assert.equal(rows[0]!.ok, 1);
    }
  });

  test('ids are generated by the database and cannot be forced', async () => {
    await assert.rejects(database.pool.query('INSERT INTO matches (id) VALUES (42)'), /non-DEFAULT value into column "id"/);
  });
});
