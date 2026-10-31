import type { AppConfig } from '@church/app-config';
import type { ChurchRecipient } from '../domain/contracts/application/church-notifications';
import type {
  INotifier,
  NotificationTemplate,
  SinkRegistration,
} from '../domain/contracts/application/notifier';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type {
  EmailPayload,
  EmailSender,
} from '../domain/contracts/infrastructure/email-sender';
import type { NotificationRepository } from '../domain/contracts/infrastructure/notification.repository';
import type { OutboxRepository } from '../domain/contracts/infrastructure/outbox.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type {
  NotificationDeliveryData,
  NotificationDeliveryDataByKind,
  NotificationPayload,
  NotificationRequestKind,
  TransferDigestDeliveryFacts,
} from '../domain/notification-kinds';
import { recipientLocale } from '../domain/services/recipient-locale';
import {
  EmailNotificationSink,
  type EmailRecipientAddress,
} from './email-notification-sink';
import { InboxNotificationSink } from './inbox-notification-sink';
import { Notifier, registerSink } from './notifier';

/** The Notifier with the Church's recipient, kinds and delivery facts fixed. */
export type ChurchNotifier = INotifier<
  ChurchRecipient,
  NotificationRequestKind,
  NotificationDeliveryData
>;

/** Each kind's template sees that kind's own delivery facts. */
type TemplatesByKind<TAddress, TContent> = {
  [K in NotificationRequestKind]?: NotificationTemplate<
    NotificationDeliveryDataByKind[K],
    TAddress,
    TContent
  >;
};

/** The drainer resolves `data` from the row's own kind, so each template only
 * ever receives its kind's facts. */
function byKind<TAddress, TContent>(
  templates: TemplatesByKind<TAddress, TContent>,
): SinkRegistration<
  ChurchRecipient,
  NotificationRequestKind,
  NotificationDeliveryData,
  TAddress,
  TContent
>['templates'] {
  return templates as SinkRegistration<
    ChurchRecipient,
    NotificationRequestKind,
    NotificationDeliveryData,
    TAddress,
    TContent
  >['templates'];
}

interface TransferDigestEmailInput {
  kind: 'transfer.ministry-digest' | 'transfer.leaderless-ministry';
  data: TransferDigestDeliveryFacts;
  address: EmailRecipientAddress;
}

/** One private email per recipient: never a shared recipient list. */
function transferDigestEmail({
  kind,
  data,
  address,
}: TransferDigestEmailInput): EmailPayload {
  return {
    kind,
    to: [address.email],
    ministryName: data.ministryName,
    volunteerName: data.volunteerName,
    withdrawnAssignments: data.withdrawnAssignments,
  };
}

export interface BuildChurchNotifierInput {
  config: AppConfig;
  churchRepository: ChurchRepository;
  notificationRepository: NotificationRepository;
  outboxRepository: OutboxRepository;
  emailSender: EmailSender;
  unitOfWork: UnitOfWork;
}

/**
 * Registers the email and inbox sinks once. Each lookup searches only within
 * the recipient's Church, so a non-member gets nothing on either channel.
 */
export function buildChurchNotifier({
  config,
  churchRepository,
  notificationRepository,
  outboxRepository,
  emailSender,
  unitOfWork,
}: BuildChurchNotifierInput): ChurchNotifier {
  const email = registerSink<
    ChurchRecipient,
    NotificationRequestKind,
    NotificationDeliveryData,
    EmailRecipientAddress,
    EmailPayload
  >({
    name: 'email',
    enabled: config.notifications.email.enabled,
    lookup: async ({ to }) => {
      const address = await churchRepository.findMemberEmail({
        id: to.churchId,
        userId: to.userId,
      });
      return address === null
        ? null
        : {
            email: address,
            locale: recipientLocale({
              recipient: to,
              defaultLocale: config.defaultLocale,
            }),
          };
    },
    templates: byKind<EmailRecipientAddress, EmailPayload>({
      // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
      ministry_invitation: ({ data, address }) => ({
        kind: 'invitation.ministry',
        to: address.email,
        churchName: data.churchName,
        ministryName: data.ministryName,
        ministryAccessLevel: data.ministryAccessLevel,
        roleNames: data.roleNames,
        expiresAt: data.expiresAt,
        churchTimezone: data.churchTimezone,
        redemptionUrl: data.redemptionUrl,
      }),
      // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
      transfer_ministry_digest: ({ data, address }) =>
        transferDigestEmail({
          kind: 'transfer.ministry-digest',
          data,
          address,
        }),
      // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
      transfer_leaderless_ministry: ({ data, address }) =>
        transferDigestEmail({
          kind: 'transfer.leaderless-ministry',
          data,
          address,
        }),
    }),
    sink: new EmailNotificationSink({
      emailSender,
      outboxRepository,
      unitOfWork,
      emailIdempotencyRetentionMs: config.outbox.emailIdempotencyRetentionMs,
    }),
  });

  const inbox = registerSink<
    ChurchRecipient,
    NotificationRequestKind,
    NotificationDeliveryData,
    ChurchRecipient,
    NotificationPayload
  >({
    name: 'inbox',
    enabled: config.notifications.inbox.enabled,
    lookup: async ({ to }) =>
      (await churchRepository.findMemberEmail({
        id: to.churchId,
        userId: to.userId,
      })) === null
        ? null
        : to,
    // Transfer kinds are email-only: no template, so the inbox skips them.
    templates: byKind<ChurchRecipient, NotificationPayload>({
      // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
      ministry_invitation: ({ data }) => ({
        kind: 'ministry_invitation',
        data: {
          ministryInvitationId: data.ministryInvitationId,
          ministryId: data.ministryId,
          ministryName: data.ministryName,
        },
      }),
    }),
    sink: new InboxNotificationSink({ notificationRepository }),
  });

  return new Notifier({ sinks: [email, inbox] });
}
