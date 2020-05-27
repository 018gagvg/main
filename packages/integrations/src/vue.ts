import { EventProcessor, Hub, Integration, IntegrationClass, Span } from '@sentry/types';
import { basename, getGlobalObject, logger, timestampWithMs } from '@sentry/utils';

/**
 * Used to extract Tracing integration from the current client,
 * without the need to import `Tracing` itself from the @sentry/apm package.
 */
const TRACING_GETTER = ({
  id: 'Tracing',
} as any) as IntegrationClass<Integration>;

/** Global Vue object limited to the methods/attributes we require */
interface VueInstance {
  config?: {
    errorHandler?(error: Error, vm?: ViewModel, info?: string): void; // tslint:disable-line:completed-docs
  };
  mixin(hooks: { [key: string]: () => void }): void; // tslint:disable-line:completed-docs
  util: {
    warn(...input: any): void; // tslint:disable-line:completed-docs
  };
}

/** Representation of Vue component internals */
interface ViewModel {
  [key: string]: any;
  $root: object;
  $options: {
    [key: string]: any;
    name?: string;
    propsData?: { [key: string]: any };
    _componentTag?: string;
    __file?: string;
    $_sentryPerfHook?: boolean;
  };
  $once(hook: string, cb: () => void): void; // tslint:disable-line:completed-docs
}

// tslint:enable:completed-docs

/** Vue Integration configuration */
interface IntegrationOptions {
  /** Vue instance to be used inside the integration */
  Vue: VueInstance;

  /**
   * When set to `false`, Sentry will suppress reporting of all props data
   * from your Vue components for privacy concerns.
   */
  attachProps: boolean;
  /**
   * When set to `true`, original Vue's `logError` will be called as well.
   * https://github.com/vuejs/vue/blob/c2b1cfe9ccd08835f2d99f6ce60f67b4de55187f/src/core/util/error.js#L38-L48
   */
  logErrors: boolean;

  /**
   * When set to `false`, disables tracking of components lifecycle performance.
   * By default, it tracks only when `Tracing` integration is also enabled.
   */
  tracing: boolean;

  /** {@link TracingOptions} */
  tracingOptions: TracingOptions;
}

/** Vue specific configuration for Tracing Integration  */
interface TracingOptions {
  /**
   * Decides whether to track components by hooking into its lifecycle methods.
   * Can be either set to `boolean` to enable/disable tracking for all of them.
   * Or to an array of specific component names (case-sensitive).
   */
  trackComponents: boolean | string[];
  /** How long to wait until the tracked root activity is marked as finished and sent of to Sentry */
  timeout: number;
  /**
   * List of hooks to keep track of during component lifecycle.
   * Available hooks: https://vuejs.org/v2/api/#Options-Lifecycle-Hooks
   */
  hooks: Hook[];
}

/** Optional metadata attached to Sentry Event */
interface Metadata {
  [key: string]: any;
  componentName?: string;
  propsData?: { [key: string]: any };
  lifecycleHook?: string;
}

// https://vuejs.org/v2/api/#Options-Lifecycle-Hooks
type Hook =
  | 'activated'
  | 'beforeCreate'
  | 'beforeDestroy'
  | 'beforeMount'
  | 'beforeUpdate'
  | 'created'
  | 'deactivated'
  | 'destroyed'
  | 'mounted'
  | 'updated';

type Operation = 'activate' | 'create' | 'destroy' | 'mount' | 'update';

// Mappings from lifecycle hook to corresponding operation,
// used to track already started measurements.
const OPERATIONS: { [key in Hook]: Operation } = {
  activated: 'activate',
  beforeCreate: 'create',
  beforeDestroy: 'destroy',
  beforeMount: 'mount',
  beforeUpdate: 'update',
  created: 'create',
  deactivated: 'activate',
  destroyed: 'destroy',
  mounted: 'mount',
  updated: 'update',
};

const COMPONENT_NAME_REGEXP = /(?:^|[-_/])(\w)/g;
const ROOT_COMPONENT_NAME = 'root';
const ANONYMOUS_COMPONENT_NAME = 'anonymous component';

