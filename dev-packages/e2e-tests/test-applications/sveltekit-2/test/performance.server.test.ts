import { expect, test } from '@playwright/test';
import { waitForTransaction } from '../event-proxy-server';

test('server pageload request span has nested request span for sub request', async ({ page }) => {
  const serverTxnEventPromise = waitForTransaction('sveltekit-2', txnEvent => {
    return txnEvent?.transaction === 'GET /server-load-fetch';
  });

  await page.goto('/server-load-fetch');

  const serverTxnEvent = await serverTxnEventPromise;
  const spans = serverTxnEvent.spans;

  expect(serverTxnEvent).toMatchObject({
    transaction: 'GET /server-load-fetch',
    tags: { runtime: 'node' },
    transaction_info: { source: 'route' },
    type: 'transaction',
    contexts: {
      trace: {
        op: 'http.server',
        origin: 'auto.http.sveltekit',
      },
    },
  });

  expect(spans).toHaveLength(2);

  expect(spans).toEqual(
    expect.arrayContaining([
      // load span where the server load function initiates the sub request:
      expect.objectContaining({ op: 'function.sveltekit.server.load', description: '/server-load-fetch' }),
      // sub request span:
      expect.objectContaining({ op: 'http.server', description: 'GET /api/users' }),
    ]),
  );
});
