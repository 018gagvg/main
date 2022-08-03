import { Event } from '@sentry/node';

import { assertSentryEvent, getMultipleEnvelopeRequest, runServer, filterEnvelopeItems } from '../../../../utils';

test('should unset user', async () => {
  const url = await runServer(__dirname);
  const events = filterEnvelopeItems(await getMultipleEnvelopeRequest(url, 6));

  assertSentryEvent(events[0], {
    message: 'no_user',
  });

  expect((events[0] as Event).user).not.toBeDefined();

  assertSentryEvent(events[1], {
    message: 'user',
    user: {
      id: 'foo',
      ip_address: 'bar',
      other_key: 'baz',
    },
  });

  assertSentryEvent(events[2], {
    message: 'unset_user',
  });

  expect((events[2] as Event).user).not.toBeDefined();
});
