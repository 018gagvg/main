import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should create spans for GraphQL Fetch requests', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  await page.route('**/foo', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        people: [
          { name: 'Amy', pet: 'dog' },
          { name: 'Jay', pet: 'cat' },
        ],
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const requestSpans = eventData.spans?.filter(({ op }) => op === 'http.client');

  expect(requestSpans).toHaveLength(1);

  expect(requestSpans![0]).toMatchObject({
    description: 'POST http://sentry-test.io/foo (query Test)',
    parent_span_id: eventData.contexts?.trace?.span_id,
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: eventData.contexts?.trace?.trace_id,
    status: 'ok',
    data: expect.objectContaining({
      type: 'fetch',
      'http.method': 'POST',
      'http.url': 'http://sentry-test.io/foo',
      url: 'http://sentry-test.io/foo',
      'server.address': 'sentry-test.io',
      'sentry.op': 'http.client',
      'sentry.origin': 'auto.http.browser',
      body: {
        query: expect.any(String),
      },
    }),
  });
});
