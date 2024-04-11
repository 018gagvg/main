// This is exported so the loader does not fail when switching off Replay/Tracing
import {
  addTracingExtensionsShim,
  browserTracingIntegrationShim,
  feedbackIntegrationShim,
  feedbackModalIntegrationShim,
  feedbackScreenshotIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

export {
  addTracingExtensionsShim as addTracingExtensions,
  browserTracingIntegrationShim as browserTracingIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  feedbackModalIntegrationShim as feedbackModalIntegration,
  feedbackScreenshotIntegrationShim as feedbackScreenshotIntegration,
  replayIntegrationShim as replayIntegration,
};
