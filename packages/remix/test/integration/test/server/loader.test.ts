import {
  assertSentryTransaction,
  getEnvelopeRequest,
  runServer,
  getMultipleEnvelopeRequest,
  assertSentryEvent,
} from './utils/helpers';

jest.spyOn(console, 'error').mockImplementation();

describe('Remix API Loaders', () => {
  it('reports an error thrown from the loader', async () => {
    const baseURL = await runServer();
    const url = `${baseURL}/loader-json-response/-2`;

    const [transaction, event] = await getMultipleEnvelopeRequest(url, 2);

    assertSentryTransaction(transaction[2], {
      contexts: {
        trace: {
          status: 'internal_error',
          tags: {
            'http.status_code': '500',
          },
        },
      },
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Unexpected Server Error from Loader',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'loader',
              },
              handled: true,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });

  it('correctly instruments a parameterized Remix API loader', async () => {
    const baseURL = await runServer();
    const url = `${baseURL}/loader-json-response/123123`;
    const envelope = await getEnvelopeRequest(url);
    const transaction = envelope[2];

    assertSentryTransaction(transaction, {
      transaction: 'routes/loader-json-response/$id',
      transaction_info: {
        source: 'route',
      },
      spans: [
        // TODO: These two spans look exactly the same, but they are not.
        // One is from the parent route, and the other is from the route we are reaching.
        // We need to pass the names of the routes as their descriptions while wrapping loaders and actions.
        {
          description: 'routes/loader-json-response/$id',
          op: 'remix.server.loader',
        },
        {
          description: 'routes/loader-json-response/$id',
          op: 'remix.server.loader',
        },
        {
          description: 'routes/loader-json-response/$id',
          op: 'remix.server.documentRequest',
        },
      ],
    });
  });

  it('handles a thrown 500 response', async () => {
    const baseURL = await runServer();
    const url = `${baseURL}/loader-json-response/-1`;

    const [transaction_1, event, transaction_2] = await getMultipleEnvelopeRequest(url, 3);

    assertSentryTransaction(transaction_1[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
          tags: {
            method: 'GET',
            'http.status_code': '302',
          },
        },
      },
      tags: {
        transaction: 'routes/loader-json-response/$id',
      },
    });

    assertSentryTransaction(transaction_2[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          tags: {
            method: 'GET',
            'http.status_code': '500',
          },
        },
      },
      tags: {
        transaction: 'routes/loader-json-response/$id',
      },
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Unexpected Server Error from Loader',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'loader',
              },
              handled: true,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });
});
