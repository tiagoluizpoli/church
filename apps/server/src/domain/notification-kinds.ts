import { calendarDaySchema, type Instant, instantSchema } from '@church/time';
import { z } from 'zod';
import { MinistryId, VolunteerId } from './branded-ids';
import {
  MINISTRY_ACCESS_LEVEL_OPTIONS,
  type MinistryAccessLevel,
} from './entities/ministry-membership';

/** The offer facts N1 renders (Spec 15): who invited, as what, until when. */
const ministryInvitationOfferFactsSchema = z.object({
  churchName: z.string(),
  churchTimezone: z.string(),
  inviterName: z.string(),
  ministryAccessLevel: z.enum(MINISTRY_ACCESS_LEVEL_OPTIONS),
  roleNames: z.array(z.string()),
  expiresAt: instantSchema,
});

/**
 * The typed kind/data map of member Notifications (ADR-0008). Data holds
 * identifiers for deep links plus display facts frozen at first delivery —
 * never finished text, so the UI renders words at read time in its locale.
 * Later Flow specs add their kind here together with its catalog messages.
 *
 * Inbox rows stored before Spec 15 hold only the deep-link identity and
 * Ministry name; they stay supported, so the offer facts are optional here
 * and required only where an email is prepared.
 */
export const ministryInvitationNotificationDataSchema = z.object({
  ministryInvitationId: z.uuid(),
  ministryId: z.uuid(),
  ministryName: z.string(),
  ...ministryInvitationOfferFactsSchema.partial().shape,
});

/** Availability opened (initial Ask) and the reminder share their facts. */
export const availabilityNotificationDataSchema = z.object({
  /** The recipient's check; absent on rows frozen before deep links. */
  checkId: z.uuid().optional(),
  cycleId: z.uuid(),
  ministryId: z.uuid(),
  ministryName: z.string(),
  cycleName: z.string(),
  cycleStartDate: calendarDaySchema,
  cycleEndDate: calendarDaySchema,
  /** The recipient's own relevant Shifts; absent on rows frozen before it. */
  shiftCount: z.number().int().nonnegative().optional(),
  /** The ask record's Deadline at first delivery, when one was set. */
  answerBy: calendarDaySchema.optional(),
  /** Whether that Deadline had passed then, so bell and email word it alike. */
  deadlinePassed: z.boolean().optional(),
});

/** One of the recipient's Shifts, frozen when the Schedule is published. */
export const schedulePublishedShiftSchema = z.object({
  eventTitle: z.string(),
  roleName: z.string(),
  sectorName: z.string(),
  startsAt: instantSchema,
  endsAt: instantSchema,
});

export const schedulePublishedNotificationDataSchema = z.object({
  cycleId: z.uuid(),
  cycleName: z.string(),
  ministryId: z.uuid(),
  ministryName: z.string(),
  churchTimezone: z.string(),
  shifts: z.array(schedulePublishedShiftSchema).min(1),
});

export const scheduleUpdatedChangeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('added'),
    assignment: schedulePublishedShiftSchema,
  }),
  z.object({
    kind: z.literal('removed'),
    assignment: schedulePublishedShiftSchema.extend({
      swapRequestCovered: z.boolean().optional(),
    }),
  }),
  z.object({
    kind: z.literal('moved'),
    before: schedulePublishedShiftSchema.extend({
      swapRequestCovered: z.boolean().optional(),
    }),
    after: schedulePublishedShiftSchema,
  }),
]);

export const scheduleUpdatedNotificationDataSchema =
  schedulePublishedNotificationDataSchema.omit({ shifts: true }).extend({
    changes: z.array(scheduleUpdatedChangeSchema).min(1),
  });

/**
 * N2: a Cycle was sent and the recipient leads these Ministries in it. The
 * Ministries are those captured at Send, named at first delivery.
 */
export const cycleReadyToPrepareNotificationDataSchema = z.object({
  cycleId: z.uuid(),
  cycleName: z.string(),
  cycleStartDate: calendarDaySchema,
  cycleEndDate: calendarDaySchema,
  eventCount: z.number().int().nonnegative(),
  ministries: z.array(z.object({ id: z.uuid(), name: z.string() })).min(1),
});

