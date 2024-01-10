import {
  addTracingExtensions,
  captureException,
  getCurrentScope,
  handleCallbackErrors,
  runWithAsyncContext,
  startSpan,
} from '@sentry/core';
import { tracingContextFromHeaders, winterCGHeadersToDict } from '@sentry/utils';

import { isRedirectNavigationError } from './nextNavigationErrorUtils';
import type { RouteHandlerContext } from './types';
import { platformSupportsStreaming } from './utils/platformSupportsStreaming';
import { flushQueue } from './utils/responseEnd';

/**
 * Wraps a Next.js route handler with performance and error instrumentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapRouteHandlerWithSentry<F extends (...args: any[]) => any>(
  routeHandler: F,
  context: RouteHandlerContext,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>> {
  addTracingExtensions();
  // TODO
  // eslint-disable-next-line deprecation/deprecation
  const { method, parameterizedRoute, baggageHeader, sentryTraceHeader, headers } = context;
  return new Proxy(routeHandler, {
    apply: (originalFunction, thisArg, args) => {
      return runWithAsyncContext(async () => {
        const { traceparentData, dynamicSamplingContext, propagationContext } = tracingContextFromHeaders(
          sentryTraceHeader ?? headers?.get('sentry-trace') ?? undefined,
          baggageHeader ?? headers?.get('baggage'),
        );
        getCurrentScope().setPropagationContext(propagationContext);

        let result;

        try {
          result = await startSpan(
            {
              op: 'http.server',
              name: `${method} ${parameterizedRoute}`,
              status: 'ok',
              ...traceparentData,
              metadata: {
                request: {
                  headers: headers ? winterCGHeadersToDict(headers) : undefined,
                },
                source: 'route',
                dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
              },
            },
            async span => {
              const response: Response = await handleCallbackErrors(
                () => originalFunction.apply(thisArg, args),
                error => {
                  // Next.js throws errors when calling `redirect()`. We don't wanna report these.
                  if (!isRedirectNavigationError(error)) {
                    captureException(error, {
                      mechanism: {
                        handled: false,
                      },
                    });
                  }
                },
              );

              try {
                span?.setHttpStatus(response.status);
              } catch {
                // best effort
              }

              return response;
            },
          );
        } finally {
          if (!platformSupportsStreaming() || process.env.NEXT_RUNTIME === 'edge') {
            // 1. Edge tranpsort requires manual flushing
            // 2. Lambdas require manual flushing to prevent execution freeze before the event is sent
            await flushQueue();
          }
        }

        return result;
      });
    },
  });
}
