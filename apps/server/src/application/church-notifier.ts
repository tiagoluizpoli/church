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
import {
  type AvailabilityDeliveryFacts,
  availabilityNotificationDataSchema,
  ministryInvitationNotificationDataSchema,
  type NotificationDeliveryData,
  type NotificationDeliveryDataByKind,
  type NotificationPayload,
  type NotificationRequestKind,
  schedulePublishedNotificationDataSchema,
  type TransferDigestDeliveryFacts,
} from '../domain/notification-kinds';
import { recipientLocale } from '../domain/services/recipient-locale';
import {
  EmailNotificationSink,
  type EmailRecipientAddress,
} from './email-notification-sink';
import { InboxNotificationSink } from './inbox-notification-sink';
import { Notifier, registerSink } from './notifier';

/** The registered sinks; a row's `channelOutcomes` is keyed by these. */
export const CHURCH_SINK_NAMES = { email: 'email', inbox: 'inbox' } as const;

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
  return { kind, to: [address.email], ...data };
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
    name: CHURCH_SINK_NAMES.email,
    enabled: config.notifications.email.enabled,
    lookup: async ({ to }) => {
      const contact = await churchRepository.findMemberContact({
        id: to.churchId,
        userId: to.userId,
      });
      return contact === null
        ? null
        : {
            email: contact.email,
            firstName: contact.name.trim().split(/\s+/)[0] ?? '',
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
        recipientFirstName: address.firstName,
        ministryName: data.ministryName,
        ministryAccessLevel: data.ministryAccessLevel,
        roleNames: data.roleNames,
        expiresAt: data.expiresAt,
        churchTimezone: data.churchTimezone,
        redemptionUrl: data.redemptionUrl,
      }),
      // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
      availability_opened: ({ data, address }) => ({
        kind: 'availability.opened',
        to: address.email,
        recipientFirstName: address.firstName,
        ...availabilityEmailFacts(data),
      }),
      // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
      availability_reminder: ({ data, address }) => ({
        kind: 'availability.reminder',
        to: address.email,
        recipientFirstName: address.firstName,
        ...availabilityEmailFacts(data),
      }),
      // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
      schedule_published: ({ data, address }) => ({
        kind: 'schedule.published',
        to: address.email,
        churchName: data.churchName,
        recipientFirstName: address.firstName,
        ministryName: data.ministryName,
        eventTitle: data.eventTitle,
        eventStart: data.eventStart,
        churchTimezone: data.churchTimezone,
        shifts: data.shifts,
        actionUrl: data.actionUrl,
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
    name: CHURCH_SINK_NAMES.inbox,
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
        data: ministryInvitationNotificationDataSchema.parse(data),
      }),
      // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
      availability_opened: ({ data }) => ({
        kind: 'availability_opened',
        data: availabilityNotificationDataSchema.parse(data),
      }),
      // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
      availability_reminder: ({ data }) => ({
        kind: 'availability_reminder',
        data: availabilityNotificationDataSchema.parse(data),
      }),
      // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
      schedule_published: ({ data }) => ({
        kind: 'schedule_published',
        data: schedulePublishedNotificationDataSchema.parse(data),
      }),
    }),
    sink: new InboxNotificationSink({ notificationRepository }),
  });

  return new Notifier({ sinks: [email, inbox] });
}

/** The facts both availability emails render. */
function availabilityEmailFacts(data: AvailabilityDeliveryFacts) {
  return {
    churchName: data.churchName,
    ministryName: data.ministryName,
    cycleName: data.cycleName,
    cycleStartDate: data.cycleStartDate,
    cycleEndDate: data.cycleEndDate,
    actionUrl: data.actionUrl,
  };
}
