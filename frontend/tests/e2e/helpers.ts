import { expect, type Page, type Response } from '@playwright/test';

export type Winner = 'You' | 'AI' | 'Draw';

export interface PlayedMatch {
  id: number;
  result: Winner;
}

const isCreateMatch = (r: Response) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/matches';

const isFinishMatch = (id: number) => (r: Response) =>
  r.request().method() === 'PATCH' && new URL(r.url()).pathname === `/api/matches/${id}`;

/** Fixes Math.random in the browser (0.1 → you go first, 0.9 → the AI goes first). */
export async function fixRandom(page: Page, value: number) {
  await page.addInitScript((v) => {
    Math.random = () => v;
  }, value);
}

export interface BoardEvent {
  /** Empty squares at that moment. */
  empty: number;
  /** Board data-state at that moment. */
  state: string;
  /** Browser performance.now(). */
  t: number;
}

/**
 * Records, from the browser, every board change (marks and state) until there are
 * `untilEmpty` empty squares and it's your turn. Call it before the moves happen.
 */
export function recordBoardTimeline(page: Page, untilEmpty: number): Promise<BoardEvent[]> {
  return page.evaluate(
    (target) =>
      new Promise<BoardEvent[]>((resolve) => {
        const board = document.querySelector('[data-testid="board"]');
        if (!board) throw new Error('No board');
        const events: BoardEvent[] = [];
        const record = () => {
          const empty = board.querySelectorAll('[data-empty="true"]').length;
          const state = board.getAttribute('data-state') ?? '';
          const last = events.at(-1);
          if (!last || last.empty !== empty || last.state !== state) events.push({ empty, state, t: performance.now() });
          if (empty === target && state === 'your-turn') {
            observer.disconnect();
            resolve(events);
          }
        };
        const observer = new MutationObserver(record);
        observer.observe(board, { subtree: true, attributes: true, attributeFilter: ['data-state', 'data-empty'] });
        record();
      }),
    untilEmpty,
  );
}

/** Waits for the POST that creates the match and returns its id. */
export async function waitForMatchCreated(page: Page, trigger: () => Promise<unknown>): Promise<number> {
  const [response] = await Promise.all([page.waitForResponse(isCreateMatch), trigger()]);
  expect(response.status()).toBe(201);
  const match = (await response.json()) as { id: number; winner: null; createdAt: string };
  expect(match.winner).toBeNull();
  expect(match.createdAt).toMatch(/-03:00$/);
  return match.id;
}

/**
 * Plays the already started match by clicking the first free square on each turn
 * until it's over. Verifies the PATCH and the result modal.
 */
export async function playUntilEnd(
  page: Page,
  id: number,
  { pauseAfterMoveMs = 0 }: { pauseAfterMoveMs?: number } = {},
): Promise<Winner> {
  const patch = page.waitForResponse(isFinishMatch(id));
  // If the test fails before reaching `await patch`, this wait is cancelled when the page
  // closes; marking it as handled avoids a stray "not a part of any test" error.
  patch.catch(() => {});

  await playMovesUntilFinished(page, { pauseAfterMoveMs });

  const response = await patch;
  expect(response.status()).toBe(200);
  const saved = (await response.json()) as { winner: Winner; finishedAt: string };
  expect(saved.finishedAt).toMatch(/-03:00$/);

  const modal = page.getByTestId('result-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('data-result', saved.winner);
  await expect(page.getByTestId('save-ok')).toBeVisible();
  return saved.winner;
}

/** Clicks the first free square on each of your turns until the match is over. */
export async function playMovesUntilFinished(page: Page, { pauseAfterMoveMs = 0 }: { pauseAfterMoveMs?: number } = {}) {
  const board = page.getByTestId('board');
  const emptyCells = board.locator('[data-empty="true"]');

  for (let move = 0; move < 5; move++) {
    await expect(board).toHaveAttribute('data-state', /^(your-turn|finished)$/, { timeout: 15_000 });
    if ((await board.getAttribute('data-state')) === 'finished') break;

    const emptyBefore = await emptyCells.count();
    await emptyCells.first().click();
    // Simulates someone stepping through with --debug: the app keeps running meanwhile.
    if (pauseAfterMoveMs) await page.waitForTimeout(pauseAfterMoveMs);

    // Doesn't depend on catching the AI's turn: waits until both have played
    // (2 fewer empty squares and it's your turn again) or the match is over.
    await expect
      .poll(
        async () => {
          const state = await board.getAttribute('data-state');
          return state === 'finished' || (state === 'your-turn' && (await emptyCells.count()) <= emptyBefore - 2);
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  }
  await expect(board).toHaveAttribute('data-state', 'finished', { timeout: 15_000 });
}

/** Opens /play and plays a full match. */
export async function playFullMatch(page: Page): Promise<PlayedMatch> {
  const id = await waitForMatchCreated(page, () => page.goto('/play'));
  const result = await playUntilEnd(page, id);
  return { id, result };
}
