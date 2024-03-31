import type { ComponentType } from 'preact';
import type { Attachment } from '../attachment';
import type { Integration } from '../integration';
import type { TransportMakeRequestResponse } from '../transport';
import type {
  FeedbackCallbacks,
  FeedbackGeneralConfiguration,
  FeedbackTextConfiguration,
  FeedbackThemeConfiguration,
} from './config';
import type { FeedbackTheme } from './theme';

export type { FeedbackFormData } from './form';

export type { FeedbackEvent, UserFeedback } from './sendFeedback';

export { FeedbackTheme };
export interface FeedbackThemes {
  themeDark: FeedbackTheme;
  themeLight: FeedbackTheme;
}

/**
 * The integration's internal `options` member where every value should be set
 */
export interface FeedbackInternalOptions
  extends FeedbackGeneralConfiguration,
    FeedbackThemeConfiguration,
    FeedbackTextConfiguration,
    FeedbackCallbacks {}

/**
 * Partial configuration that overrides default configuration values
 *
 * This is the config that gets passed into the integration constructor
 */
export interface OptionalFeedbackConfiguration
  extends Omit<Partial<FeedbackInternalOptions>, 'themeLight' | 'themeDark'> {
  themeLight?: Partial<FeedbackTheme>;
  themeDark?: Partial<FeedbackTheme>;
}

/**
 * Partial configuration that overrides default configuration values
 *
 * This is the config that gets passed into the integration constructor
 */
export type OverrideFeedbackConfiguration = Omit<Partial<FeedbackInternalOptions>, 'themeLight' | 'themeDark'>;

interface SendFeedbackParams {
  message: string;
  name?: string;
  email?: string;
  attachments?: Attachment[];
  url?: string;
  source?: string;
}

interface SendFeedbackOptions {
  /**
   * Should include replay with the feedback?
   */
  includeReplay?: boolean;
}

export type SendFeedback = (
  params: SendFeedbackParams,
  options?: SendFeedbackOptions,
) => Promise<TransportMakeRequestResponse>;

export type FeedbackCreateInputElement = (h: any, dialog: Dialog) => ScreenshotInput;

export interface Dialog {
  /**
   * The HTMLElement that is containing all the form content
   */
  el: HTMLElement;

  /**
   * Insert the Dialog into the Shadow DOM.
   *
   * The Dialog starts in the `closed` state where no inner HTML is rendered.
   */
  appendToDom: () => void;

  /**
   * Remove the dialog from the Shadow DOM
   */
  removeFromDom: () => void;

  /**
   * Open/Show the dialog & form inside it
   */
  open: () => void;

  /**
   * Close/Hide the dialog & form inside it
   */
  close: () => void;
}

export interface ScreenshotInput {
  /**
   * The preact component
   */
  input: ComponentType<{ onError: (error: Error) => void }>;

  /**
   * The image/screenshot bytes
   */
  value: () => Promise<Attachment | undefined>;
}

export interface FeedbackScreenshotIntegration extends Integration {
  createInput: FeedbackCreateInputElement;
}
