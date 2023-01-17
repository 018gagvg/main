import replace from '@rollup/plugin-replace';

import { makeBaseBundleConfig, makeBundleConfigVariants } from '../../rollup/index.js';

import pkg from './package.json';

const builds = [];

['es5', 'es6'].forEach(jsVersion => {
  const baseBundleConfig = makeBaseBundleConfig({
    bundleType: 'standalone',
    entrypoints: ['src/index.bundle.ts'],
    jsVersion,
    licenseTitle: '@sentry/tracing & @sentry/browser',
    outputFileBase: () => `bundles/bundle.tracing${jsVersion === 'es5' ? '.es5' : ''}`,
  });

  builds.push(...makeBundleConfigVariants(baseBundleConfig));
});

// Full bundle incl. replay only avaialable for es6
const replayBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.replay.ts'],
  jsVersion: 'es6',
  licenseTitle: '@sentry/tracing & @sentry/browser & @sentry/replay',
  outputFileBase: () => 'bundles/bundle.tracing.replay',
  includeReplay: true,
  packageSpecificConfig: {
    plugins: [
      replace({
        preventAssignment: true,
        values: {
          __SENTRY_REPLAY_VERSION__: JSON.stringify(pkg.version),
        },
      }),
    ],
  },
});

builds.push(...makeBundleConfigVariants(replayBaseBundleConfig));

export default builds;
