import type { Baggage, Context, SpanContext, TextMapGetter, TextMapSetter } from '@opentelemetry/api';
import { context } from '@opentelemetry/api';
import { TraceFlags, propagation, trace } from '@opentelemetry/api';
import { TraceState, W3CBaggagePropagator, isTracingSuppressed } from '@opentelemetry/core';
import type { continueTrace } from '@sentry/core';
import { getClient, getCurrentScope, getDynamicSamplingContextFromClient, getIsolationScope } from '@sentry/core';
import type { DynamicSamplingContext, PropagationContext } from '@sentry/types';
import {
  SENTRY_BAGGAGE_KEY_PREFIX,
  baggageHeaderToDynamicSamplingContext,
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  propagationContextFromHeaders,
} from '@sentry/utils';

import {
  SENTRY_BAGGAGE_HEADER,
  SENTRY_TRACE_HEADER,
  SENTRY_TRACE_STATE_DSC,
  SENTRY_TRACE_STATE_PARENT_SPAN_ID,
  SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING,
} from './constants';
import { getScopesFromContext, setScopesOnContext } from './utils/contextData';
import { setIsSetup } from './utils/setupCheck';

/** Get the Sentry propagation context from a span context. */
export function getPropagationContextFromSpanContext(spanContext: SpanContext): PropagationContext {
  const { traceId, spanId, traceState } = spanContext;

  const dscString = traceState ? traceState.get(SENTRY_TRACE_STATE_DSC) : undefined;
  const dsc = dscString ? baggageHeaderToDynamicSamplingContext(dscString) : undefined;
  const parentSpanId = traceState ? traceState.get(SENTRY_TRACE_STATE_PARENT_SPAN_ID) : undefined;

  const sampled = getSamplingDecision(spanContext);

  return {
    traceId,
    spanId,
    sampled,
    parentSpanId,
    dsc,
  };
}

/**
 * Injects and extracts `sentry-trace` and `baggage` headers from carriers.
 */
export class SentryPropagator extends W3CBaggagePropagator {
  public constructor() {
    super();
    setIsSetup('SentryPropagator');
  }

  /**
   * @inheritDoc
   */
  public inject(context: Context, carrier: unknown, setter: TextMapSetter): void {
    if (isTracingSuppressed(context)) {
      return;
    }

    let baggage = propagation.getBaggage(context) || propagation.createBaggage({});

    const { dynamicSamplingContext, traceId, spanId, sampled } = getInjectionData(context);

    if (dynamicSamplingContext) {
      baggage = Object.entries(dynamicSamplingContext).reduce<Baggage>((b, [dscKey, dscValue]) => {
        if (dscValue) {
          return b.setEntry(`${SENTRY_BAGGAGE_KEY_PREFIX}${dscKey}`, { value: dscValue });
        }
        return b;
      }, baggage);
    }

    setter.set(carrier, SENTRY_TRACE_HEADER, generateSentryTraceHeader(traceId, spanId, sampled));

    super.inject(propagation.setBaggage(context, baggage), carrier, setter);
  }

  /**
   * @inheritDoc
   */
  public extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    const maybeSentryTraceHeader: string | string[] | undefined = getter.get(carrier, SENTRY_TRACE_HEADER);
    const baggage = getter.get(carrier, SENTRY_BAGGAGE_HEADER);

    const sentryTrace = maybeSentryTraceHeader
      ? Array.isArray(maybeSentryTraceHeader)
        ? maybeSentryTraceHeader[0]
        : maybeSentryTraceHeader
      : undefined;

    const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);

    // Add remote parent span context,
    const ctxWithSpanContext = getContextWithRemoteActiveSpan(context, { sentryTrace, baggage });

    // Also update the scope on the context (to be sure this is picked up everywhere)
    const scopes = getScopesFromContext(ctxWithSpanContext);
    const newScopes = {
      scope: scopes ? scopes.scope.clone() : getCurrentScope().clone(),
      isolationScope: scopes ? scopes.isolationScope : getIsolationScope(),
    };
    newScopes.scope.setPropagationContext(propagationContext);

    return setScopesOnContext(ctxWithSpanContext, newScopes);
  }

  /**
   * @inheritDoc
   */
  public fields(): string[] {
    return [SENTRY_TRACE_HEADER, SENTRY_BAGGAGE_HEADER];
  }
}

/** Exported for tests. */
export function makeTraceState({
  parentSpanId,
  dsc,
  sampled,
}: {
  parentSpanId?: string;
  dsc?: Partial<DynamicSamplingContext>;
  sampled?: boolean;
}): TraceState | undefined {
  if (!parentSpanId && !dsc && sampled !== false) {
    return undefined;
  }

  // We store the DSC as OTEL trace state on the span context
  const dscString = dsc ? dynamicSamplingContextToSentryBaggageHeader(dsc) : undefined;

  const traceStateBase = parentSpanId
    ? new TraceState().set(SENTRY_TRACE_STATE_PARENT_SPAN_ID, parentSpanId)
    : new TraceState();

  const traceStateWithDsc = dscString ? traceStateBase.set(SENTRY_TRACE_STATE_DSC, dscString) : traceStateBase;

  // We also specifically want to store if this is sampled to be not recording,
  // or unsampled (=could be either sampled or not)
  return sampled === false ? traceStateWithDsc.set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1') : traceStateWithDsc;
}

