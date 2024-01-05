import { getCurrentScope } from '@sentry/browser';
import type { Span, Transaction } from '@sentry/types';
import { logger, timestampInSeconds } from '@sentry/utils';

import { DEFAULT_HOOKS } from './constants';
import { DEBUG_BUILD } from './debug-build';
import type { Hook, Operation, TracingOptions, ViewModel, Vue } from './types';
import { formatComponentName } from './vendor/components';

const VUE_OP = 'ui.vue';

type Mixins = Parameters<Vue['mixin']>[0];

interface VueSentry extends ViewModel {
  readonly $root: VueSentry;
  $_sentrySpans?: {
    [key: string]: Span | undefined;
  };
  $_sentryRootSpan?: Span;
  $_sentryRootSpanTimer?: ReturnType<typeof setTimeout>;
}

// Mappings from operation to corresponding lifecycle hook.
const HOOKS: { [key in Operation]: Hook[] } = {
  activate: ['activated', 'deactivated'],
  create: ['beforeCreate', 'created'],
  // Vue 3
  unmount: ['beforeUnmount', 'unmounted'],
  // Vue 2
  destroy: ['beforeDestroy', 'destroyed'],
  mount: ['beforeMount', 'mounted'],
  update: ['beforeUpdate', 'updated'],
};

/** Grabs active transaction off scope, if any */
export function getActiveTransaction(): Transaction | undefined {
  return getCurrentScope().getTransaction();
}

/** Finish top-level span and activity with a debounce configured using `timeout` option */
function finishRootSpan(vm: VueSentry, timestamp: number, timeout: number): void {
  if (vm.$_sentryRootSpanTimer) {
    clearTimeout(vm.$_sentryRootSpanTimer);
  }

  vm.$_sentryRootSpanTimer = setTimeout(() => {
    if (vm.$root && vm.$root.$_sentryRootSpan) {
      vm.$root.$_sentryRootSpan.end(timestamp);
      vm.$root.$_sentryRootSpan = undefined;
    }
  }, timeout);
}

export const createTracingMixins = (options: TracingOptions): Mixins => {
  const hooks = (options.hooks || [])
    .concat(DEFAULT_HOOKS)
    // Removing potential duplicates
    .filter((value, index, self) => self.indexOf(value) === index);

  const mixins: Mixins = {};

  for (const operation of hooks) {
    // Retrieve corresponding hooks from Vue lifecycle.
    // eg. mount => ['beforeMount', 'mounted']
    const internalHooks = HOOKS[operation];
    if (!internalHooks) {
      DEBUG_BUILD && logger.warn(`Unknown hook: ${operation}`);
      continue;
    }

    for (const internalHook of internalHooks) {
      mixins[internalHook] = function (this: VueSentry) {
        const isRoot = this.$root === this;

        if (isRoot) {
          const activeTransaction = getActiveTransaction();
          if (activeTransaction) {
            this.$_sentryRootSpan =
              this.$_sentryRootSpan ||
              // eslint-disable-next-line deprecation/deprecation
              activeTransaction.startChild({
                description: 'Application Render',
                op: `${VUE_OP}.render`,
                origin: 'auto.ui.vue',
              });
          }
        }

        // Skip components that we don't want to track to minimize the noise and give a more granular control to the user
        const name = formatComponentName(this, false);
        const shouldTrack = Array.isArray(options.trackComponents)
          ? options.trackComponents.indexOf(name) > -1
          : options.trackComponents;

        // We always want to track root component
        if (!isRoot && !shouldTrack) {
          return;
        }

        this.$_sentrySpans = this.$_sentrySpans || {};

        // Start a new span if current hook is a 'before' hook.
        // Otherwise, retrieve the current span and finish it.
        if (internalHook == internalHooks[0]) {
          const activeTransaction = (this.$root && this.$root.$_sentryRootSpan) || getActiveTransaction();
          if (activeTransaction) {
            // Cancel old span for this hook operation in case it didn't get cleaned up. We're not actually sure if it
            // will ever be the case that cleanup hooks re not called, but we had users report that spans didn't get
            // finished so we finish the span before starting a new one, just to be sure.
            const oldSpan = this.$_sentrySpans[operation];
            if (oldSpan && !oldSpan.endTimestamp) {
              oldSpan.end();
            }

            // eslint-disable-next-line deprecation/deprecation
            this.$_sentrySpans[operation] = activeTransaction.startChild({
              description: `Vue <${name}>`,
              op: `${VUE_OP}.${operation}`,
              origin: 'auto.ui.vue',
            });
          }
        } else {
          // The span should already be added via the first handler call (in the 'before' hook)
          const span = this.$_sentrySpans[operation];
          // The before hook did not start the tracking span, so the span was not added.
          // This is probably because it happened before there is an active transaction
          if (!span) return;
          span.end();

          finishRootSpan(this, timestampInSeconds(), options.timeout);
        }
      };
    }
  }

  return mixins;
};
