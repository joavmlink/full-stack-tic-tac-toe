import { expect, test } from '@playwright/test';

test.describe('Start menu', () => {
  test('shows the title and both options', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Tic-Tac-Toe' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Match History', exact: true })).toBeVisible();
  });

  test('"Play" opens the board', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Play', exact: true }).click();
    await expect(page).toHaveURL('/play');
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('board').locator('button')).toHaveCount(9);
  });

  test('"Match History" opens the history', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Match History', exact: true }).click();
    await expect(page).toHaveURL('/history');
    await expect(page.getByRole('heading', { name: 'Match History' })).toBeVisible();
  });

  test('remembers the chosen difficulty', async ({ page }) => {
    await page.goto('/');
    const hard = page.getByRole('radio', { name: /Hard/ });
    await hard.click();
    await expect(hard).toHaveAttribute('aria-checked', 'true');

    await page.reload();
    await expect(page.getByRole('radio', { name: /Hard/ })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('link', { name: 'Play', exact: true }).click();
    await expect(page.getByTestId('difficulty-chip')).toContainText('AI: Hard');
  });

  test('unknown routes show a 404 with a way back to the menu', async ({ page }) => {
    await page.goto('/does-not-exist');
    await expect(page.getByText('404')).toBeVisible();
    await page.getByRole('link', { name: 'Back to menu' }).click();
    await expect(page).toHaveURL('/');
  });
});
