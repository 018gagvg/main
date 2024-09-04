import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: [
      'src/index.client.ts',
      'src/index.server.ts',
      'src/client/index.ts',
      'src/server/index.ts',
      'src/solidrouter.ts',
      'src/solidrouter.client.ts',
      'src/solidrouter.server.ts',
      'src/client/solidrouter.ts',
      'src/server/solidrouter.ts',
    ],
    // prevent this internal code from ending up in our built package (this doesn't happen automatially because
    // the name doesn't match an SDK dependency)
    packageSpecificConfig: {
      external: ['solid-js/web', 'solid-js', '@sentry/solid', '@sentry/solid/solidrouter', '@sentry/vite-plugin'],
      output: {
        dynamicImportInCjs: true,
      },
    },
  }),
);
