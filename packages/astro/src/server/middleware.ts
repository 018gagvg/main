import { captureException, configureScope, getCurrentHub, startSpan } from '@sentry/node';
import { addExceptionMechanism, objectify, stripUrlQueryAndFragment, tracingContextFromHeaders } from '@sentry/utils';
import type { APIContext, MiddlewareResponseHandler } from 'astro';

import { getTracingMetaTags } from './meta';

type MiddlewareOptions = {
  /**
   * If true, the client IP will be attached to the event by calling `setUser`.
   * Only set this to `true` if you're fine with collecting potentially personally identifiable information (PII).
   *
   * This will only work if your app is configured for SSR
   *
   * @default false (recommended)
   */
  trackClientIp?: boolean;

  /**
   * If true, the headers from the request will be attached to the event by calling `setExtra`.
   * Only set this to `true` if you're fine with collecting potentially personally identifiable information (PII).
   *
   * @default false (recommended)
   */
  trackHeaders?: boolean;
};

function sendErrorToSentry(e: unknown): unknown {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  captureException(objectifiedErr, scope => {
    scope.addEventProcessor(event => {
      addExceptionMechanism(event, {
        type: 'astro',
        handled: false,
        data: {
          function: 'astroMiddleware',
        },
      });
      return event;
    });

    return scope;
  });

  return objectifiedErr;
}

export const handleRequest: (options?: MiddlewareOptions) => MiddlewareResponseHandler = (
  options = { trackClientIp: false, trackHeaders: false },
) => {
  return async (ctx, next) => {
    const method = ctx.request.method;
    const headers = ctx.request.headers;

    const { dynamicSamplingContext, traceparentData, propagationContext } = tracingContextFromHeaders(
      headers.get('sentry-trace') || undefined,
      headers.get('baggage'),
    );

    const allHeaders: Record<string, string> = {};
    headers.forEach((value, key) => {
      allHeaders[key] = value;
    });

    configureScope(scope => {
      scope.setPropagationContext(propagationContext);

      if (options.trackClientIp) {
        scope.setUser({ ip_address: ctx.clientAddress });
      }
    });

    try {
      // storing res in a variable instead of directly returning is necessary to
      // invoke the catch block if next() throws
      const res = await startSpan(
        {
          name: `${method} ${interpolateRouteFromUrlAndParams(ctx.url.pathname, ctx.params)}`,
          op: `http.server.${method.toLowerCase()}`,
          origin: 'auto.http.astro',
          status: 'ok',
          ...traceparentData,
          metadata: {
            source: 'route',
            dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
          },
          data: {
            method,
            url: stripUrlQueryAndFragment(ctx.url.href),
            ...(ctx.url.search && { 'http.query': ctx.url.search }),
            ...(ctx.url.hash && { 'http.fragment': ctx.url.hash }),
            ...(options.trackHeaders && { headers: allHeaders }),
          },
        },
        async span => {
          const originalResponse = await next();
          if (span && originalResponse.status) {
            span.setHttpStatus(originalResponse.status);
          }

          const hub = getCurrentHub();
          const client = hub.getClient();
          const contentType = originalResponse.headers.get('content-type');

          const isPageloadRequest = contentType && contentType.startsWith('text/html');
          if (!isPageloadRequest || !client) {
            return originalResponse;
          }

          const html = await originalResponse.text();
          if (typeof html !== 'string' || !html.includes('<head>')) {
            return originalResponse;
          }

          const { sentryTrace, baggage } = getTracingMetaTags(span, hub);
          const content = `<head>\n${sentryTrace}\n${baggage}\n`;
          const modifiedHtml = html.replace('<head>', content);

          return new Response(modifiedHtml, originalResponse);
        },
      );
      return res;
    } catch (e) {
      sendErrorToSentry(e);
      throw e;
    }
    // TODO: flush if serveless (first extract function)
  };
};

/**
 * Interpolates the route from the URL and the passed params.
 * Best we can do to get a route name instead of a raw URL.
 *
 * exported for testing
 */
export function interpolateRouteFromUrlAndParams(rawUrl: string, params: APIContext['params']): string {
  return Object.entries(params).reduce((interpolateRoute, value) => {
    const [paramId, paramValue] = value;
    return interpolateRoute.replace(new RegExp(`(/|-)${paramValue}(/|-|$)`), `$1[${paramId}]$2`);
  }, rawUrl);
}
