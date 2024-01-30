import * as SentryAstro from '@sentry/astro';
import * as SentryBun from '@sentry/bun';
import * as SentryNextJs from '@sentry/nextjs';
import * as SentryNode from '@sentry/node';
import * as SentryRemix from '@sentry/remix';
import * as SentryServerless from '@sentry/serverless';
import * as SentrySvelteKit from '@sentry/sveltekit';

/* List of exports that are safe to ignore / we don't require in any depending package */
const NODE_EXPORTS_IGNORE = [
  'default',
  // Probably generated by transpilation, no need to require it
  '__esModule',
  // this function was deprecates almost immediately after it was introduced
  // due to a name change (startSpan). No need to re-export it IMHO.
  'startActiveSpan',
  // this was never meant for external use (and documented as such)
  'trace',
  // These Node exports were only made for type definition fixes (see #10339)
  'Undici',
  'Http',
  'DebugSession',
  'AnrIntegrationOptions',
  'LocalVariablesIntegrationOptions',
];

type Dependent = {
  package: string;
  exports: string[];
  ignoreExports?: string[];
  skip?: boolean;
};

const DEPENDENTS: Dependent[] = [
  {
    package: '@sentry/astro',
    exports: Object.keys(SentryAstro),
  },
  {
    package: '@sentry/bun',
    exports: Object.keys(SentryBun),
    ignoreExports: [
      // not supported in bun:
      'Handlers',
      'NodeClient',
      'hapiErrorPlugin',
      'makeNodeTransport',
    ],
  },
  {
    package: '@sentry/nextjs',
    // Next.js doesn't require explicit exports, so we can just merge top level and `default` exports:
    // @ts-expect-error: `default` is not in the type definition but it's defined
    exports: Object.keys({ ...SentryNextJs, ...SentryNextJs.default }),
  },
  {
    package: '@sentry/remix',
    exports: Object.keys(SentryRemix),
  },
  {
    package: '@sentry/serverless',
    exports: Object.keys(SentryServerless),
    ignoreExports: [
      // Deprecated, no need to add this now to serverless
      'extractTraceparentData',
      'getModuleFromFilename',
      'enableAnrDetection',
      // TODO: Should these be exported from serverless?
      'cron',
      'runWithAsyncContext',
      'hapiErrorPlugin',
    ],
    // TODO: Fix exports in serverless
    skip: true,
  },
  {
    package: '@sentry/sveltekit',
    exports: Object.keys(SentrySvelteKit),
  },
];

/* Sanitized list of node exports */
const nodeExports = Object.keys(SentryNode).filter(e => !NODE_EXPORTS_IGNORE.includes(e));

console.log('🔎 Checking for consistent exports of @sentry/node exports in depending packages');

const missingExports: Record<string, string[]> = {};
const dependentsToCheck = DEPENDENTS.filter(d => !d.skip);

for (const nodeExport of nodeExports) {
  for (const dependent of dependentsToCheck) {
    if (dependent.ignoreExports?.includes(nodeExport)) {
      continue;
    }
    if (!dependent.exports.includes(nodeExport)) {
      missingExports[dependent.package] = [...(missingExports[dependent.package] ?? []), nodeExport];
    }
  }
}

if (Object.keys(missingExports).length > 0) {
  console.error('\n❌ Found missing exports from @sentry/node in the following packages:\n');
  console.log(JSON.stringify(missingExports, null, 2));
  process.exit(1);
}

console.log('✅ All good :)');
