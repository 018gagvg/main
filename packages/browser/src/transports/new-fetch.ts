import { BaseTransportOptions, createTransport, NewTransport } from '@sentry/core';
import { TransportMakeRequestResponse, TransportRequest } from '@sentry/core/dist/transports/base';

import { getNativeFetchImplementation } from './utils';

export interface FetchTransportOptions extends BaseTransportOptions {
  requestOptions?: RequestInit;
}

/**
 * Creates a Transport that uses the Fetch API to send events to Sentry.
 */
export function makeNewFetchTransport(options: FetchTransportOptions): NewTransport {
  const nativeFetch = getNativeFetchImplementation();

  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    const requestOptions: RequestInit = {
      body: request.body,
      method: 'POST',
      referrerPolicy: 'origin',
      ...options.requestOptions,
    };

    return nativeFetch(options.url, requestOptions).then(response => {
      return response.text().then(body => ({
        body,
        headers: {
          'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
          'retry-after': response.headers.get('Retry-After'),
        },
        reason: response.statusText,
        statusCode: response.status,
      }));
    });
  }

  return createTransport({ bufferSize: options.bufferSize }, makeRequest);
}
