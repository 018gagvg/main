import type { EventHint, FeedbackEvent, SendFeedbackParams } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';
import { getClient, getCurrentScope } from './currentScopes';
import { createAttachmentEnvelope } from './envelope';

/**
 * Send user feedback to Sentry.
 */
export function captureFeedback(
  feedbackParams: SendFeedbackParams,
  hint?: EventHint & { includeReplay?: boolean },
): string {
  const { message, name, email, url, source, attachments, associatedEventId } = feedbackParams;

  const client = getClient();
  const transport = client && client.getTransport();
  const dsn = client && client.getDsn();

  const feedbackEvent: FeedbackEvent = {
    contexts: {
      feedback: dropUndefinedKeys({
        contact_email: email,
        name,
        message,
        url,
        source,
        associated_event_id: associatedEventId,
      }),
    },
    type: 'feedback',
    level: 'info',
  };

  if (client) {
    client.emit('beforeSendFeedback', feedbackEvent, hint);
  }

  const eventId = getCurrentScope().captureEvent(feedbackEvent, hint);

  // For now, we have to send attachments manually in a separate envelope
  // Because we do not support attachments in the feedback envelope
  // Once the Sentry API properly supports this, we can get rid of this and send it through the event envelope
  if (client && transport && dsn && attachments && attachments.length) {
    // TODO: https://docs.sentry.io/platforms/javascript/enriching-events/attachments/
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    void transport.send(
      createAttachmentEnvelope(
        {
          ...feedbackEvent,
          event_id: eventId,
        },
        attachments,
        dsn,
        client.getOptions()._metadata,
        client.getOptions().tunnel,
      ),
    );
  }

  return eventId;
}
