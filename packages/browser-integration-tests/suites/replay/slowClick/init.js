import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window.Replay = new Sentry.Replay({
  flushMinDelay: 200,
  flushMaxDelay: 200,
  minReplayDuration: 0,
  slowClickTimeout: 3500,
  slowClickIgnoreSelectors: ['.ignore-class', '[ignore-attribute]'],
});

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 0,
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 0.0,

  integrations: [window.Replay],
});
