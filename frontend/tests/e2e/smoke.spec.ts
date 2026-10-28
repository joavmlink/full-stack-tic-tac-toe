import { expect, test } from '@playwright/test';
import { fixRandom, playUntilEnd, waitForMatchCreated } from './helpers';

// Also used by `test:e2e:remote` to verify a real deployment.
test.describe('Smoke: browser console', () => {
  test('no errors, security policy (CSP) violations or failed requests', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`exception: ${error.message}`));
    page.on('requestfailed', (request) => problems.push(`failed request: ${request.url()}`));
    page.on('response', (response) => {
      if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
    });

    await page.addInitScript(() => {
      // Content-Security-Policy violations don't always show up as console errors.
      document.addEventListener('securitypolicyviolation', (e) => {
        console.error(`CSP blocked ${e.blockedURI || 'inline'} (${e.violatedDirective})`);
      });
      // Easy AI + fixed random → you win with the 2-4-6 diagonal and the confetti fires.
      localStorage.setItem('tic-tac-toe-settings', JSON.stringify({ state: { difficulty: 'easy' }, version: 0 }));
    });
    await fixRandom(page, 0.1);

    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Play', exact: true })).toBeVisible();

    await page.goto('/history');
    await expect(page.getByRole('heading', { name: 'Match History' })).toBeVisible();

    const id = await waitForMatchCreated(page, () => page.goto('/play'));
    const result = await playUntilEnd(page, id);
    expect(result).toBe('You');
    // The confetti (~0.9 s after the end) draws on a <canvas> appended to the body.
    await page.locator('body > canvas').waitFor({ state: 'attached', timeout: 5000 });
    await page.waitForTimeout(500);

    await page.goto(`/history/${id}`);
    await expect(page.getByTestId('match-detail')).toHaveAttribute('data-result', 'You');

    expect(problems).toEqual([]);
  });
});
