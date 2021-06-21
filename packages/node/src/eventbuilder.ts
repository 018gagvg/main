import { getCurrentHub } from '@sentry/core';
import { Event, EventHint, Mechanism, Severity } from '@sentry/types';
import {
  addExceptionMechanism,
  addExceptionTypeValue,
  extractExceptionKeysForMessage,
  isError,
  isPlainObject,
  normalizeToSize,
  SyncPromise,
} from '@sentry/utils';

import { extractStackFromError, parseError, parseStack, prepareFramesForEvent, ReadFilesFn } from './parsers';
import { NodeOptions } from './types';

/**
 * Builds and Event from a Exception
 * @hidden
 */
export function eventFromException(
  options: NodeOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  exception: any,
  hint?: EventHint,
  readFiles?: ReadFilesFn,
): PromiseLike<Event> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ex: any = exception;
  const providedMechanism: Mechanism | undefined =
    hint && hint.data && (hint.data as { mechanism: Mechanism }).mechanism;
  const mechanism: Mechanism = providedMechanism || {
    handled: true,
    type: 'generic',
  };

  if (!isError(exception)) {
    if (isPlainObject(exception)) {
      // This will allow us to group events based on top-level keys
      // which is much better than creating new group when any key/value change
      const message = `Non-Error exception captured with keys: ${extractExceptionKeysForMessage(exception)}`;

      getCurrentHub().configureScope(scope => {
        scope.setExtra('__serialized__', normalizeToSize(exception as Record<string, unknown>));
      });

      ex = (hint && hint.syntheticException) || new Error(message);
      (ex as Error).message = message;
    } else {
      // This handles when someone does: `throw "something awesome";`
      // We use synthesized Error here so we can extract a (rough) stack trace.
      ex = (hint && hint.syntheticException) || new Error(exception as string);
      (ex as Error).message = exception;
    }
    mechanism.synthetic = true;
  }

  return new SyncPromise<Event>((resolve, reject) =>
    parseError(ex as Error, readFiles, options)
      .then(event => {
        addExceptionTypeValue(event, undefined, undefined);
        addExceptionMechanism(event, mechanism);

        resolve({
          ...event,
          event_id: hint && hint.event_id,
        });
      })
      .then(null, reject),
  );
}

/**
 * Builds and Event from a Message
 * @hidden
 */
export function eventFromMessage(
  options: NodeOptions,
  message: string,
  level: Severity = Severity.Info,
  hint?: EventHint,
  readFiles?: ReadFilesFn,
): PromiseLike<Event> {
  const event: Event = {
    event_id: hint && hint.event_id,
    level,
    message,
  };

  return new SyncPromise<Event>(resolve => {
    if (options.attachStacktrace && hint && hint.syntheticException) {
      const stack = hint.syntheticException ? extractStackFromError(hint.syntheticException) : [];
      void parseStack(stack, readFiles, options)
        .then(frames => {
          event.stacktrace = {
            frames: prepareFramesForEvent(frames),
          };
          resolve(event);
        })
        .then(null, () => {
          resolve(event);
        });
    } else {
      resolve(event);
    }
  });
}
