import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  // disable auto span creation
  integrations: [
    Sentry.browserTracingIntegration({
      instrumentPageLoad: false,
      instrumentNavigation: false,
    }),
  ],
  tracePropagationTargets: ['http://example.com'],
  tracesSampleRate: 1,
  autoSessionTracking: false,
});
