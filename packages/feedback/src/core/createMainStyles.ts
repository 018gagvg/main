import { DOCUMENT } from '../constants';
import type { FeedbackInternalOptions } from '../types';

function getThemedCssVariables(theme: FeedbackInternalOptions['themeLight']): string {
  return `
  --background: ${theme.background};
  --background-hover: ${theme.backgroundHover};
  --foreground: ${theme.foreground};
  --error: ${theme.error};
  --success: ${theme.success};
  --border: ${theme.border};
  --border-radius: ${theme.borderRadius};
  --box-shadow: ${theme.boxShadow};

  --submit-background: ${theme.submitBackground};
  --submit-background-hover: ${theme.submitBackgroundHover};
  --submit-border: ${theme.submitBorder};
  --submit-outline-focus: ${theme.submitOutlineFocus};
  --submit-foreground: ${theme.submitForeground};
  --submit-foreground-hover: ${theme.submitForegroundHover};

  --cancel-background: ${theme.cancelBackground};
  --cancel-background-hover: ${theme.cancelBackgroundHover};
  --cancel-border: ${theme.cancelBorder};
  --cancel-outline-focus: ${theme.cancelOutlineFocus};
  --cancel-foreground: ${theme.cancelForeground};
  --cancel-foreground-hover: ${theme.cancelForegroundHover};

  --input-background: ${theme.inputBackground};
  --input-foreground: ${theme.inputForeground};
  --input-border: ${theme.inputBorder};
  --input-outline-focus: ${theme.inputOutlineFocus};

  --form-border-radius: ${theme.formBorderRadius};
  --form-content-border-radius: ${theme.formContentBorderRadius};
  `;
}

/**
 * Creates <style> element for widget actor (button that opens the dialog)
 */
export function createMainStyles(
  colorScheme: 'system' | 'dark' | 'light',
  themes: Pick<FeedbackInternalOptions, 'themeLight' | 'themeDark'>,
): HTMLStyleElement {
  const style = DOCUMENT.createElement('style');
  style.textContent = `
:host {
  --z-index: ${themes.themeLight.zIndex};
  --font-family: ${themes.themeLight.fontFamily};
  --font-size: ${themes.themeLight.fontSize};

  font-family: var(--font-family);
  font-size: var(--font-size);

  --page-margin: 16px;
  --actor-inset: auto var(--page-margin) var(--page-margin) auto;

  --dialog-inset: auto var(--page-margin) var(--page-margin) auto;
  --dialog-padding: 24px;

  .brand-link path {
    fill: ${colorScheme === 'dark' ? '#fff' : '#362d59'};
  }
  @media (prefers-color-scheme: dark)
  {
    path: {
      fill: '#fff';
    }
  }

  ${getThemedCssVariables(colorScheme === 'dark' ? themes.themeDark : themes.themeLight)}
}

${
  colorScheme === 'system'
    ? `
@media (prefers-color-scheme: dark) {
  :host {
    ${getThemedCssVariables(themes.themeDark)}
  }
}`
    : ''
}
}`;

  return style;
}
