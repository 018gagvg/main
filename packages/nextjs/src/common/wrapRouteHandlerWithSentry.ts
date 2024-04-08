import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  addTracingExtensions,
  captureException,
  getActiveSpan,
  getRootSpan,
  handleCallbackErrors,
  setHttpStatus,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import type { Span } from '@sentry/types';
import { winterCGHeadersToDict } from '@sentry/utils';
import { isNotFoundNavigationError, isRedirectNavigationError } from './nextNavigationErrorUtils';
import type { RouteHandlerContext } from './types';
import { platformSupportsStreaming } from './utils/platformSupportsStreaming';
import { flushQueue } from './utils/responseEnd';
import { withIsolationScopeOrReuseFromRootSpan } from './utils/withIsolationScopeOrReuseFromRootSpan';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function addSpanAttributes<F extends (...args: any[]) => any>(
  originalFunction: F,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  thisArg: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[],
  rootSpan?: Span,
): Promise<Response> {
  const response: Response = await handleCallbackErrors(
    () => originalFunction.apply(thisArg, args),
    error => {
      // Next.js throws errors when calling `redirect()`. We don't wanna report these.
      if (isRedirectNavigationError(error)) {
        // Don't do anything
      } else if (isNotFoundNavigationError(error) && rootSpan) {
        rootSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'not_found' });
      } else {
        captureException(error, {
          mechanism: {
            handled: false,
          },
        });
      }
    },
  );

  try {
    if (rootSpan && response.status) {
      setHttpStatus(rootSpan, response.status);
    }
  } catch {
    // best effort - response may be undefined?
  }

  return response;
}

/**
 * Wraps a Next.js route handler with performance and error instrumentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapRouteHandlerWithSentry<F extends (...args: any[]) => any>(
  routeHandler: F,
  context: RouteHandlerContext,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>> {
  addTracingExtensions();

  const { method, parameterizedRoute, headers } = context;

  return new Proxy(routeHandler, {
    apply: (originalFunction, thisArg, args) => {
      return withIsolationScope(async isolationScope => {
        isolationScope.setSDKProcessingMetadata({
          request: {
            headers: headers ? winterCGHeadersToDict(headers) : undefined,
          },
        });

        try {
          const activeSpan = getActiveSpan();
          const rootSpan = activeSpan && getRootSpan(activeSpan);

          if (rootSpan) {
            return await addSpanAttributes<F>(originalFunction, thisArg, args, rootSpan);
          } else {
            /** As our own HTTP integration is disabled (src/server/index.ts) the rootSpan comes from Next.js.
             * In case there is not root span, we start a new one. */
            return await startSpan(
              {
                op: 'http.server',
                name: `${method} ${parameterizedRoute}`,
                forceTransaction: true,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs',
                },
              },
              async span => addSpanAttributes(originalFunction, thisArg, args, span),
            );
          }
        } finally {
          if (!platformSupportsStreaming() || process.env.NEXT_RUNTIME === 'edge') {
            // 1. Edge transport requires manual flushing
            // 2. Lambdas require manual flushing to prevent execution freeze before the event is sent
            await flushQueue();
          }
        }
      });
    },
  });
}
