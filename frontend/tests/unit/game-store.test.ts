import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ApiError } from '../../src/api/errors';
import { createGameStore, type GameApi } from '../../src/store/create-game-store';
import type { Match, Winner } from '../../src/types/match';

const match = (id: number, winner: Winner | null = null): Match => ({
  id,
  winner,
  createdAt: '2026-10-29T10:00:00.000-03:00',
  finishedAt: winner ? '2026-10-29T10:01:00.000-03:00' : null,
});

/**
 * A fake API whose finishMatch answers come from a script, one per call. getMatch returns the
 * stored winner (`storedWinner`, by default the last winner sent to finishMatch).
 */
function fakeApi(finishAnswers: (() => Promise<Match>)[] = [], storedWinner?: Winner | (() => Promise<Match>)) {
  let nextId = 1;
  let lastWinner: Winner | null = null;
  const finishCalls: { id: number; winner: Winner }[] = [];
  const api: GameApi = {
    createMatch: async () => match(nextId++),
    finishMatch: (id, winner) => {
      finishCalls.push({ id, winner });
      lastWinner = winner;
      const answer = finishAnswers.shift();
      return answer ? answer() : Promise.resolve(match(id, winner));
    },
    getMatch: (id) =>
      typeof storedWinner === 'function' ? storedWinner() : Promise.resolve(match(id, storedWinner ?? lastWinner)),
  };
  return { api, finishCalls };
}

const reject = (error: Error) => () => Promise.reject(error);
const networkError = () => new ApiError(0, 'NETWORK_ERROR', "Couldn't reach the server.");
const alreadyFinished = () => new ApiError(409, 'MATCH_ALREADY_FINISHED', 'Match 1 is already finished');

/** A store with a finished match that still has to be saved. */
function finishedStore(api: GameApi, matchId = 1) {
  const store = createGameStore(api);
  store.setState({ status: 'finished', matchId, result: 'You' });
  return store;
}

describe('game store: saving the result', () => {
  test('a 409 with our result stored means an earlier attempt was saved', async () => {
    // The first PATCH reaches the server but its response is lost; the retry finds the match finished.
    const { api, finishCalls } = fakeApi([reject(networkError()), reject(alreadyFinished())]);
    const store = finishedStore(api);
    await store.getState().retrySave();
    assert.equal(store.getState().saveStatus, 'saved');
    assert.equal(finishCalls.length, 2);
  });

  test('a 409 with a different result stored means the match was finished elsewhere', async () => {
    // Someone else closed this open match (by its id) with another result before we did.
    const { api, finishCalls } = fakeApi([reject(alreadyFinished())], 'AI');
    const store = finishedStore(api);
    await store.getState().retrySave();
    assert.equal(store.getState().saveStatus, 'conflict');
    assert.equal(finishCalls.length, 1);
  });

  test("a 409 that can't be checked is reported as a failed save", async () => {
    const { api } = fakeApi([reject(alreadyFinished())], reject(networkError()));
    const store = finishedStore(api);
    await store.getState().retrySave();
    assert.equal(store.getState().saveStatus, 'failed');
  });

  test('errors that a retry cannot fix fail right away', async () => {
    const { api, finishCalls } = fakeApi([reject(new ApiError(404, 'MATCH_NOT_FOUND', 'Match 1 not found'))]);
    const store = finishedStore(api);
    await store.getState().retrySave();
    assert.equal(store.getState().saveStatus, 'failed');
    assert.equal(finishCalls.length, 1);
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
    assert.deepEqual(
      finishCalls.map((call) => call.id),
      [41, 41],
    );
    // The new match isn't affected by the old match's save status.
    assert.notEqual(store.getState().matchId, 41);
    assert.equal(store.getState().saveStatus, 'idle');
  });
});

describe('game store: leaving the page', () => {
  test('leaving while the match is being created stops it', async () => {
    let created!: (value: Match) => void;
    const { api } = fakeApi();
    api.createMatch = () => new Promise((resolve) => (created = resolve));
    const store = createGameStore(api);

    const starting = store.getState().startMatch();
    store.getState().abandon(); // the player leaves /play before POST /matches answers
    created(match(1));
    await starting;

    assert.equal(store.getState().status, 'idle');
    assert.equal(store.getState().matchId, null);
  });

  test("StrictMode's unmount and remount in development keeps the match", async () => {
    let created!: (value: Match) => void;
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
    created(match(1));
    await starting;

    assert.equal(posts, 1);
    assert.equal(store.getState().status, 'flipping');
    assert.equal(store.getState().matchId, 1);
    store.getState().abandon(); // clears the coin-flip timer
  });
});
