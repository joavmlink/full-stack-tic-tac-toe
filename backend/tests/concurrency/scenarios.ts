// What must hold when requests really overlap, checked through the API. Two targets run these
// scenarios: PGlite inside `npm test`, where the single session serializes everything and only the
// outcomes are proved, and a real Postgres in `npm run test:concurrency`, where the locks do the work.
//
// A 503 is accepted only because the checks that follow prove it left nothing behind: no new row
// and no changed result. A 500 is never accepted, and the failure message shows the error behind it.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test, type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { randomBytes } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { ensureSchema } from '../../src/db/schema.js';
import { toHttpError } from '../../src/middlewares/error-handler.js';
import { FRONTEND_URL, bearer, captureLogger, jsonBody, listen, type TestServer } from '../helpers.js';

export interface ConcurrencyTarget {
  /** App instances, each with its own pool, like several Vercel Function instances. */
  instances: number;
  poolSize: number;
  /** Whether the database takes extra connections and runs them at the same time. */
  realSessions: boolean;
  /** Whether "two different results" must see each request win at least once. */
  requireBothOrders: boolean;
  /** How much longer the delayed request of a race waits every two rounds. */
  raceStepMs: number;
  open(): Promise<{ connectionString: string; close(): Promise<void> }>;
}

interface Result {
  status: number;
  body: unknown;
  startedAt: number;
  endedAt: number;
}
interface OpenMatch {
  id: number;
  finishToken: string;
}
type Winner = 'You' | 'AI' | 'Draw';

const OVERLAPPING_REQUESTS = 12;
const ROUNDS = 6;
const SCHEMA_ROUNDS = 3;
const MAX_ATTEMPTS = 3;
const OLDER_SCHEMA = 'an older schema';

const times = <T>(count: number, make: (index: number) => T): T[] => Array.from({ length: count }, (_, i) => make(i));
const count = (results: Result[], status: number) => results.filter((result) => result.status === status).length;
const overlapped = ([a, b]: [Result, Result]) => a.startedAt < b.endedAt && b.startedAt < a.endedAt;
const sortedIds = (ids: number[]) => [...ids].sort((a, b) => a - b);

