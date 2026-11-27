import { registerChurchSinks } from '../../application/church-notifier';
import { EmailNotificationSink } from '../../application/email-notification-sink';
import { InboxNotificationSink } from '../../application/inbox-notification-sink';
import { Notifier } from '../../application/notifier';
import type {
  BuildChurchNotifierInput,
  ChurchNotifier,
} from '../../domain/contracts/application/church-notifier';

/** The Church's Notifier over its email and inbox sinks. */
export function buildChurchNotifier({
  config,
  churchRepository,
  notificationRepository,
  outboxRepository,
  emailSender,
  unitOfWork,
}: BuildChurchNotifierInput): ChurchNotifier {
  const { emailIdempotencyRetentionMs } = config.outbox;
  const emailSink = new EmailNotificationSink({
    emailSender,
    outboxRepository,
    unitOfWork,
    emailIdempotencyRetentionMs,
  });
  const inboxSink = new InboxNotificationSink({ notificationRepository });
  const sinks = registerChurchSinks({
    config,
    churchRepository,
    emailSink,
    inboxSink,
  });
  return new Notifier({ sinks });
}
