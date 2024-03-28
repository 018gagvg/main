import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';

sentryTest('it allows to lazy load an integration', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  page.on('console', msg => console.log(msg.text()));

  await page.goto(url);

  const hasIntegration = await page.evaluate('!!window.Sentry.getClient()?.getIntegrationByName("HttpClient")');
  expect(hasIntegration).toBe(false);

  const scriptTagsBefore = await page.evaluate<number>('document.querySelectorAll("script").length');

  await page.evaluate('window._testLazyLoadIntegration()');
  await page.waitForFunction('window._integrationLoaded');

  const scriptTagsAfter = await page.evaluate<number>('document.querySelectorAll("script").length');

  const hasIntegration2 = await page.evaluate('!!window.Sentry.getClient()?.getIntegrationByName("HttpClient")');
  expect(hasIntegration2).toBe(true);

  expect(scriptTagsAfter).toBe(scriptTagsBefore + 1);
});
