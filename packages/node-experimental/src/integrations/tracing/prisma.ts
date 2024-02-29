import { registerInstrumentations } from '@opentelemetry/instrumentation';
// This is a cjs module, so have to import like this
import * as prismaInstrumentation from '@prisma/instrumentation';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

const _prismaIntegration = (() => {
  return {
    name: 'Prisma',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          // does not have a hook to adjust spans & add origin
          new prismaInstrumentation.PrismaInstrumentation({}),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Prisma integration
 *
 * Capture tracing data for prisma.
 * Note: This requieres to set:
 * previewFeatures = ["tracing"]
 * For the prisma client.
 * See https://www.prisma.io/docs/concepts/components/prisma-client/opentelemetry-tracing for more details.
 */
export const prismaIntegration = defineIntegration(_prismaIntegration);
