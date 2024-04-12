/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HandlerDataFetch } from '@sentry/types';

import { DEBUG_BUILD } from '../debug-build';
import { logger } from '../logger';
import { fill } from '../object';
import { supportsNativeFetch } from '../supports';
import { GLOBAL_OBJ } from '../worldwide';
import { addHandler, maybeInstrument, triggerHandlers } from './handlers';

type FetchResource = string | { toString(): string } | { url: string };

/**
 * Add an instrumentation handler for when a fetch request happens.
 * The handler function is called once when the request starts and once when it ends,
 * which can be identified by checking if it has an `endTimestamp`.
 *
 * Use at your own risk, this might break without changelog notice, only used internally.
 * @hidden
 */
export function addFetchInstrumentationHandler(handler: (data: HandlerDataFetch) => void): void {
  const type = 'fetch';
  addHandler(type, handler);
  maybeInstrument(type, instrumentFetch);
}

function instrumentFetch(): void {
  if (!supportsNativeFetch()) {
    return;
  }

  fill(GLOBAL_OBJ, 'fetch', function (originalFetch: () => void): () => void {
    return function (...args: any[]): void {
      const { method, url } = parseFetchArgs(args);

      const handlerData: HandlerDataFetch = {
        args,
        fetchData: {
          method,
          url,
        },
        startTimestamp: Date.now(),
      };

      triggerHandlers('fetch', {
        ...handlerData,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return originalFetch.apply(GLOBAL_OBJ, args).then(
        (response: Response) => {
          // We need to immediately clone the response, so that if the user reads the body before we call the handlers,
          // we cannot clone the response inside the handlers since it would throw. The Replay integration for instance
          // needs to clone the response body inside a handler to collect response size and breadcrumbs.
          // If the cloning fails for whatever reason, we still pass the original response because it could be used for
          // status.
          let responseForHandlers = response;
          let clonedResponseForResolving;
          try {
            responseForHandlers = response.clone();
            clonedResponseForResolving = response.clone();
          } catch (e) {
            // noop
            DEBUG_BUILD && logger.warn('Failed to clone response body.');
          }

          if (clonedResponseForResolving && clonedResponseForResolving.body) {
            const responseReader = clonedResponseForResolving.body.getReader();

            // eslint-disable-next-line no-inner-declarations
            function consumeChunks({ done }: { done: boolean }): Promise<void> {
              if (!done) {
                return responseReader.read().then(consumeChunks);
              } else {
                return Promise.resolve();
              }
            }

            responseReader
              .read()
              .then(consumeChunks)
              .then(() => {
                triggerHandlers('fetch', {
                  ...handlerData,
                  endTimestamp: Date.now(),
                  response: responseForHandlers,
                });
              })
              .catch(() => {
                // noop
              });
          } else {
            triggerHandlers('fetch', {
              ...handlerData,
              endTimestamp: Date.now(),
              response: responseForHandlers,
            });
          }

          return response;
        },
        (error: Error) => {
          const erroredHandlerData: HandlerDataFetch = {
            ...handlerData,
            endTimestamp: Date.now(),
            error,
          };

          triggerHandlers('fetch', erroredHandlerData);
          // NOTE: If you are a Sentry user, and you are seeing this stack frame,
          //       it means the sentry.javascript SDK caught an error invoking your application code.
          //       This is expected behavior and NOT indicative of a bug with sentry.javascript.
          throw error;
        },
      );
    };
  });
}

function hasProp<T extends string>(obj: unknown, prop: T): obj is Record<string, string> {
  return !!obj && typeof obj === 'object' && !!(obj as Record<string, string>)[prop];
}

function getUrlFromResource(resource: FetchResource): string {
  if (typeof resource === 'string') {
    return resource;
  }

  if (!resource) {
    return '';
  }

  if (hasProp(resource, 'url')) {
    return resource.url;
  }

  if (resource.toString) {
    return resource.toString();
  }

  return '';
}

/**
 * Parses the fetch arguments to find the used Http method and the url of the request.
 * Exported for tests only.
 */
export function parseFetchArgs(fetchArgs: unknown[]): { method: string; url: string } {
  if (fetchArgs.length === 0) {
    return { method: 'GET', url: '' };
  }

  if (fetchArgs.length === 2) {
    const [url, options] = fetchArgs as [FetchResource, object];

    return {
      url: getUrlFromResource(url),
      method: hasProp(options, 'method') ? String(options.method).toUpperCase() : 'GET',
    };
  }

  const arg = fetchArgs[0];
  return {
    url: getUrlFromResource(arg as FetchResource),
    method: hasProp(arg, 'method') ? String(arg.method).toUpperCase() : 'GET',
  };
}
