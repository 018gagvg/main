/* eslint-disable max-lines */
import {
  SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  TRACING_DEFAULTS,
  addTracingExtensions,
  continueTrace,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getIsolationScope,
  getRootSpan,
  spanToJSON,
  startIdleSpan,
  withScope,
} from '@sentry/core';
import type { Client, Integration, IntegrationFn, StartSpanOptions, TransactionSource } from '@sentry/types';
import type { Span } from '@sentry/types';
import { browserPerformanceTimeOrigin, getDomElement, logger, uuid4 } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { addHistoryInstrumentationHandler } from '../instrument/history';
import { registerBackgroundTabDetection } from './backgroundtab';
import { addPerformanceInstrumentationHandler } from './instrument';
import {
  addPerformanceEntries,
  startTrackingINP,
  startTrackingInteractions,
  startTrackingLongTasks,
  startTrackingWebVitals,
} from './metrics';
import { defaultRequestInstrumentationOptions, instrumentOutgoingRequests } from './request';
import type { InteractionRouteNameMapping} from './types';
import { WINDOW } from './types';

export const BROWSER_TRACING_INTEGRATION_ID = 'BrowserTracing';

/** Options for Browser Tracing integration */
export interface BrowserTracingOptions {
  /**
   * The time that has to pass without any span being created.
   * If this time is exceeded, the idle span will finish.
   *
   * Default: 1000 (ms)
   */
  idleTimeout: number;

  /**
   * The max. time an idle span may run.
   * If this time is exceeded, the idle span will finish no matter what.
   *
   * Default: 30000 (ms)
   */
  finalTimeout: number;

  /**
   The max. time an idle span may run.
   * If this time is exceeded, the idle span will finish no matter what.
   *
   * Default: 15000 (ms)
   */
  childSpanTimeout: number;

  /**
   * If a span should be created on page load.
   * If this is set to `false`, this integration will not start the default page load span.
   * Default: true
   */
  instrumentPageLoad: boolean;

  /**
   * If a span should be created on navigation (history change).
   * If this is set to `false`, this integration will not start the default navigation spans.
   * Default: true
   */
  instrumentNavigation: boolean;

  /**
   * Flag spans where tabs moved to background with "cancelled". Browser background tab timing is
   * not suited towards doing precise measurements of operations. By default, we recommend that this option
   * be enabled as background transactions can mess up your statistics in nondeterministic ways.
   *
   * Default: true
   */
  markBackgroundSpan: boolean;

  /**
   * If true, Sentry will capture long tasks and add them to the corresponding transaction.
   *
   * Default: true
   */
  enableLongTask: boolean;

  /**
   * If true, Sentry will capture first input delay and add it to the corresponding transaction.
   *
   * Default: true
   */
  enableInp: boolean;

  /**
   * Flag to disable patching all together for fetch requests.
   *
   * Default: true
   */
  traceFetch: boolean;

  /**
   * Flag to disable patching all together for xhr requests.
   *
   * Default: true
   */
  traceXHR: boolean;

  /**
   * If true, Sentry will capture http timings and add them to the corresponding http spans.
   *
   * Default: true
   */
  enableHTTPTimings: boolean;

  /**
   * _experiments allows the user to send options to define how this integration works.
   *
   * Default: undefined
   */
  _experiments: Partial<{
    enableInteractions: boolean;
  }>;

  /**
   * A callback which is called before a span for a pageload or navigation is started.
   * It receives the options passed to `startSpan`, and expects to return an updated options object.
   */
  beforeStartSpan?: (options: StartSpanOptions) => StartSpanOptions;

  /**
   * This function will be called before creating a span for a request with the given url.
   * Return false if you don't want a span for the given url.
   *
   * Default: (url: string) => true
   */
  shouldCreateSpanForRequest?(this: void, url: string): boolean;
}

const DEFAULT_BROWSER_TRACING_OPTIONS: BrowserTracingOptions = {
  ...TRACING_DEFAULTS,
  instrumentNavigation: true,
  instrumentPageLoad: true,
  markBackgroundSpan: true,
  enableLongTask: true,
  enableInp: true,
  _experiments: {},
  ...defaultRequestInstrumentationOptions,
};

