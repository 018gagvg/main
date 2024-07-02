import { conditionalTest } from '../../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

// Before Node 16, parametrization is not working properly here
conditionalTest({ min: 16 })('complex-router', () => {
  test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route and express used multiple middlewares with route', done => {
    // parse node.js major version
    const [major = 0] = process.versions.node.split('.').map(Number);
    // Split test result base on major node version because regex d flag is support from node 16+

    const EXPECTED_TRANSACTION =
      major >= 16
        ? {
            transaction: 'GET /api/api/v1/sub-router/users/:userId/posts/:postId',
            transaction_info: {
              source: 'route',
            },
          }
        : {
            transaction: 'GET /api/api/v1/sub-router/users/123/posts/:postId',
            transaction_info: {
              source: 'route',
            },
          };

    createRunner(__dirname, 'server.ts')
      .ignore('event', 'session', 'sessions')
      .expect({ transaction: EXPECTED_TRANSACTION as any })
      .start(done)
      .makeRequest('get', '/api/api/v1/sub-router/users/123/posts/456');
  });

  test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route and express used multiple middlewares with route and original url has query params', done => {
    // parse node.js major version
    const [major = 0] = process.versions.node.split('.').map(Number);
    // Split test result base on major node version because regex d flag is support from node 16+
    const EXPECTED_TRANSACTION =
      major >= 16
        ? {
            transaction: 'GET /api/api/v1/sub-router/users/:userId/posts/:postId',
            transaction_info: {
              source: 'route',
            },
          }
        : {
            transaction: 'GET /api/api/v1/sub-router/users/123/posts/:postId',
            transaction_info: {
              source: 'route',
            },
          };

    createRunner(__dirname, 'server.ts')
      .ignore('event', 'session', 'sessions')
      .expect({ transaction: EXPECTED_TRANSACTION as any })
      .start(done)
      .makeRequest('get', '/api/api/v1/sub-router/users/123/posts/456?param=1');
  });

  test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route and express used multiple middlewares with route and original url ends with trailing slash and has query params', done => {
    // parse node.js major version
    const [major = 0] = process.versions.node.split('.').map(Number);
    // Split test result base on major node version because regex d flag is support from node 16+
    const EXPECTED_TRANSACTION =
      major >= 16
        ? {
            transaction: 'GET /api/api/v1/sub-router/users/:userId/posts/:postId',
            transaction_info: {
              source: 'route',
            },
          }
        : {
            transaction: 'GET /api/api/v1/sub-router/users/123/posts/:postId',
            transaction_info: {
              source: 'route',
            },
          };

    createRunner(__dirname, 'server.ts')
      .ignore('event', 'session', 'sessions')
      .expect({ transaction: EXPECTED_TRANSACTION as any })
      .start(done)
      .makeRequest('get', '/api/api/v1/sub-router/users/123/posts/456/?param=1');
  });
});
