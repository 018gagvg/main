import { RequestSessionStatus, Status } from '@sentry/types';

import { SessionFlusher } from '../src';

describe('Session Flusher', () => {
  let sendSessionAggregates: jest.Mock;
  let transport: {
    sendEvent: jest.Mock;
    sendSessionAggregates: jest.Mock;
    close: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    sendSessionAggregates = jest.fn(() => Promise.resolve({ status: Status.Success }));
    transport = {
      sendEvent: jest.fn(),
      sendSessionAggregates,
      close: jest.fn(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('test incrementSessionStatusCount updates the internal SessionFlusher state', () => {
    const flusher = new SessionFlusher(transport, { release: '1.0.0', environment: 'dev' });

    const date = new Date('2021-04-08T12:18:23.043Z');
    let count = (flusher as any)._incrementSessionStatusCount(RequestSessionStatus.Ok, date);
    expect(count).toEqual(1);
    count = (flusher as any)._incrementSessionStatusCount(RequestSessionStatus.Ok, date);
    expect(count).toEqual(2);
    count = (flusher as any)._incrementSessionStatusCount(RequestSessionStatus.Errored, date);
    expect(count).toEqual(1);
    date.setMinutes(date.getMinutes() + 1);
    count = (flusher as any)._incrementSessionStatusCount(RequestSessionStatus.Ok, date);
    expect(count).toEqual(1);
    count = (flusher as any)._incrementSessionStatusCount(RequestSessionStatus.Errored, date);
    expect(count).toEqual(1);

    expect(flusher.getSessionAggregates().aggregates).toEqual([
      { errored: 1, exited: 2, started: '2021-04-08T12:18:00.000Z' },
      { errored: 1, exited: 1, started: '2021-04-08T12:19:00.000Z' },
    ]);
    expect(flusher.getSessionAggregates().attrs).toEqual({ release: '1.0.0', environment: 'dev' });
  });

  test('test undefined attributes are excluded, on incrementSessionStatusCount call', () => {
    const flusher = new SessionFlusher(transport, { release: '1.0.0' });

    const date = new Date('2021-04-08T12:18:23.043Z');
    (flusher as any)._incrementSessionStatusCount(RequestSessionStatus.Ok, date);
    (flusher as any)._incrementSessionStatusCount(RequestSessionStatus.Errored, date);

    expect(flusher.getSessionAggregates()).toEqual({
      aggregates: [{ errored: 1, exited: 1, started: '2021-04-08T12:18:00.000Z' }],
      attrs: { release: '1.0.0' },
    });
  });

  test('flush is called every 60 seconds after initialisation of an instance of SessionFlusher', () => {
    const flusher = new SessionFlusher(transport, { release: '1.0.0', environment: 'dev' });
    const flusherFlushFunc = jest.spyOn(flusher, 'flush');
    jest.advanceTimersByTime(59000);
    expect(flusherFlushFunc).toHaveBeenCalledTimes(0);
    jest.advanceTimersByTime(2000);
    expect(flusherFlushFunc).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(58000);
    expect(flusherFlushFunc).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2000);
    expect(flusherFlushFunc).toHaveBeenCalledTimes(2);
  });

  test('sendSessions is called on flush if sessions were captured', () => {
    const flusher = new SessionFlusher(transport, { release: '1.0.0', environment: 'dev' });
    const flusherFlushFunc = jest.spyOn(flusher, 'flush');
    const date = new Date('2021-04-08T12:18:23.043Z');
    (flusher as any)._incrementSessionStatusCount(RequestSessionStatus.Ok, date);
    (flusher as any)._incrementSessionStatusCount(RequestSessionStatus.Ok, date);

    expect(sendSessionAggregates).toHaveBeenCalledTimes(0);

    jest.advanceTimersByTime(61000);

    expect(flusherFlushFunc).toHaveBeenCalledTimes(1);
    expect(sendSessionAggregates).toHaveBeenCalledWith(
      expect.objectContaining({
        attrs: { release: '1.0.0', environment: 'dev' },
        aggregates: [{ started: '2021-04-08T12:18:00.000Z', exited: 2 }],
      }),
    );
  });

  test('sendSessions is not called on flush if no sessions were captured', () => {
    const flusher = new SessionFlusher(transport, { release: '1.0.0', environment: 'dev' });
    const flusherFlushFunc = jest.spyOn(flusher, 'flush');

    expect(sendSessionAggregates).toHaveBeenCalledTimes(0);
    jest.advanceTimersByTime(61000);
    expect(flusherFlushFunc).toHaveBeenCalledTimes(1);
    expect(sendSessionAggregates).toHaveBeenCalledTimes(0);
  });

  test('calling close on SessionFlusher should disable SessionFlusher', () => {
    const flusher = new SessionFlusher(transport, { release: '1.0.x' });
    flusher.close();
    expect((flusher as any)._isEnabled).toEqual(false);
  });

  test('calling close on SessionFlusher will force call flush', () => {
    const flusher = new SessionFlusher(transport, { release: '1.0.x' });
    const flusherFlushFunc = jest.spyOn(flusher, 'flush');
    const date = new Date('2021-04-08T12:18:23.043Z');
    (flusher as any)._incrementSessionStatusCount(RequestSessionStatus.Ok, date);
    (flusher as any)._incrementSessionStatusCount(RequestSessionStatus.Ok, date);
    flusher.close();

    expect(flusherFlushFunc).toHaveBeenCalledTimes(1);
    expect(sendSessionAggregates).toHaveBeenCalledWith(
      expect.objectContaining({
        attrs: { release: '1.0.x' },
        aggregates: [{ started: '2021-04-08T12:18:00.000Z', exited: 2 }],
      }),
    );
  });
});
