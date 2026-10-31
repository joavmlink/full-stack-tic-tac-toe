import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { createHash } from 'node:crypto';
import type { CreatedMatch, Match } from '../src/schemas/matches.js';
import {
  bearer,
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

  async function createMatch(): Promise<CreatedMatch> {
    const res = await request('/matches', { method: 'POST' });
    assert.equal(res.status, 201);
    return (await res.json()) as CreatedMatch;
  }

  /** PATCH /matches/:id, sending `token` (when given) as a Bearer credential. */
  const finish = (id: number, init: RequestInit, token?: string) =>
    request(`/matches/${id}`, {
      method: 'PATCH',
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        ...(token === undefined ? {} : bearer(token)),
      },
    });

  async function storedMatch(id: number): Promise<Match> {
    return (await (await request(`/matches/${id}`)).json()) as Match;
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
    test('returns the match (without its token)', async () => {
      const { finishToken: _token, ...created } = await createMatch();
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
        const res = await finish(created.id, jsonBody({ winner }), created.finishToken);
        assert.equal(res.status, 200);

        const match = (await res.json()) as Match;
        assert.equal(match.winner, winner);
        assert.equal(match.createdAt, created.createdAt);
        assert.ok(match.finishedAt);
        assert.match(match.finishedAt, UTC_MINUS_3);
        assert.ok(new Date(match.finishedAt) >= new Date(match.createdAt));

        assert.deepEqual(await storedMatch(created.id), match);
      });
    }

    test('409 when the match is already finished with a different result', async () => {
      const created = await createMatch();
      await finish(created.id, jsonBody({ winner: 'You' }), created.finishToken);

      const res = await finish(created.id, jsonBody({ winner: 'AI' }), created.finishToken);
      assert.equal(res.status, 409);
      assert.equal(await errorCode(res), 'MATCH_ALREADY_FINISHED');
      assert.equal((await storedMatch(created.id)).winner, 'You');
    });

    test('repeating the same result is idempotent: 200 with the saved match', async () => {
      // E.g. a retry whose first response was lost: the result was already saved.
      const created = await createMatch();
      const first = (await (await finish(created.id, jsonBody({ winner: 'Draw' }), created.finishToken)).json()) as Match;

      const retry = await finish(created.id, jsonBody({ winner: 'Draw' }), created.finishToken);
      assert.equal(retry.status, 200);
      assert.deepEqual(await retry.json(), first);
    });

    test('only one of two concurrent finish requests succeeds', async () => {
      const created = await createMatch();
      const responses = await Promise.all(
        (['You', 'AI'] as const).map((winner) =>
          finish(created.id, jsonBody({ winner }), created.finishToken),
        ),
      );
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    });

    test('404 when the match does not exist', async () => {
      const created = await createMatch();
      const res = await finish(999, jsonBody({ winner: 'You' }), created.finishToken);
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
        const res = await finish(created.id, jsonBody(payload), created.finishToken);
        assert.equal(res.status, 400);
        assert.equal(await errorCode(res), 'VALIDATION_ERROR');
      });
    }

    test('400 with malformed JSON', async () => {
      const created = await createMatch();
      const res = await finish(
        created.id,
        { headers: { 'Content-Type': 'application/json' }, body: '{"winner":' },
        created.finishToken,
      );
      assert.equal(res.status, 400);
      assert.equal(await errorCode(res), 'INVALID_JSON');
    });

    test('413 when the body is too large', async () => {
      const created = await createMatch();
      const res = await finish(
        created.id,
        jsonBody({ winner: 'You', padding: 'x'.repeat(20_000) }),
        created.finishToken,
      );
      assert.equal(res.status, 413);
      assert.equal(await errorCode(res), 'PAYLOAD_TOO_LARGE');
    });

    describe('match token', () => {
      const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

      test('the Bearer scheme is case-insensitive and tolerates extra spaces', async () => {
        const created = await createMatch();
        const res = await finish(created.id, {
          ...jsonBody({ winner: 'You' }),
          headers: { 'Content-Type': 'application/json', Authorization: `bearer   ${created.finishToken} ` },
        });
        assert.equal(res.status, 200);
      });

      test('creating a match returns its token once; reads never include it', async () => {
        const created = await createMatch();
        assert.match(created.finishToken, TOKEN_FORMAT);
        assert.notEqual((await createMatch()).finishToken, created.finishToken);

        for (const path of [`/matches/${created.id}`, '/matches', '/matches/stats']) {
          const body = await (await request(path)).text();
          assert.ok(!body.includes(created.finishToken), path);
          assert.ok(!body.toLowerCase().includes('token'), path);
        }
      });

      test('only a hash of the token is stored', async () => {
        const created = await createMatch();
        const { rows } = await database.pool.query<{ finish_token_hash: string }>(
          'SELECT finish_token_hash FROM matches WHERE id = $1',
          [created.id],
        );
        const expected = createHash('sha256').update(created.finishToken).digest('hex');
        assert.equal(rows[0]?.finish_token_hash, expected);
      });

      test('401 without the token, with a Bearer challenge; the match stays open', async () => {
        const created = await createMatch();
        const res = await finish(created.id, jsonBody({ winner: 'You' }));
        assert.equal(res.status, 401);
        assert.equal(res.headers.get('www-authenticate'), 'Bearer');
        assert.equal(await errorCode(res), 'MATCH_TOKEN_REQUIRED');
        assert.equal((await storedMatch(created.id)).winner, null);
      });

      test('401 when the Authorization header is not a Bearer credential', async () => {
        const created = await createMatch();
        const res = await finish(created.id, {
          ...jsonBody({ winner: 'You' }),
          headers: { 'Content-Type': 'application/json', Authorization: `Basic ${created.finishToken}` },
        });
        assert.equal(res.status, 401);
        assert.equal(await errorCode(res), 'MATCH_TOKEN_REQUIRED');
      });

      test("403 with another match's token or a malformed token; the match stays open", async () => {
        const target = await createMatch();
        const other = await createMatch();
        for (const token of [other.finishToken, 'not-a-token', target.finishToken.slice(0, -1) + '!']) {
          const res = await finish(target.id, jsonBody({ winner: 'AI' }), token);
          assert.equal(res.status, 403, token);
          assert.equal(await errorCode(res), 'MATCH_TOKEN_INVALID');
        }
        assert.equal((await storedMatch(target.id)).winner, null);
      });

      test('403 rather than 409 for a finished match when the token is wrong', async () => {
        const target = await createMatch();
        const other = await createMatch();
        await finish(target.id, jsonBody({ winner: 'You' }), target.finishToken);

        const res = await finish(target.id, jsonBody({ winner: 'AI' }), other.finishToken);
        assert.equal(res.status, 403);
        assert.equal((await storedMatch(target.id)).winner, 'You');
      });

      test('a match stored without a token can no longer be finished', async () => {
        const created = await createMatch();
        await database.pool.query('INSERT INTO matches DEFAULT VALUES');
        const tokenless = created.id + 1;

        const res = await finish(tokenless, jsonBody({ winner: 'You' }), created.finishToken);
        assert.equal(res.status, 403);
        assert.equal((await storedMatch(tokenless)).winner, null);
      });
    });

    test('400 without a body', async () => {
      const created = await createMatch();
      const res = await finish(created.id, {}, created.finishToken);
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
