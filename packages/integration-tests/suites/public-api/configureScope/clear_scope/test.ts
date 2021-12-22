import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getSentryRequest } from '../../../../utils/helpers';

sentryTest('should clear previously set properties of a scope', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  expect(eventData.message).toBe('cleared_scope');
  expect(eventData.user).toBeUndefined();
  expect(eventData.tags).toBeUndefined();
  expect(eventData.extra).toBeUndefined();
});
