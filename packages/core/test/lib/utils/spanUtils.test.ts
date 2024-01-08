import { TRACEPARENT_REGEXP, timestampInSeconds } from '@sentry/utils';
import { Span, spanToTraceHeader } from '../../../src';
import { spanTimeInputToSeconds, spanToJSON, spanIsSampled } from '../../../src/utils/spanUtils';

describe('spanToTraceHeader', () => {
  test('simple', () => {
    const span = new Span();
    expect(spanToTraceHeader(span)).toMatch(TRACEPARENT_REGEXP);
  });
  test('with sample', () => {
    const span = new Span({ sampled: true });
    expect(spanToTraceHeader(span)).toMatch(TRACEPARENT_REGEXP);
  });
});

describe('spanTimeInputToSeconds', () => {
  it('works with undefined', () => {
    const now = timestampInSeconds();
    expect(spanTimeInputToSeconds(undefined)).toBeGreaterThanOrEqual(now);
  });

  it('works with a timestamp in seconds', () => {
    const timestamp = timestampInSeconds();
    expect(spanTimeInputToSeconds(timestamp)).toEqual(timestamp);
  });

  it('works with a timestamp in milliseconds', () => {
    const timestamp = Date.now();
    expect(spanTimeInputToSeconds(timestamp)).toEqual(timestamp / 1000);
  });

  it('works with a Date object', () => {
    const timestamp = new Date();
    expect(spanTimeInputToSeconds(timestamp)).toEqual(timestamp.getTime() / 1000);
  });

  it('works with a simple array', () => {
    const seconds = Math.floor(timestampInSeconds());
    const timestamp: [number, number] = [seconds, 0];
    expect(spanTimeInputToSeconds(timestamp)).toEqual(seconds);
  });

  it('works with a array with nanoseconds', () => {
    const seconds = Math.floor(timestampInSeconds());
    const timestamp: [number, number] = [seconds, 9000];
    expect(spanTimeInputToSeconds(timestamp)).toEqual(seconds + 0.000009);
  });
});

describe('spanToJSON', () => {
  it('works with a simple span', () => {
    const span = new Span();
    expect(spanToJSON(span)).toEqual({
      span_id: span.spanId,
      trace_id: span.traceId,
      origin: 'manual',
      start_timestamp: span.startTimestamp,
    });
  });

  it('works with a full span', () => {
    const span = new Span({
      name: 'test name',
      op: 'test op',
      parentSpanId: '1234',
      spanId: '5678',
      status: 'ok',
      tags: {
        foo: 'bar',
      },
      traceId: 'abcd',
      origin: 'auto',
      startTimestamp: 123,
    });

    expect(spanToJSON(span)).toEqual({
      description: 'test name',
      op: 'test op',
      parent_span_id: '1234',
      span_id: '5678',
      status: 'ok',
      tags: {
        foo: 'bar',
      },
      trace_id: 'abcd',
      origin: 'auto',
      start_timestamp: 123,
    });
  });

  it('works with a custom class without spanToJSON', () => {
    const span = {
      toJSON: () => {
        return {
          span_id: 'span_id',
          trace_id: 'trace_id',
          origin: 'manual',
          start_timestamp: 123,
        };
      },
    } as unknown as Span;

    expect(spanToJSON(span)).toEqual({
      span_id: 'span_id',
      trace_id: 'trace_id',
      origin: 'manual',
      start_timestamp: 123,
    });
  });

  it('returns empty object if span does not have getter methods', () => {
    // eslint-disable-next-line
    const span = new Span().toJSON();

    expect(spanToJSON(span as unknown as Span)).toEqual({});
  });
});

describe('spanIsSampled', () => {
  test('sampled', () => {
    const span = new Span({ sampled: true });
    expect(spanIsSampled(span)).toBe(true);
  });

  test('not sampled', () => {
    const span = new Span({ sampled: false });
    expect(spanIsSampled(span)).toBe(false);
  });
});
