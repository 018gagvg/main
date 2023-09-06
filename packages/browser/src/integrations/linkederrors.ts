import type { Client, Integration } from '@sentry/types';
import { applyAggregateErrorsToEvent } from '@sentry/utils';

import { exceptionFromError } from '../eventbuilder';

const DEFAULT_KEY = 'cause';
const DEFAULT_LIMIT = 5;

interface LinkedErrorsOptions {
  key: string;
  limit: number;
}

/** Adds SDK info to an event. */
export class LinkedErrors implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'LinkedErrors';

  /**
   * @inheritDoc
   */
  public readonly name: string;

  /**
   * @inheritDoc
   */
  private readonly _key: LinkedErrorsOptions['key'];

  /**
   * @inheritDoc
   */
  private readonly _limit: LinkedErrorsOptions['limit'];

  /**
   * @inheritDoc
   */
  public constructor(options: Partial<LinkedErrorsOptions> = {}) {
    this.name = LinkedErrors.id;
    this._key = options.key || DEFAULT_KEY;
    this._limit = options.limit || DEFAULT_LIMIT;
  }

  /** @inheritdoc */
  public setupOnce(): void {
    // noop
  }

  /**
   * @inheritDoc
   */
  public setup(client: Client): void {
    if (!client.on) {
      return;
    }

    client.on('preprocessEvent', (event, hint) => {
      const options = client.getOptions();

      applyAggregateErrorsToEvent(
        exceptionFromError,
        options.stackParser,
        options.maxValueLength,
        this._key,
        this._limit,
        event,
        hint,
      );
    });
  }
}
