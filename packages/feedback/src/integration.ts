import type { Integration } from '@sentry/types';
import { isBrowser } from '@sentry/utils';
import { logger } from '@sentry/utils';

import {
  ACTOR_LABEL,
  CANCEL_BUTTON_LABEL,
  DEFAULT_THEME,
  EMAIL_LABEL,
  EMAIL_PLACEHOLDER,
  FORM_TITLE,
  MESSAGE_LABEL,
  MESSAGE_PLACEHOLDER,
  NAME_LABEL,
  NAME_PLACEHOLDER,
  SUBMIT_BUTTON_LABEL,
  SUCCESS_MESSAGE_TEXT,
} from './constants';
import type { FeedbackConfigurationWithDefaults, Widget } from './types';
import { createActorStyles } from './widget/Actor.css';
import { createShadowHost } from './widget/createShadowHost';
import { createWidget } from './widget/createWidget';

<<<<<<< HEAD
interface FeedbackConfiguration extends Partial<Omit<FeedbackConfigurationWithDefaults, 'theme'>> {
  theme?: {
    dark?: Partial<FeedbackTheme>;
    light?: Partial<FeedbackTheme>;
  };
}
=======
type ElectronProcess = { type?: string };

// Electron renderers with nodeIntegration enabled are detected as Node.js so we specifically test for them
function isElectronNodeRenderer(): boolean {
  return typeof process !== 'undefined' && (process as ElectronProcess).type === 'renderer';
}
/**
 * Returns true if we are in the browser.
 */
function isBrowser(): boolean {
  // eslint-disable-next-line no-restricted-globals
  return typeof window !== 'undefined' && (!isNodeEnv() || isElectronNodeRenderer());
}

type FeedbackConfiguration = Partial<FeedbackConfigurationWithDefaults>;
>>>>>>> 5fa9a4abb (ref: extract widget creation to function, allow handling of multiple widgets)

/**
 * Feedback integration. When added as an integration to the SDK, it will
 * inject a button in the bottom-right corner of the window that opens a
 * feedback modal when clicked.
 */
