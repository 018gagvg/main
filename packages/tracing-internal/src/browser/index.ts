export * from '../exports';

export type { RequestInstrumentationOptions } from './request';

export {
  BROWSER_TRACING_INTEGRATION_ID,
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './browserTracingIntegration';

export { instrumentOutgoingRequests, defaultRequestInstrumentationOptions } from './request';

export {
  addPerformanceInstrumentationHandler,
  addClsInstrumentationHandler,
  addFidInstrumentationHandler,
  addLcpInstrumentationHandler,
} from './instrument';
