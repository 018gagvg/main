import { EventType } from '@sentry-internal/rrweb';

import { BASE_TIMESTAMP } from '../..';
import * as SentryAddEvent from '../../../src/util/addEvent';
import { getHandleRecordingEmit } from '../../../src/util/handleRecordingEmit';
import { setupReplayContainer } from '../../utils/setupReplayContainer';
import { useFakeTimers } from '../../utils/use-fake-timers';

useFakeTimers();

describe('Unit | util | handleRecordingEmit', () => {
  let addEventMock: jest.SpyInstance;

  beforeEach(function () {
    jest.setSystemTime(BASE_TIMESTAMP);
    addEventMock = jest.spyOn(SentryAddEvent, 'addEvent').mockImplementation(async () => {
      // Do nothing
    });
  });

  afterEach(function () {
    addEventMock.mockReset();
  });

  it('interprets first event as checkout event', async function () {
    const replay = setupReplayContainer({
      options: {
        errorSampleRate: 0,
        sessionSampleRate: 1,
      },
    });

    const handler = getHandleRecordingEmit(replay);

    const event = {
      type: EventType.FullSnapshot,
      data: {
        tag: 'test custom',
      },
      timestamp: BASE_TIMESTAMP + 10,
    };

    handler(event);
    await new Promise(process.nextTick);

    expect(addEventMock).toBeCalledTimes(1);
    expect(addEventMock).toHaveBeenLastCalledWith(replay, event, true);

    handler(event);
    await new Promise(process.nextTick);

    expect(addEventMock).toBeCalledTimes(2);
    expect(addEventMock).toHaveBeenLastCalledWith(replay, event, false);
  });

  it('interprets any event with isCheckout as checkout', async function () {
    const replay = setupReplayContainer({
      options: {
        errorSampleRate: 0,
        sessionSampleRate: 1,
      },
    });

    const handler = getHandleRecordingEmit(replay);

    const event = {
      type: EventType.IncrementalSnapshot,
      data: {
        tag: 'test custom',
      },
      timestamp: BASE_TIMESTAMP + 10,
    };

    handler(event, true);
    await new Promise(process.nextTick);

    expect(addEventMock).toBeCalledTimes(1);
    expect(addEventMock).toHaveBeenLastCalledWith(replay, event, true);

    handler(event, true);
    await new Promise(process.nextTick);

    expect(addEventMock).toBeCalledTimes(2);
    expect(addEventMock).toHaveBeenLastCalledWith(replay, event, true);
  });
});
