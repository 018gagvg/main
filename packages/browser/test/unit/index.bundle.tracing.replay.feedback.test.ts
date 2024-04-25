import { browserTracingIntegration, feedbackAsyncIntegration, replayIntegration } from '../../src';
import * as TracingReplayFeedbackBundle from '../../src/index.bundle.tracing.replay.feedback';

describe('index.bundle.tracing.replay.feedback', () => {
  it('has correct exports', () => {
    expect(TracingReplayFeedbackBundle.replayIntegration).toBe(replayIntegration);
    expect(TracingReplayFeedbackBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingReplayFeedbackBundle.feedbackAsyncIntegration).toBe(feedbackAsyncIntegration);
  });
});
