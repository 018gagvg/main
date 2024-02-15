import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

jest.setTimeout(20000);

// This is required to run the test with ts-node and decorators
process.env.TS_NODE_PROJECT = `${__dirname}/tsconfig.json`;

describe('nestjs auto instrumentation', () => {
  afterAll(async () => {
    cleanupChildProcesses();
  });

  const CREATION_TRANSACTION = {
    transaction: 'Create Nest App',
  };

  const GET_TRANSACTION = {
    transaction: 'GET /',
    spans: expect.arrayContaining([
      expect.objectContaining({
        description: 'GET /',
        data: expect.objectContaining({
          'nestjs.callback': 'getHello',
          'nestjs.controller': 'AppController',
          'nestjs.type': 'request_context',
          'otel.kind': 'INTERNAL',
          'sentry.op': 'http',
        }),
      }),
    ]),
  };

  test('should auto-instrument `nestjs` package', done => {
    createRunner(__dirname, 'scenario.ts')
      .expect({ transaction: CREATION_TRANSACTION })
      .expect({ transaction: GET_TRANSACTION })
      .start(done)
      .makeRequest('get', '/');
  });
});
