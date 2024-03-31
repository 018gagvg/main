import type { ComponentType } from 'preact';
import type { Attachment } from '../attachment';
import type { Integration } from '../integration';

import type {
  FeedbackCallbacks,
  FeedbackGeneralConfiguration,
  FeedbackTextConfiguration,
  FeedbackThemeConfiguration,
} from './config';

export type { FeedbackFormData } from './form';

import type { FeedbackEvent, SendFeedback, UserFeedback } from './sendFeedback';
export type { FeedbackEvent, UserFeedback, SendFeedback };

/**
 * The integration's internal `options` member where every value should be set
 */
export interface FeedbackInternalOptions
  extends FeedbackGeneralConfiguration,
    FeedbackThemeConfiguration,
    FeedbackTextConfiguration,
    FeedbackCallbacks {}

export interface FeedbackDialog {
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

interface CreateDialogProps {
  options: FeedbackInternalOptions;
  screenshotIntegration: FeedbackScreenshotIntegration | undefined;
  sendFeedback: SendFeedback;
  shadow: ShadowRoot;
}

export type FeedbackCreateDialog = (props: CreateDialogProps) => FeedbackDialog;

export interface FeedbackModalIntegration extends Integration {
  createDialog: FeedbackCreateDialog;
}

export interface FeedbackScreenshotIntegration extends Integration {
  createInput: (
    h: any,
    dialog: FeedbackDialog,
  ) => {
    /**
     * The preact component
     */
    input: ComponentType<{ onError: (error: Error) => void }>;

    /**
     * The image/screenshot bytes
     */
    value: () => Promise<Attachment | undefined>;
  };
}
