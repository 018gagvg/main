import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    disableConsoleIntercept: true,
    silent: false,
    setupFiles: './test/integration/instrument.server.cjs',
    include:
      process.env.USE_OTEL === '1' ? ['**/instrumentation-otel/*.test.ts'] : ['**/instrumentation-legacy/*.test.ts'],
  },
});
