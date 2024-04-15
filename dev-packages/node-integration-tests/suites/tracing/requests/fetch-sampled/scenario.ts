import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  tracePropagationTargets: [/\/v0/, 'v1'],
  integrations: [],
  transport: loggingTransport,
});

async function run(): Promise<void> {
  await Sentry.startSpan({ name: 'test_span' }, async () => {
    // Since fetch is lazy loaded, we need to wait a bit until it's fully instrumented
    await new Promise(resolve => setTimeout(resolve, 100));
    await fetch(`${process.env.SERVER_URL}/api/v0`);
    await fetch(`${process.env.SERVER_URL}/api/v1`);
    await fetch(`${process.env.SERVER_URL}/api/v2`);
    await fetch(`${process.env.SERVER_URL}/api/v3`);
  });
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
