import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should capture with different severity levels', async () => {
  const url = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(url, 14);
  console.log(envelopes);

  assertSentryEvent(envelopes[1][2], {
    message: 'debug_message',
    level: 'debug',
  });

  assertSentryEvent(envelopes[3][2], {
    message: 'info_message',
    level: 'info',
  });

  assertSentryEvent(envelopes[5][2], {
    message: 'warning_message',
    level: 'warning',
  });

  assertSentryEvent(envelopes[7][2], {
    message: 'error_message',
    level: 'error',
  });

  assertSentryEvent(envelopes[9][2], {
    message: 'fatal_message',
    level: 'fatal',
  });

  assertSentryEvent(envelopes[11][2], {
    message: 'critical_message',
    level: 'critical',
  });

  assertSentryEvent(envelopes[13][2], {
    message: 'log_message',
    level: 'log',
  });
});
