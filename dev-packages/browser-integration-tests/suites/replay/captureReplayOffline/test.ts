import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('should capture replays offline', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  // This would be the obvious way to test offline support but it doesn't appear to work!
  // await context.setOffline(true);

  // Abort the first envelope request so the event gets queued
  await page.route(/ingest\.sentry\.io/, route => route.abort(), { times: 1 });

  await page.goto(url);

  // Now send a second event which should be queued after the the first one and force flushing the queue
  await page.locator('button').click();

  const replayEvent0 = getReplayEvent(await reqPromise0);
  const replayEvent1 = getReplayEvent(await reqPromise1);

  // Check that we received the envelopes in the correct order
  expect(replayEvent0.timestamp).toBeGreaterThan(0);
  expect(replayEvent1.timestamp).toBeGreaterThan(0);
  expect(replayEvent0.timestamp).toBeLessThan(replayEvent1.timestamp || 0);
});
