import * as fs from 'node:fs';
import type { Event, EventEnvelope, SpanAttributes } from '@sentry/types';

import {
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE,
  spanToJSON,
} from '@sentry/core';
import { SentrySpan } from '@sentry/core';
import {
  addItemToEnvelope,
  createEnvelope,
  createSpanEnvelopeItem,
  forEachEnvelopeItem,
  parseEnvelope,
  serializeEnvelope,
} from '../src/envelope';
import type { InternalGlobal } from '../src/worldwide';
import { GLOBAL_OBJ } from '../src/worldwide';

describe('envelope', () => {
  describe('createSpanEnvelope()', () => {
    it('span-envelope-item of INP event has the correct object structure', () => {
      const attributes: SpanAttributes = {
        release: 'releaseString',
        environment: 'dev',
        transaction: '/test-route',
        [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: 80,
        user: 10,
        profile_id: 'test-profile-id',
        replay_id: 'test-replay-id',
      };

      const startTime = 1713365480;

      const span = new SentrySpan({
        startTimestamp: startTime,
        endTimestamp: startTime + 2,
        op: 'ui.interaction.click',
        name: '<unknown>',
        attributes,
      });

      span.addEvent('inp', {
        [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT]: 'millisecond',
        [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE]: 100,
      });

      const spanEnvelopeItem = createSpanEnvelopeItem(spanToJSON(span));

      const expectedObj = {
        data: {
          'sentry.origin': expect.any(String),
          'sentry.op': expect.any(String),
          release: expect.any(String),
          environment: expect.any(String),
          transaction: expect.any(String),
          'sentry.exclusive_time': expect.any(Number),
          user: expect.any(Number),
          profile_id: expect.any(String),
          replay_id: expect.any(String),
        },
        description: expect.any(String),
        op: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
        origin: expect.any(String),
        exclusive_time: expect.any(Number),
        measurements: { inp: { value: expect.any(Number), unit: expect.any(String) } },
      };

      expect(spanEnvelopeItem[0]?.type).toBe('span');
      expect(spanEnvelopeItem[1]).toMatchObject(expectedObj);
    });
  });

  describe('createEnvelope()', () => {
    const testTable: Array<[string, Parameters<typeof createEnvelope>[0], Parameters<typeof createEnvelope>[1]]> = [
      ['creates an empty envelope', {}, []],
      ['creates an envelope with a header but no items', { dsn: 'https://public@example.com/1', sdk: {} }, []],
    ];
    it.each(testTable)('%s', (_: string, headers, items) => {
      const env = createEnvelope(headers, items);
      expect(env).toHaveLength(2);
      expect(env[0]).toStrictEqual(headers);
      expect(env[1]).toStrictEqual(items);
    });
  });

  describe('serializeEnvelope and parseEnvelope', () => {
    afterEach(() => {
      delete (GLOBAL_OBJ as Partial<InternalGlobal>).__SENTRY__;
    });

    it('serializes an envelope', () => {
      const env = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, []);
      const serializedEnvelope = serializeEnvelope(env);
      expect(typeof serializedEnvelope).toBe('string');

      const [headers] = parseEnvelope(serializedEnvelope);
      expect(headers).toEqual({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' });
    });

    test.each([
      {
        name: 'with TextEncoder/Decoder polyfill',
        before: () => {
          GLOBAL_OBJ.__SENTRY__ = {} as InternalGlobal['__SENTRY__'];
          GLOBAL_OBJ.__SENTRY__.encodePolyfill = jest.fn<Uint8Array, [string]>((input: string) =>
            new TextEncoder().encode(input),
          );
        },
        after: () => {
          expect(GLOBAL_OBJ.__SENTRY__.encodePolyfill).toHaveBeenCalled();
        },
      },
      {
        name: 'with default TextEncoder/Decoder',
      },
    ])('serializes an envelope with attachments $name', ({ before, after }) => {
      before?.();

      const items: EventEnvelope[1] = [
        [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }],
        [{ type: 'attachment', filename: 'bar.txt', length: 6 }, Uint8Array.from([1, 2, 3, 4, 5, 6])],
        [{ type: 'attachment', filename: 'foo.txt', length: 6 }, Uint8Array.from([7, 8, 9, 10, 11, 12])],
      ];

      const env = createEnvelope<EventEnvelope>(
        { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' },
        items,
      );

      const serializedEnvelope = serializeEnvelope(env);
      expect(serializedEnvelope).toBeInstanceOf(Uint8Array);

      const [parsedHeaders, parsedItems] = parseEnvelope(serializedEnvelope);
      expect(parsedHeaders).toEqual({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' });
      expect(parsedItems).toHaveLength(3);
      expect(items[0]).toEqual([{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }]);
      expect(items[1]).toEqual([
        { type: 'attachment', filename: 'bar.txt', length: 6 },
        Uint8Array.from([1, 2, 3, 4, 5, 6]),
      ]);
      expect(items[2]).toEqual([
        { type: 'attachment', filename: 'foo.txt', length: 6 },
        Uint8Array.from([7, 8, 9, 10, 11, 12]),
      ]);

      after?.();
    });

    it("doesn't throw when being passed a an envelope that contains a circular item payload", () => {
      const chicken: { egg?: any } = {};
      const egg = { chicken } as unknown as Event;
      chicken.egg = chicken;

      const env = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
        [{ type: 'event' }, egg],
      ]);

      const serializedEnvelope = serializeEnvelope(env);
      const [, , serializedBody] = serializedEnvelope.toString().split('\n');

      expect(serializedBody).toBe('{"chicken":{"egg":"[Circular ~]"}}');
    });
  });

  describe('addItemToEnvelope()', () => {
    it('adds an item to an envelope', () => {
      const env = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, []);
      let [envHeaders, items] = parseEnvelope(serializeEnvelope(env));
      expect(items).toHaveLength(0);
      expect(envHeaders).toEqual({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' });

      const newEnv = addItemToEnvelope<EventEnvelope>(env, [
        { type: 'event' },
        { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' },
      ]);

      [envHeaders, items] = parseEnvelope(serializeEnvelope(newEnv));
      expect(envHeaders).toEqual({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' });
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual([{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', type: 'event' }]);
    });
  });

  describe('forEachEnvelopeItem', () => {
    it('loops through an envelope', () => {
      const items: EventEnvelope[1] = [
        [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }],
        [{ type: 'attachment', filename: 'bar.txt', length: 6 }, Uint8Array.from([1, 2, 3, 4, 5, 6])],
        [{ type: 'attachment', filename: 'foo.txt', length: 6 }, Uint8Array.from([7, 8, 9, 10, 11, 12])],
      ];

      const env = createEnvelope<EventEnvelope>(
        { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' },
        items,
      );

      expect.assertions(6);

      let iteration = 0;
      forEachEnvelopeItem(env, (item, type) => {
        expect(item).toBe(items[iteration]);
        expect(type).toBe(items[iteration]?.[0]?.type);
        iteration = iteration + 1;
      });
    });
  });

  describe('parseEnvelope', () => {
    describe('Sentry Integration', () => {
      test('Process Envelope Empty', () => {
        const envelope = fs.readFileSync(`${__dirname}/_fixtures/envelope_empty.txt`, 'utf-8');
        expect(parseEnvelope(envelope)).not.toBe(undefined);
      });

      test('Process Envelope', () => {
        const envelope = fs.readFileSync(`${__dirname}/_fixtures/envelope_javascript.txt`, 'utf-8');
        expect(parseEnvelope(envelope)).not.toBe(undefined);
      });

      test('Process Python Transaction Envelope', () => {
        const envelope = fs.readFileSync(`${__dirname}/_fixtures/envelope_python.txt`, 'utf-8');
        expect(parseEnvelope(envelope)).not.toBe(undefined);
      });

      test('Process PHP Transaction Envelope', () => {
        const envelope = fs.readFileSync(`${__dirname}/_fixtures/envelope_php.txt`, 'utf-8');
        const processedEnvelope = parseEnvelope(envelope);
        expect(processedEnvelope).not.toBe(undefined);
        expect((processedEnvelope[1][0][1] as any).type).toEqual('transaction');
      });

      test('Process Java Transaction Envelope', () => {
        const envelope = fs.readFileSync(`${__dirname}/_fixtures/envelope_java.txt`, 'utf-8');
        const processedEnvelope = parseEnvelope(envelope);
        expect(processedEnvelope).not.toBe(undefined);
        expect((processedEnvelope[1][0][1] as any).type).toEqual('transaction');
      });

      test('Process Astro SSR pageload (BE -> FE) trace', () => {
        const nodeEnvelope = fs.readFileSync(`${__dirname}/_fixtures/envelope_astro_ssr_node.txt`, 'utf-8');
        const processedNodeEnvelope = parseEnvelope(nodeEnvelope);

        const browserEnvelope = fs.readFileSync(`${__dirname}/_fixtures/envelope_astro_ssr_browser.txt`, 'utf-8');
        const processedBrowserEnvelope = parseEnvelope(browserEnvelope);

        expect(processedNodeEnvelope).not.toBe(undefined);
        expect(processedBrowserEnvelope).not.toBe(undefined);

        const nodeEvent = processedNodeEnvelope[1][0][1] as Event;
        const browserEvent = processedBrowserEnvelope[1][0][1] as Event;

        expect(nodeEvent.spans?.length).toEqual(0);
        expect(browserEvent.spans?.length).toEqual(45);
        expect(nodeEvent.type).toEqual('transaction');
        expect(browserEvent.type).toEqual('transaction');

        const nodeTraceId = nodeEvent.contexts?.trace?.trace_id;
        const browserTraceId = browserEvent.contexts?.trace?.trace_id;
        expect(nodeTraceId).toEqual(browserTraceId);
      });

      test('Process Angular Envelope', () => {
        const envelope = fs.readFileSync(`${__dirname}/_fixtures/envelope_angular.txt`, 'utf-8');
        expect(parseEnvelope(envelope)).not.toBe(undefined);
      });

      test('Process Java Formatted Message Envelope', () => {
        const envelope = fs.readFileSync(`${__dirname}/_fixtures/envelope_java_formatted_message.txt`, 'utf-8');
        expect(parseEnvelope(envelope)).not.toBe(undefined);
      });

      test('Process Envelope w/ Binary Data', () => {
        const envelope = fs.readFileSync(`${__dirname}/_fixtures/envelope_binary.bin`);
        expect(parseEnvelope(envelope)).not.toBe(undefined);
      });

      test('Process Envelope w/ Empty Payloads', () => {
        const envelope = fs.readFileSync(`${__dirname}/_fixtures/envelope_empty_payload.txt`, 'utf-8');
        expect(parseEnvelope(envelope)).not.toBe(undefined);
      });

      test('Process Envelope w/ implicit length, terminated by newline', () => {
        const envelope = fs.readFileSync(`${__dirname}/_fixtures/envelope_no_len_w_new_line.txt`, 'utf-8');
        expect(parseEnvelope(envelope)).not.toBe(undefined);
      });

      test('Process Envelope w/ implicit length, terminated by EOF', () => {
        const envelope = fs.readFileSync(`${__dirname}/_fixtures/envelope_no_len_w_eof.txt`, 'utf-8');
        expect(parseEnvelope(envelope)).not.toBe(undefined);
      });

      test('Process Envelope w/ implicit length, terminated by EOF, empty headers', () => {
        const envelope = fs.readFileSync(`${__dirname}/_fixtures/envelope_no_len_w_eof_empty_headers.txt`, 'utf-8');
        expect(parseEnvelope(envelope)).not.toBe(undefined);
      });
    });
  });
});
