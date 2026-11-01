import { calendarDaySchema, type Instant, instantSchema } from '@church/time';
import { z } from 'zod';
import { MinistryId, VolunteerId } from './branded-ids';
import type { MinistryAccessLevel } from './entities/ministry-membership';

/**
 * The typed kind/data map of member Notifications (ADR-0008). Data holds
 * identifiers for deep links plus display facts frozen at first delivery —
 * never finished text, so the UI renders words at read time in its locale.
 * Later Flow specs add their kind here together with its catalog messages.
 */
export const ministryInvitationNotificationDataSchema = z.object({
  ministryInvitationId: z.uuid(),
  ministryId: z.uuid(),
  ministryName: z.string(),
});

/** Availability opened (initial Ask) and the reminder share their facts. */
export const availabilityNotificationDataSchema = z.object({
  cycleId: z.uuid(),
  ministryId: z.uuid(),
  ministryName: z.string(),
  cycleName: z.string(),
  cycleStartDate: calendarDaySchema,
  cycleEndDate: calendarDaySchema,
});

/** One of the recipient's own Shifts in the published event. */
export const schedulePublishedShiftSchema = z.object({
  roleName: z.string(),
  startsAt: instantSchema,
});

export const schedulePublishedNotificationDataSchema = z.object({
  eventId: z.uuid(),
  cycleId: z.uuid(),
  ministryId: z.uuid(),
  ministryName: z.string(),
  eventTitle: z.string(),
  eventStart: instantSchema,
  eventEnd: instantSchema,
  /** The Church Timezone the Instants are read in. */
  churchTimezone: z.string(),
  shifts: z.array(schedulePublishedShiftSchema),
});

export const notificationKindDataSchemas = {
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  ministry_invitation: ministryInvitationNotificationDataSchema,
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  availability_opened: availabilityNotificationDataSchema,
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  availability_reminder: availabilityNotificationDataSchema,
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  schedule_published: schedulePublishedNotificationDataSchema,
} as const;

export const NOTIFICATION_KIND_OPTIONS = Object.keys(
  notificationKindDataSchemas,
) as [NotificationKind, ...NotificationKind[]];

export type NotificationKind = keyof typeof notificationKindDataSchemas;

export type NotificationDataOf<K extends NotificationKind> = z.infer<
  (typeof notificationKindDataSchemas)[K]
>;

/** A kind with its matching data, so `data` can never disagree with `kind`. */
export type NotificationPayload = {
  [K in NotificationKind]: { kind: K; data: NotificationDataOf<K> };
}[NotificationKind];

export function isNotificationKind(value: string): value is NotificationKind {
  return value in notificationKindDataSchemas;
}

/**
 * One Volunteer Transfer digest for one affected Ministry: the retired source
 * profile and the transfer's correlation id, which re-derives the withdrawn
 * Assignments from `assignment_audit` at delivery.
 */
const transferDigestRequestDataSchema = z.object({
  ministryId: z.uuid().transform((id) => MinistryId.from(id)),
  volunteerId: z.uuid().transform((id) => VolunteerId.from(id)),
  transferCorrelationId: z.string().min(1),
});

/**
 * What Church code enqueues per kind: identifiers only, validated before the
 * outbox row is written. Display facts are resolved at delivery and frozen by
 * each channel's first delivery (inbox row, prepared email). Every inbox kind
 * is enqueueable; the transfer kinds are email-only, so the inbox has no
 * template for them and stores no row.
 */
const availabilityRequestDataSchema = z.object({
  cycleId: z.uuid(),
  ministryId: z.uuid(),
});

export const notificationRequestDataSchemas = {
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  ministry_invitation: z.object({ ministryInvitationId: z.uuid() }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  availability_opened: availabilityRequestDataSchema,
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  availability_reminder: availabilityRequestDataSchema,
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  schedule_published: z.object({ participationId: z.uuid() }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  transfer_ministry_digest: transferDigestRequestDataSchema,
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  transfer_leaderless_ministry: transferDigestRequestDataSchema,
} as const satisfies Record<NotificationKind, z.ZodType> &
  Record<string, z.ZodType>;

/** Every kind Church code can enqueue: the inbox kinds plus email-only kinds. */
export type NotificationRequestKind =
  keyof typeof notificationRequestDataSchemas;

export type NotificationRequestDataOf<K extends NotificationRequestKind> =
  z.infer<(typeof notificationRequestDataSchemas)[K]>;

/** A kind with its enqueued data, as persisted on the outbox row. */
export type NotificationRequest = {
  [K in NotificationRequestKind]: {
    kind: K;
    data: NotificationRequestDataOf<K>;
  };
}[NotificationRequestKind];

/** Everything the ministry_invitation templates render, resolved at delivery. */
export interface MinistryInvitationDeliveryFacts {
  ministryInvitationId: string;
  ministryId: string;
  ministryName: string;
  churchName: string;
  churchTimezone: string;
  ministryAccessLevel: MinistryAccessLevel;
  roleNames: string[];
  expiresAt: Instant;
  redemptionUrl: string;
}

/** Delivery facts of the kinds whose inbox data is also the email's facts. */
export type AvailabilityDeliveryFacts =
  NotificationDataOf<'availability_opened'> & {
    churchName: string;
    actionUrl: string;
  };
export type SchedulePublishedDeliveryFacts =
  NotificationDataOf<'schedule_published'> & {
    churchName: string;
    actionUrl: string;
  };

/**
 * Everything both transfer email templates render, resolved at delivery.
 * Never names the destination Church.
 */
export interface TransferDigestDeliveryFacts {
  ministryName: string;
  volunteerName: string;
  withdrawnAssignments: {
    eventName: string;
    eventTimeBlockStart: Instant;
    roleName: string;
  }[];
}

/** Delivery facts by kind; later kinds add their entry here. */
export interface NotificationDeliveryDataByKind {
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  ministry_invitation: MinistryInvitationDeliveryFacts;
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  availability_opened: AvailabilityDeliveryFacts;
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  availability_reminder: AvailabilityDeliveryFacts;
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  schedule_published: SchedulePublishedDeliveryFacts;
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  transfer_ministry_digest: TransferDigestDeliveryFacts;
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  transfer_leaderless_ministry: TransferDigestDeliveryFacts;
}

export type NotificationDeliveryData =
  NotificationDeliveryDataByKind[NotificationRequestKind];
