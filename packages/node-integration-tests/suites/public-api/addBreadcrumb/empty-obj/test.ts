import { assertSentryEvent, TestEnv } from '../../../../utils.ts';

test('should add an empty breadcrumb, when an empty object is given', async () => {
  const env = await TestEnv.init(__dirname);
  const envelope = await env.getEnvelopeRequest();

  expect(envelope).toHaveLength(3);

  assertSentryEvent(envelope[2], {
    message: 'test-empty-obj',
  });
});
