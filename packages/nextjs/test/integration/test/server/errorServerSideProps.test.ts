import { NextTestEnv } from './utils/helpers';

describe('Error Server-side Props', () => {
  it('should capture an error event', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/withErrorServerSideProps`;

    const envelope = await env.getEnvelopeRequest({
      url,
      envelopeType: 'event',
    });

    expect(envelope[2]).toMatchObject({
      transaction: `getServerSideProps (/withErrorServerSideProps)`,
      exception: {
        values: [
          {
            type: 'Error',
            value: 'ServerSideProps Error',
          },
        ],
      },
      request: {
        url,
        method: 'GET',
      },
    });
  });

  it('should capture an erroneous transaction', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/withErrorServerSideProps`;

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      envelopeType: 'transaction',
      count: 1,
    });

    const sentryTransactionEnvelope = envelopes.find(envelope => {
      const envelopeItem = envelope[2]!;
      return envelopeItem.transaction === '/withErrorServerSideProps';
    });

    expect(sentryTransactionEnvelope).toBeDefined();

    const envelopeItem = sentryTransactionEnvelope![2];

    expect(envelopeItem).toMatchObject({
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
        },
      },
      transaction: '/withErrorServerSideProps',
      transaction_info: {
        source: 'route',
      },
      type: 'transaction',
      request: {
        url: expect.stringMatching(/http:\/\/localhost:[0-9]+\/withErrorServerSideProps/),
      },
    });
  });
});
