/**
 * Rollup config docs: https://rollupjs.org/guide/en/#big-list-of-options
 */

import { builtinModules } from 'module';
import * as path from 'path';

import deepMerge from 'deepmerge';

import {
  makeConstToVarPlugin,
  makeNodeResolvePlugin,
  makeRemoveESLintCommentsPlugin,
  makeSucrasePlugin,
} from './plugins/index.js';

const packageDotJSON = require(path.resolve(process.cwd(), './package.json'));

export function makeBaseNPMConfig(options = {}) {
  const {
    entrypoints = ['src/index.ts'],
    esModuleInterop = false,
    externals: packageSpecificExternals = [],
    hasBundles = false,
  } = options;

  const nodeResolvePlugin = makeNodeResolvePlugin();
  const sucrasePlugin = makeSucrasePlugin();
  const constToVarPlugin = makeConstToVarPlugin();
  const removeESLintCommentsPlugin = makeRemoveESLintCommentsPlugin();

  // return {
  const config = {
    input: entrypoints,

    output: {
      // an appropriately-named directory will be added to this base value when we specify either a cjs or esm build
      dir: hasBundles ? 'build/npm' : 'build',

      sourcemap: true,

      // output individual files rather than one big bundle
      // preserveModules: true,

      // any wrappers or helper functions generated by rollup can use ES6 features
      // generatedCode: 'es2015',

      // don't add `"use strict"` to the top of cjs files
      strict: false,

      // do TS-3.8-style exports
      //     exports.dogs = are.great
      // rather than TS-3.9-style exports
      //     Object.defineProperty(exports, 'dogs', {
      //       enumerable: true,
      //       get: () => are.great,
      //     });
      externalLiveBindings: false,

      // Equivalent to `esModuleInterop` in tsconfig.
      // Controls whether rollup emits helpers to handle special cases where turning
      //     `import * as dogs from 'dogs'`
      // into
      //     `const dogs = require('dogs')`
      // doesn't work.
      //
      // `auto` -> emit helpers
      // `esModule` -> don't emit helpers
      interop: esModuleInterop ? 'auto' : 'esModule',
    },

    plugins: [nodeResolvePlugin, sucrasePlugin, constToVarPlugin, removeESLintCommentsPlugin],

    // don't include imported modules from outside the package in the final output
    external: [
      ...builtinModules,
      ...Object.keys(packageDotJSON.dependencies || {}),
      ...Object.keys(packageDotJSON.devDependencies || {}),
      ...Object.keys(packageDotJSON.peerDependencies || {}),
      ...packageSpecificExternals,
    ],

    // TODO `'smallest'` will get rid of `isDebugBuild()` by evaluating it and inlining the result and then treeshaking
    // from there. The current setting (false) prevents this, in case we want to leave it there for users to use in
    // their own bundling. That said, we don't yet know for sure that that works, so come back to this.
    // treeshake: 'smallest',
    treeshake: false,
  };

  // temporary hack for testing sucrase bundles before we switch over
  if (!process.version.startsWith('v8')) {
    console.log('Doing normal preserveModules');
    config.output.preserveModules = true;
  } else {
    console.log('Doing node 8 preserveModules');
    config.preserveModules = true;
  }

  return config;
}

export function makeNPMConfigVariants(baseConfig) {
  const variantSpecificConfigs = [
    { output: { format: 'cjs', dir: path.join(baseConfig.output.dir, 'cjs') } },
    { output: { format: 'esm', dir: path.join(baseConfig.output.dir, 'esm') } },
  ];

  return variantSpecificConfigs.map(variant => deepMerge(baseConfig, variant));
}