/**
 * The Browser Tracing integration automatically instruments browser pageload/navigation
 * actions as transactions, and captures requests, metrics and errors as spans.
 *
 * The integration can be configured with a variety of options, and can be extended to use
 * any routing library.
 *
 * We explicitly export the proper type here, as this has to be extended in some cases.
 */
export const browserTracingIntegration = ((_options: Partial<BrowserTracingOptions> = {}) => {
  addTracingExtensions();

  const options = {
    ...DEFAULT_BROWSER_TRACING_OPTIONS,
    ..._options,
  };

  const _collectWebVitals = startTrackingWebVitals();

  const inpMap: InteractionRouteNameMapping = {};

  if (options.enableInp) {
    startTrackingINP(inpMap);
  }

  if (options.enableLongTask) {
    startTrackingLongTasks();
  }
  if (options._experiments.enableInteractions) {
    startTrackingInteractions();
  }

  let latestRouteName: string | undefined;
  let latestRouteSource: TransactionSource | undefined;

  /** Create routing idle transaction. */
  function _createRouteSpan(client: Client, startSpanOptions: StartSpanOptions): Span {
    const { beforeStartSpan, idleTimeout, finalTimeout, childSpanTimeout } = options;

    const isPageloadTransaction = startSpanOptions.op === 'pageload';

    const finalStartSpanOptions: StartSpanOptions = beforeStartSpan
      ? beforeStartSpan(startSpanOptions)
      : startSpanOptions;

    // If `beforeStartSpan` set a custom name, record that fact
    const attributes = finalStartSpanOptions.attributes || {};

    if (finalStartSpanOptions.name !== finalStartSpanOptions.name) {
      attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] = 'custom';
      finalStartSpanOptions.attributes = attributes;
    }

    latestRouteName = finalStartSpanOptions.name;
    latestRouteSource = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];

    const idleSpan = startIdleSpan(finalStartSpanOptions, {
      idleTimeout,
      finalTimeout,
      childSpanTimeout,
      // should wait for finish signal if it's a pageload transaction
      disableAutoFinish: isPageloadTransaction,
      beforeSpanEnd: span => {
        _collectWebVitals();
        addPerformanceEntries(span);
      },
    });

    if (isPageloadTransaction && WINDOW.document) {
      WINDOW.document.addEventListener('readystatechange', () => {
        if (['interactive', 'complete'].includes(WINDOW.document.readyState)) {
          client.emit('idleSpanEnableAutoFinish', idleSpan);
        }
      });

      if (['interactive', 'complete'].includes(WINDOW.document.readyState)) {
        client.emit('idleSpanEnableAutoFinish', idleSpan);
      }
    }

    return idleSpan;
  }

  return {
    name: BROWSER_TRACING_INTEGRATION_ID,
    afterAllSetup(client) {
      const { markBackgroundSpan, traceFetch, traceXHR, shouldCreateSpanForRequest, enableHTTPTimings, _experiments } =
        options;

      let activeSpan: Span | undefined;
      let startingUrl: string | undefined = WINDOW.location && WINDOW.location.href;

      client.on('startNavigationSpan', startSpanOptions => {
        if (getClient() !== client) {
          return;
        }

        if (activeSpan) {
          DEBUG_BUILD && logger.log(`[Tracing] Finishing current root span with op: ${spanToJSON(activeSpan).op}`);
          // If there's an open transaction on the scope, we need to finish it before creating an new one.
          activeSpan.end();
        }
        activeSpan = _createRouteSpan(client, {
          op: 'navigation',
          ...startSpanOptions,
        });
      });

      client.on('startPageLoadSpan', (startSpanOptions, traceOptions) => {
        if (getClient() !== client) {
          return;
        }

        if (activeSpan) {
          DEBUG_BUILD && logger.log(`[Tracing] Finishing current root span with op: ${spanToJSON(activeSpan).op}`);
          // If there's an open transaction on the scope, we need to finish it before creating an new one.
          activeSpan.end();
        }

        const sentryTrace = traceOptions?.sentryTrace || getMetaContent('sentry-trace');
        const baggage = traceOptions?.baggage || getMetaContent('baggage');

        // Continue trace updates the scope in the callback only, but we want to break out of it again...
        // This is a bit hacky, because we want to get the span to use both the correct scope _and_ the correct propagation context
        // but afterwards, we want to reset it to avoid this also applying to other spans
        const scope = getCurrentScope();
        const propagationContextBefore = scope.getPropagationContext();

        activeSpan = continueTrace({ sentryTrace, baggage }, () => {
          // We update the outer current scope to have the correct propagation context...
          scope.setPropagationContext(getCurrentScope().getPropagationContext());

          // Ensure we are on the original current scope again, so the span is set as active on it
          return withScope(scope, () => {
            return _createRouteSpan(client, {
              op: 'pageload',
              ...startSpanOptions,
            });
          });
        });

        // Reset this back to what it was before
        scope.setPropagationContext(propagationContextBefore);
      });

      if (options.instrumentPageLoad && WINDOW.location) {
        const startSpanOptions: StartSpanOptions = {
          name: WINDOW.location.pathname,
          // pageload should always start at timeOrigin (and needs to be in s, not ms)
          startTime: browserPerformanceTimeOrigin ? browserPerformanceTimeOrigin / 1000 : undefined,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
          },
        };
        startBrowserTracingPageLoadSpan(client, startSpanOptions);
      }

      if (options.instrumentNavigation && WINDOW.location) {
        addHistoryInstrumentationHandler(({ to, from }) => {
          /**
           * This early return is there to account for some cases where a navigation transaction starts right after
           * long-running pageload. We make sure that if `from` is undefined and a valid `startingURL` exists, we don't
           * create an uneccessary navigation transaction.
           *
           * This was hard to duplicate, but this behavior stopped as soon as this fix was applied. This issue might also
           * only be caused in certain development environments where the usage of a hot module reloader is causing
           * errors.
           */
          if (from === undefined && startingUrl && startingUrl.indexOf(to) !== -1) {
            startingUrl = undefined;
            return;
          }

          if (from !== to) {
            startingUrl = undefined;
            const startSpanOptions: StartSpanOptions = {
              name: WINDOW.location.pathname,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser',
              },
            };

            startBrowserTracingNavigationSpan(client, startSpanOptions);
          }
        });
      }

      if (markBackgroundSpan) {
        registerBackgroundTabDetection();
      }

      if (_experiments.enableInteractions) {
        registerInteractionListener(options, latestRouteName, latestRouteSource);
      }

      if (options.enableInp) {
        registerInpInteractionListener(inpMap, { name: latestRouteName, source: latestRouteSource });
      }

      instrumentOutgoingRequests({
        traceFetch,
        traceXHR,
        tracePropagationTargets: client.getOptions().tracePropagationTargets,
        shouldCreateSpanForRequest,
        enableHTTPTimings,
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Manually start a page load span.
 * This will only do something if a browser tracing integration integration has been setup.
 *
 * If you provide a custom `traceOptions` object, it will be used to continue the trace
 * instead of the default behavior, which is to look it up on the <meta> tags.
 */
export function startBrowserTracingPageLoadSpan(
  client: Client,
  spanOptions: StartSpanOptions,
  traceOptions?: { sentryTrace?: string | undefined; baggage?: string | undefined },
): Span | undefined {
  client.emit('startPageLoadSpan', spanOptions, traceOptions);

  getCurrentScope().setTransactionName(spanOptions.name);

  const span = getActiveSpan();
  const op = span && spanToJSON(span).op;
  return op === 'pageload' ? span : undefined;
}

/**
 * Manually start a navigation span.
 * This will only do something if a browser tracing integration has been setup.
 */
export function startBrowserTracingNavigationSpan(client: Client, spanOptions: StartSpanOptions): Span | undefined {
  getCurrentScope().setPropagationContext({
    traceId: uuid4(),
    spanId: uuid4().substring(16),
  });
  getIsolationScope().setPropagationContext({
    traceId: uuid4(),
    spanId: uuid4().substring(16),
  });

  client.emit('startNavigationSpan', spanOptions);

  getCurrentScope().setTransactionName(spanOptions.name);

  const span = getActiveSpan();
  const op = span && spanToJSON(span).op;
  return op === 'navigation' ? span : undefined;
}

/** Returns the value of a meta tag */
export function getMetaContent(metaName: string): string | undefined {
  // Can't specify generic to `getDomElement` because tracing can be used
  // in a variety of environments, have to disable `no-unsafe-member-access`
  // as a result.
  const metaTag = getDomElement(`meta[name=${metaName}]`);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return metaTag ? metaTag.getAttribute('content') : undefined;
}

/** Start listener for interaction transactions */
function registerInteractionListener(
  options: BrowserTracingOptions,
  latestRouteName: string | undefined,
  latestRouteSource: TransactionSource | undefined,
): void {
  let inflightInteractionSpan: Span | undefined;
  const registerInteractionTransaction = (): void => {
    const { idleTimeout, finalTimeout, childSpanTimeout } = options;
    const op = 'ui.action.click';

    const activeSpan = getActiveSpan();
    const rootSpan = activeSpan && getRootSpan(activeSpan);
    if (rootSpan) {
      const currentRootSpanOp = spanToJSON(rootSpan).op;
      if (['navigation', 'pageload'].includes(currentRootSpanOp as string)) {
        DEBUG_BUILD &&
          logger.warn(`[Tracing] Did not create ${op} span because a pageload or navigation span is in progress.`);
        return undefined;
      }
    }

    if (inflightInteractionSpan) {
      inflightInteractionSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON, 'interactionInterrupted');
      inflightInteractionSpan.end();
      inflightInteractionSpan = undefined;
    }

    if (!latestRouteName) {
      DEBUG_BUILD && logger.warn(`[Tracing] Did not create ${op} transaction because _latestRouteName is missing.`);
      return undefined;
    }

    inflightInteractionSpan = startIdleSpan(
      {
        name: latestRouteName,
        op,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: latestRouteSource || 'url',
        },
      },
      {
        idleTimeout,
        finalTimeout,
        childSpanTimeout,
      },
    );
  };

  ['click'].forEach(type => {
    addEventListener(type, registerInteractionTransaction, { once: false, capture: true });
  });
}

