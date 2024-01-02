import type { Span as WriteableSpan, SpanOptions, Tracer } from '@opentelemetry/api';
import type { BasicTracerProvider, ReadableSpan, Span } from '@opentelemetry/sdk-trace-base';
import type { SpanOrigin, TransactionMetadata, TransactionSource } from '@sentry/types';

export interface OpenTelemetryClient {
  tracer: Tracer;
  traceProvider: BasicTracerProvider | undefined;
}

export interface OpenTelemetrySpanContext extends SpanOptions {
  name: string;
  op?: string;
  metadata?: Partial<TransactionMetadata>;
  origin?: SpanOrigin;
  source?: TransactionSource;
}

/**
 * The base `Span` type is basically a `WriteableSpan`.
 * There are places where we basically want to allow passing _any_ span,
 * so in these cases we type this as `AbstractSpan` which could be either a regular `Span` or a `ReadableSpan`.
 * You'll have to make sure to check relevant fields before accessing them.
 *
 * Note that technically, the `Span` exported from `@opentelemwetry/sdk-trace-base` matches this,
 * but we cannot be 100% sure that we are actually getting such a span, so this type is more defensive.
 */
export type AbstractSpan = WriteableSpan | ReadableSpan;

export type { Span };
