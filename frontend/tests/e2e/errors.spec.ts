import { expect, test } from '@playwright/test';

test.describe('Unexpected errors', () => {
  test('a malformed API response shows the error screen instead of a blank page', async ({ page }) => {
    // The history expects an array of matches; an object makes the page crash while rendering.
    await page.route('**/api/matches', (route) => route.fulfill({ json: { unexpected: true } }));
    await page.goto('/history');

    const errorScreen = page.getByTestId('error-boundary');
    await expect(errorScreen).toBeVisible();
    await expect(errorScreen).toContainText('Something went wrong');

    await page.getByRole('link', { name: 'Back to menu' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('link', { name: 'Play', exact: true })).toBeVisible();
  });

  test('"Try again" reloads the app and recovers once the problem is gone', async ({ page }) => {
    let broken = true;
    await page.route('**/api/matches', (route) =>
      broken ? route.fulfill({ json: { unexpected: true } }) : route.fulfill({ json: [] }),
    );
    await page.goto('/history');
    await expect(page.getByTestId('error-boundary')).toBeVisible();

    broken = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('history-empty')).toBeVisible();
  });
});
