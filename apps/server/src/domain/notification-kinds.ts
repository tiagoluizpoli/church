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
 * One Volunteer Transfer digest for one affected Ministry: the retired source
 * profile and the transfer's correlation id, which re-derives the withdrawn
 * Assignments from `assignment_audit` at delivery.
 */
const transferDigestRequestDataSchema = z.object({
  ministryId: z.uuid(),
  volunteerId: z.uuid(),
  transferCorrelationId: z.string().min(1),
});

/**
 * What Church code enqueues per kind: identifiers only, validated before the
 * outbox row is written. Display facts are resolved at delivery and frozen by
 * each channel's first delivery (inbox row, prepared email). Every inbox kind
 * is enqueueable; the transfer kinds are email-only, so the inbox has no
 * template for them and stores no row.
 */
export const notificationRequestDataSchemas = {
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  ministry_invitation: z.object({ ministryInvitationId: z.uuid() }),
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
  transfer_ministry_digest: TransferDigestDeliveryFacts;
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  transfer_leaderless_ministry: TransferDigestDeliveryFacts;
}

export type NotificationDeliveryData =
  NotificationDeliveryDataByKind[NotificationRequestKind];
