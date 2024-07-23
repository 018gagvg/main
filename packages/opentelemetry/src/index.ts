export { getRequestSpanData } from './utils/getRequestSpanData';

export type { OpenTelemetryClient } from './types';
export { wrapClientClass } from './custom/client';

export { getSpanKind } from './utils/getSpanKind';

export { getScopesFromContext } from './utils/contextData';

export {
  spanHasAttributes,
  spanHasEvents,
  spanHasKind,
  spanHasName,
  spanHasParentId,
  spanHasStatus,
} from './utils/spanTypes';

// Re-export this for backwards compatibility (this used to be a different implementation)
export { getDynamicSamplingContextFromSpan } from '@sentry/core';

export { isSentryRequestSpan } from './utils/isSentryRequest';

export { enhanceDscWithOpenTelemetryRootSpanName } from './utils/enhanceDscWithOpenTelemetryRootSpanName';
export { generateSpanContextForPropagationContext } from './utils/generateSpanContextForPropagationContext';

export { getActiveSpan } from './utils/getActiveSpan';
export { startSpan, startSpanManual, startInactiveSpan, withActiveSpan, continueTrace } from './trace';

export { suppressTracing } from './utils/suppressTracing';

// eslint-disable-next-line deprecation/deprecation
export { getCurrentHubShim } from '@sentry/core';
export { setupEventContextTrace } from './setupEventContextTrace';

export { setOpenTelemetryContextAsyncContextStrategy } from './asyncContextStrategy';
export { wrapContextManagerClass } from './contextManager';
export { SentryPropagator, getPropagationContextFromSpan } from './propagator';
export { SentrySpanProcessor } from './spanProcessor';
export {
  SentrySampler,
  wrapSamplingDecision,
} from './sampler';

export { openTelemetrySetupCheck } from './utils/setupCheck';

export { addOpenTelemetryInstrumentation } from './instrumentation';

// Legacy
export { getClient } from '@sentry/core';
