import { BrowserClient } from '@sentry/browser';
import { Hub, addTracingExtensions, makeMain, startInactiveSpan, startSpan } from '@sentry/core';
import type { HandlerDataError, HandlerDataUnhandledRejection } from '@sentry/types';

import { getDefaultBrowserClientOptions } from '../../../../tracing/test/testutils';
import { registerErrorInstrumentation } from '../../../src/tracing/errors';

const mockAddGlobalErrorInstrumentationHandler = jest.fn();
const mockAddGlobalUnhandledRejectionInstrumentationHandler = jest.fn();
let mockErrorCallback: (data: HandlerDataError) => void = () => {};
let mockUnhandledRejectionCallback: (data: HandlerDataUnhandledRejection) => void = () => {};
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    addGlobalErrorInstrumentationHandler: (callback: () => void) => {
      mockErrorCallback = callback;

      return mockAddGlobalErrorInstrumentationHandler(callback);
    },
    addGlobalUnhandledRejectionInstrumentationHandler: (callback: () => void) => {
      mockUnhandledRejectionCallback = callback;
      return mockAddGlobalUnhandledRejectionInstrumentationHandler(callback);
    },
  };
});

beforeAll(() => {
  addTracingExtensions();
});

describe('registerErrorHandlers()', () => {
  beforeEach(() => {
    mockAddGlobalErrorInstrumentationHandler.mockClear();
    mockAddGlobalUnhandledRejectionInstrumentationHandler.mockClear();
    const options = getDefaultBrowserClientOptions({ enableTracing: true });
    const hub = new Hub(new BrowserClient(options));
    // eslint-disable-next-line deprecation/deprecation
    makeMain(hub);
  });

  it('registers error instrumentation', () => {
    registerErrorInstrumentation();
    expect(mockAddGlobalErrorInstrumentationHandler).toHaveBeenCalledTimes(1);
    expect(mockAddGlobalUnhandledRejectionInstrumentationHandler).toHaveBeenCalledTimes(1);
    expect(mockAddGlobalErrorInstrumentationHandler).toHaveBeenCalledWith(expect.any(Function));
    expect(mockAddGlobalUnhandledRejectionInstrumentationHandler).toHaveBeenCalledWith(expect.any(Function));
  });

  it('does not set status if transaction is not on scope', () => {
    registerErrorInstrumentation();

    const transaction = startInactiveSpan({ name: 'test' })!;
    expect(transaction.status).toBe(undefined);

    mockErrorCallback({} as HandlerDataError);
    expect(transaction.status).toBe(undefined);

    mockUnhandledRejectionCallback({});
    expect(transaction.status).toBe(undefined);
    transaction.end();
  });

  it('sets status for transaction on scope on error', () => {
    registerErrorInstrumentation();

    startSpan({ name: 'test' }, span => {
      mockErrorCallback({} as HandlerDataError);
      expect(span?.status).toBe('internal_error');
    });
  });

  it('sets status for transaction on scope on unhandledrejection', () => {
    registerErrorInstrumentation();

    startSpan({ name: 'test' }, span => {
      mockUnhandledRejectionCallback({});
      expect(span?.status).toBe('internal_error');
    });
  });
});
