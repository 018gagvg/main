import { Event } from '@sentry/node';

import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should unset user', async () => {
  const url = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(url, 6);

  assertSentryEvent(envelopes[1][2], {
    message: 'no_user',
  });

  expect((envelopes[0][2] as Event).user).not.toBeDefined();

  assertSentryEvent(envelopes[3][2], {
    message: 'user',
    user: {
      id: 'foo',
      ip_address: 'bar',
      other_key: 'baz',
    },
  });

  assertSentryEvent(envelopes[5][2], {
    message: 'unset_user',
  });

  expect((envelopes[2][2] as Event).user).not.toBeDefined();
});
