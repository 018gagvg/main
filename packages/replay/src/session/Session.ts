import { uuid4 } from '@sentry/utils';

import { SampleRates } from '../types';
import { isSampled } from '../util/isSampled';

type Sampled = false | 'session' | 'error';

export interface Session {
  id: string;

  /**
   * Start time of current session
   */
  started: number;

  /**
   * Last known activity of the session
   */
  lastActivity: number;

  /**
   * Segment ID for replay events
   */
  segmentId: number;

  /**
   * The ID of the previous session.
   * If this is empty, there was no previous session.
   */
  previousSessionId?: string;

  /**
   * Is the session sampled? `false` if not sampled, otherwise, `session` or `error`
   */
  sampled: Sampled;
}

/**
 * Get a session with defaults & applied sampling.
 */
export function makeSession(session: Partial<Session>, { sessionSampleRate, errorSampleRate }: SampleRates): Session {
  const now = new Date().getTime();
  const id = session.id || uuid4();
  // Note that this means we cannot set a started/lastActivity of `0`, but this should not be relevant outside of tests.
  const started = session.started || now;
  const lastActivity = session.lastActivity || now;
  const segmentId = session.segmentId || 0;
  const sampled = sampleSession(session.sampled, { sessionSampleRate, errorSampleRate });

  return {
    id,
    started,
    lastActivity,
    segmentId,
    sampled,
  };
}

function sampleSession(sampled: Sampled | undefined, { sessionSampleRate, errorSampleRate }: SampleRates): Sampled {
  if (typeof sampled !== 'undefined') {
    return sampled;
  }

  return isSampled(sessionSampleRate) ? 'session' : isSampled(errorSampleRate) ? 'error' : false;
}
