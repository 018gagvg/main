import type { HandlerDataXhr } from '@sentry/types';

import type { NetworkRequestData, ReplayContainer, ReplayPerformanceEntry } from '../types';
import { addNetworkBreadcrumb } from './addNetworkBreadcrumb';

/** only exported for tests */
export function handleXhr(handlerData: HandlerDataXhr): ReplayPerformanceEntry<NetworkRequestData> | null {
  const { startTimestamp, endTimestamp, xhr } = handlerData;

  if (!startTimestamp || !endTimestamp || !xhr.__sentry_xhr__) {
    return null;
  }

  const {
    method,
    url,
    status_code: statusCode,
    request_body_size: requestBodySize,
    response_body_size: responseBodySize,
  } = xhr.__sentry_xhr__;

  if (url === undefined) {
    return null;
  }

  return {
    type: 'resource.xhr',
    name: url,
    start: startTimestamp / 1000,
    end: endTimestamp / 1000,
    data: {
      method,
      statusCode,
      requestBodySize,
      responseBodySize,
    },
  };
}

/**
 * Returns a listener to be added to `addInstrumentationHandler('xhr', listener)`.
 */
export function handleXhrSpanListener(replay: ReplayContainer): (handlerData: HandlerDataXhr) => void {
  return (handlerData: HandlerDataXhr) => {
    if (!replay.isEnabled()) {
      return;
    }

    const result = handleXhr(handlerData);

    addNetworkBreadcrumb(replay, result);
  };
}