/** JSDoc */
export class Vue implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Vue.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'Vue';

  private readonly _options: IntegrationOptions;

  /**
   * Cache holding already processed component names
   */
  private readonly _componentsCache: { [key: string]: string } = {};
  private _rootSpan?: Span;
  private _rootSpanTimer?: ReturnType<typeof setTimeout>;
  private _tracingActivity?: number;

  /**
   * @inheritDoc
   */
  public constructor(options: Partial<IntegrationOptions>) {
    this._options = {
      Vue: getGlobalObject<any>().Vue, // tslint:disable-line:no-unsafe-any
      attachProps: true,
      logErrors: false,
      tracing: true,
      ...options,
      tracingOptions: {
        hooks: ['beforeMount', 'mounted', 'beforeUpdate', 'updated'],
        timeout: 2000,
        trackComponents: false,
        ...options.tracingOptions,
      },
    };
  }

  /**
   * Extract component name from the ViewModel
   */
  private _getComponentName(vm: ViewModel): string {
    // Such level of granularity is most likely not necessary, but better safe than sorry. — Kamil
    if (!vm) {
      return ANONYMOUS_COMPONENT_NAME;
    }

    if (vm.$root === vm) {
      return ROOT_COMPONENT_NAME;
    }

    if (!vm.$options) {
      return ANONYMOUS_COMPONENT_NAME;
    }

    if (vm.$options.name) {
      return vm.$options.name;
    }

    if (vm.$options._componentTag) {
      return vm.$options._componentTag;
    }

    // injected by vue-loader
    if (vm.$options.__file) {
      const unifiedFile = vm.$options.__file.replace(/^[a-zA-Z]:/, '').replace(/\\/g, '/');
      const filename = basename(unifiedFile, '.vue');
      return (
        this._componentsCache[filename] ||
        (this._componentsCache[filename] = filename.replace(COMPONENT_NAME_REGEXP, (_, c: string) =>
          c ? c.toUpperCase() : '',
        ))
      );
    }

    return ANONYMOUS_COMPONENT_NAME;
  }

  /** Keep it as attribute function, to keep correct `this` binding inside the hooks callbacks  */
  private readonly _applyTracingHooks = (vm: ViewModel, getCurrentHub: () => Hub) => {
    // Don't attach twice, just in case
    if (vm.$options.$_sentryPerfHook) {
      return;
    }
    vm.$options.$_sentryPerfHook = true;

    const name = this._getComponentName(vm);
    const rootMount = name === ROOT_COMPONENT_NAME;
    const spans: { [key: string]: Span } = {};

    // Render hook starts after once event is emitted,
    // but it ends before the second event of the same type.
    //
    // Because of this, we start measuring inside the first event,
    // but finish it before it triggers, to skip the event emitter timing itself.
    const rootHandler = (hook: Hook) => {
      const now = timestampWithMs();

      // On the first handler call (before), it'll be undefined, as `$once` will add it in the future.
      // However, on the second call (after), it'll be already in place.
      if (this._rootSpan) {
        this._finishRootSpan(now, getCurrentHub);
      } else {
        vm.$once(`hook:${hook}`, () => {
          // Create an activity on the first event call. There'll be no second call, as rootSpan will be in place,
          // thus new event handler won't be attached.

          // We do this whole dance with `TRACING_GETTER` to prevent `@sentry/apm` from becoming a peerDependency.
          // We also need to ask for the `.constructor`, as `pushActivity` and `popActivity` are static, not instance methods.
          const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);
          if (tracingIntegration) {
            // tslint:disable-next-line:no-unsafe-any
            this._tracingActivity = (tracingIntegration as any).constructor.pushActivity('Vue Application Render');
            // tslint:disable-next-line:no-unsafe-any
            const transaction = (tracingIntegration as any).constructor.getTransaction();
            if (transaction) {
              // tslint:disable-next-line:no-unsafe-any
              this._rootSpan = transaction.startChild({
                description: 'Application Render',
                op: 'Vue',
              });
            }
          }
        });
      }
    };

    const childHandler = (hook: Hook) => {
      // Skip components that we don't want to track to minimize the noise and give a more granular control to the user
      const shouldTrack = Array.isArray(this._options.tracingOptions.trackComponents)
        ? this._options.tracingOptions.trackComponents.includes(name)
        : this._options.tracingOptions.trackComponents;

      if (!this._rootSpan || !shouldTrack) {
        return;
      }

      const now = timestampWithMs();
      const op = OPERATIONS[hook];
      const span = spans[op];

      // On the first handler call (before), it'll be undefined, as `$once` will add it in the future.
      // However, on the second call (after), it'll be already in place.
      if (span) {
        span.finish();
        this._finishRootSpan(now, getCurrentHub);
      } else {
        vm.$once(`hook:${hook}`, () => {
          if (this._rootSpan) {
            spans[op] = this._rootSpan.startChild({
              description: `Vue <${name}>`,
              op,
            });
          }
        });
      }
    };

    // Each compomnent has it's own scope, so all activities are only related to one of them
    this._options.tracingOptions.hooks.forEach(hook => {
      const handler = rootMount ? rootHandler.bind(this, hook) : childHandler.bind(this, hook);
      const currentValue = vm.$options[hook];

      if (Array.isArray(currentValue)) {
        vm.$options[hook] = [handler, ...currentValue];
      } else if (typeof currentValue === 'function') {
        vm.$options[hook] = [handler, currentValue];
      } else {
        vm.$options[hook] = [handler];
      }
    });
  };

  /** Finish top-level span and activity with a debounce configured using `timeout` option */
  private _finishRootSpan(timestamp: number, getCurrentHub: () => Hub): void {
    if (this._rootSpanTimer) {
      clearTimeout(this._rootSpanTimer);
    }

    this._rootSpanTimer = setTimeout(() => {
      if (this._tracingActivity) {
        // We do this whole dance with `TRACING_GETTER` to prevent `@sentry/apm` from becoming a peerDependency.
        // We also need to ask for the `.constructor`, as `pushActivity` and `popActivity` are static, not instance methods.
        const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);
        if (tracingIntegration) {
          // tslint:disable-next-line:no-unsafe-any
          (tracingIntegration as any).constructor.popActivity(this._tracingActivity);
          if (this._rootSpan) {
            this._rootSpan.finish(timestamp);
          }
        }
      }
    }, this._options.tracingOptions.timeout);
  }

  /** Inject configured tracing hooks into Vue's component lifecycles */
  private _startTracing(getCurrentHub: () => Hub): void {
    const applyTracingHooks = this._applyTracingHooks;

    this._options.Vue.mixin({
      beforeCreate(this: ViewModel): void {
        if (getCurrentHub().getIntegration(TRACING_GETTER)) {
          // `this` points to currently rendered component
          applyTracingHooks(this, getCurrentHub);
        } else {
          logger.error('Vue integration has tracing enabled, but Tracing integration is not configured');
        }
      },
    });
  }

  /** Inject Sentry's handler into owns Vue's error handler  */
  private _attachErrorHandler(getCurrentHub: () => Hub): void {
    if (!this._options.Vue.config) {
      logger.error('Vue instance is missing required `config` attribute');
      return;
    }

    const currentErrorHandler = this._options.Vue.config.errorHandler; // tslint:disable-line:no-unbound-method

    this._options.Vue.config.errorHandler = (error: Error, vm?: ViewModel, info?: string): void => {
      const metadata: Metadata = {};

      if (vm) {
        try {
          metadata.componentName = this._getComponentName(vm);

          if (this._options.attachProps) {
            metadata.propsData = vm.$options.propsData;
          }
        } catch (_oO) {
          logger.warn('Unable to extract metadata from Vue component.');
        }
      }

      if (info) {
        metadata.lifecycleHook = info;
      }

      if (getCurrentHub().getIntegration(Vue)) {
        // Capture exception in the next event loop, to make sure that all breadcrumbs are recorded in time.
        setTimeout(() => {
          getCurrentHub().withScope(scope => {
            scope.setContext('vue', metadata);
            getCurrentHub().captureException(error);
          });
        });
      }

      if (typeof currentErrorHandler === 'function') {
        currentErrorHandler.call(this._options.Vue, error, vm, info);
      }

      if (this._options.logErrors) {
        this._options.Vue.util.warn(`Error in ${info}: "${error.toString()}"`, vm);
        console.error(error); // tslint:disable-line:no-console
      }
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!this._options.Vue) {
      logger.error('Vue integration is missing a Vue instance');
      return;
    }

    this._attachErrorHandler(getCurrentHub);

    if (this._options.tracing) {
      this._startTracing(getCurrentHub);
    }
  }
}
