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

test('can type in terminal input and receive streamed response', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('main')).toBeVisible();
  
  // Route stream request to mock SSE response
  await page.route('**/api/agent/chat/stream', async (route) => {
    const streamContent = [
      'event: chunk\ndata: {"text": "Bull market"}\n\n',
      'event: tool_done\ndata: {"name": "get_market_intelligence", "result": "Regime: Bull", "status": "success"}\n\n',
      'event: chunk\ndata: {"text": " confirmed."}\n\n',
      'event: done\ndata: {"answer": "Bull market confirmed.", "toolCalls": [{"name": "get_market_intelligence"}]}\n\n'
    ].join('');
    
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: streamContent,
    });
  });

  const input = page.getByPlaceholder('ENTER COMMAND OR QUERY...');
  await input.fill('show market regime');
  await input.press('Enter');

  // Verify streamed response appears
  await expect(page.getByText('Bull market confirmed.')).toBeVisible();
  await expect(page.getByText('get_market_intelligence')).toBeVisible();
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
