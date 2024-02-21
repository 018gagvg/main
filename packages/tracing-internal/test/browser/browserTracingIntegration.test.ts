import type { IdleTransaction } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  TRACING_DEFAULTS,
  getActiveSpan,
  getActiveTransaction,
  getCurrentScope,
  setCurrentClient,
  spanIsSampled,
  spanToJSON,
  startInactiveSpan,
} from '@sentry/core';
import * as hubExtensions from '@sentry/core';
import type { StartSpanOptions } from '@sentry/types';
import { timestampInSeconds } from '@sentry/utils';
import { JSDOM } from 'jsdom';
import { browserTracingIntegration, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan } from '../..';
import { WINDOW } from '../../src/browser/types';
import { TestClient, getDefaultClientOptions } from '../utils/TestClient';

// We're setting up JSDom here because the Next.js routing instrumentations requires a few things to be present on pageload:
// 1. Access to window.document API for `window.document.getElementById`
// 2. Access to window.location API for `window.location.pathname`

const dom = new JSDOM(undefined, { url: 'https://example.com/' });
Object.defineProperty(global, 'document', { value: dom.window.document, writable: true });
Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });
Object.defineProperty(global, 'history', { value: dom.window.history, writable: true });

const originalGlobalDocument = WINDOW.document;
const originalGlobalLocation = WINDOW.location;
const originalGlobalHistory = WINDOW.history;
afterAll(() => {
  // Clean up JSDom
  Object.defineProperty(WINDOW, 'document', { value: originalGlobalDocument });
  Object.defineProperty(WINDOW, 'location', { value: originalGlobalLocation });
  Object.defineProperty(WINDOW, 'history', { value: originalGlobalHistory });
});

