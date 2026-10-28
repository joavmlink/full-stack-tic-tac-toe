import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { Match, MatchStats } from '../src/schemas/matches.js';
import { createTestDatabase, startTestServer, type ErrorBody, type TestDatabase, type TestServer } from './helpers.js';

describe('Match list pagination and stats', () => {
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

  /** Inserts `count` matches, one minute apart (ids 1..count, newest = highest id). */
  async function seed(count: number) {
    await database.pool.query(
      `INSERT INTO matches (created_at)
       SELECT timestamptz '2026-10-01T12:00:00Z' + n * interval '1 minute' FROM generate_series(1, $1) AS n`,
      [count],
    );
  }

  const get = (path: string) => fetch(`${server.baseUrl}/api${path}`);
  const ids = async (res: Response) => ((await res.json()) as Match[]).map((m) => m.id);
  const nextCursor = (res: Response) => /[?&]before=(\d+)>; rel="next"/.exec(res.headers.get('link') ?? '')?.[1];

  test('returns the 20 most recent matches by default, with a Link to the next page', async () => {
    await seed(25);
    const res = await get('/matches');
    assert.equal(res.status, 200);
    assert.deepEqual(await ids(res), Array.from({ length: 20 }, (_, i) => 25 - i));
    assert.equal(res.headers.get('link'), '</api/matches?limit=20&before=6>; rel="next"');
  });

  test('the last page has no Link header', async () => {
    await seed(3);
    const res = await get('/matches');
    assert.deepEqual(await ids(res), [3, 2, 1]);
    assert.equal(res.headers.get('link'), null);
  });

  test('following the cursors returns every match exactly once, in order', async () => {
    await seed(23);
    const seen: number[] = [];
    let path = '/matches?limit=10';
    for (let page = 0; page < 5; page++) {
      const res = await get(path);
      seen.push(...(await ids(res)));
      const cursor = nextCursor(res);
      if (!cursor) break;
      path = `/matches?limit=10&before=${cursor}`;
    }
    assert.deepEqual(seen, Array.from({ length: 23 }, (_, i) => 23 - i));
  });

  test('cursors stay correct when several matches share the same createdAt', async () => {
    await database.pool.query(
      "INSERT INTO matches (created_at) SELECT timestamptz '2026-10-01T12:00:00Z' FROM generate_series(1, 5)",
    );
    const first = await get('/matches?limit=2');
    assert.deepEqual(await ids(first), [5, 4]);
    const second = await get(`/matches?limit=2&before=${nextCursor(first)}`);
    assert.deepEqual(await ids(second), [3, 2]);
    const third = await get(`/matches?limit=2&before=${nextCursor(second)}`);
    assert.deepEqual(await ids(third), [1]);
  });

  test('an unknown cursor returns an empty page', async () => {
    await seed(3);
    const res = await get('/matches?before=999');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });

  test('accepts limits up to 100', async () => {
    await seed(120);
    assert.equal((await ids(await get('/matches?limit=100'))).length, 100);
    assert.equal((await ids(await get('/matches?limit=1'))).length, 1);
  });

  for (const query of ['limit=0', 'limit=101', 'limit=abc', 'limit=-5', 'before=0', 'before=abc', 'limit=5&limit=6']) {
    test(`400 for invalid query (${query})`, async () => {
      const res = await get(`/matches?${query}`);
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as ErrorBody).error.code, 'VALIDATION_ERROR');
    });
  }

  test('GET /matches/stats counts every match, not just one page', async () => {
    await seed(30);
    await database.pool.query(
      `UPDATE matches SET finished_at = created_at + interval '1 minute',
         winner = CASE WHEN id <= 12 THEN 'You' WHEN id <= 20 THEN 'AI' WHEN id <= 25 THEN 'Draw' END
       WHERE id <= 25`,
    );
    const res = await get('/matches/stats');
    assert.equal(res.status, 200);
    const stats = (await res.json()) as MatchStats;
    assert.deepEqual(stats, { wins: 12, losses: 8, draws: 5, unfinished: 5, total: 30 });
  });

  test('GET /matches/stats with no matches', async () => {
    assert.deepEqual(await (await get('/matches/stats')).json(), {
      wins: 0,
      losses: 0,
      draws: 0,
      unfinished: 0,
      total: 0,
    });
  });

  test('/matches/stats only accepts GET', async () => {
    const res = await fetch(`${server.baseUrl}/api/matches/stats`, { method: 'POST' });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET, HEAD');
  });
});
