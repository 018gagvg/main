import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import type { UserConfig } from 'vitest';

import baseConfig from '../../vite/vite.config';

export default {
  ...baseConfig,
  test: {
    // test exists, no idea why TS doesn't recognize it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(baseConfig as UserConfig & { test: any }).test,
    environment: 'jsdom',
    setupFiles: ['./test/vitest.setup.ts'],
    alias: [
      {
        find: '$app/stores',
        replacement: resolve(fileURLToPath(dirname(import.meta.url)), '/.empty.js'),
      },
    ],
  },
};
