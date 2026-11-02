import { expect, test, type Page } from '@playwright/test';
import { fixRandom, waitForMatchCreated } from './helpers';

const SCREENS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

/** Follows the coin through its whole flip, in the browser, frame by frame. */
function measureCoinFlip(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ smallestGap: number; jump: number }>((resolve) => {
        const heading = document.querySelector('[data-testid="coin-heading"]')!;
        const coin = document.querySelector('[data-testid="coin"]')!;
        const startedAt = performance.now();
        const tops: number[] = [];
        let smallestGap = Infinity;
        const measure = () => {
          const top = coin.getBoundingClientRect().top;
          tops.push(top);
          smallestGap = Math.min(smallestGap, top - heading.getBoundingClientRect().bottom);
          if (performance.now() - startedAt < 1200) requestAnimationFrame(measure);
          else resolve({ smallestGap, jump: Math.max(...tops) - Math.min(...tops) });
        };
        measure();
      }),
  );
}

/** Whether a player's status fits on one line, without reaching the mark next to it. */
function measureStatus(page: Page, player: 'you' | 'ai') {
  return page.evaluate((who) => {
    const badge = document.querySelector(`[data-testid="player-badge-${who}"]`)!;
    const status = badge.querySelector('[data-testid="player-status"]')!;
    const content = document.createRange();
    content.selectNodeContents(status);
    // Only the words: the dots are centered in the line and would count as another one.
    const words = document.createRange();
    words.selectNode(status.firstChild!);
    const mark = badge.querySelector(':scope > svg')!.getBoundingClientRect();
    return {
      text: status.textContent,
      wordLines: new Set([...words.getClientRects()].map((r) => Math.round(r.top))).size,
      clearOfMark: content.getBoundingClientRect().right <= mark.left,
      markInside: mark.right <= badge.getBoundingClientRect().right,
    };
  }, player);
}

test.describe('Match screen layout', () => {
  for (const screen of SCREENS) {
    test(`the coin stays clear of its heading at ${screen.width} px`, async ({ page }) => {
      await page.setViewportSize(screen);
      await fixRandom(page, 0.1);
      await waitForMatchCreated(page, () => page.goto('/play'));
      await expect(page.getByTestId('coin')).toBeVisible();

      const { smallestGap, jump } = await measureCoinFlip(page);

      expect(jump, 'the coin should still jump').toBeGreaterThan(30);
      expect(smallestGap).toBeGreaterThan(0);
    });

    test(`each player's status fits on one line at ${screen.width} px`, async ({ page }) => {
      await page.setViewportSize(screen);
      await fixRandom(page, 0.1); // you go first
      await waitForMatchCreated(page, () => page.goto('/play'));
      await page.evaluate(() => document.fonts.ready);

      const indicator = page.getByTestId('turn-indicator');
      await expect(indicator).toHaveAttribute('data-turn', 'you');
      const fits = { wordLines: 1, clearOfMark: true, markInside: true };
      expect(await measureStatus(page, 'you')).toMatchObject({ text: 'Your turn', ...fits });
      expect(await measureStatus(page, 'ai')).toMatchObject({ text: 'Waiting', ...fits });

      await page.getByTestId('cell-4').click();
      await expect(indicator).toHaveAttribute('data-turn', 'ai');
      expect(await measureStatus(page, 'ai')).toMatchObject({ text: 'Thinking', ...fits });
    });

    test(`the active player's badge doesn't reach "VS" at ${screen.width} px`, async ({ page }) => {
      await page.setViewportSize(screen);
      await fixRandom(page, 0.1); // you go first
      await waitForMatchCreated(page, () => page.goto('/play'));

      // At its full size: the badge grows while it's active.
      const badge = page.getByTestId('player-badge-you');
      await expect(badge).toHaveCSS('transform', /^matrix\(1\.06,/);

      const badgeBox = (await badge.boundingBox())!;
      const versusBox = (await page.getByTestId('turn-indicator').getByText('VS').boundingBox())!;
      expect(versusBox.x).toBeGreaterThan(badgeBox.x + badgeBox.width);
    });
  }
});
