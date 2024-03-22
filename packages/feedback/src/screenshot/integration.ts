import { defineIntegration } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';
import { createInput } from './createInput';

interface PublicFeedbackScreenshotIntegration {
  createInput: typeof createInput;
}

const INTEGRATION_NAME = 'FeedbackScreenshot';

export type IFeedbackScreenshotIntegration = Integration & PublicFeedbackScreenshotIntegration;

export const _feedbackScreenshotIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    createInput,
  };
}) satisfies IntegrationFn;

export const feedbackScreenshotIntegration = defineIntegration(_feedbackScreenshotIntegration);
