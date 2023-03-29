import type { Hub } from '@sentry/core';
import type { EventProcessor, Integration } from '@sentry/types';
import {
  dynamicRequire,
  dynamicSamplingContextToSentryBaggageHeader,
  parseSemver,
  stringMatchesSomePattern,
  stripUrlQueryAndFragment,
} from '@sentry/utils';

import type { NodeClient } from '../../client';
import { isSentryRequest } from '../utils/http';
import type { DiagnosticsChannel, RequestCreateMessage, RequestEndMessage, RequestErrorMessage } from './types';

const NODE_VERSION = parseSemver(process.versions.node);

export enum ChannelName {
  // https://github.com/nodejs/undici/blob/e6fc80f809d1217814c044f52ed40ef13f21e43c/docs/api/DiagnosticsChannel.md#undicirequestcreate
  RequestCreate = 'undici:request:create',
  RequestEnd = 'undici:request:headers',
  RequestError = 'undici:request:error',
}

export interface UndiciOptions {
  /**
   * Whether breadcrumbs should be recorded for requests
   * Defaults to true
   */
  breadcrumbs: boolean;
  /**
   * Function determining whether or not to create spans to track outgoing requests to the given URL.
   * By default, spans will be created for all outgoing requests.
   */
  shouldCreateSpanForRequest: (url: string) => boolean;
}

// Please note that you cannot use `console.log` to debug the callbacks registered to the `diagnostics_channel` API.
// To debug, you can use `writeFileSync` to write to a file:
// https://nodejs.org/api/async_hooks.html#printing-in-asynchook-callbacks

/**
 * Instruments outgoing HTTP requests made with the `undici` package via
 * Node's `diagnostics_channel` API.
 *
 * Supports Undici 4.7.0 or higher.
 *
 * Requires Node 16.17.0 or higher.
 */
export class Undici implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Undici';

  /**
   * @inheritDoc
   */
  public name: string = Undici.id;

  private readonly _options: UndiciOptions;

  public constructor(_options: Partial<UndiciOptions> = {}) {
    this._options = {
      breadcrumbs: _options.breadcrumbs === undefined ? true : _options.breadcrumbs,
      shouldCreateSpanForRequest: _options.shouldCreateSpanForRequest || (() => true),
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    // Requires Node 16+ to use the diagnostics_channel API.
    if (NODE_VERSION.major && NODE_VERSION.major < 16) {
      return;
    }

    let ds: DiagnosticsChannel | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ds = dynamicRequire(module, 'diagnostics_channel') as DiagnosticsChannel;
    } catch (e) {
      // no-op
    }

    if (!ds || !ds.subscribe) {
      return;
    }

    // https://github.com/nodejs/undici/blob/e6fc80f809d1217814c044f52ed40ef13f21e43c/docs/api/DiagnosticsChannel.md
    ds.subscribe(ChannelName.RequestCreate, message => {
      const hub = getCurrentHub();
      if (!hub.getIntegration(Undici)) {
        return;
      }

      const { request } = message as RequestCreateMessage;

      const url = new URL(request.path, request.origin);
      const stringUrl = url.toString();

      if (isSentryRequest(stringUrl) || request.__sentry__ !== undefined) {
        return;
      }

      const client = hub.getClient<NodeClient>();
      const scope = hub.getScope();

      const activeSpan = scope.getSpan();

      if (activeSpan && client) {
        const clientOptions = client.getOptions();
        const shouldCreateSpan = this._options.shouldCreateSpanForRequest(stringUrl);

        if (shouldCreateSpan) {
          const data: Record<string, unknown> = {};
          const params = url.searchParams.toString();
          if (params) {
            data['http.query'] = `?${params}`;
          }
          if (url.hash) {
            data['http.fragment'] = url.hash;
          }

          const span = activeSpan.startChild({
            op: 'http.client',
            description: `${request.method || 'GET'} ${stripUrlQueryAndFragment(stringUrl)}`,
            data,
          });
          request.__sentry__ = span;

          const shouldPropagate = clientOptions.tracePropagationTargets
            ? stringMatchesSomePattern(stringUrl, clientOptions.tracePropagationTargets)
            : true;

          if (shouldPropagate) {
            request.addHeader('sentry-trace', span.toTraceparent());
            if (span.transaction) {
              const dynamicSamplingContext = span.transaction.getDynamicSamplingContext();
              const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
              if (sentryBaggageHeader) {
                request.addHeader('baggage', sentryBaggageHeader);
              }
            }
          }
        }
      }
    });

    ds.subscribe(ChannelName.RequestEnd, message => {
      const hub = getCurrentHub();
      if (!hub.getIntegration(Undici)) {
        return;
      }

      const { request, response } = message as RequestEndMessage;

      const url = new URL(request.path, request.origin);
      const stringUrl = url.toString();

      if (isSentryRequest(stringUrl)) {
        return;
      }

      const span = request.__sentry__;
      if (span) {
        span.setHttpStatus(response.statusCode);
        span.finish();
      }

      if (this._options.breadcrumbs) {
        hub.addBreadcrumb(
          {
            category: 'http',
            data: {
              method: request.method,
              status_code: response.statusCode,
              url: stringUrl,
            },
            type: 'http',
          },
          {
            event: 'response',
            request,
            response,
          },
        );
      }
    });

    ds.subscribe(ChannelName.RequestError, message => {
      const hub = getCurrentHub();
      if (!hub.getIntegration(Undici)) {
        return;
      }

      const { request } = message as RequestErrorMessage;

      const url = new URL(request.path, request.origin);
      const stringUrl = url.toString();

      if (isSentryRequest(stringUrl)) {
        return;
      }

      const span = request.__sentry__;
      if (span) {
        span.setStatus('internal_error');
        span.finish();
      }

      if (this._options.breadcrumbs) {
        hub.addBreadcrumb(
          {
            category: 'http',
            data: {
              method: request.method,
              url: stringUrl,
            },
            level: 'error',
            type: 'http',
          },
          {
            event: 'error',
            request,
          },
        );
      }
    });
  }
}
