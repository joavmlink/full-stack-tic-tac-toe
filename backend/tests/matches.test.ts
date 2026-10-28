import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { Match } from '../src/schemas/matches.js';
import {
  createTestDatabase,
  jsonBody,
  startTestServer,
  type ErrorBody,
  type TestDatabase,
  type TestServer,
} from './helpers.js';

const UTC_MINUS_3 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}-03:00$/;

describe('API /api/matches', () => {
  let database: TestDatabase;
  let server: TestServer;

  before(async () => {
    database = await createTestDatabase();
  });

  after(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    server = await startTestServer(database);
  });

  afterEach(async () => {
    await server.close();
  });

  const request = (path: string, init?: RequestInit) => fetch(`${server.baseUrl}/api${path}`, init);

  async function createMatch(): Promise<Match> {
    const res = await request('/matches', { method: 'POST' });
    assert.equal(res.status, 201);
    return (await res.json()) as Match;
  }

  async function errorCode(res: Response): Promise<string> {
    return ((await res.json()) as ErrorBody).error.code;
  }

  test('GET /health returns ok', async () => {
    const res = await request('/health');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });

  describe('POST /matches', () => {
    test('creates a match with a null result and createdAt in UTC-3', async () => {
      const before = Date.now();
      const match = await createMatch();

      assert.equal(match.id, 1);
      assert.equal(match.winner, null);
      assert.equal(match.finishedAt, null);
      assert.match(match.createdAt, UTC_MINUS_3);

      const createdAtMs = new Date(match.createdAt).getTime();
      assert.ok(createdAtMs >= before - 1000 && createdAtMs <= Date.now() + 1000, 'createdAt must be "now"');
    });

    test('ignores any request body', async () => {
      const res = await request('/matches', { method: 'POST', ...jsonBody({ winner: 'You' }) });
      assert.equal(res.status, 201);
      assert.equal(((await res.json()) as Match).winner, null);
    });
  });

  describe('GET /matches', () => {
    test('returns [] when there are no matches', async () => {
      const res = await request('/matches');
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), []);
    });

    test('sorts from most recent to oldest', async () => {
      for (const createdAt of ['2026-10-20T13:00:00Z', '2026-10-25T13:00:00Z', '2026-10-22T13:00:00Z']) {
        await database.pool.query('INSERT INTO matches (created_at) VALUES ($1)', [createdAt]);
      }

      const matches = (await (await request('/matches')).json()) as Match[];
      assert.deepEqual(
        matches.map((m) => m.createdAt),
        ['2026-10-25T10:00:00.000-03:00', '2026-10-22T10:00:00.000-03:00', '2026-10-20T10:00:00.000-03:00'],
      );
    });

    test('breaks createdAt ties by descending id', async () => {
      await database.pool.query(
        "INSERT INTO matches (created_at) VALUES ('2026-10-20T13:00:00Z'), ('2026-10-20T13:00:00Z'), ('2026-10-20T13:00:00Z')",
      );
      const matches = (await (await request('/matches')).json()) as Match[];
      assert.deepEqual(
        matches.map((m) => m.id),
        [3, 2, 1],
      );
    });
  });

  describe('GET /matches/:id', () => {
    test('returns the match', async () => {
      const created = await createMatch();
      const res = await request(`/matches/${created.id}`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), created);
    });

    test('404 when it does not exist', async () => {
      const res = await request('/matches/999');
      assert.equal(res.status, 404);
      assert.equal(await errorCode(res), 'MATCH_NOT_FOUND');
    });

    for (const invalidId of ['abc', '0', '-1', '1.5', '1e3', '2147483648']) {
      test(`400 when the id is invalid (${invalidId})`, async () => {
        const res = await request(`/matches/${invalidId}`);
        assert.equal(res.status, 400);
        assert.equal(await errorCode(res), 'VALIDATION_ERROR');
      });
    }
  });

  describe('PATCH /matches/:id', () => {
    for (const winner of ['You', 'AI', 'Draw'] as const) {
      test(`finishes the match with winner=${winner}`, async () => {
        const created = await createMatch();
        const res = await request(`/matches/${created.id}`, { method: 'PATCH', ...jsonBody({ winner }) });
        assert.equal(res.status, 200);

        const match = (await res.json()) as Match;
        assert.equal(match.winner, winner);
        assert.equal(match.createdAt, created.createdAt);
        assert.ok(match.finishedAt);
        assert.match(match.finishedAt, UTC_MINUS_3);
        assert.ok(new Date(match.finishedAt) >= new Date(match.createdAt));

        const stored = (await (await request(`/matches/${created.id}`)).json()) as Match;
        assert.deepEqual(stored, match);
      });
    }

    test('409 when the match is already finished', async () => {
      const created = await createMatch();
      await request(`/matches/${created.id}`, { method: 'PATCH', ...jsonBody({ winner: 'You' }) });

      const res = await request(`/matches/${created.id}`, { method: 'PATCH', ...jsonBody({ winner: 'AI' }) });
      assert.equal(res.status, 409);
      assert.equal(await errorCode(res), 'MATCH_ALREADY_FINISHED');

      const stored = (await (await request(`/matches/${created.id}`)).json()) as Match;
      assert.equal(stored.winner, 'You');
    });

    test('only one of two concurrent finish requests succeeds', async () => {
      const created = await createMatch();
      const responses = await Promise.all(
        (['You', 'AI'] as const).map((winner) =>
          request(`/matches/${created.id}`, { method: 'PATCH', ...jsonBody({ winner }) }),
        ),
      );
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    });

    test('404 when the match does not exist', async () => {
      const res = await request('/matches/999', { method: 'PATCH', ...jsonBody({ winner: 'You' }) });
      assert.equal(res.status, 404);
    });

    const invalidBodies: [string, unknown][] = [
      ['invalid winner', { winner: 'Nobody' }],
      ['wrong case', { winner: 'ai' }],
      ['null winner', { winner: null }],
      ['missing winner', {}],
      ['extra fields', { winner: 'You', finishedAt: '2020-01-01T00:00:00.000-03:00' }],
    ];
    for (const [name, payload] of invalidBodies) {
      test(`400 with an invalid body (${name})`, async () => {
        const created = await createMatch();
        const res = await request(`/matches/${created.id}`, { method: 'PATCH', ...jsonBody(payload) });
        assert.equal(res.status, 400);
        assert.equal(await errorCode(res), 'VALIDATION_ERROR');
      });
    }

    test('400 with malformed JSON', async () => {
      const created = await createMatch();
      const res = await request(`/matches/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: '{"winner":',
      });
      assert.equal(res.status, 400);
      assert.equal(await errorCode(res), 'INVALID_JSON');
    });

    test('413 when the body is too large', async () => {
      const created = await createMatch();
      const res = await request(`/matches/${created.id}`, {
        method: 'PATCH',
        ...jsonBody({ winner: 'You', padding: 'x'.repeat(20_000) }),
      });
      assert.equal(res.status, 413);
      assert.equal(await errorCode(res), 'PAYLOAD_TOO_LARGE');
    });

    test('400 without a body', async () => {
      const created = await createMatch();
      const res = await request(`/matches/${created.id}`, { method: 'PATCH' });
      assert.equal(res.status, 400);
    });
  });

  const unsupported: [string, string, string][] = [
    ['DELETE', '/matches/1', 'GET, PATCH, HEAD'],
    ['PUT', '/matches/1', 'GET, PATCH, HEAD'],
    ['DELETE', '/matches', 'GET, POST, HEAD'],
    ['PATCH', '/matches', 'GET, POST, HEAD'],
    ['POST', '/health', 'GET, HEAD'],
  ];
  for (const [method, path, allow] of unsupported) {
    test(`405 with an Allow header for ${method} ${path}`, async () => {
      const res = await request(path, { method });
      assert.equal(res.status, 405);
      assert.equal(res.headers.get('allow'), allow);
      assert.equal(await errorCode(res), 'METHOD_NOT_ALLOWED');
    });
  }

  test('HEAD works wherever GET does', async () => {
    assert.equal((await request('/matches', { method: 'HEAD' })).status, 200);
    assert.equal((await request('/health', { method: 'HEAD' })).status, 200);
  });

  test('30 simultaneous creations get unique ids and consistent totals', async () => {
    const responses = await Promise.all(Array.from({ length: 30 }, () => request('/matches', { method: 'POST' })));
    assert.ok(responses.every((res) => res.status === 201));
    const ids = await Promise.all(responses.map(async (res) => ((await res.json()) as Match).id));
    assert.equal(new Set(ids).size, 30);

    const stats = (await (await request('/matches/stats')).json()) as { total: number; unfinished: number };
    assert.equal(stats.total, 30);
    assert.equal(stats.unfinished, 30);
  });

  test('404 for unknown routes', async () => {
    const res = await request('/nothing');
    assert.equal(res.status, 404);
    assert.equal(await errorCode(res), 'ROUTE_NOT_FOUND');
  });

  test('500 responses never leak internal details', async () => {
    await database.pool.query('DROP TABLE matches');
    try {
      const res = await request('/matches');
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    } finally {
      const { ensureSchema } = await import('../src/db/schema.js');
      await ensureSchema(database.pool);
    }
  });
});