/**
 * N8: the leader kept the Volunteer on an Assignment and answered the Swap
 * request. Everything shown is frozen here; Spec 28's keep action supplies it.
 */
export const swapRequestAnsweredNotificationDataSchema = z.object({
  assignmentId: z.uuid(),
  ministryId: z.uuid(),
  ministryName: z.string(),
  /** The answering leader, frozen from their User name. */
  leaderName: z.string(),
  churchTimezone: z.string(),
  shift: schedulePublishedShiftSchema,
  reply: z.string().optional(),
});

/**
 * N7: a Volunteer raised a Swap request. Frozen when raised, so the alert reads
 * the same whatever happens to the Assignment afterwards. The note is for
 * leaders and ChurchAdmins, which is who this goes to.
 */
export const swapRequestNotificationDataSchema = z.object({
  swapRequestId: z.uuid(),
  cycleId: z.uuid(),
  ministryId: z.uuid(),
  ministryName: z.string(),
  churchTimezone: z.string(),
  volunteerName: z.string(),
  shift: schedulePublishedShiftSchema,
  note: z.string().optional(),
});

/**
 * What changed about the Event, discriminated so later changes (a move) add a
 * variant without reshaping the add facts.
 */
export const eventChangedChangeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('add'),
    start: instantSchema,
    end: instantSchema,
  }),
]);

/**
 * N10: an admin changed a Sent Cycle's Event. One message per recipient; the
 * Ministries are those the recipient leads (or covers as fallback) that the
 * change affects, merged into one line each. Frozen when enqueued.
 */
