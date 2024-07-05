import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

// Validation test for https://github.com/getsentry/sentry-javascript/issues/12281
sentryTest('should add browser-related spans to pageload transaction', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const browserSpans = eventData.spans?.filter(({ op }) => op === 'browser');

  // Spans `domContentLoadedEvent`, `connect`, `cache` and `DNS` are not
  // always inside `pageload` transaction.
  expect(browserSpans?.length).toBeGreaterThanOrEqual(4);

  const requestSpan = browserSpans!.find(({ description }) => description === 'request');
  expect(requestSpan).toBeDefined();

  const measureSpan = eventData.spans?.find(({ op }) => op === 'measure');
  expect(measureSpan).toBeDefined();

  expect(requestSpan!.start_timestamp).toBeLessThanOrEqual(measureSpan!.start_timestamp);
  expect(measureSpan?.data).toEqual({
    'sentry.browser.measure_happened_before_request': true,
    'sentry.browser.measure_start_time': expect.any(Number),
    'sentry.op': 'measure',
    'sentry.origin': 'auto.resource.browser.metrics',
  });
});
