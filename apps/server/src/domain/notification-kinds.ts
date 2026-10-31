import { calendarDaySchema, type Instant, instantSchema } from '@church/time';
import { z } from 'zod';
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
 * What Church code enqueues per kind: identifiers only, validated before the
 * outbox row is written. Display facts are resolved at delivery and frozen by
 * each channel's first delivery (inbox row, prepared email).
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
} as const satisfies Record<NotificationKind, z.ZodType>;

export type NotificationRequestDataOf<K extends NotificationKind> = z.infer<
  (typeof notificationRequestDataSchemas)[K]
>;

/** A kind with its enqueued data, as persisted on the outbox row. */
export type NotificationRequest = {
  [K in NotificationKind]: { kind: K; data: NotificationRequestDataOf<K> };
}[NotificationKind];

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
  NotificationDataOf<'availability_opened'> & { actionUrl: string };
export type SchedulePublishedDeliveryFacts =
  NotificationDataOf<'schedule_published'> & { actionUrl: string };

/**
 * Delivery facts by kind, discriminated so a template never sees another
 * kind's facts; later kinds widen this union.
 */
export type NotificationDeliveryData =
  | MinistryInvitationDeliveryFacts
  | AvailabilityDeliveryFacts
  | SchedulePublishedDeliveryFacts;
