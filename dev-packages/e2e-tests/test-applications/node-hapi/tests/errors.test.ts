import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends thrown error to Sentry', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-hapi', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'This is an error';
  });

  const transactionEventPromise = waitForTransaction('node-hapi', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-failure';
  });

  await fetch(`${baseURL}/test-failure`);

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('GET /test-failure');
  expect(transactionEvent.contexts?.trace).toMatchObject({
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an error');

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/test-failure',
  });

  expect(errorEvent.transaction).toEqual('GET /test-failure');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });

  expect(errorEvent.contexts?.trace?.trace_id).toBe(transactionEvent.contexts?.trace?.trace_id);
  expect(errorEvent.contexts?.trace?.span_id).toBe(transactionEvent.contexts?.trace?.span_id);
});

test('sends error with parameterized transaction name', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-hapi', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'This is an error with id 123';
  });

  await fetch(`${baseURL}/test-error/123`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent?.transaction).toBe('GET /test-error/{id}');
});

test('Does not send errors to Sentry if boom throws in "onPreResponse" after JS error in route handler', async ({
  baseURL,
}) => {
  let errorEventOccurred = false;

  waitForError('node-hapi', event => {
    if (!event.type && event.exception?.values?.[0]?.value?.includes('This is an error (boom in onPreResponse)')) {
      errorEventOccurred = true;
    }
    return false; // expects to return a boolean (but not relevant here)
  });

  const transactionEventPromise5xx = waitForTransaction('node-hapi', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-failure-boom-4xx';
  });

  const transactionEventPromise4xx = waitForTransaction('node-hapi', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-failure-boom-5xx';
  });

  const response = await fetch(`${baseURL}/test-failure-boom-4xx`);
  expect(response.status).toBe(404);

  const transactionEvent4xx = await transactionEventPromise4xx;
  const transactionEvent5xx = await transactionEventPromise5xx;

  expect(errorEventOccurred).toBe(false);
  expect(transactionEvent4xx.transaction).toBe('GET /test-failure-boom-4xx');
  expect(transactionEvent5xx.transaction).toBe('GET /test-failure-boom-5xx');
});

test('Only sends onPreResponse error to Sentry if JS error is thrown in route handler AND onPreResponse', async ({
  baseURL,
}) => {
  const errorEventPromise = waitForError('node-hapi', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value?.includes('JS error (onPreResponse)') || false;
  });

  const transactionEventPromise = waitForTransaction('node-hapi', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-failure-JS-error-onPreResponse';
  });

  const response = await fetch(`${baseURL}/test-failure-JS-error-onPreResponse`);

  expect(response.status).toBe(500);

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('GET /test-failure-JS-error-onPreResponse');
  expect(errorEvent.transaction).toEqual('GET /test-failure-JS-error-onPreResponse');
});
