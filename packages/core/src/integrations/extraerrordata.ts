import { addGlobalEventProcessor, getCurrentHub } from '@sentry/hub';
import { Event, EventHint, ExtendedError, Integration } from '@sentry/types';
import { isError, isPlainObject } from '@sentry/utils/is';
import { logger } from '@sentry/utils/logger';
import { safeNormalize } from '@sentry/utils/object';

/** Patch toString calls to return proper name for wrapped functions */
export class ExtraErrorData implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = ExtraErrorData.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'ExtraErrorData';

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor((event: Event, hint?: EventHint) => {
      const self = getCurrentHub().getIntegration(ExtraErrorData);
      if (!self) {
        return event;
      }
      return self.enhanceEventWithErrorData(event, hint);
    });
  }

  /**
   * Attaches extracted information from the Error object to extra field in the Event
   */
  public enhanceEventWithErrorData(event: Event, hint?: EventHint): Event {
    if (!hint || !hint.originalException || !isError(hint.originalException)) {
      return event;
    }

    const errorData = this.extractErrorData(hint.originalException);

    if (errorData) {
      let extra = {
        ...event.extra,
      };

      const normalizedErrorData = safeNormalize(errorData);
      if (isPlainObject(normalizedErrorData)) {
        extra = {
          ...event.extra,
          ...normalizedErrorData,
        };
      }

      return {
        ...event,
        extra,
      };
    }

    return event;
  }

  /**
   * Extract extra information from the Error object
   */
  private extractErrorData(error: ExtendedError): { [key: string]: unknown } | null {
    let result = null;
    // We are trying to enhance already existing event, so no harm done if it won't succeed
    try {
      const nativeKeys = ['name', 'message', 'stack', 'line', 'column', 'fileName', 'lineNumber', 'columnNumber'];
      const name = error.name || error.constructor.name;
      const errorKeys = Object.getOwnPropertyNames(error).filter(key => nativeKeys.indexOf(key) === -1);

      if (errorKeys.length) {
        const extraErrorInfo: { [key: string]: unknown } = {};
        for (const key of errorKeys) {
          let value = error[key];
          if (isError(value)) {
            value = (value as Error).name || (value as Error).constructor.name;
          }
          extraErrorInfo[key] = value;
        }
        result = {
          [name]: extraErrorInfo,
        };
      }
    } catch (oO) {
      logger.error('Unable to extract extra data from the Error object:', oO);
    }

    return result;
  }
}
