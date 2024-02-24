// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type { VNode } from 'preact';
import { useMemo } from 'preact/hooks';
import type { FeedbackInternalOptions } from '../../types';
import type { Props as LogoProps } from './SentryLogo';
import { SentryLogo } from './SentryLogo';

export interface Props extends LogoProps {
  formTitle: FeedbackInternalOptions['formTitle'];
  showBranding: FeedbackInternalOptions['showBranding'];
}

export function DialogHeader({ colorScheme, formTitle, showBranding }: Props): VNode {
  const logoHtml = useMemo(() => {
    const logo = SentryLogo({ colorScheme });
    return { __html: logo.outerHTML };
  }, [colorScheme]);

  return (
    <h2 class="dialog__header">
      {formTitle}
      {showBranding ? (
        <a
          class="brand-link"
          target="_blank"
          href="https://sentry.io/welcome/"
          title="Powered by Sentry"
          rel="noopener noreferrer"
          dangerouslySetInnerHTML={logoHtml}
        />
      ) : null}
    </h2>
  );
}
