import type { Instant } from '@church/time';
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

export const notificationKindDataSchemas = {
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  ministry_invitation: ministryInvitationNotificationDataSchema,
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
export const notificationRequestDataSchemas = {
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  ministry_invitation: z.object({ ministryInvitationId: z.uuid() }),
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

/** Delivery facts by kind; later kinds widen this union. */
export type NotificationDeliveryData = MinistryInvitationDeliveryFacts;
