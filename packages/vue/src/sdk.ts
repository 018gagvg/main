import type { BrowserClient } from '@sentry/browser';
import { init as browserInit, SDK_VERSION } from '@sentry/browser';
import { getCurrentHub, hasTracingEnabled } from '@sentry/core';
import { arrayify, GLOBAL_OBJ, logger } from '@sentry/utils';

import { DEFAULT_HOOKS } from './constants';
import { attachErrorHandler } from './errorhandler';
import { createTracingMixins } from './tracing';
import type { Options, TracingOptions, Vue } from './types';

const globalWithVue = GLOBAL_OBJ as typeof GLOBAL_OBJ & { Vue: Vue };

const DEFAULT_CONFIG: Options = {
  Vue: globalWithVue.Vue,
  attachProps: true,
  logErrors: true,
  hooks: DEFAULT_HOOKS,
  timeout: 2000,
  trackComponents: false,
  _metadata: {
    sdk: {
      name: 'sentry.javascript.vue',
      packages: [
        {
          name: 'npm:@sentry/vue',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    },
  },
};

/**
 * Inits the Vue SDK
 */
export function init(
  config: Partial<Omit<Options, 'tracingOptions'> & { tracingOptions: Partial<TracingOptions> }> = {},
): void {
  const options = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  browserInit(options);

  if (!options.Vue && !options.app && options.app !== false) {
    // eslint-disable-next-line no-console
    console.warn(
      `[@sentry/vue]: Misconfigured SDK. Vue specific errors will not be captured.
Update your \`Sentry.init\` call with an appropriate config option:
\`app\` (Application Instance - Vue 3) or \`Vue\` (Vue Constructor - Vue 2).`,
    );
    return;
  }

  if (options.app) {
    const apps = arrayify(options.app);
    apps.forEach(app => vueInit(app, options));
  } else if (options.Vue) {
    vueInit(options.Vue, options);
  }
}

/**
 * Initialize Vue-specific error monitoring for a given Vue app.
 */
export function initVueApp(app: Vue, client?: BrowserClient): void {
  const _client = client || getCurrentHub().getClient();
  const options = _client && (_client.getOptions() as Options);

  if (options) {
    vueInit(app, options);
  } else if (__DEBUG_BUILD__) {
    logger.warn(
      '[@sentry/vue]: Cannot initialize as no Client available. Make sure to call `Sentry.init` before calling `initVueApp()`.',
    );
  }
}

const vueInit = (app: Vue, options: Options): void => {
  // Check app is not mounted yet - should be mounted _after_ init()!
  // This is _somewhat_ private, but in the case that this doesn't exist we simply ignore it
  // See: https://github.com/vuejs/core/blob/eb2a83283caa9de0a45881d860a3cbd9d0bdd279/packages/runtime-core/src/component.ts#L394
  const appWithInstance = app as Vue & {
    _instance?: {
      isMounted?: boolean;
    };
  };

  const isMounted = appWithInstance._instance && appWithInstance._instance.isMounted;
  if (isMounted === true) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/vue]: Misconfigured SDK. Vue app is already mounted. Make sure to call `app.mount()` after `Sentry.init()`.',
    );
  }

  attachErrorHandler(app, options);

  if (hasTracingEnabled(options)) {
    app.mixin(
      createTracingMixins({
        ...options,
        ...options.tracingOptions,
      }),
    );
  }
};
