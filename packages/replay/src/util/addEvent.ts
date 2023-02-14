import { getCurrentHub } from '@sentry/core';
import { logger } from '@sentry/utils';

import { SESSION_IDLE_DURATION } from '../constants';
import type { AddEventResult, RecordingEvent, ReplayContainer } from '../types';

/**
 * Add an event to the event buffer
 */
export async function addEvent(
  replay: ReplayContainer,
  event: RecordingEvent,
  isCheckout?: boolean,
): Promise<AddEventResult | null> {
  if (!replay.eventBuffer || !replay.session) {
    // This implies that `_isEnabled` is false
    return null;
  }

  if (replay.isPaused()) {
    // Do not add to event buffer when recording is paused
    return null;
  }

  // TODO: sadness -- we will want to normalize timestamps to be in ms -
  // requires coordination with frontend
  const isMs = event.timestamp > 9999999999;
  const timestampInMs = isMs ? event.timestamp : event.timestamp * 1000;

  // Throw out events that happen more than 5 minutes ago. This can happen if
  // page has been left open and idle for a long period of time and user
  // comes back to trigger a new session. The performance entries rely on
  // `performance.timeOrigin`, which is when the page first opened.
  if (timestampInMs + SESSION_IDLE_DURATION < new Date().getTime()) {
    return null;
  }

  // In error mode, any checkout will always be the first timestamp, as we clear everything before
  if (isCheckout && replay.recordingMode === 'error') {
    replay.getContext().initialTimestamp = timestampInMs;
  }

  try {
    return await replay.eventBuffer.addEvent(event, isCheckout);
  } catch (error) {
    __DEBUG_BUILD__ && logger.error(error);
    replay.stop();

    const client = getCurrentHub().getClient();

    if (client) {
      client.recordDroppedEvent('internal_sdk_error', 'replay');
    }
  }
}