describe('browserTracingIntegration', () => {
  afterEach(() => {
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
  });

  it('works with tracing enabled', () => {
    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
        integrations: [browserTracingIntegration()],
      }),
    );
    setCurrentClient(client);
    client.init();

    const span = getActiveSpan();
    expect(span).toBeDefined();
    expect(spanIsSampled(span!)).toBe(true);
    expect(spanToJSON(span!)).toEqual({
      description: '/',
      op: 'pageload',
      origin: 'auto.pageload.browser',
      data: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      },
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      trace_id: expect.any(String),
    });
  });

  it('works with tracing disabled', () => {
    const client = new TestClient(
      getDefaultClientOptions({
        integrations: [browserTracingIntegration()],
      }),
    );
    setCurrentClient(client);
    client.init();

    const span = getActiveSpan();
    expect(span).toBeDefined();
    expect(spanIsSampled(span!)).toBe(false);
  });

  it("doesn't create a pageload span when instrumentPageLoad is false", () => {
    const client = new TestClient(
      getDefaultClientOptions({
        integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
      }),
    );
    setCurrentClient(client);
    client.init();

    const span = getActiveSpan();
    expect(span).not.toBeDefined();
  });

  it('works with tracing enabled but unsampled', () => {
    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 0,
        integrations: [browserTracingIntegration()],
      }),
    );
    setCurrentClient(client);
    client.init();

    const span = getActiveSpan();
    expect(span).toBeDefined();
    expect(spanIsSampled(span!)).toBe(false);
  });

  it('starts navigation when URL changes', () => {
    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
        integrations: [browserTracingIntegration()],
      }),
    );
    setCurrentClient(client);
    client.init();

    const span = getActiveSpan();
    expect(span).toBeDefined();
    expect(spanIsSampled(span!)).toBe(true);
    expect(span!.isRecording()).toBe(true);
    expect(spanToJSON(span!)).toEqual({
      description: '/',
      op: 'pageload',
      origin: 'auto.pageload.browser',
      data: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      },
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      trace_id: expect.any(String),
    });

    // this is what is used to get the span name - JSDOM does not update this on it's own!
    const dom = new JSDOM(undefined, { url: 'https://example.com/test' });
    Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });

    WINDOW.history.pushState({}, '', '/test');

    expect(span!.isRecording()).toBe(false);

    const span2 = getActiveSpan();
    expect(span2).toBeDefined();
    expect(spanIsSampled(span2!)).toBe(true);
    expect(span2!.isRecording()).toBe(true);
    expect(spanToJSON(span2!)).toEqual({
      description: '/test',
      op: 'navigation',
      origin: 'auto.navigation.browser',
      data: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser',
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      },
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      trace_id: expect.any(String),
    });

    // this is what is used to get the span name - JSDOM does not update this on it's own!
    const dom2 = new JSDOM(undefined, { url: 'https://example.com/test2' });
    Object.defineProperty(global, 'location', { value: dom2.window.document.location, writable: true });

    WINDOW.history.pushState({}, '', '/test2');

    expect(span2!.isRecording()).toBe(false);

    const span3 = getActiveSpan();
    expect(span3).toBeDefined();
    expect(spanIsSampled(span3!)).toBe(true);
    expect(span3!.isRecording()).toBe(true);
    expect(spanToJSON(span3!)).toEqual({
      description: '/test2',
      op: 'navigation',
      origin: 'auto.navigation.browser',
      data: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser',
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      },
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      trace_id: expect.any(String),
    });
  });

  it('extracts window.location/self.location for sampling context in pageload transactions', () => {
    // this is what is used to get the span name - JSDOM does not update this on it's own!
    const dom = new JSDOM(undefined, { url: 'https://example.com/test' });
    Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });

    const tracesSampler = jest.fn();
    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
        integrations: [browserTracingIntegration()],
        tracesSampler,
      }),
    );
    setCurrentClient(client);
    client.init();

    expect(tracesSampler).toHaveBeenCalledWith(
      expect.objectContaining({
        location: dom.window.document.location,
      }),
    );
  });

  it('extracts window.location/self.location for sampling context in navigation transactions', () => {
    const tracesSampler = jest.fn();
    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
        integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
        tracesSampler,
      }),
    );
    setCurrentClient(client);
    client.init();

    // this is what is used to get the span name - JSDOM does not update this on it's own!
    const dom = new JSDOM(undefined, { url: 'https://example.com/test' });
    Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });

    WINDOW.history.pushState({}, '', '/test');

    expect(tracesSampler).toHaveBeenCalledWith(
      expect.objectContaining({
        location: dom.window.document.location,
      }),
    );
  });

  it("trims pageload transactions to the max duration of the transaction's children", () => {
    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
        integrations: [browserTracingIntegration()],
      }),
    );

    setCurrentClient(client);
    client.init();

    const pageloadSpan = getActiveSpan();
    const childSpan = startInactiveSpan({ name: 'pageload-child' });
    const timestamp = timestampInSeconds();

    childSpan?.end(timestamp);
    pageloadSpan?.end(timestamp + 12345);

    expect(spanToJSON(pageloadSpan!).timestamp).toBe(timestamp);
  });

  describe('startBrowserTracingPageLoadSpan', () => {
    it('works without integration setup', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          integrations: [],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingPageLoadSpan(client, { name: 'test span' });

      expect(span).toBeUndefined();
    });

    it('works with unsampled span', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 0,
          integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingPageLoadSpan(client, { name: 'test span' });

      expect(span).toBeDefined();
      expect(spanIsSampled(span!)).toBe(false);
    });

    it('works with integration setup', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingPageLoadSpan(client, { name: 'test span' });

      expect(span).toBeDefined();
      expect(spanToJSON(span!)).toEqual({
        description: 'test span',
        op: 'pageload',
        origin: 'manual',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        },
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        trace_id: expect.any(String),
      });
      expect(spanIsSampled(span!)).toBe(true);
    });

    it('allows to overwrite properties', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingPageLoadSpan(client, {
        name: 'test span',
        origin: 'auto.test',
        attributes: { testy: 'yes' },
      });

      expect(span).toBeDefined();
      expect(spanToJSON(span!)).toEqual({
        description: 'test span',
        op: 'pageload',
        origin: 'auto.test',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test',
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
          testy: 'yes',
        },
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        trace_id: expect.any(String),
      });
    });

    it('calls before beforeStartSpan', () => {
      const mockBeforeStartSpan = jest.fn((options: StartSpanOptions) => options);

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 0,
          integrations: [
            browserTracingIntegration({ instrumentPageLoad: false, beforeStartSpan: mockBeforeStartSpan }),
          ],
        }),
      );
      setCurrentClient(client);
      client.init();

      startBrowserTracingPageLoadSpan(client, { name: 'test span' });

      expect(mockBeforeStartSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test span',
          op: 'pageload',
        }),
      );
    });

    it('uses options overridden with beforeStartSpan', () => {
      const mockBeforeStartSpan = jest.fn((options: StartSpanOptions) => ({
        ...options,
        op: 'test op',
      }));

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 0,
          integrations: [
            browserTracingIntegration({
              instrumentPageLoad: false,
              instrumentNavigation: false,
              beforeStartSpan: mockBeforeStartSpan,
            }),
          ],
        }),
      );
      setCurrentClient(client);
      client.init();

      startBrowserTracingPageLoadSpan(client, { name: 'test span' });

      const pageloadSpan = getActiveSpan();

      expect(spanToJSON(pageloadSpan!).op).toBe('test op');
    });
  });

  it('sets source to "custom" if name is changed in beforeStartSpan', () => {
    const mockBeforeStartSpan = jest.fn((options: StartSpanOptions) => ({
      ...options,
      name: 'changed',
    }));

    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 0,
        integrations: [
          browserTracingIntegration({
            instrumentPageLoad: false,
            instrumentNavigation: false,
            beforeStartSpan: mockBeforeStartSpan,
          }),
        ],
      }),
    );
    setCurrentClient(client);
    client.init();

    startBrowserTracingPageLoadSpan(client, { name: 'test span' });

    const pageloadSpan = getActiveSpan();

    expect(spanToJSON(pageloadSpan!).description).toBe('changed');
    expect(spanToJSON(pageloadSpan!).data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toBe('custom');
  });

  describe('startBrowserTracingNavigationSpan', () => {
    it('works without integration setup', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          integrations: [],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingNavigationSpan(client, { name: 'test span' });

      expect(span).toBeUndefined();
    });

    it('works with unsampled span', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 0,
          integrations: [browserTracingIntegration({ instrumentNavigation: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingNavigationSpan(client, { name: 'test span' });

      expect(span).toBeDefined();
      expect(spanIsSampled(span!)).toBe(false);
    });

    it('works with integration setup', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration({ instrumentNavigation: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingNavigationSpan(client, { name: 'test span' });

      expect(span).toBeDefined();
      expect(spanToJSON(span!)).toEqual({
        description: 'test span',
        op: 'navigation',
        origin: 'manual',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        },
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        trace_id: expect.any(String),
      });
      expect(spanIsSampled(span!)).toBe(true);
    });

    it('allows to overwrite properties', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration({ instrumentNavigation: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingNavigationSpan(client, {
        name: 'test span',
        origin: 'auto.test',
        attributes: { testy: 'yes' },
      });

      expect(span).toBeDefined();
      expect(spanToJSON(span!)).toEqual({
        description: 'test span',
        op: 'navigation',
        origin: 'auto.test',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test',
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
          testy: 'yes',
        },
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        trace_id: expect.any(String),
      });
    });

    it('calls before beforeStartSpan', () => {
      const mockBeforeStartSpan = jest.fn((options: StartSpanOptions) => options);

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 0,
          integrations: [
            browserTracingIntegration({
              instrumentPageLoad: false,
              instrumentNavigation: false,
              beforeStartSpan: mockBeforeStartSpan,
            }),
          ],
        }),
      );
      setCurrentClient(client);
      client.init();

      startBrowserTracingNavigationSpan(client, { name: 'test span' });

      expect(mockBeforeStartSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test span',
          op: 'navigation',
        }),
      );
    });

    it('uses options overridden with beforeStartSpan', () => {
      const mockBeforeStartSpan = jest.fn((options: StartSpanOptions) => ({
        ...options,
        op: 'test op',
      }));

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 0,
          integrations: [
            browserTracingIntegration({
              instrumentPageLoad: false,
              instrumentNavigation: false,
              beforeStartSpan: mockBeforeStartSpan,
            }),
          ],
        }),
      );
      setCurrentClient(client);
      client.init();

      startBrowserTracingNavigationSpan(client, { name: 'test span' });

      const navigationSpan = getActiveSpan();

      expect(spanToJSON(navigationSpan!).op).toBe('test op');
    });

    it('sets source to "custom" if name is changed in beforeStartSpan', () => {
      const mockBeforeStartSpan = jest.fn((options: StartSpanOptions) => ({
        ...options,
        name: 'changed',
      }));

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 0,
          integrations: [
            browserTracingIntegration({
              instrumentPageLoad: false,
              instrumentNavigation: false,
              beforeStartSpan: mockBeforeStartSpan,
            }),
          ],
        }),
      );
      setCurrentClient(client);
      client.init();

      startBrowserTracingNavigationSpan(client, { name: 'test span' });

      const pageloadSpan = getActiveSpan();

      expect(spanToJSON(pageloadSpan!).description).toBe('changed');
      expect(spanToJSON(pageloadSpan!).data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toBe('custom');
    });
  });

  it('sets transaction context from sentry-trace header for pageload transactions', () => {
    const name = 'sentry-trace';
    const content = '126de09502ae4e0fb26c6967190756a4-b6e54397b12a2a0f-1';
    document.head.innerHTML =
      `<meta name="${name}" content="${content}">` + '<meta name="baggage" content="sentry-release=2.1.14,foo=bar">';
    const startIdleTransaction = jest.spyOn(hubExtensions, 'startIdleTransaction');

    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
        integrations: [browserTracingIntegration()],
      }),
    );
    setCurrentClient(client);
    client.init();

    expect(startIdleTransaction).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        traceId: '126de09502ae4e0fb26c6967190756a4',
        parentSpanId: 'b6e54397b12a2a0f',
        parentSampled: true,
        metadata: {
          dynamicSamplingContext: { release: '2.1.14' },
        },
      }),
      expect.any(Number),
      expect.any(Number),
      expect.any(Boolean),
      expect.any(Object),
      expect.any(Number),
      true,
    );
  });

  describe('using the <meta> tag data', () => {
    it('uses the tracing data for pageload transactions', () => {
      // make sampled false here, so we can see that it's being used rather than the tracesSampleRate-dictated one
      document.head.innerHTML =
        '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
        '<meta name="baggage" content="sentry-release=2.1.14,foo=bar">';

      const client = new TestClient(
        getDefaultClientOptions({
          integrations: [browserTracingIntegration()],
        }),
      );
      setCurrentClient(client);

      // pageload transactions are created as part of the browserTracingIntegration's initialization
      client.init();

      // eslint-disable-next-line deprecation/deprecation
      const transaction = getActiveTransaction() as IdleTransaction;
      // eslint-disable-next-line deprecation/deprecation
      const dynamicSamplingContext = transaction.getDynamicSamplingContext()!;

      expect(transaction).toBeDefined();
      // eslint-disable-next-line deprecation/deprecation
      expect(transaction.op).toBe('pageload');
      // eslint-disable-next-line deprecation/deprecation
      expect(transaction.traceId).toEqual('12312012123120121231201212312012');
      // eslint-disable-next-line deprecation/deprecation
      expect(transaction.parentSpanId).toEqual('1121201211212012');
      // eslint-disable-next-line deprecation/deprecation
      expect(transaction.sampled).toBe(false);
      expect(dynamicSamplingContext).toBeDefined();
      expect(dynamicSamplingContext).toStrictEqual({ release: '2.1.14' });
    });

    it('puts frozen Dynamic Sampling Context on pageload transactions if sentry-trace data and only 3rd party baggage is present', () => {
      // make sampled false here, so we can see that it's being used rather than the tracesSampleRate-dictated one
      document.head.innerHTML =
        '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
        '<meta name="baggage" content="foo=bar">';

      const client = new TestClient(
        getDefaultClientOptions({
          integrations: [browserTracingIntegration()],
        }),
      );
      setCurrentClient(client);

      // pageload transactions are created as part of the browserTracingIntegration's initialization
      client.init();

      // eslint-disable-next-line deprecation/deprecation
      const transaction = getActiveTransaction() as IdleTransaction;
      // eslint-disable-next-line deprecation/deprecation
      const dynamicSamplingContext = transaction.getDynamicSamplingContext()!;

      expect(transaction).toBeDefined();
      // eslint-disable-next-line deprecation/deprecation
      expect(transaction.op).toBe('pageload');
      // eslint-disable-next-line deprecation/deprecation
      expect(transaction.traceId).toEqual('12312012123120121231201212312012');
      // eslint-disable-next-line deprecation/deprecation
      expect(transaction.parentSpanId).toEqual('1121201211212012');
      // eslint-disable-next-line deprecation/deprecation
      expect(transaction.sampled).toBe(false);
      expect(dynamicSamplingContext).toStrictEqual({});
    });

    it('ignores the meta tag data for navigation transactions', () => {
      document.head.innerHTML =
        '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
        '<meta name="baggage" content="sentry-release=2.1.14">';

      const client = new TestClient(
        getDefaultClientOptions({
          integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
        }),
      );
      setCurrentClient(client);

      // pageload transactions are created as part of the browserTracingIntegration's initialization
      client.init();

      // this is what is used to get the span name - JSDOM does not update this on it's own!
      const dom = new JSDOM(undefined, { url: 'https://example.com/navigation-test' });
      Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });

      WINDOW.history.pushState({}, '', '/navigation-test');

      // eslint-disable-next-line deprecation/deprecation
      const transaction = getActiveTransaction() as IdleTransaction;
      // eslint-disable-next-line deprecation/deprecation
      const dynamicSamplingContext = transaction.getDynamicSamplingContext()!;

      expect(transaction).toBeDefined();
      // eslint-disable-next-line deprecation/deprecation
      expect(transaction.op).toBe('navigation');
      // eslint-disable-next-line deprecation/deprecation
      expect(transaction.traceId).not.toEqual('12312012123120121231201212312012');
      // eslint-disable-next-line deprecation/deprecation
      expect(transaction.parentSpanId).toBeUndefined();
      expect(dynamicSamplingContext).toMatchObject({
        trace_id: expect.not.stringMatching('12312012123120121231201212312012'),
      });
      transaction.end();
    });
  });

  describe('idleTimeout', () => {
    it('is created by default', () => {
      jest.useFakeTimers();
      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration()],
        }),
      );
      setCurrentClient(client);
      client.init();

      const mockFinish = jest.fn();
      // eslint-disable-next-line deprecation/deprecation
      const transaction = getActiveTransaction() as IdleTransaction;
      transaction.sendAutoFinishSignal();
      transaction.end = mockFinish;

      // eslint-disable-next-line deprecation/deprecation
      const span = transaction.startChild(); // activities = 1
      span.end(); // activities = 0

      expect(mockFinish).toHaveBeenCalledTimes(0);
      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(mockFinish).toHaveBeenCalledTimes(1);
    });

    it('can be a custom value', () => {
      jest.useFakeTimers();

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration({ idleTimeout: 2000 })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const mockFinish = jest.fn();
      // eslint-disable-next-line deprecation/deprecation
      const transaction = getActiveTransaction() as IdleTransaction;
      transaction.sendAutoFinishSignal();
      transaction.end = mockFinish;

      // eslint-disable-next-line deprecation/deprecation
      const span = transaction.startChild(); // activities = 1
      span.end(); // activities = 0

      expect(mockFinish).toHaveBeenCalledTimes(0);
      jest.advanceTimersByTime(2000);
      expect(mockFinish).toHaveBeenCalledTimes(1);
    });
  });

  // TODO(lforst): I cannot manage to get this test to pass.
  /*
  it('heartbeatInterval can be a custom value', () => {
    jest.useFakeTimers();

    const interval = 200;

    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
        integrations: [browserTracingIntegration({ heartbeatInterval: interval })],
      }),
    );

    setCurrentClient(client);
    client.init();

    const mockFinish = jest.fn();
    // eslint-disable-next-line deprecation/deprecation
    const transaction = getActiveTransaction() as IdleTransaction;
    transaction.sendAutoFinishSignal();
    transaction.end = mockFinish;

    const span = startInactiveSpan({ name: 'child-span' }); // activities = 1
    span!.end(); // activities = 0

    expect(mockFinish).toHaveBeenCalledTimes(0);
    jest.advanceTimersByTime(interval * 3);
    expect(mockFinish).toHaveBeenCalledTimes(1);
  });
  */
});
