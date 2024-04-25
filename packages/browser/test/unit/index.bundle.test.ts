import { feedbackIntegrationShim, replayIntegrationShim } from '@sentry-internal/integration-shims';

import * as Bundle from '../../src/index.bundle';

describe('index.bundle', () => {
  it('has correct exports', () => {
    expect(Bundle.replayIntegration).toBe(replayIntegrationShim);
    expect(Bundle.feedbackAsyncIntegration).toBe(feedbackIntegrationShim);
  });
});
