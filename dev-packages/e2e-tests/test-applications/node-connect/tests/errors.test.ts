import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends correct error event', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-connect', event => {
    return event.type !== 'transaction' && event.exception?.values?.[0]?.value === 'This is an exception';
  });

  await fetch(`${baseURL}/test-exception`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an exception');

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/test-exception',
  });

  expect(errorEvent.transaction).toEqual('GET /test-exception');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });
});
