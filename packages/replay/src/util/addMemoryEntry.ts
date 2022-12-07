import { WINDOW } from '../constants';
import type { ReplayContainer } from '../replay';
import { createPerformanceSpans } from './createPerformanceSpans';

/**
 * Create a "span" for the total amount of memory being used by JS objects
 * (including v8 internal objects).
 */
export function addMemoryEntry(replay: ReplayContainer): Promise<void[]> | undefined {
  // window.performance.memory is a non-standard API and doesn't work on all browsers
  // so we check before creating the event.
  if (!('memory' in WINDOW.performance)) {
    return;
  }

  return createPerformanceSpans(replay, [
    // @ts-ignore memory doesn't exist on type Performance as the API is non-standard (we check that it exists above)
    createMemoryEntry(WINDOW.performance.memory),
  ]);
}