export function defineConcurrencyScenarios(target: ConcurrencyTarget): void {
  describe('overlapping requests', () => {
    const logger = captureLogger();
    let connectionString: string;
    let closeTarget: () => Promise<void>;
    let pools: Pool[];
    let main: Pool;
    let servers: TestServer[] = [];
    let nextServer = 0;

    /** Sends each request to the next instance, in turn. */
    async function request(method: string, path: string, init: RequestInit = {}): Promise<Result> {
      const { baseUrl } = servers[nextServer++ % servers.length]!;
      const startedAt = performance.now();
      const response = await fetch(`${baseUrl}/api${path}`, { method, ...init });
      const text = await response.text();
      return { status: response.status, body: text === '' ? null : JSON.parse(text), startedAt, endedAt: performance.now() };
    }

    const create = () => request('POST', '/matches');
    const finish = (id: number, winner: Winner, token: string) => {
      const { headers, body } = jsonBody({ winner });
      return request('PATCH', `/matches/${id}`, { headers: { ...headers, ...bearer(token) }, body });
    };

    /** Fails on any status outside `allowed` (and 503), naming the errors behind a 500 or a 503. */
    function expectStatuses(t: TestContext, label: string, results: Result[], allowed: number[]): void {
      const tally: Record<string, number> = {};
      for (const { status } of results) tally[status] = (tally[status] ?? 0) + 1;
      const causes = logger
        .errors()
        .filter((entry) => entry.message === 'request failed')
        .map((entry) => {
          const error = entry.fields.error as { message?: string } | string;
          const reason = typeof error === 'string' ? error : error.message;
          return `${String(entry.fields.status)} ${String(entry.fields.path)}: ${reason}`;
        });
      t.diagnostic(`${label}: ${JSON.stringify(tally)}`);
      if (count(results, 503) > 0) t.diagnostic(`${label}, causes: ${causes.join('; ')}`);
      for (const { status } of results) {
        assert.ok([...allowed, 503].includes(status), `${label}: unexpected ${status}. ${causes.join('; ')}`);
      }
    }

    /** Sets up a match for a scenario: a refusal here isn't what the scenario is about. */
    async function openMatch(): Promise<OpenMatch> {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const result = await create();
        if (result.status === 201) return result.body as OpenMatch;
        assert.equal(result.status, 503);
      }
      return assert.fail('a match could not be created');
    }

    /** Status of a finish request whose outcome is being checked, past any transient refusal. */
    async function finishStatus(match: OpenMatch, winner: Winner, token = match.finishToken): Promise<number> {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const { status } = await finish(match.id, winner, token);
        if (status !== 503) return status;
      }
      return assert.fail('a finish request kept being refused');
    }

    /** Delays one of two requests, the other one in each round and for longer every two rounds. */
    async function race(round: number, first: () => Promise<Result>, second: () => Promise<Result>): Promise<[Result, Result]> {
      const wait = Math.floor(round / 2) * target.raceStepMs;
      const delayed = async (ms: number, send: () => Promise<Result>) => {
        await delay(ms);
        return send();
      };
      return Promise.all([delayed(round % 2 === 0 ? wait : 0, first), delayed(round % 2 === 0 ? 0 : wait, second)]);
    }

    const storedWinner = async (id: number): Promise<string | null> => {
      const { rows } = await main.query<{ winner: string | null }>('SELECT winner FROM matches WHERE id = $1', [id]);
      assert.equal(rows.length, 1);
      return rows[0]!.winner;
    };
    const storedIds = async (): Promise<number[]> => {
      const { rows } = await main.query<{ id: number }>('SELECT id FROM matches ORDER BY id');
      return rows.map((row) => row.id);
    };
    const schemaHashes = async (): Promise<string[]> => {
      const { rows } = await main.query<{ hash: string }>('SELECT hash FROM schema_version');
      return rows.map((row) => row.hash);
    };

    /** Like vercel.ts: a transient refusal is retried, and the schema must end up applied. */
    async function applySchema(t: TestContext, pool: Pool): Promise<void> {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await ensureSchema(pool);
          t.diagnostic(`schema applied on attempt ${attempt}`);
          return;
        } catch (error) {
          assert.equal(toHttpError(error).status, 503, String(error));
          t.diagnostic(`schema attempt ${attempt} refused: ${String(error)}`);
        }
      }
      assert.fail('the schema could not be applied');
    }

    before(async () => {
      const opened = await target.open();
      connectionString = opened.connectionString;
      closeTarget = opened.close;
      pools = times(target.instances, () => createPool(connectionString, { max: target.poolSize, logger }));
      main = pools[0]!;
      await ensureSchema(main);
      servers = await Promise.all(
        pools.map((pool) =>
          listen(
            createApp({
              pool,
              frontendUrls: [FRONTEND_URL],
              writeLimitPerMinute: 1_000_000,
              readLimitPerMinute: 1_000_000,
              logger,
            }),
          ),
        ),
      );
    });

    after(async () => {
      await Promise.all(servers.map((server) => server.close()));
      await Promise.all((pools ?? []).map((pool) => pool.end()));
      await closeTarget?.();
    });

    beforeEach(async () => {
      // Whatever the last scenario left, including a schema it changed on purpose.
      await main.query('DROP TABLE IF EXISTS schema_version');
      await ensureSchema(main);
      await main.query('TRUNCATE matches, rate_limit_hits RESTART IDENTITY');
      logger.entries.length = 0;
    });

    test('instances starting together on an empty database create one schema', async (t) => {
      await main.query('DROP TABLE IF EXISTS matches, rate_limit_hits, schema_version CASCADE');
      const racing = target.realSessions
        ? times(4, () => createPool(connectionString, { max: 1, logger }))
        : times(3, () => main);
      try {
        await Promise.all(racing.map((pool) => applySchema(t, pool)));
      } finally {
        if (target.realSessions) await Promise.all(racing.map((pool) => pool.end()));
      }

      assert.equal((await schemaHashes()).length, 1);
      const match = await openMatch();
      assert.equal(await finishStatus(match, 'You'), 200);
    });

    test('a schema applied during writes breaks neither', async (t) => {
      const created: number[] = [];
      for (let round = 0; round < SCHEMA_ROUNDS; round++) {
        const open = await Promise.all(times(4, openMatch));
        await main.query('UPDATE schema_version SET hash = $1', [OLDER_SCHEMA]);

        const creating = times(OVERLAPPING_REQUESTS, create);
        const finishing = open.map((match) => finish(match.id, 'Draw', match.finishToken));
        const schemas = times(2, () => applySchema(t, main));
        const creations = await Promise.all(creating);
        const finishes = await Promise.all(finishing);
        await Promise.all(schemas);

        expectStatuses(t, `round ${round}, creations`, creations, [201]);
        expectStatuses(t, `round ${round}, finishes`, finishes, [200]);
        for (const [index, match] of open.entries()) {
          const expected = finishes[index]!.status === 200 ? 'Draw' : null;
          assert.equal(await storedWinner(match.id), expected, `round ${round}: match ${match.id}`);
        }
        created.push(
          ...open.map((match) => match.id),
          ...creations.filter((result) => result.status === 201).map((result) => (result.body as OpenMatch).id),
        );
        assert.deepEqual(await storedIds(), sortedIds(created), `round ${round}: rows must match the 201s exactly`);
        assert.notDeepEqual(await schemaHashes(), [OLDER_SCHEMA]);
      }
    });

    test('a column added while an older instance inserts loses no row', async (t) => {
      await main.query('ALTER TABLE matches DROP COLUMN finish_token_hash');
      await main.query('DELETE FROM schema_version');
      const older = pools.at(-1)!;

      const inserting = times(OVERLAPPING_REQUESTS, () =>
        older.query<{ id: number }>('INSERT INTO matches DEFAULT VALUES RETURNING id').then(
          ({ rows }) => ({ id: rows[0]!.id }),
          (error: unknown) => {
            assert.equal(toHttpError(error).status, 503, String(error));
            return { id: null };
          },
        ),
      );
      await Promise.all(times(2, () => applySchema(t, main)));
      const inserted = await Promise.all(inserting);

      const ids = inserted.flatMap(({ id }) => (id === null ? [] : [id]));
      t.diagnostic(`inserted: ${ids.length} of ${OVERLAPPING_REQUESTS}`);
      assert.deepEqual(await storedIds(), sortedIds(ids));
      const { rows } = await main.query<{ tokens: number }>(
        'SELECT count(finish_token_hash)::int AS tokens FROM matches',
      );
      assert.equal(rows[0]!.tokens, 0);

      const match = await openMatch();
      assert.equal(await finishStatus(match, 'You'), 200);
      if (ids[0] !== undefined) {
        assert.equal(await finishStatus({ id: ids[0], finishToken: match.finishToken }, 'You'), 403);
      }
    });

    test('two different results: one is saved, the other gets a 409', async (t) => {
      const wins = { You: 0, AI: 0 };
      let overlaps = 0;
      for (let round = 0; round < ROUNDS; round++) {
        const match = await openMatch();
        const pair = await race(
          round,
          () => finish(match.id, 'You', match.finishToken),
          () => finish(match.id, 'AI', match.finishToken),
        );
        const [you, ai] = pair;
        if (overlapped(pair)) overlaps += 1;
        expectStatuses(t, `round ${round}: You ${you.status}, AI ${ai.status}`, pair, [200, 409]);
        assert.ok(you.status !== 200 || ai.status !== 200, `round ${round}: both results were accepted`);

        const saved = you.status === 200 ? 'You' : ai.status === 200 ? 'AI' : null;
        if (saved) wins[saved] += 1;
        assert.equal(await storedWinner(match.id), saved, `round ${round}: the stored result must be the 200's`);
      }
      t.diagnostic(`wins: You ${wins.You}, AI ${wins.AI}; overlapping rounds: ${overlaps} of ${ROUNDS}`);
      if (target.requireBothOrders) {
        assert.ok(wins.You > 0 && wins.AI > 0, `order not verified: You won ${wins.You}, AI won ${wins.AI}`);
      }
    });

    test('the same result at once: both get the same saved match', async (t) => {
      for (let round = 0; round < ROUNDS; round++) {
        const match = await openMatch();
        const pair = await race(
          round,
          () => finish(match.id, 'You', match.finishToken),
          () => finish(match.id, 'You', match.finishToken),
        );
        expectStatuses(t, `round ${round}: ${pair[0].status}, ${pair[1].status}`, pair, [200]);

        const accepted = pair.filter((result) => result.status === 200);
        if (accepted.length === 2) assert.deepEqual(accepted[0]!.body, accepted[1]!.body);
        assert.equal(await storedWinner(match.id), accepted.length > 0 ? 'You' : null, `round ${round}`);
      }
    });

    test('the right token and a wrong one: only the right one finishes the match', async (t) => {
      for (let round = 0; round < ROUNDS; round++) {
        const match = await openMatch();
        const pair = await race(
          round,
          () => finish(match.id, 'You', match.finishToken),
          () => finish(match.id, 'AI', randomBytes(32).toString('base64url')),
        );
        const [right, wrong] = pair;
        expectStatuses(t, `round ${round}: right ${right.status}, wrong ${wrong.status}`, pair, [200, 403]);
        assert.notEqual(right.status, 403, `round ${round}: the right token was rejected`);
        assert.notEqual(wrong.status, 200, `round ${round}: a wrong token finished the match`);
        assert.equal(await storedWinner(match.id), right.status === 200 ? 'You' : null, `round ${round}`);
      }
    });

    test('simultaneous creations: unique matches, each closed only by its own token', async (t) => {
      const results = await Promise.all(times(OVERLAPPING_REQUESTS, create));
      expectStatuses(t, 'creations', results, [201]);

      const matches = results.filter((result) => result.status === 201).map((result) => result.body as OpenMatch);
      assert.deepEqual(await storedIds(), sortedIds(matches.map((match) => match.id)), 'rows must match the 201s exactly');
      assert.equal(new Set(matches.map((match) => match.finishToken)).size, matches.length);

      await Promise.all(
        matches.map(async (match, index) => {
          const other = matches[(index + 1) % matches.length]!;
          if (other !== match) assert.equal(await finishStatus(match, 'Draw', other.finishToken), 403);
          assert.equal(await finishStatus(match, 'Draw'), 200);
        }),
      );
    });
  });
}
