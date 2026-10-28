import { expect, test } from '@playwright/test';
import { MARK_DRAW_MS } from '../../src/game/mark-animation';
import { fixRandom, playFullMatch, playUntilEnd, recordBoardTimeline, waitForMatchCreated } from './helpers';

// Margin for browser timer imprecision.
const TIMER_TOLERANCE_MS = 40;

test.describe('Match against the AI', () => {
  test('plays a full match and saves the result', async ({ page }) => {
    const { result } = await playFullMatch(page);
    expect(['You', 'AI', 'Draw']).toContain(result);
  });

  test('when the coin says you, you play X on an empty board', async ({ page }) => {
    await fixRandom(page, 0.1);
    await waitForMatchCreated(page, () => page.goto('/play'));

    const coin = page.getByTestId('coin-flip');
    await expect(coin).toHaveAttribute('data-starter', 'you');
    await expect(coin).toContainText('You go first!');

    const board = page.getByTestId('board');
    await expect(board).toHaveAttribute('data-state', 'your-turn');
    await expect(board.locator('[data-empty="true"]')).toHaveCount(9);
    await expect(page.getByTestId('turn-indicator')).toHaveAttribute('data-turn', 'you');
  });

  test('when the coin says AI, it moves first', async ({ page }) => {
    await fixRandom(page, 0.9);
    await waitForMatchCreated(page, () => page.goto('/play'));

    const coin = page.getByTestId('coin-flip');
    await expect(coin).toHaveAttribute('data-starter', 'ai');
    await expect(coin).toContainText('AI goes first');

    const board = page.getByTestId('board');
    await expect(board).toHaveAttribute('data-state', 'ai-turn');
    await expect(page.getByTestId('game-status')).toHaveText('The AI is thinking…');
    await expect(board).toHaveAttribute('data-state', 'your-turn');
    await expect(board.locator('[data-empty="true"]')).toHaveCount(8);
  });

  test("your turn starts only after the AI's mark has finished drawing", async ({ page }) => {
    await fixRandom(page, 0.9); // the AI goes first
    await waitForMatchCreated(page, () => page.goto('/play'));

    const timeline = await recordBoardTimeline(page, 8);
    const aiPlaced = timeline.find((e) => e.empty === 8);
    const yourTurn = timeline.find((e) => e.empty === 8 && e.state === 'your-turn');

    expect(aiPlaced?.state).toBe('ai-turn');
    expect(yourTurn!.t - aiPlaced!.t).toBeGreaterThanOrEqual(MARK_DRAW_MS - TIMER_TOLERANCE_MS);
  });

  test('the AI waits for your mark to finish drawing before playing', async ({ page }) => {
    await fixRandom(page, 0.1); // you go first
    await waitForMatchCreated(page, () => page.goto('/play'));
    await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'your-turn');

    const timeline = recordBoardTimeline(page, 7);
    await page.getByTestId('cell-4').click();
    const events = await timeline;

    const yourMark = events.find((e) => e.empty === 8);
    const aiMark = events.find((e) => e.empty === 7);
    const yourTurnAgain = events.find((e) => e.empty === 7 && e.state === 'your-turn');

    expect(yourMark?.state).toBe('ai-turn');
    expect(aiMark!.t - yourMark!.t).toBeGreaterThanOrEqual(MARK_DRAW_MS - TIMER_TOLERANCE_MS);
    expect(aiMark?.state).toBe('ai-turn');
    expect(yourTurnAgain!.t - aiMark!.t).toBeGreaterThanOrEqual(MARK_DRAW_MS - TIMER_TOLERANCE_MS);
  });

  // 0.1 → you go first and play X; 0.9 → the AI goes first and you play O (the AI doesn't take square 4).
  for (const [mark, random] of [
    ['X', 0.1],
    ['O', 0.9],
  ] as const) {
    test(`your mark (${mark}) is drawn with an animation`, async ({ page }) => {
      await fixRandom(page, random);
      await waitForMatchCreated(page, () => page.goto('/play'));
      await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'your-turn');

      // Samples the stroke opacity on every frame from when the mark appears until it's done.
      const opacities = page.evaluate(
        () =>
          new Promise<number[]>((resolve) => {
            const cell = document.querySelector('[data-testid="cell-4"]');
            if (!cell) throw new Error('No square');
            const values: number[] = [];
            const start = performance.now();
            const tick = () => {
              const el = cell.getAttribute('data-empty') === 'false' ? cell.querySelector('path, circle') : null;
              if (el) values.push(Number(getComputedStyle(el).opacity));
              const done = values.length > 0 && values.at(-1) === 1;
              if (done || performance.now() - start > 2000) resolve(values);
              else requestAnimationFrame(tick);
            };
            tick();
          }),
      );
      await page.getByTestId('cell-4').click();
      const samples = await opacities;

      expect(samples.length).toBeGreaterThan(0);
      expect(samples[0], 'the mark must appear transparent and then be drawn').toBeLessThan(1);
      expect(samples.at(-1)).toBe(1);
      await expect(page.getByTestId('cell-4')).toHaveAttribute('aria-label', new RegExp(`${mark}, yours`));
    });
  }

  test("taken squares and the AI's turn don't accept clicks", async ({ page }) => {
    await fixRandom(page, 0.1);
    await waitForMatchCreated(page, () => page.goto('/play'));

    const board = page.getByTestId('board');
    await expect(board).toHaveAttribute('data-state', 'your-turn');
    await page.getByTestId('cell-4').click();

    await expect(page.getByTestId('cell-4')).toBeDisabled();
    await expect(board).toHaveAttribute('data-state', 'ai-turn');
    // During the AI's turn free squares don't respond.
    await board.locator('[data-empty="true"]').first().click({ force: true });
    await expect(board).toHaveAttribute('data-state', 'your-turn');
    await expect(board.locator('[data-empty="true"]')).toHaveCount(7);
  });

  test('the helper tolerates long pauses between moves (like stepping with --debug)', async ({ page }) => {
    const id = await waitForMatchCreated(page, () => page.goto('/play'));
    // 1.5 s > the AI's thinking time (max 0.8 s) + drawing its mark (0.25 s).
    const result = await playUntilEnd(page, id, { pauseAfterMoveMs: 1500 });
    expect(['You', 'AI', 'Draw']).toContain(result);
  });

  test('"Rematch" starts a new match', async ({ page }) => {
    const first = await playFullMatch(page);
    const secondId = await waitForMatchCreated(page, () => page.getByRole('button', { name: 'Rematch' }).click());

    expect(secondId).toBeGreaterThan(first.id);
    await expect(page.getByTestId('result-modal')).toBeHidden();
    await playUntilEnd(page, secondId);
  });

  test('shows an error and lets you retry when the backend is down', async ({ page }) => {
    await page.route('**/api/matches', (route) => route.abort());
    await page.goto('/play');
    await expect(page.getByRole('alert')).toContainText("Couldn't start the match");

    await page.unroute('**/api/matches');
    await waitForMatchCreated(page, () => page.getByRole('button', { name: 'Retry' }).click());
    await expect(page.getByTestId('board')).toBeVisible();
  });
});
