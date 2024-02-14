import * as SentryReact from '@sentry/react';

import { init } from '../src/index.client';

const reactInit = jest.spyOn(SentryReact, 'init');

describe('Client init()', () => {
  afterEach(() => {
    jest.clearAllMocks();

    SentryReact.getGlobalScope().clear();
    SentryReact.getIsolationScope().clear();
    SentryReact.getCurrentScope().clear();
  });

  it('inits the React SDK', () => {
    expect(reactInit).toHaveBeenCalledTimes(0);
    init({});
    expect(reactInit).toHaveBeenCalledTimes(1);
    expect(reactInit).toHaveBeenCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.remix',
            version: expect.any(String),
            packages: [
              {
                name: 'npm:@sentry/remix',
                version: expect.any(String),
              },
              {
                name: 'npm:@sentry/react',
                version: expect.any(String),
              },
            ],
          },
        },
      }),
    );
  });

  it('sets runtime on scope', () => {
    expect(SentryReact.getIsolationScope().getScopeData().tags).toEqual({});

    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(SentryReact.getIsolationScope().getScopeData().tags).toEqual({ runtime: 'browser' });
  });
});
