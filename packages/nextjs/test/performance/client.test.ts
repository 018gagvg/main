import { getGlobalObject } from '@sentry/utils';
import { JSDOM } from 'jsdom';
import { default as Router } from 'next/router';

import { nextRouterInstrumentation } from '../../src/performance/client';

let readyCalled = false;
jest.mock('next/router', () => {
  const router = {};
  Object.setPrototypeOf(router, { changeState: () => undefined });
  return {
    default: {
      router,
      route: '/[user]/posts/[id]',
      readyCallbacks: [],
      ready(cb: () => void) {
        readyCalled = true;
        return cb();
      },
    },
  };
});

describe('client', () => {
  beforeEach(() => {
    readyCalled = false;
    if (Router.router) {
      Router.router.changeState('pushState', '/[user]/posts/[id]', '/abhi/posts/123', {});
    }
  });

  describe('nextRouterInstrumentation', () => {
    const originalGlobalDocument = getGlobalObject<Window>().document;

    function setUpNextPage(pageProperties: {
      url: string;
      route: string;
      query: any;
      props: any;
      hasNextData: boolean;
    }) {
      const dom = new JSDOM(
        // Just some example what a __NEXT_DATA__ tag might look like
        pageProperties.hasNextData
          ? `<body>
          <script id="__NEXT_DATA__" type="application/json">
          {
            "props": ${JSON.stringify(pageProperties.props)},
            "page": "${pageProperties.route}",
            "query": ${JSON.stringify(pageProperties.query)},
            "buildId": "y76hvndNJBAithejdVGLW",
            "isFallback": false,
            "gssp": true,
            "appGip": true,
            "scriptLoader": []
          }
          </script>
        </body>`
          : '<body><h1>No next data :(</h1></body>',
        { url: pageProperties.url },
      );

      Object.defineProperty(global, 'document', { value: dom.window.document, writable: true, configurable: true });
    }

    afterEach(() => {
      // Clean up JSDom
      Object.defineProperty(global, 'document', {
        value: originalGlobalDocument,
        writable: true,
        configurable: true,
      });
    });

    it('waits for Router.ready()', () => {
      setUpNextPage({ url: 'https://example.com/', route: '/', query: {}, props: {}, hasNextData: false });
      const mockStartTransaction = jest.fn();
      expect(readyCalled).toBe(false);
      nextRouterInstrumentation(mockStartTransaction);
      expect(readyCalled).toBe(true);
    });

    it.each([
      [
        'https://example.com/lforst/posts/1337?q=42',
        '/[user]/posts/[id]',
        { user: 'lforst', id: '1337', q: '42' },
        {
          _sentryGetInitialPropsTraceId: 'SOME_TRACE_ID',
          _sentryGetInitialPropsBaggage:
            'other=vendor,foo=bar,third=party,last=item,sentry-release=2.1.0,sentry-environment=myEnv',
        },
        true,
        {
          name: '/[user]/posts/[id]',
          op: 'pageload',
          tags: {
            'routing.instrumentation': 'next-router',
          },
          data: {
            user: 'lforst',
            id: '1337',
            q: '42',
          },
          metadata: {
            source: 'route',
            baggage: [{ environment: 'myEnv', release: '2.1.0' }, '', true],
          },
          traceId: 'SOME_TRACE_ID',
        },
      ],
      [
        'https://example.com/static',
        '/static',
        {},
        {
          pageProps: {
            _sentryGetServerSidePropsTraceId: 'SOME_TRACE_ID',
            _sentryGetServerSidePropsBaggage:
              'other=vendor,foo=bar,third=party,last=item,sentry-release=2.1.0,sentry-environment=myEnv',
          },
        },
        true,
        {
          name: '/static',
          op: 'pageload',
          tags: {
            'routing.instrumentation': 'next-router',
          },
          data: {},
          metadata: {
            source: 'route',
            baggage: [{ environment: 'myEnv', release: '2.1.0' }, '', true],
          },
          traceId: 'SOME_TRACE_ID',
        },
      ],
      [
        'https://example.com/',
        '/',
        {},
        {},
        true,
        {
          name: '/',
          op: 'pageload',
          tags: {
            'routing.instrumentation': 'next-router',
          },
          data: {},
          metadata: {
            source: 'route',
          },
        },
      ],
      [
        'https://example.com/lforst/posts/1337?q=42',
        '/',
        {},
        {},
        false, // no __NEXT_DATA__ tag
        {
          name: '/lforst/posts/1337',
          op: 'pageload',
          tags: {
            'routing.instrumentation': 'next-router',
          },
          metadata: {
            source: 'url',
          },
        },
      ],
    ])(
      'creates a pageload transaction (#%#)',
      (url, route, query, props, hasNextData, expectedStartTransactionCall) => {
        const mockStartTransaction = jest.fn();
        setUpNextPage({ url, route, query, props, hasNextData });
        nextRouterInstrumentation(mockStartTransaction);
        expect(mockStartTransaction).toHaveBeenCalledTimes(1);
        expect(mockStartTransaction).toHaveBeenLastCalledWith(expectedStartTransactionCall);
      },
    );

    it('does not create a pageload transaction if option not given', () => {
      const mockStartTransaction = jest.fn();
      nextRouterInstrumentation(mockStartTransaction, false);
      expect(mockStartTransaction).toHaveBeenCalledTimes(0);
    });

    describe('navigation transactions', () => {
      // [name, in, out]
      const table: Array<[string, [string, string, string, Record<string, unknown>], Record<string, unknown>]> = [
        [
          'creates parameterized transaction',
          ['pushState', '/posts/[id]', '/posts/32', {}],
          {
            name: '/posts/[id]',
            op: 'navigation',
            tags: {
              from: '/[user]/posts/[id]',
              method: 'pushState',
              'routing.instrumentation': 'next-router',
            },
            metadata: {
              source: 'route',
            },
          },
        ],
        [
          'strips query parameters',
          ['replaceState', '/posts/[id]?name=cat', '/posts/32?name=cat', {}],
          {
            name: '/posts/[id]',
            op: 'navigation',
            tags: {
              from: '/[user]/posts/[id]',
              method: 'replaceState',
              'routing.instrumentation': 'next-router',
            },
            metadata: {
              source: 'route',
            },
          },
        ],
        [
          'creates regular transactions',
          ['pushState', '/about', '/about', {}],
          {
            name: '/about',
            op: 'navigation',
            tags: {
              from: '/[user]/posts/[id]',
              method: 'pushState',
              'routing.instrumentation': 'next-router',
            },
            metadata: {
              source: 'route',
            },
          },
        ],
      ];

      it.each(table)('%s', (...test) => {
        const mockStartTransaction = jest.fn();
        nextRouterInstrumentation(mockStartTransaction, false);
        expect(mockStartTransaction).toHaveBeenCalledTimes(0);

        // @ts-ignore we can spread into test
        Router.router?.changeState(...test[1]);
        expect(mockStartTransaction).toHaveBeenLastCalledWith(test[2]);
      });
    });

    it('does not create navigation transaction with the same name', () => {
      const mockStartTransaction = jest.fn();
      nextRouterInstrumentation(mockStartTransaction, false);
      expect(mockStartTransaction).toHaveBeenCalledTimes(0);

      Router.router?.changeState('pushState', '/login', '/login', {});
      expect(mockStartTransaction).toHaveBeenCalledTimes(1);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/login',
        op: 'navigation',
        tags: { from: '/[user]/posts/[id]', method: 'pushState', 'routing.instrumentation': 'next-router' },
        metadata: {
          source: 'route',
        },
      });

      Router.router?.changeState('pushState', '/login', '/login', {});
      expect(mockStartTransaction).toHaveBeenCalledTimes(1);

      Router.router?.changeState('pushState', '/posts/[id]', '/posts/123', {});
      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/posts/[id]',
        op: 'navigation',
        tags: { from: '/login', method: 'pushState', 'routing.instrumentation': 'next-router' },
        metadata: {
          source: 'route',
        },
      });
    });
  });
});
