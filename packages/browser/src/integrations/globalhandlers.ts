/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Event, EventHint, EventProcessor, Hub, Integration, Primitive, Severity } from '@sentry/types';
import {
  addExceptionMechanism,
  addInstrumentationHandler,
  getLocationHref,
  isErrorEvent,
  isPrimitive,
  isString,
  logger,
} from '@sentry/utils';

import { eventFromUnknownInput } from '../eventbuilder';
import { shouldIgnoreOnError } from '../helpers';

/** JSDoc */
interface GlobalHandlersIntegrations {
  onerror: boolean;
  onunhandledrejection: boolean;
}

/** Global handlers */
export class GlobalHandlers implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'GlobalHandlers';

  /**
   * @inheritDoc
   */
  public name: string = GlobalHandlers.id;

  /** JSDoc */
  private readonly _options: GlobalHandlersIntegrations;

  /** JSDoc */
  private _onErrorHandlerInstalled: boolean = false;

  /** JSDoc */
  private _onUnhandledRejectionHandlerInstalled: boolean = false;

  /** JSDoc */
  public constructor(options?: GlobalHandlersIntegrations) {
    this._options = {
      onerror: true,
      onunhandledrejection: true,
      ...options,
    };
  }
  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    Error.stackTraceLimit = 50;

    const hub = getCurrentHub();
    if (!hub.getIntegration(GlobalHandlers)) {
      return;
    }
    const client = hub.getClient();
    const attachStacktrace = client && client.getOptions().attachStacktrace;

    if (this._options.onerror || !this._onErrorHandlerInstalled) {
      globalHandlerLog('onerror');
      _installGlobalOnErrorHandler(hub, attachStacktrace);
      this._onErrorHandlerInstalled = true;
    }

    if (this._options.onunhandledrejection || !this._onUnhandledRejectionHandlerInstalled) {
      globalHandlerLog('onunhandledrejection');
      _installGlobalOnUnhandledRejectionHandler(hub, attachStacktrace);
      this._onUnhandledRejectionHandlerInstalled = true;
    }
  }
}

/** JSDoc */
function _installGlobalOnErrorHandler(hub: Hub, attachStacktrace: boolean | undefined): void {
  addInstrumentationHandler({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (data: { msg: any; url: any; line: any; column: any; error: any }) => {
      const error = data.error;
      const isFailedOwnDelivery = error && error.__sentry_own_request__ === true;

      if (shouldIgnoreOnError() || isFailedOwnDelivery) {
        return;
      }

      const event =
        error === undefined && isString(data.msg)
          ? _eventFromIncompleteOnError(data.msg, data.url, data.line, data.column)
          : _enhanceEventWithInitialFrame(
              eventFromUnknownInput(error || data.msg, undefined, {
                attachStacktrace,
                rejection: false,
              }),
              data.url,
              data.line,
              data.column,
            );

      addMechanismAndCapture(hub, error, event, 'onerror');
    },
    type: 'error',
  });
}

/** JSDoc */
function _installGlobalOnUnhandledRejectionHandler(hub: Hub, attachStacktrace: boolean | undefined): void {
  addInstrumentationHandler({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (e: any) => {
      let error = e;

      // dig the object of the rejection out of known event types
      try {
        // PromiseRejectionEvents store the object of the rejection under 'reason'
        // see https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
        if ('reason' in e) {
          error = e.reason;
        }
        // something, somewhere, (likely a browser extension) effectively casts PromiseRejectionEvents
        // to CustomEvents, moving the `promise` and `reason` attributes of the PRE into
        // the CustomEvent's `detail` attribute, since they're not part of CustomEvent's spec
        // see https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent and
        // https://github.com/getsentry/sentry-javascript/issues/2380
        else if ('detail' in e && 'reason' in e.detail) {
          error = e.detail.reason;
        }
      } catch (_oO) {
        // no-empty
      }

      const isFailedOwnDelivery = error && error.__sentry_own_request__ === true;
      if (shouldIgnoreOnError() || isFailedOwnDelivery) {
        return true;
      }

      const event = isPrimitive(error)
        ? _eventFromRejectionWithPrimitive(error)
        : eventFromUnknownInput(error, undefined, {
            attachStacktrace,
            rejection: true,
          });

      event.level = Severity.Error;

      addMechanismAndCapture(hub, error, event, 'onunhandledrejection');
      return;
    },
    type: 'unhandledrejection',
  });
}

/**
 * Create an event from a promise rejection where the `reason` is a primitive.
 *
 * @param reason: The `reason` property of the promise rejection
 * @returns An Event object with an appropriate `exception` value
 */
function _eventFromRejectionWithPrimitive(reason: Primitive): Event {
  return {
    exception: {
      values: [
        {
          type: 'UnhandledRejection',
          // String() is needed because the Primitive type includes symbols (which can't be automatically stringified)
          value: `Non-Error promise rejection captured with value: ${String(reason)}`,
        },
      ],
    },
  };
}

/**
 * This function creates a stack from an old, error-less onerror handler.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _eventFromIncompleteOnError(msg: any, url: any, line: any, column: any): Event {
  const ERROR_TYPES_RE = /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?(.*)$/i;

  // If 'message' is ErrorEvent, get real message from inside
  let message = isErrorEvent(msg) ? msg.message : msg;
  let name;

  const groups = message.match(ERROR_TYPES_RE);
  if (groups) {
    name = groups[1];
    message = groups[2];
  }

  const event = {
    exception: {
      values: [
        {
          type: name || 'Error',
          value: message,
        },
      ],
    },
  };

  return _enhanceEventWithInitialFrame(event, url, line, column);
}

/** JSDoc */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _enhanceEventWithInitialFrame(event: Event, url: any, line: any, column: any): Event {
  event.exception = event.exception || {};
  event.exception.values = event.exception.values || [];
  event.exception.values[0] = event.exception.values[0] || {};
  event.exception.values[0].stacktrace = event.exception.values[0].stacktrace || {};
  event.exception.values[0].stacktrace.frames = event.exception.values[0].stacktrace.frames || [];

  const colno = isNaN(parseInt(column, 10)) ? undefined : column;
  const lineno = isNaN(parseInt(line, 10)) ? undefined : line;
  const filename = isString(url) && url.length > 0 ? url : getLocationHref();

  if (event.exception.values[0].stacktrace.frames.length === 0) {
    event.exception.values[0].stacktrace.frames.push({
      colno,
      filename,
      function: '?',
      in_app: true,
      lineno,
    });
  }

  return event;
}

function globalHandlerLog(type: string): void {
  logger.log(`Global Handler attached: ${type}`);
}

function addMechanismAndCapture(hub: Hub, error: EventHint['originalException'], event: Event, type: string): void {
  addExceptionMechanism(event, {
    handled: false,
    type,
  });
  hub.captureEvent(event, {
    originalException: error,
  });
}
