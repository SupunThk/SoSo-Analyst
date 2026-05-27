import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('hasBooted', 'true');
  });
});

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/SoSo Analyst/);
});

test('can type in terminal input', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('main')).toBeVisible();
  await page.getByPlaceholder('ENTER COMMAND OR QUERY...').fill('show market regime');
  await expect(page.getByPlaceholder('ENTER COMMAND OR QUERY...')).toHaveValue('show market regime');
});

test('does not show saved history from stored auth before wallet is connected', async ({ page }) => {
  let chatListRequests = 0;

  await page.addInitScript(() => {
    window.localStorage.setItem('soso_auth_session', JSON.stringify({
      success: true,
      walletAddress: '0x2068e859eBB10970eB77a2fa665f40Bd38594F44',
      token: 'stored-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    }));
  });

  await page.route('**/api/chats/0x2068e859eBB10970eB77a2fa665f40Bd38594F44', async (route) => {
    chatListRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ _id: 'chat-1', title: 'Should stay hidden', updatedAt: new Date().toISOString() }]),
    });
  });

  await page.goto('/');

  await expect(page.getByText('NO WALLET CONNECTED')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New terminal session' })).toBeDisabled();
  expect(chatListRequests).toBe(0);
});