export const eventChangedNotificationDataSchema = z.object({
  cycleId: z.uuid(),
  cycleName: z.string(),
  eventId: z.uuid(),
  eventTitle: z.string(),
  /** The acting ChurchAdmin, frozen from their User name. */
  adminName: z.string(),
  churchTimezone: z.string(),
  ministries: z.array(z.object({ id: z.uuid(), name: z.string() })).min(1),
  change: eventChangedChangeSchema,
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
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  schedule_updated: scheduleUpdatedNotificationDataSchema,
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  cycle_ready_to_prepare: cycleReadyToPrepareNotificationDataSchema,
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  swap_request: swapRequestNotificationDataSchema,
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  swap_request_answered: swapRequestAnsweredNotificationDataSchema,
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  event_changed: eventChangedNotificationDataSchema,
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
  checkId: z.uuid().optional(),
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
  schedule_published: schedulePublishedNotificationDataSchema.extend({
    churchName: z.string(),
  }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  schedule_updated: scheduleUpdatedNotificationDataSchema.extend({
    churchName: z.string(),
  }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  cycle_ready_to_prepare: z.object({
    cycleId: z.uuid(),
    /** The recipient's active Ministries at Send; never widened later. */
    ministryIds: z.array(z.uuid()).min(1),
  }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  swap_request: swapRequestNotificationDataSchema.extend({
    churchName: z.string(),
  }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  swap_request_answered: swapRequestAnsweredNotificationDataSchema.extend({
    churchName: z.string(),
  }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  event_changed: eventChangedNotificationDataSchema.extend({
    churchName: z.string(),
  }),
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
  inviterName: string;
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
export type ScheduleUpdatedDeliveryFacts =
  NotificationDataOf<'schedule_updated'> & {
    churchName: string;
    actionUrl: string;
  };
export type SwapRequestAnsweredDeliveryFacts =
  NotificationDataOf<'swap_request_answered'> & {
    churchName: string;
    /** The Assignment page. */
    actionUrl: string;
  };
export type CycleReadyToPrepareDeliveryFacts =
  NotificationDataOf<'cycle_ready_to_prepare'> & {
    churchName: string;
    churchTimezone: string;
    /** The single Ministry's Schedule, or the Cycle-preserving picker. */
    actionUrl: string;
  };

export type EventChangedDeliveryFacts = NotificationDataOf<'event_changed'> & {
  churchName: string;
  /** The single Ministry's Schedule, or the Cycle-preserving picker. */
  actionUrl: string;
};

export type SwapRequestDeliveryFacts = NotificationDataOf<'swap_request'> & {
  churchName: string;
  /** The board with this request open. */
  actionUrl: string;
};

/** JSON-safe copy of a withdrawn Assignment's actual Shift, so a prepared
 * email survives persistence unchanged (Instants, never `Date`s). */
export interface WithdrawnAssignmentEmailLine {
  startsAt: Instant;
  endsAt: Instant;
  eventTitle: string;
  roleName: string;
  sectorName: string;
}

/**
 * Everything both transfer email templates render, resolved and frozen at
 * first delivery. The Church is the *former* one; never the destination.
 */
export interface TransferDigestDeliveryFacts {
  churchName: string;
  churchTimezone: string;
  recipientFirstName: string;
  ministryName: string;
  volunteerName: string;
  withdrawnAssignments: WithdrawnAssignmentEmailLine[];
  /** Absolute `/schedules` link. */
  actionUrl: string;
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
  schedule_updated: ScheduleUpdatedDeliveryFacts;
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  cycle_ready_to_prepare: CycleReadyToPrepareDeliveryFacts;
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  swap_request: SwapRequestDeliveryFacts;
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  swap_request_answered: SwapRequestAnsweredDeliveryFacts;
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  event_changed: EventChangedDeliveryFacts;
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  transfer_ministry_digest: TransferDigestDeliveryFacts;
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  transfer_leaderless_ministry: TransferDigestDeliveryFacts;
}

export type NotificationDeliveryData =
  NotificationDeliveryDataByKind[NotificationRequestKind];

const transferDigestDeliveryFactsSchema = z.object({
  churchName: z.string(),
  churchTimezone: z.string(),
  recipientFirstName: z.string(),
  ministryName: z.string(),
  volunteerName: z.string(),
  withdrawnAssignments: z.array(
    z.object({
      startsAt: instantSchema,
      endsAt: instantSchema,
      eventTitle: z.string(),
      roleName: z.string(),
      sectorName: z.string(),
    }),
  ),
  actionUrl: z.string(),
});

const emailFactsSchema = z.object({ churchName: z.string() });

/**
 * What a frozen `facts` row must hold to render its email. Rows frozen before
 * a field joined the facts fail here and are skipped, never rendered with
 * invented or `undefined` values.
 */
export const notificationDeliveryFactsSchemas = {
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  ministry_invitation: ministryInvitationNotificationDataSchema
    .extend(ministryInvitationOfferFactsSchema.shape)
    .extend({ redemptionUrl: z.string() }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  availability_opened: availabilityNotificationDataSchema
    .extend(emailFactsSchema.shape)
    .extend({ actionUrl: z.string() }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  availability_reminder: availabilityNotificationDataSchema
    .extend(emailFactsSchema.shape)
    .extend({ actionUrl: z.string() }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  schedule_published: schedulePublishedNotificationDataSchema
    .extend(emailFactsSchema.shape)
    .extend({ actionUrl: z.string() }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  schedule_updated: scheduleUpdatedNotificationDataSchema
    .extend(emailFactsSchema.shape)
    .extend({ actionUrl: z.string() }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  cycle_ready_to_prepare: cycleReadyToPrepareNotificationDataSchema
    .extend(emailFactsSchema.shape)
    .extend({ churchTimezone: z.string(), actionUrl: z.string() }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  swap_request: swapRequestNotificationDataSchema
    .extend(emailFactsSchema.shape)
    .extend({ actionUrl: z.string() }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  swap_request_answered: swapRequestAnsweredNotificationDataSchema
    .extend(emailFactsSchema.shape)
    .extend({ actionUrl: z.string() }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  event_changed: eventChangedNotificationDataSchema
    .extend(emailFactsSchema.shape)
    .extend({ actionUrl: z.string() }),
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  transfer_ministry_digest: transferDigestDeliveryFactsSchema,
  // biome-ignore lint/style/useNamingConvention: the persisted kind value is snake_case
  transfer_leaderless_ministry: transferDigestDeliveryFactsSchema,
} as const satisfies Record<NotificationRequestKind, z.ZodType>;
