import { Event } from '@sentry/node';

import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should record multiple contexts', async () => {
  const url = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(url, 2);
  const errorEnvelope = envelopes[1];

  assertSentryEvent(errorEnvelope[2], {
    message: 'multiple_contexts',
    contexts: {
      context_1: {
        foo: 'bar',
        baz: { qux: 'quux' },
      },
      context_2: { 1: 'foo', bar: false },
    },
  });

  expect((errorEnvelope[2] as Event).contexts?.context_3).not.toBeDefined();
});
