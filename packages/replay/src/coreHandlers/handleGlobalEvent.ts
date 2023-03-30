import { addBreadcrumb } from '@sentry/core';
import type { Event, EventHint } from '@sentry/types';
import { logger } from '@sentry/utils';

import type { ReplayContainer } from '../types';
import { isErrorEvent, isReplayEvent, isTransactionEvent } from '../util/eventUtils';
import { isRrwebError } from '../util/isRrwebError';
import { handleAfterSendEvent } from './handleAfterSendEvent';

/**
 * Returns a listener to be added to `addGlobalEventProcessor(listener)`.
 */
export function handleGlobalEventListener(
  replay: ReplayContainer,
  includeAfterSendEventHandling = false,
): (event: Event, hint: EventHint) => Event | null {
  const afterSendHandler = includeAfterSendEventHandling ? handleAfterSendEvent(replay) : undefined;

  return (event: Event, hint: EventHint) => {
    if (isReplayEvent(event)) {
      // Replays have separate set of breadcrumbs, do not include breadcrumbs
      // from core SDK
      delete event.breadcrumbs;
      return event;
    }

    // We only want to handle errors & transactions, nothing else
    if (!isErrorEvent(event) && !isTransactionEvent(event)) {
      return event;
    }

    // Unless `captureExceptions` is enabled, we want to ignore errors coming from rrweb
    // As there can be a bunch of stuff going wrong in internals there, that we don't want to bubble up to users
    if (isRrwebError(event, hint) && !replay.getOptions()._experiments.captureExceptions) {
      __DEBUG_BUILD__ && logger.log('[Replay] Ignoring error from rrweb internals', event);
      return null;
    }

    // Only tag transactions with replayId if not waiting for an error
    if (isErrorEvent(event) || (isTransactionEvent(event) && replay.recordingMode === 'session')) {
      event.tags = { ...event.tags, replayId: replay.getSessionId() };
    }

    if (__DEBUG_BUILD__ && replay.getOptions()._experiments.traceInternals && isErrorEvent(event)) {
      const exc = getEventExceptionValues(event);
      addInternalBreadcrumb({
        message: `Tagging event (${event.event_id}) - ${event.message} - ${exc.type}: ${exc.value}`,
      });
    }

    // In cases where a custom client is used that does not support the new hooks (yet),
    // we manually call this hook method here
    if (afterSendHandler) {
      // Pretend the error had a 200 response so we always capture it
      afterSendHandler(event, { statusCode: 200 });
    }

    return event;
  };
}

function addInternalBreadcrumb(arg: Parameters<typeof addBreadcrumb>[0]): void {
  const { category, level, message, ...rest } = arg;

  addBreadcrumb({
    category: category || 'console',
    level: level || 'debug',
    message: `[debug]: ${message}`,
    ...rest,
  });
}

function getEventExceptionValues(event: Event): { type: string; value: string } {
  return {
    type: 'Unknown',
    value: 'n/a',
    ...(event.exception && event.exception.values && event.exception.values[0]),
  };
}
