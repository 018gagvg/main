fetch('http://localhost:7654/foo').then(() => {
  Sentry.captureException('test error');
});
