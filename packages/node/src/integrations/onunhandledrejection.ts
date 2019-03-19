import { getCurrentHub, Scope } from '@sentry/core';
import { Integration } from '@sentry/types';

/** Global Promise Rejection handler */
export class OnUnhandledRejection implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = OnUnhandledRejection.id;
  /**
   * @inheritDoc
   */
  public static id: string = 'OnUnhandledRejection';

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    global.process.on('unhandledRejection', this.sendUnhandledPromise.bind(this));
  }

  /**
   * Send an exception with reason
   * @param reason string
   * @param promise promise
   */
  public sendUnhandledPromise(reason: any, promise: any): void {
    const hub = getCurrentHub();

    if (!hub.getIntegration(OnUnhandledRejection)) {
      return;
    }

    const context = (promise.domain && promise.domain.sentryContext) || {};

    hub.withScope((scope: Scope) => {
      scope.setExtra('unhandledPromiseRejection', true);

      // Preserve backwards compatibility with raven-node for now
      if (context.user) {
        scope.setUser(context.user);
      }
      if (context.tags) {
        scope.setTags(context.tags);
      }
      if (context.extra) {
        scope.setExtras(context.extra);
      }

      hub.captureException(reason, { originalException: promise });
    });
  }
}
