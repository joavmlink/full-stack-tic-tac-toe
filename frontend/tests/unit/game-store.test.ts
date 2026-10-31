import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ApiError } from '../../src/api/errors';
import { createGameStore, type GameApi } from '../../src/store/create-game-store';
import type { CreatedMatch, Match, Winner } from '../../src/types/match';

const match = (id: number, winner: Winner | null = null): Match => ({
  id,
  winner,
  createdAt: '2026-10-29T10:00:00.000-03:00',
  finishedAt: winner ? '2026-10-29T10:01:00.000-03:00' : null,
});

/** The token the fake API issues for a match. */
const tokenOf = (id: number) => `token-of-match-${id}`;

const createdMatch = (id: number): CreatedMatch => ({ ...match(id), finishToken: tokenOf(id) });

/** A fake API whose finishMatch answers come from a script, one per call. */
function fakeApi(finishAnswers: (() => Promise<Match>)[] = []) {
  let nextId = 1;
  const finishCalls: { id: number; winner: Winner; token: string }[] = [];
  const api: GameApi = {
    createMatch: async () => createdMatch(nextId++),
    finishMatch: (id, winner, token) => {
      finishCalls.push({ id, winner, token });
      const answer = finishAnswers.shift();
      return answer ? answer() : Promise.resolve(match(id, winner));
    },
  };
  return { api, finishCalls };
}

const reject = (error: Error) => () => Promise.reject(error);
const networkError = () => new ApiError(0, 'NETWORK_ERROR', "Couldn't reach the server.");

/** A store with a finished match that still has to be saved. */
function finishedStore(api: GameApi, matchId = 1) {
  const store = createGameStore(api);
  store.setState({ status: 'finished', matchId, matchToken: tokenOf(matchId), result: 'You' });
  return store;
}

describe('game store: saving the result', () => {
  test('a new match keeps the token it was issued and sends it when saving', async () => {
    const { api, finishCalls } = fakeApi();
    const store = createGameStore(api);
    await store.getState().startMatch();
    assert.equal(store.getState().matchToken, tokenOf(1));

    store.setState({ status: 'finished', result: 'Draw' });
    await store.getState().retrySave();
    assert.deepEqual(finishCalls, [{ id: 1, winner: 'Draw', token: tokenOf(1) }]);
    store.getState().abandon(); // clears the coin-flip timer
  });

  test('a save whose first response was lost is retried and saved', async () => {
    // The server answers the repeated, identical request with 200 (finishing is idempotent).
    const { api, finishCalls } = fakeApi([reject(networkError())]);
    const store = finishedStore(api);
    await store.getState().retrySave();
    assert.equal(store.getState().saveStatus, 'saved');
    assert.equal(finishCalls.length, 2);
  });

  for (const [status, code] of [
    [400, 'VALIDATION_ERROR'],
    [401, 'MATCH_TOKEN_REQUIRED'],
    [403, 'MATCH_TOKEN_INVALID'],
    [404, 'MATCH_NOT_FOUND'],
    [409, 'MATCH_ALREADY_FINISHED'],
  ] as const) {
    test(`a ${status} can't be fixed by retrying: the save ends as rejected, without retries`, async () => {
      const { api, finishCalls } = fakeApi([reject(new ApiError(status, code, 'Rejected'))]);
      const store = finishedStore(api);
      await store.getState().retrySave();
      assert.equal(store.getState().saveStatus, 'rejected');
      assert.equal(finishCalls.length, 1);
    });
  }

  test('retries that run out end as failed, so the player can try again', async () => {
    const unavailable = reject(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Unavailable'));
    const { api, finishCalls } = fakeApi([unavailable, unavailable, unavailable]);
    const store = finishedStore(api);
    await store.getState().retrySave();
    assert.equal(store.getState().saveStatus, 'failed');
    assert.equal(finishCalls.length, 3);
  });

  test('server and network errors are retried', async () => {
    const { api, finishCalls } = fakeApi([reject(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Unavailable'))]);
    const store = finishedStore(api);
    await store.getState().retrySave();
    assert.equal(store.getState().saveStatus, 'saved');
    assert.equal(finishCalls.length, 2);
  });

  test('a rematch does not stop the previous match from being saved', async () => {
    const { api, finishCalls } = fakeApi([reject(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Unavailable'))]);
    const store = finishedStore(api, 41);
    const saving = store.getState().retrySave();
    await store.getState().startMatch(); // "Rematch" while the first save waits to retry

    await saving;
    // Both attempts are for the old match, with its own token.
    assert.deepEqual(
      finishCalls.map((call) => [call.id, call.token]),
      [
        [41, tokenOf(41)],
        [41, tokenOf(41)],
      ],
    );
    // The new match isn't affected by the old match's save status.
    assert.notEqual(store.getState().matchId, 41);
    assert.equal(store.getState().saveStatus, 'idle');
  });
});

describe('game store: leaving the page', () => {
  test('leaving while the match is being created stops it', async () => {
    let created!: (value: CreatedMatch) => void;
    const { api } = fakeApi();
    api.createMatch = () => new Promise((resolve) => (created = resolve));
    const store = createGameStore(api);

    const starting = store.getState().startMatch();
    store.getState().abandon(); // the player leaves /play before POST /matches answers
    created(createdMatch(1));
    await starting;

    assert.equal(store.getState().status, 'idle');
    assert.equal(store.getState().matchId, null);
  });

  test("StrictMode's unmount and remount in development keeps the match", async () => {
    let created!: (value: CreatedMatch) => void;
    let posts = 0;
    const { api } = fakeApi();
    api.createMatch = () => {
      posts++;
      return new Promise((resolve) => (created = resolve));
    };
    const store = createGameStore(api);

    const starting = store.getState().startMatch(); // mount
    store.getState().abandon(); // StrictMode's immediate unmount…
    void store.getState().startMatch(); // …and remount
    created(createdMatch(1));
    await starting;

    assert.equal(posts, 1);
    assert.equal(store.getState().status, 'flipping');
    assert.equal(store.getState().matchId, 1);
    store.getState().abandon(); // clears the coin-flip timer
  });
});
