import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node-experimental';
import express from 'express';

const app = express();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

app.use(Sentry.Handlers.requestHandler());

Sentry.setTag('global', 'tag');

app.get('/test/express', () => {
  Sentry.withScope(scope => {
    scope.setTag('local', 'tag');
    throw new Error('test_error');
  });
});

app.use(Sentry.Handlers.errorHandler());

startExpressServerAndSendPortToRunner(app);
