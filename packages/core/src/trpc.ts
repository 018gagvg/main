import { isThenable, normalize } from '@sentry/utils';

import { getClient } from './currentScopes';
import { captureException, setContext } from './exports';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from './semanticAttributes';
import { startSpanManual } from './tracing';

interface SentryTrpcMiddlewareOptions {
  /** Whether to include procedure inputs in reported events. Defaults to `false`. */
  attachRpcInput?: boolean;
}

export interface SentryTrpcMiddlewareArguments<T> {
  path?: unknown;
  type?: unknown;
  next: () => T;
  rawInput?: unknown;
  getRawInput?: () => Promise<unknown>;
}

const trpcCaptureContext = { mechanism: { handled: false, data: { function: 'trpcMiddleware' } } };

/**
 * Sentry tRPC middleware that captures errors and creates spans for tRPC procedures.
 */
export function trpcMiddleware(options: SentryTrpcMiddlewareOptions = {}) {
  return function <T>(opts: SentryTrpcMiddlewareArguments<T>): T {
    const { path, type, next, rawInput, getRawInput } = opts;

    const client = getClient();
    const clientOptions = client && client.getOptions();

    const trpcContext: Record<string, unknown> = {
      procedure_type: type,
    };

    if (options.attachRpcInput !== undefined ? options.attachRpcInput : clientOptions && clientOptions.sendDefaultPii) {
      if (rawInput !== undefined) {
        trpcContext.input = normalize(rawInput);
        setContext('trpc', trpcContext);
      }

      if (getRawInput !== undefined && typeof getRawInput === 'function') {
        getRawInput().then(
          rawRes => {
            trpcContext.input = normalize(rawRes);
            setContext('trpc', trpcContext);
          },
          _e => {
            // noop
          },
        );
      }
    }

    function captureIfError(nextResult: unknown): void {
      // TODO: Set span status based on what TRPCError was encountered
      if (
        typeof nextResult === 'object' &&
        nextResult !== null &&
        'ok' in nextResult &&
        !nextResult.ok &&
        'error' in nextResult
      ) {
        captureException(nextResult.error, trpcCaptureContext);
      }
    }

    return startSpanManual(
      {
        name: `trpc/${path}`,
        op: 'rpc.server',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.rpc.trpc',
        },
      },
      span => {
        let maybePromiseResult;
        try {
          maybePromiseResult = next();
        } catch (e) {
          captureException(e, trpcCaptureContext);
          span.end();
          throw e;
        }

        if (isThenable(maybePromiseResult)) {
          return maybePromiseResult.then(
            nextResult => {
              captureIfError(nextResult);
              span.end();
              return nextResult;
            },
            e => {
              captureException(e, trpcCaptureContext);
              span.end();
              throw e;
            },
          ) as T;
        } else {
          captureIfError(maybePromiseResult);
          span.end();
          return maybePromiseResult;
        }
      },
    );
  };
}
