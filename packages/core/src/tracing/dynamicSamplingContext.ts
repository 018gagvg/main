import type { Client, DynamicSamplingContext, Scope, Span } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

import { DEFAULT_ENVIRONMENT } from '../constants';
import { getClient, getCurrentScope } from '../exports';

/**
 * Creates a dynamic sampling context from a client.
 *
 * Dispatches the `createDsc` lifecycle hook as a side effect.
 */
export function getDynamicSamplingContextFromClient(
  trace_id: string,
  client: Client,
  scope?: Scope,
  emitHook: boolean = true,
): DynamicSamplingContext {
  const options = client.getOptions();

  const { publicKey: public_key } = client.getDsn() || {};
  const { segment: user_segment } = (scope && scope.getUser()) || {};

  const dsc = dropUndefinedKeys({
    environment: options.environment || DEFAULT_ENVIRONMENT,
    release: options.release,
    user_segment,
    public_key,
    trace_id,
  }) as DynamicSamplingContext;

  if (emitHook) {
    client.emit && client.emit('createDsc', dsc);
  }

  return dsc;
}

/**
 * A Span with a frozen dynamic sampling context.
 */
type TransactionWithV7FrozenDsc = Span & { _frozenDynamicSamplingContext?: DynamicSamplingContext };

/**
 * Creates a dynamic sampling context from a span (and client and scope)
 *
 * @param span the span from which a few values like the root span name and sample rate are extracted.
 *
 * @returns a dynamic sampling context
 */
export function getDynamicSamplingContextFromSpan(span: Span): Readonly<Partial<DynamicSamplingContext>> {
  // TODO (v8): Remove v7FrozenDsc as a Transaction will no longer have _frozenDynamicSamplingContext
  // For now we need to avoid breaking users who directly created a txn with a DSC, where this field is still set.
  // @see Transaction class constructor
  const v7FrozenDsc = (span as TransactionWithV7FrozenDsc)._frozenDynamicSamplingContext;
  if (v7FrozenDsc) {
    return v7FrozenDsc;
  }

  const client = getClient();
  if (!client) {
    return {};
  }

  // passing emit=false here to only emit later once the DSC is actually populated
  const dsc = getDynamicSamplingContextFromClient(span.traceId, client, getCurrentScope(), false);
  const txn = span.transaction;
  if (!txn) {
    return dsc;
  }

  const maybeSampleRate = txn.metadata.sampleRate;
  if (maybeSampleRate !== undefined) {
    dsc.sample_rate = `${maybeSampleRate}`;
  }

  // We don't want to have a transaction name in the DSC if the source is "url" because URLs might contain PII
  const source = txn.metadata.source;
  if (source && source !== 'url') {
    dsc.transaction = txn.name;
  }

  // TODO: Switch to `spanIsSampled` once we have it
  // eslint-disable-next-line deprecation/deprecation
  if (txn.sampled !== undefined) {
    // eslint-disable-next-line deprecation/deprecation
    dsc.sampled = String(txn.sampled);
  }

  client.emit && client.emit('createDsc', dsc);

  return dsc;
}
