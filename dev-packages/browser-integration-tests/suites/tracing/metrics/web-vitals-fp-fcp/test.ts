import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should capture FP vital.', async ({ browserName, getLocalTestPath, page }) => {
  // FP is not generated on webkit or firefox
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.fp?.value).toBeDefined();

  // eslint-disable-next-line deprecation/deprecation
  const fpSpan = eventData.spans?.filter(({ description }) => description === 'first-paint')[0];

  expect(fpSpan).toBeDefined();
  expect(fpSpan?.op).toBe('paint');
  expect(fpSpan?.parentSpanId).toBe(eventData.contexts?.trace_span_id);
});

sentryTest('should capture FCP vital.', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.fcp?.value).toBeDefined();

  // eslint-disable-next-line deprecation/deprecation
  const fcpSpan = eventData.spans?.filter(({ description }) => description === 'first-contentful-paint')[0];

  expect(fcpSpan).toBeDefined();
  expect(fcpSpan?.op).toBe('paint');
  expect(fcpSpan?.parentSpanId).toBe(eventData.contexts?.trace_span_id);
});
