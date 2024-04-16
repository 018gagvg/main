import { Scope, getCurrentScope, withActiveSpan } from '@sentry/core';
import type { PropagationContext } from '@sentry/types';
import { GLOBAL_OBJ, logger, uuid4 } from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';

const commonPropagationContextMap = new WeakMap<object, PropagationContext>();

/**
 * Takes a shared (garbage collectable) object between resources, e.g. a headers object shared between Next.js server components and returns a common propagation context.
 *
 * @param commonObject The shared object.
 * @param propagationContext The propagation context that should be shared between all the resources if no propagation context was registered yet.
 * @returns the shared propagation context.
 */
export function commonObjectToPropagationContext(
  commonObject: unknown,
  propagationContext: PropagationContext,
): PropagationContext {
  if (typeof commonObject === 'object' && commonObject) {
    const memoPropagationContext = commonPropagationContextMap.get(commonObject);
    if (memoPropagationContext) {
      return memoPropagationContext;
    } else {
      commonPropagationContextMap.set(commonObject, propagationContext);
      return propagationContext;
    }
  } else {
    return propagationContext;
  }
}

const commonIsolationScopeMap = new WeakMap<object, Scope>();

/**
 * Takes a shared (garbage collectable) object between resources, e.g. a headers object shared between Next.js server components and returns a common propagation context.
 *
 * @param commonObject The shared object.
 * @param isolationScope The isolationScope that should be shared between all the resources if no isolation scope was created yet.
 * @returns the shared isolation scope.
 */
export function commonObjectToIsolationScope(commonObject: unknown): Scope {
  if (typeof commonObject === 'object' && commonObject) {
    const memoIsolationScope = commonIsolationScopeMap.get(commonObject);
    if (memoIsolationScope) {
      return memoIsolationScope;
    } else {
      const newIsolationScope = new Scope();
      commonIsolationScopeMap.set(commonObject, newIsolationScope);
      return newIsolationScope;
    }
  } else {
    return new Scope();
  }
}

interface AsyncLocalStorage<T> {
  getStore(): T | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run<R, TArgs extends any[]>(store: T, callback: (...args: TArgs) => R, ...args: TArgs): R;
}

let nextjsEscapedAsyncStorage: AsyncLocalStorage<true>;

/**
 * TODO
 */
export function escapeNextjsTracing<T>(cb: () => T): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  const MaybeGlobalAsyncLocalStorage = (GLOBAL_OBJ as any).AsyncLocalStorage;

  if (!MaybeGlobalAsyncLocalStorage) {
    DEBUG_BUILD &&
      logger.warn(
        "Tried to register AsyncLocalStorage async context strategy in a runtime that doesn't support AsyncLocalStorage.",
      );
    return cb();
  }

  if (!nextjsEscapedAsyncStorage) {
    nextjsEscapedAsyncStorage = new MaybeGlobalAsyncLocalStorage();
  }

  if (nextjsEscapedAsyncStorage.getStore()) {
    return cb();
  } else {
    return withActiveSpan(null, () => {
      getCurrentScope().setPropagationContext({
        traceId: uuid4(),
        spanId: uuid4().substring(16),
      });
      return cb();
    });
  }
}