export class Feedback implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Feedback';

  /**
   * @inheritDoc
   */
  public name: string;

  /**
   * Feedback configuration options
   */
  public options: FeedbackConfigurationWithDefaults;

  /**
   * Reference to widget element that is created when autoInject is true
   */
  private _widget: Widget | null;

  /**
   * List of all widgets that are created from the integration
   */
  private _widgets: Set<Widget>;

  /**
   * Reference to the host element where widget is inserted
   */
  private _host: HTMLDivElement | null;

  /**
   * Refernce to Shadow DOM root
   */
  private _shadow: ShadowRoot | null;

  /**
   * Tracks if actor styles have ever been inserted into shadow DOM
   */
  private _hasInsertedActorStyles: boolean;

  public constructor({
    id = 'sentry-feedback',
    // attachTo = null,
    autoInject = true,
    showEmail = true,
    showName = true,
    useSentryUser = {
      email: 'email',
      name: 'username',
    },
    isAnonymous = false,
    isEmailRequired = false,
    isNameRequired = false,

    themeDark,
    themeLight,
    colorScheme = 'system',

    buttonLabel = ACTOR_LABEL,
    cancelButtonLabel = CANCEL_BUTTON_LABEL,
    submitButtonLabel = SUBMIT_BUTTON_LABEL,
    formTitle = FORM_TITLE,
    emailPlaceholder = EMAIL_PLACEHOLDER,
    emailLabel = EMAIL_LABEL,
    messagePlaceholder = MESSAGE_PLACEHOLDER,
    messageLabel = MESSAGE_LABEL,
    namePlaceholder = NAME_PLACEHOLDER,
    nameLabel = NAME_LABEL,
    successMessageText = SUCCESS_MESSAGE_TEXT,

    onActorClick,
    onDialogClose,
    onDialogOpen,
    onSubmitError,
    onSubmitSuccess,
  }: FeedbackConfiguration = {}) {
    // Initializations
    this.name = Feedback.id;

    // tsc fails if these are not initialized explicitly constructor, e.g. can't call `_initialize()`
    this._host = null;
    this._shadow = null;
    this._widget = null;
    this._widgets = new Set();
    this._hasInsertedActorStyles = false;

    this.options = {
      id,
      // attachTo,
      autoInject,
      isAnonymous,
      isEmailRequired,
      isNameRequired,
      showEmail,
      showName,
      useSentryUser,

      colorScheme,
      themeDark: Object.assign({}, DEFAULT_THEME.dark, themeDark),
      themeLight: Object.assign({}, DEFAULT_THEME.light, themeLight),

      buttonLabel,
      cancelButtonLabel,
      submitButtonLabel,
      formTitle,
      emailLabel,
      emailPlaceholder,
      messageLabel,
      messagePlaceholder,
      nameLabel,
      namePlaceholder,
      successMessageText,

      onActorClick,
      onDialogClose,
      onDialogOpen,
      onSubmitError,
      onSubmitSuccess,
    };
  }

  /**
   * Setup and initialize replay container
   */
  public setupOnce(): void {
    if (!isBrowser()) {
      return;
    }

    try {
      // TODO: This is only here for hot reloading
      if (this._host) {
        this.remove();
      }
      // eslint-disable-next-line no-restricted-globals
      const existingFeedback = document.querySelector(`#${this.options.id}`);
      if (existingFeedback) {
        existingFeedback.remove();
      }
      // TODO: End hotloading

      const { autoInject } = this.options;

      if (!autoInject) {
        // Nothing to do here
        return;
      }

      this._widget = this._createWidget(this.options);
    } catch (err) {
      // TODO: error handling
      logger.error(err);
    }
  }

  /**
   * Adds click listener to attached element to open a feedback dialog
   */
  public attachTo(el: Node | string, optionOverrides: Partial<FeedbackConfigurationWithDefaults>): Widget | null {
    try {
      const options = Object.assign({}, this.options, optionOverrides);

      return this._ensureShadowHost<Widget | null>(options, ([shadow]) => {
        const targetEl =
          // eslint-disable-next-line no-restricted-globals
          typeof el === 'string' ? document.querySelector(el) : typeof el.addEventListener === 'function' ? el : null;

        if (!targetEl) {
          logger.error('[Feedback] Unable to attach to target element');
          return null;
        }

        const widget = createWidget({ shadow, options, attachTo: targetEl });
        this._widgets.add(widget);
        return widget;
      });
    } catch (err) {
      logger.error(err);
      return null;
    }
  }

  /**
   * Creates a new widget. Accepts partial options to override any options passed to constructor.
   */
  public createWidget(optionOverrides: Partial<FeedbackConfigurationWithDefaults>): Widget | null {
    try {
      return this._createWidget(Object.assign({}, this.options, optionOverrides));
    } catch (err) {
      logger.error(err);
      return null;
    }
  }

  /**
   * Removes a single widget
   */
  public removeWidget(widget: Widget | null | undefined): boolean {
    if (!widget) {
      return false;
    }

    try {
      if (this._widgets.has(widget)) {
        widget.removeActor();
        widget.removeDialog();
        this._widgets.delete(widget);
        return true;
      }
    } catch (err) {
      logger.error(err);
    }
    return false;
  }

  /**
   * Removes the Feedback integration (including host, shadow DOM, and all widgets)
   */
  public remove(): void {
    if (this._host) {
      this._host.remove();
    }
    this._initialize();
  }

  /**
   * Initializes values of protected properties
   */
  protected _initialize(): void {
    this._host = null;
    this._shadow = null;
    this._widget = null;
    this._widgets = new Set();
    this._hasInsertedActorStyles = false;
  }

  /**
   * Creates a new widget, after ensuring shadow DOM exists
   */
  protected _createWidget(options: FeedbackConfigurationWithDefaults): Widget | null {
    return this._ensureShadowHost<Widget>(options, ([shadow]) => {
      const widget = createWidget({ shadow, options });

      if (!this._hasInsertedActorStyles && widget.actor) {
        // eslint-disable-next-line no-restricted-globals
        shadow.appendChild(createActorStyles(document));
        this._hasInsertedActorStyles = true;
      }

      this._widgets.add(widget);
      return widget;
    });
  }

  /**
   * Ensures that shadow DOM exists and is added to the DOM
   */
  protected _ensureShadowHost<T>(
    options: FeedbackConfigurationWithDefaults,
    cb: (createShadowHostResult: ReturnType<typeof createShadowHost>) => T,
  ): T | null {
    let needsAppendHost = false;

    // Don't create if it already exists
    if (!this._shadow && !this._host) {
      const [shadow, host] = createShadowHost({ options });
      this._shadow = shadow;
      this._host = host;
      needsAppendHost = true;
    }

    if (!this._shadow || !this._host) {
      logger.warn('[Feedback] Unable to create host element and/or shadow DOM');
      // This shouldn't happen
      return null;
    }

    const result = cb([this._shadow, this._host]);

    if (needsAppendHost) {
      // eslint-disable-next-line no-restricted-globals
      document.body.appendChild(this._host);
    }

    return result;
  }
}
