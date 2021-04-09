import { DebugMeta, Event, SentryRequest, TransactionSamplingMethod } from '@sentry/types';

import { API } from '../../src/api';
import { aggregateSessionsToSentryRequest, eventToSentryRequest } from '../../src/request';

const api = new API('https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012', {
  sdk: {
    integrations: ['AWSLambda'],
    name: 'sentry.javascript.browser',
    version: `12.31.12`,
    packages: [{ name: 'npm:@sentry/browser', version: `12.31.12` }],
  },
});

describe('eventToSentryRequest', () => {
  let event: Event;
  function parseEnvelopeRequest(request: SentryRequest): any {
    const [envelopeHeaderString, itemHeaderString, eventString] = request.body.split('\n');

    return {
      envelopeHeader: JSON.parse(envelopeHeaderString),
      itemHeader: JSON.parse(itemHeaderString),
      event: JSON.parse(eventString),
    };
  }

  beforeEach(() => {
    event = {
      contexts: { trace: { trace_id: '1231201211212012', span_id: '12261980', op: 'pageload' } },
      environment: 'dogpark',
      event_id: '0908201304152013',
      release: 'off.leash.park',
      spans: [],
      transaction: '/dogs/are/great/',
      type: 'transaction',
      user: { id: '1121', username: 'CharlieDog', ip_address: '11.21.20.12' },
    };
  });

  it(`adds transaction sampling information to item header`, () => {
    event.debug_meta = { transactionSampling: { method: TransactionSamplingMethod.Rate, rate: 0.1121 } };

    const result = eventToSentryRequest(event, api);
    const envelope = parseEnvelopeRequest(result);

    expect(envelope.itemHeader).toEqual(
      expect.objectContaining({
        sample_rates: [{ id: TransactionSamplingMethod.Rate, rate: 0.1121 }],
      }),
    );
  });

  it('removes transaction sampling information (and only that) from debug_meta', () => {
    event.debug_meta = {
      transactionSampling: { method: TransactionSamplingMethod.Sampler, rate: 0.1121 },
      dog: 'Charlie',
    } as DebugMeta;

    const result = eventToSentryRequest(event, api);
    const envelope = parseEnvelopeRequest(result);

    expect('transactionSampling' in envelope.event.debug_meta).toBe(false);
    expect('dog' in envelope.event.debug_meta).toBe(true);
  });

  it('removes debug_meta entirely if it ends up empty', () => {
    event.debug_meta = {
      transactionSampling: { method: TransactionSamplingMethod.Rate, rate: 0.1121 },
    } as DebugMeta;

    const result = eventToSentryRequest(event, api);
    const envelope = parseEnvelopeRequest(result);

    expect('debug_meta' in envelope.event).toBe(false);
  });

  it('adds sdk info to envelope header', () => {
    const result = eventToSentryRequest(event, api);
    const envelope = parseEnvelopeRequest(result);

    expect(envelope.envelopeHeader).toEqual(
      expect.objectContaining({ sdk: { name: 'sentry.javascript.browser', version: '12.31.12' } }),
    );
  });

  it('adds sdk info to event body', () => {
    const result = eventToSentryRequest(event, api);
    const envelope = parseEnvelopeRequest(result);

    expect(envelope.event).toEqual(
      expect.objectContaining({
        sdk: {
          integrations: ['AWSLambda'],
          name: 'sentry.javascript.browser',
          version: `12.31.12`,
          packages: [{ name: 'npm:@sentry/browser', version: `12.31.12` }],
        },
      }),
    );
  });

  it('merges existing sdk info if one is present on the event body', () => {
    event.sdk = {
      integrations: ['Clojure'],
      name: 'foo',
      packages: [{ name: 'npm:@sentry/clj', version: `12.31.12` }],
      version: '1337',
    };

    const result = eventToSentryRequest(event, api);
    const envelope = parseEnvelopeRequest(result);

    expect(envelope.event).toEqual(
      expect.objectContaining({
        sdk: {
          integrations: ['Clojure', 'AWSLambda'],
          name: 'foo',
          packages: [
            { name: 'npm:@sentry/clj', version: `12.31.12` },
            { name: 'npm:@sentry/browser', version: `12.31.12` },
          ],
          version: '1337',
        },
      }),
    );
  });
});

describe('aggregateSessionsToSentryRequest', () => {
  it('test envelope creation for aggregateSessions', () => {
    const aggregatedSession = {
      attrs: { release: '1.0.x', environment: 'prod' },
      aggregates: [{ started: '2021-04-08T12:18:00.000Z', exited: 2 }],
    };
    const result = aggregateSessionsToSentryRequest(aggregatedSession, api);

    const [envelopeHeaderString, itemHeaderString, sessionString] = result.body.split('\n');

    expect(JSON.parse(envelopeHeaderString)).toEqual(
      expect.objectContaining({
        sdk: { name: 'sentry.javascript.browser', version: '12.31.12' },
      }),
    );
    expect(JSON.parse(itemHeaderString)).toEqual(
      expect.objectContaining({
        type: 'sessions',
      }),
    );
    expect(JSON.parse(sessionString)).toEqual(
      expect.objectContaining({
        attrs: { release: '1.0.x', environment: 'prod' },
        aggregates: [{ started: '2021-04-08T12:18:00.000Z', exited: 2 }],
      }),
    );
  });
});
