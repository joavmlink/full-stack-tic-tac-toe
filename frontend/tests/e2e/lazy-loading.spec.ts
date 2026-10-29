import { expect, test, type Page } from '@playwright/test';

/** Records the URLs of every script the page requests. */
function recordScripts(page: Page) {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') urls.push(request.url());
  });
  return { loaded: (name: string) => urls.some((url) => url.includes(name)) };
}

// Page chunks only exist in the production build (`npm run test:e2e:prod`).
const isProductionBuild = (baseURL: string | undefined) => baseURL?.endsWith(':4173') ?? false;
const PLAY_CHUNK = '**/assets/PlayPage-*.js';

test.describe('Lazy loading', () => {
  test('each page downloads only its own code', async ({ page }) => {
    const scripts = recordScripts(page);

    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Play', exact: true })).toBeVisible();
    expect(scripts.loaded('MenuPage')).toBe(true);
    for (const other of ['PlayPage', 'HistoryPage', 'MatchDetailPage']) {
      expect(scripts.loaded(other), `${other} loaded on the menu`).toBe(false);
    }

    await page.getByRole('link', { name: 'Match History', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Match History' })).toBeVisible();
    expect(scripts.loaded('HistoryPage')).toBe(true);
    expect(scripts.loaded('PlayPage')).toBe(false);
  });

  test('reloads once when a page chunk is missing after a new deployment', async ({ page, baseURL }) => {
    test.skip(!isProductionBuild(baseURL), 'Page chunks only exist in the production build');
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Play', exact: true })).toBeVisible();

    // The first request fails like a chunk from an old deployment; after the reload it loads.
    let failed = false;
    await page.route(PLAY_CHUNK, (route) => {
      if (failed) return route.continue();
      failed = true;
      return route.fulfill({ status: 404, body: 'Not found' });
    });
    await page.getByRole('link', { name: 'Play', exact: true }).click();

    await expect(page.getByTestId('board')).toBeVisible();
    expect(failed).toBe(true);
    expect(await page.evaluate(() => sessionStorage.getItem('tic-tac-toe-chunk-reload'))).not.toBeNull();
  });

  test('a chunk that keeps failing shows the error screen instead of reloading forever', async ({ page, baseURL }) => {
    test.skip(!isProductionBuild(baseURL), 'Page chunks only exist in the production build');
    await page.route(PLAY_CHUNK, (route) => route.fulfill({ status: 404, body: 'Not found' }));
    await page.goto('/');
    await page.getByRole('link', { name: 'Play', exact: true }).click();

    await expect(page.getByTestId('error-boundary')).toBeVisible();
    await expect(page).toHaveURL('/play');
  });
});
