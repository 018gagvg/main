import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracePropagationTargets: [/\/v0/, 'v1'],
  tracesSampleRate: 0,
  integrations: [],
  transport: loggingTransport,
});

async function run(): Promise<void> {
  // Wrap in span that is not sampled
  await Sentry.startSpan({ name: 'outer' }, async () => {
    // Since fetch is lazy loaded, we need to wait a bit until it's fully instrumented
    await new Promise(resolve => setTimeout(resolve, 100));
    await fetch(`${process.env.SERVER_URL}/api/v0`);
    await fetch(`${process.env.SERVER_URL}/api/v1`);
    await fetch(`${process.env.SERVER_URL}/api/v2`);
    await fetch(`${process.env.SERVER_URL}/api/v3`);
  });

  Sentry.captureException(new Error('foo'));
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
