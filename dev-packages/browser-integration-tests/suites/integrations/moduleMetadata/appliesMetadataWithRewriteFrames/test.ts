import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest(
  'should provide module_metadata on stack frames in beforeSend even though an event processor (rewriteFramesIntegration) modified the filename',
  async ({ getLocalTestUrl, page }) => {
    // moduleMetadataIntegration is not included in any CDN bundles
    if (process.env.PW_BUNDLE?.startsWith('bundle')) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const errorEvent = await getFirstSentryEnvelopeRequest<Event>(page, url);
    expect(errorEvent?.extra?.['module_metadata_entries']).toEqual([{ foo: 'baz' }]);
  },
);
