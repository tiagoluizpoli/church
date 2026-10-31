import type { AppConfig } from '@church/app-config';
import type { ChurchRecipient } from '../domain/contracts/application/church-notifications';
import type { INotifier } from '../domain/contracts/application/notifier';
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
  type MinistryInvitationDeliveryFacts,
  ministryInvitationNotificationDataSchema,
  type NotificationDeliveryData,
  type NotificationKind,
  type NotificationPayload,
  type SchedulePublishedDeliveryFacts,
  schedulePublishedNotificationDataSchema,
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
  NotificationKind,
  NotificationDeliveryData
>;

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
    NotificationKind,
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
    templates: {
      // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
      ministry_invitation: ({ data: facts, address }) => {
        const data = facts as MinistryInvitationDeliveryFacts;
        return {
          kind: 'invitation.ministry',
          to: address.email,
          churchName: data.churchName,
          ministryName: data.ministryName,
          ministryAccessLevel: data.ministryAccessLevel,
          roleNames: data.roleNames,
          expiresAt: data.expiresAt,
          churchTimezone: data.churchTimezone,
          redemptionUrl: data.redemptionUrl,
        };
      },
      // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
      availability_opened: ({ data, address }) => ({
        kind: 'availability.opened',
        to: address.email,
        ...availabilityEmailFacts(data),
      }),
      // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
      availability_reminder: ({ data, address }) => ({
        kind: 'availability.reminder',
        to: address.email,
        ...availabilityEmailFacts(data),
      }),
      // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
      schedule_published: ({ data, address }) => {
        const facts = data as SchedulePublishedDeliveryFacts;
        return {
          kind: 'schedule.published',
          to: address.email,
          ministryName: facts.ministryName,
          eventTitle: facts.eventTitle,
          eventStart: facts.eventStart,
          churchTimezone: facts.churchTimezone,
          shifts: facts.shifts,
          actionUrl: facts.actionUrl,
        };
      },
    },
    sink: new EmailNotificationSink({
      emailSender,
      outboxRepository,
      unitOfWork,
      emailIdempotencyRetentionMs: config.outbox.emailIdempotencyRetentionMs,
    }),
  });

  const inbox = registerSink<
    ChurchRecipient,
    NotificationKind,
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
    templates: {
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
    },
    sink: new InboxNotificationSink({ notificationRepository }),
  });

  return new Notifier({ sinks: [email, inbox] });
}

/** The facts every availability email renders; the drainer resolved them for this kind. */
function availabilityEmailFacts(data: NotificationDeliveryData) {
  const facts = data as AvailabilityDeliveryFacts;
  return {
    ministryName: facts.ministryName,
    cycleName: facts.cycleName,
    cycleStartDate: facts.cycleStartDate,
    cycleEndDate: facts.cycleEndDate,
    actionUrl: facts.actionUrl,
  };
}
