import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { convertIntegrationFnToClass, defineIntegration } from '@sentry/core';
import type { Event, Integration, IntegrationClass, IntegrationFn } from '@sentry/types';

let moduleCache: { [key: string]: string };

const INTEGRATION_NAME = 'Modules';

/** Extract information about paths */
function getPaths(): string[] {
  try {
    return require.cache ? Object.keys(require.cache as Record<string, unknown>) : [];
  } catch (e) {
    return [];
  }
}

/** Extract information about package.json modules */
function collectModules(): {
  [name: string]: string;
} {
  const mainPaths = (require.main && require.main.paths) || [];
  const paths = getPaths();
  const infos: {
    [name: string]: string;
  } = {};
  const seen: {
    [path: string]: boolean;
  } = {};

  paths.forEach(path => {
    let dir = path;

    /** Traverse directories upward in the search of package.json file */
    const updir = (): void | (() => void) => {
      const orig = dir;
      dir = dirname(orig);

      if (!dir || orig === dir || seen[orig]) {
        return undefined;
      }
      if (mainPaths.indexOf(dir) < 0) {
        return updir();
      }

      const pkgfile = join(orig, 'package.json');
      seen[orig] = true;

      if (!existsSync(pkgfile)) {
        return updir();
      }

      try {
        const info = JSON.parse(readFileSync(pkgfile, 'utf8')) as {
          name: string;
          version: string;
        };
        infos[info.name] = info.version;
      } catch (_oO) {
        // no-empty
      }
    };

    updir();
  });

  return infos;
}

/** Fetches the list of modules and the versions loaded by the entry file for your node.js app. */
function _getModules(): { [key: string]: string } {
  if (!moduleCache) {
    moduleCache = collectModules();
  }
  return moduleCache;
}

const _modulesIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    // TODO v8: Remove this
    setupOnce() {}, // eslint-disable-line @typescript-eslint/no-empty-function
    processEvent(event) {
      event.modules = {
        ...event.modules,
        ..._getModules(),
      };

      return event;
    },
  };
}) satisfies IntegrationFn;

export const modulesIntegration = defineIntegration(_modulesIntegration);

/**
 * Add node modules / packages to the event.
 * @deprecated Use `modulesIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const Modules = convertIntegrationFnToClass(INTEGRATION_NAME, modulesIntegration) as IntegrationClass<
  Integration & { processEvent: (event: Event) => Event }
>;

// eslint-disable-next-line deprecation/deprecation
export type Modules = typeof Modules;
