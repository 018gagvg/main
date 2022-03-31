module.exports = [
  {
    name: '@sentry/browser - ES5 CDN Bundle (gzipped + minified)',
    path: 'packages/browser/build/bundles/bundle.min.js',
    gzip: true,
    limit: '100 KB',
  },
  {
    name: '@sentry/browser - ES5 CDN Bundle (minified)',
    path: 'packages/browser/build/bundles/bundle.min.js',
    gzip: false,
    limit: '120 KB',
  },
  {
    name: '@sentry/browser - ES6 CDN Bundle (gzipped + minified)',
    path: 'packages/browser/build/bundles/bundle.es6.min.js',
    gzip: true,
    limit: '100 KB',
  },
  {
    name: '@sentry/browser - ES6 CDN Bundle (minified)',
    path: 'packages/browser/build/bundles/bundle.es6.min.js',
    gzip: false,
    limit: '120 KB',
  },
  {
    name: '@sentry/browser - Webpack (gzipped + minified)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init }',
    gzip: true,
    limit: '100 KB',
  },
  {
    name: '@sentry/browser - Webpack (minified)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init }',
    gzip: false,
    limit: '100 KB',
  },
  {
    name: '@sentry/react - Webpack (gzipped + minified)',
    path: 'packages/react/esm/index.js',
    import: '{ init }',
    gzip: true,
    limit: '100 KB',
  },
  {
    name: '@sentry/nextjs Client - Webpack (gzipped + minified)',
    path: 'packages/nextjs/esm/index.client.js',
    import: '{ init }',
    gzip: true,
    limit: '100 KB',
  },
  {
    name: '@sentry/browser + @sentry/tracing - ES5 CDN Bundle (gzipped + minified)',
    path: 'packages/tracing/build/bundle.tracing.min.js',
    gzip: true,
    limit: '100 KB',
  },
  {
    name: '@sentry/browser + @sentry/tracing - ES6 CDN Bundle (gzipped + minified)',
    path: 'packages/tracing/build/bundle.tracing.es6.min.js',
    gzip: true,
    limit: '100 KB',
  },
];