function isPerformanceEventTiming(entry: PerformanceEntry): entry is PerformanceEventTiming {
  return 'duration' in entry;
}

/** We store up to 10 interaction candidates max to cap memory usage. This is the same cap as getINP from web-vitals */
const MAX_INTERACTIONS = 10;

/** Creates a listener on interaction entries, and maps interactionIds to the origin path of the interaction */
function registerInpInteractionListener(
  interactionIdtoRouteNameMapping: InteractionRouteNameMapping,
  latestRoute: {
    name: string | undefined;
    source: TransactionSource | undefined;
  },
): void {
  addPerformanceInstrumentationHandler('event', ({ entries }) => {
    const client = getClient();
    // We need to get the replay, user, and activeTransaction from the current scope
    // so that we can associate replay id, profile id, and a user display to the span
    const replay = client && client.getIntegrationByName<Integration & { getReplayId: () => string }>('Replay');

    const replayId = replay && replay.getReplayId();

    const activeSpan = getActiveSpan();
    const currentScope = getCurrentScope();
    const user = currentScope !== undefined ? currentScope.getUser() : undefined;

    for (const entry of entries) {
      if (isPerformanceEventTiming(entry)) {
        const duration = entry.duration;
        const keys = Object.keys(interactionIdtoRouteNameMapping);
        const minInteractionId =
          keys.length > 0
            ? keys.reduce((a, b) => {
                return interactionIdtoRouteNameMapping[a].duration < interactionIdtoRouteNameMapping[b].duration
                  ? a
                  : b;
              })
            : undefined;
        if (minInteractionId === undefined || duration > interactionIdtoRouteNameMapping[minInteractionId].duration) {
          const interactionId = entry.interactionId;
          const routeName = latestRoute.name;
          if (interactionId && routeName) {
            if (minInteractionId && Object.keys(interactionIdtoRouteNameMapping).length >= MAX_INTERACTIONS) {
              // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
              delete interactionIdtoRouteNameMapping[minInteractionId];
            }
            interactionIdtoRouteNameMapping[interactionId] = {
              routeName,
              duration,
              activeSpan,
              currentScope,
              user,
              replayId,
            };
          }
        }
      }
    }
  });
}
