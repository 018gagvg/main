import type {
  Span,
  SpanAttributes,
  SpanJSON,
  SpanOrigin,
  SpanStatus,
  SpanTimeInput,
  TraceContext,
} from '@sentry/types';
import { dropUndefinedKeys, generateSentryTraceHeader, timestampInSeconds } from '@sentry/utils';
import { getMetricSummaryJsonForSpan } from '../metrics/metric-summary';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes';
import { SPAN_STATUS_OK, SPAN_STATUS_UNSET } from '../tracing';
import type { SentrySpan } from '../tracing/sentrySpan';

// These are aligned with OpenTelemetry trace flags
export const TRACE_FLAG_NONE = 0x0;
export const TRACE_FLAG_SAMPLED = 0x1;

/**
 * Convert a span to a trace context, which can be sent as the `trace` context in an event.
 */
export function spanToTraceContext(span: Span): TraceContext {
  const { spanId: span_id, traceId: trace_id } = span.spanContext();
  const { data, op, parent_span_id, status, tags, origin } = spanToJSON(span);

  return dropUndefinedKeys({
    data,
    op,
    parent_span_id,
    span_id,
    status,
    tags,
    trace_id,
    origin,
  });
}

/**
 * Convert a Span to a Sentry trace header.
 */
export function spanToTraceHeader(span: Span): string {
  const { traceId, spanId } = span.spanContext();
  const sampled = spanIsSampled(span);
  return generateSentryTraceHeader(traceId, spanId, sampled);
}

/**
 * Convert a span time input intp a timestamp in seconds.
 */
export function spanTimeInputToSeconds(input: SpanTimeInput | undefined): number {
  if (typeof input === 'number') {
    return ensureTimestampInSeconds(input);
  }

  if (Array.isArray(input)) {
    // See {@link HrTime} for the array-based time format
    return input[0] + input[1] / 1e9;
  }

  if (input instanceof Date) {
    return ensureTimestampInSeconds(input.getTime());
  }

  return timestampInSeconds();
}

/**
 * Converts a timestamp to second, if it was in milliseconds, or keeps it as second.
 */
function ensureTimestampInSeconds(timestamp: number): number {
  const isMs = timestamp > 9999999999;
  return isMs ? timestamp / 1000 : timestamp;
}

/**
 * Convert a span to a JSON representation.
 * Note that all fields returned here are optional and need to be guarded against.
 *
 * Note: Because of this, we currently have a circular type dependency (which we opted out of in package.json).
 * This is not avoidable as we need `spanToJSON` in `spanUtils.ts`, which in turn is needed by `span.ts` for backwards compatibility.
 * And `spanToJSON` needs the Span class from `span.ts` to check here.
 */
export function spanToJSON(span: Span): Partial<SpanJSON> {
  if (spanIsSentrySpan(span)) {
    return span.getSpanJSON();
  }

  try {
    const { spanId: span_id, traceId: trace_id } = span.spanContext();

    // Handle a span from @opentelemetry/sdk-base-trace's `Span` class
    if (spanIsOpenTelemetrySdkTraceBaseSpan(span)) {
      const { attributes, startTime, name, endTime, parentSpanId, status } = span;

      return dropUndefinedKeys({
        span_id,
        trace_id,
        data: attributes,
        description: name,
        parent_span_id: parentSpanId,
        start_timestamp: spanTimeInputToSeconds(startTime),
        // This is [0,0] by default in OTEL, in which case we want to interpret this as no end time
        timestamp: spanTimeInputToSeconds(endTime) || undefined,
        status: getStatusMessage(status),
        op: attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP],
        origin: attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] as SpanOrigin | undefined,
        _metrics_summary: getMetricSummaryJsonForSpan(span),
      });
    }

    // Finally, at least we have `spanContext()`....
    return {
      span_id,
      trace_id,
    };
  } catch {
    return {};
  }
}

function spanIsOpenTelemetrySdkTraceBaseSpan(span: Span): span is OpenTelemetrySdkTraceBaseSpan {
  const castSpan = span as OpenTelemetrySdkTraceBaseSpan;
  return !!castSpan.attributes && !!castSpan.startTime && !!castSpan.name && !!castSpan.endTime && !!castSpan.status;
}

/** Exported only for tests. */
export interface OpenTelemetrySdkTraceBaseSpan extends Span {
  attributes: SpanAttributes;
  startTime: SpanTimeInput;
  name: string;
  status: SpanStatus;
  endTime: SpanTimeInput;
  parentSpanId?: string;
}

/**
 * Sadly, due to circular dependency checks we cannot actually import the Span class here and check for instanceof.
 * :( So instead we approximate this by checking if it has the `getSpanJSON` method.
 */
function spanIsSentrySpan(span: Span): span is SentrySpan {
  return typeof (span as SentrySpan).getSpanJSON === 'function';
}

/**
 * Returns true if a span is sampled.
 * In most cases, you should just use `span.isRecording()` instead.
 * However, this has a slightly different semantic, as it also returns false if the span is finished.
 * So in the case where this distinction is important, use this method.
 */
export function spanIsSampled(span: Span): boolean {
  // We align our trace flags with the ones OpenTelemetry use
  // So we also check for sampled the same way they do.
  const { traceFlags } = span.spanContext();
  // eslint-disable-next-line no-bitwise
  return Boolean(traceFlags & TRACE_FLAG_SAMPLED);
}

/** Get the status message to use for a JSON representation of a span. */
export function getStatusMessage(status: SpanStatus | undefined): string | undefined {
  if (!status || status.code === SPAN_STATUS_UNSET) {
    return undefined;
  }

  if (status.code === SPAN_STATUS_OK) {
    return 'ok';
  }

  return status.message || 'unknown_error';
}