function getInjectionData(context: Context): {
  dynamicSamplingContext: Partial<DynamicSamplingContext> | undefined;
  traceId: string | undefined;
  spanId: string | undefined;
  sampled: boolean | undefined;
} {
  const span = trace.getSpan(context);
  const spanIsRemote = span?.spanContext().isRemote;

  // If we have a local span, we can just pick everything from it
  if (span && !spanIsRemote) {
    const spanContext = span.spanContext();
    const propagationContext = getPropagationContextFromSpanContext(spanContext);
    const dynamicSamplingContext = getDynamicSamplingContext(propagationContext, spanContext.traceId);
    return {
      dynamicSamplingContext,
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      sampled: getSamplingDecision(spanContext),
    };
  }

  // Else we try to use the propagation context from the scope
  const scope = getScopesFromContext(context)?.scope;
  if (scope) {
    const propagationContext = scope.getPropagationContext();
    if (propagationContext) {
      const dynamicSamplingContext = getDynamicSamplingContext(propagationContext, propagationContext.traceId);
      return {
        dynamicSamplingContext,
        traceId: propagationContext.traceId,
        spanId: propagationContext.spanId,
        sampled: propagationContext.sampled,
      };
    }
    // TODO: is it okay to just fall through here or should we return undefined properties?
  }

  // Else, we look at the remote span context
  const spanContext = trace.getSpanContext(context);
  if (spanContext) {
    const propagationContext = getPropagationContextFromSpanContext(spanContext);
    const dynamicSamplingContext = getDynamicSamplingContext(propagationContext, spanContext.traceId);

    return {
      dynamicSamplingContext,
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      sampled: getSamplingDecision(spanContext),
    };
  }

  // If we have neither, there is nothing much we can do, but that should not happen usually
  // Unless there is a detached OTEL context being passed around
  return {
    dynamicSamplingContext: undefined,
    traceId: undefined,
    spanId: undefined,
    sampled: undefined,
  };
}

/** Get the DSC from a context, or fall back to use the one from the client. */
function getDynamicSamplingContext(
  propagationContext: PropagationContext,
  traceId: string | undefined,
): Partial<DynamicSamplingContext> | undefined {
  // If we have a DSC on the propagation context, we just use it
  if (propagationContext?.dsc) {
    return propagationContext.dsc;
  }

  // Else, we try to generate a new one
  const client = getClient();

  if (client) {
    return getDynamicSamplingContextFromClient(traceId || propagationContext.traceId, client);
  }

  return undefined;
}

function getContextWithRemoteActiveSpan(
  ctx: Context,
  { sentryTrace, baggage }: Parameters<typeof continueTrace>[0],
): Context {
  const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);

  // We store the DSC as OTEL trace state on the span context
  const traceState = makeTraceState({
    parentSpanId: propagationContext.parentSpanId,
    dsc: propagationContext.dsc,
    sampled: propagationContext.sampled,
  });

  const spanContext: SpanContext = {
    traceId: propagationContext.traceId,
    spanId: propagationContext.parentSpanId || '',
    isRemote: true,
    traceFlags: propagationContext.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
    traceState,
  };

  return trace.setSpanContext(ctx, spanContext);
}

/**
 * Takes trace strings and propagates them as a remote active span.
 * This should be used in addition to `continueTrace` in OTEL-powered environments.
 */
export function continueTraceAsRemoteSpan<T>(
  ctx: Context,
  options: Parameters<typeof continueTrace>[0],
  callback: () => T,
): T {
  const ctxWithSpanContext = getContextWithRemoteActiveSpan(ctx, options);

  return context.with(ctxWithSpanContext, callback);
}

/**
 * OpenTelemetry only knows about SAMPLED or NONE decision,
 * but for us it is important to differentiate between unset and unsampled.
 *
 * Both of these are identified as `traceFlags === TracegFlags.NONE`,
 * but we additionally look at a special trace state to differentiate between them.
 */
export function getSamplingDecision(spanContext: SpanContext): boolean | undefined {
  const { traceFlags, traceState } = spanContext;

  const sampledNotRecording = traceState ? traceState.get(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING) === '1' : false;

  // If trace flag is `SAMPLED`, we interpret this as sampled
  // If it is `NONE`, it could mean either it was sampled to be not recorder, or that it was not sampled at all
  // For us this is an important difference, sow e look at the SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING
  // to identify which it is
  if (traceFlags === TraceFlags.SAMPLED) {
    return true;
  }

  if (sampledNotRecording) {
    return false;
  }

  // Fall back to DSC as a last resort, that may also contain `sampled`...
  const dscString = traceState ? traceState.get(SENTRY_TRACE_STATE_DSC) : undefined;
  const dsc = dscString ? baggageHeaderToDynamicSamplingContext(dscString) : undefined;

  if (dsc?.sampled === 'true') {
    return true;
  }
  if (dsc?.sampled === 'false') {
    return false;
  }

  return undefined;
}
