export {
  Breadcrumb,
  Request,
  SdkInfo,
  SentryEvent,
  SentryException,
  SentryResponse,
  Severity,
  StackFrame,
  Stacktrace,
  Status,
  Thread,
  User,
} from '@sentry/types';

export {
  addBreadcrumb,
  captureMessage,
  captureException,
  captureEvent,
  configureScope,
} from '@sentry/minimal';

export { getHubFromCarrier, getDefaultHub, Hub, Scope } from '@sentry/hub';

export { BrowserBackend, BrowserOptions } from './backend';
export { BrowserClient } from './client';
export { init } from './sdk';

import * as Integrations from './integrations';
import * as Transports from './transports';

export { Integrations, Transports };

export const defaultIntegrations = [
  new Integrations.Breadcrumbs(),
  new Integrations.FunctionToString(),
  new Integrations.OnError(),
  new Integrations.OnUnhandledRejection(),
  new Integrations.TryCatch(),
];
