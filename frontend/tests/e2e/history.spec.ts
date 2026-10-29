import { expect, test } from '@playwright/test';
import { playFullMatch } from './helpers';

const RESULT_LABEL = { You: 'Win', AI: 'Loss', Draw: 'Draw' } as const;

test.describe('Match History', () => {
  test('shows the empty state when there are no matches', async ({ page }) => {
    // Only the list is mocked as empty; the "Play" POST still reaches the real backend.
    await page.route('**/api/matches', (route) =>
      route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.continue(),
    );
    await page.goto('/history');

    await expect(page.getByTestId('history-empty')).toBeVisible();
    await page.getByRole('link', { name: 'Play your first match!' }).click();
    await expect(page).toHaveURL('/play');
  });

  test('lists matches from most recent to oldest', async ({ page }) => {
    const first = await playFullMatch(page);
    const second = await playFullMatch(page);

    await page.goto('/history');
    const cards = page.getByTestId('match-card');
    await expect(cards.first()).toBeVisible();

    await expect(cards.nth(0)).toHaveAttribute('data-id', String(second.id));
    await expect(cards.nth(0)).toHaveAttribute('data-result', second.result);
    await expect(cards.nth(0)).toContainText(RESULT_LABEL[second.result]);
    await expect(cards.nth(1)).toHaveAttribute('data-id', String(first.id));
    await expect(cards.nth(1)).toHaveAttribute('data-result', first.result);

    // The whole list is in descending order.
    const ids = await cards.evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-id'))));
    expect(ids).toEqual([...ids].sort((a, b) => b - a));

    await expect(page.getByTestId('stat-wins')).toBeVisible();
  });

  test('opens the detail of a match', async ({ page }) => {
    const played = await playFullMatch(page);

    await page.goto('/history');
    await page.locator(`[data-testid="match-card"][data-id="${played.id}"]`).click();

    await expect(page).toHaveURL(`/history/${played.id}`);
    const detail = page.getByTestId('match-detail');
    await expect(detail).toHaveAttribute('data-result', played.result);
    await expect(detail).toContainText(RESULT_LABEL[played.result]);
    await expect(page.getByRole('heading', { name: `Match #${played.id}` })).toBeVisible();
  });

  test('loads older matches page by page and shows totals for the whole history', async ({ page }) => {
    // 25 matches: the API returns 20 + a Link to the next page, then the remaining 5.
    const match = (id: number) => ({
      id,
      winner: 'You',
      createdAt: `2026-10-01T12:${String(id).padStart(2, '0')}:00.000-03:00`,
      finishedAt: `2026-10-01T12:${String(id).padStart(2, '0')}:30.000-03:00`,
    });
    const range = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => match(from - i));
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Link' };

    await page.route('**/api/matches/stats', (route) =>
      route.fulfill({ headers: cors, json: { wins: 25, losses: 0, draws: 0, unfinished: 0, total: 25 } }),
    );
    await page.route(/\/api\/matches(\?.*)?$/, (route) => {
      const before = new URL(route.request().url()).searchParams.get('before');
      return before === null
        ? route.fulfill({
            headers: { ...cors, Link: '</api/matches?limit=20&before=6>; rel="next"' },
            json: range(25, 6),
          })
        : route.fulfill({ headers: cors, json: range(Number(before) - 1, 1) });
    });

    await page.goto('/history');
    const cards = page.getByTestId('match-card');
    await expect(cards).toHaveCount(20);
    await expect(page.getByTestId('stat-wins')).toContainText('25');
    await expect(page.getByText('Most recent first · 25 matches')).toBeVisible();

    await page.getByTestId('load-more').click();
    await expect(cards).toHaveCount(25);
    await expect(cards.last()).toHaveAttribute('data-id', '1');
    await expect(page.getByTestId('load-more')).toBeHidden();
  });

  test('a missing match shows "not found"', async ({ page }) => {
    await page.goto('/history/999999');
    await expect(page.getByRole('alert')).toContainText('Match not found');
  });

  test('shows an error and lets you retry when loading fails', async ({ page }) => {
    await page.route('**/api/matches', (route) => route.abort());
    await page.goto('/history');
    await expect(page.getByRole('alert')).toContainText("Couldn't load your match history");

    await page.unroute('**/api/matches');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('alert')).toBeHidden();
  });

  test('a successful response that is not JSON shows the retry screen, not a crash', async ({ page }) => {
    // E.g. a proxy or a misrouted request answering 200 with an HTML page.
    await page.route('**/api/matches', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Not the API</title>' }),
    );
    await page.goto('/history');
    await expect(page.getByRole('alert')).toContainText("Couldn't load your match history");
    await expect(page.getByTestId('error-boundary')).toHaveCount(0);
  });
});
