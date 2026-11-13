import type { CalendarDay, Instant } from '@church/time';
import type { MinistryAccessLevel } from '../../entities/ministry-membership';
import type {
  NotificationDataOf,
  TransferDigestDeliveryFacts,
} from '../../notification-kinds';

/**
 * Typed per-kind email payloads for invitation delivery (issue #56) and
 * Volunteer Transfer notifications (issue #60).
 *
 * `redemptionUrl` is the one place an absolute URL exists in this feature
 * (spec §6.2): the caller composes it from transport configuration plus the
 * invitation's relative redemption path before calling `send` — it is never
 * persisted and never appears in an API response.
 */

/** T1: a Ministry invitation paired with a Church invitation; names who sent it. */
export interface ChainedInvitationEmail {
  kind: 'invitation.chained';
  to: string;
  churchName: string;
  ministryName: string;
  ministryAccessLevel: MinistryAccessLevel;
  roleNames: string[];
  inviterName: string;
  expiresAt: Instant;
  /** The Church Timezone `expiresAt` is read in. */
  churchTimezone: string;
  redemptionUrl: string;
}

/** N1: a Ministry invitation to an existing Church Member, in T1's inviter-led wording. */
export interface MinistryInvitationEmail {
  kind: 'invitation.ministry';
  to: string;
  churchName: string;
  recipientFirstName: string;
  inviterName: string;
  ministryName: string;
  ministryAccessLevel: MinistryAccessLevel;
  roleNames: string[];
  expiresAt: Instant;
  /** The Church Timezone `expiresAt` is read in. */
  churchTimezone: string;
  redemptionUrl: string;
}

/** A policy-derived length of time, translated at render time. */
export type EmailDuration =
  | { minutes: number }
  | { hours: number }
  | { days: number };

/** A Transactional recipient known only by address (no Church Membership). */
export interface AddressRecipient {
  email: string;
}

export interface VerificationCodeEmail {
  kind: 'invitation.verification-code';
  to: string;
  churchName: string;
  code: string;
  /** How long the code stays valid, from the same policy that enforces it. */
  codeLifetime: EmailDuration;
}

/**
 * App-branded and church-less: sent to an address, never a Church Member.
 * The caller (Spec 11) supplies the absolute reset URL and the lifetime from
 * the policy that enforces the link.
 */
export interface PasswordResetEmail {
  kind: 'auth.password-reset';
  to: string;
  resetUrl: string;
  linkLifetime: EmailDuration;
}

/** A pending Ministry half retained by an admin Church offer, as its T1 names it. */
export interface ChurchOfferMinistryFacts {
  ministryName: string;
  ministryAccessLevel: MinistryAccessLevel;
  roleNames: string[];
  inviterName: string;
}

/** T1 for an admin Church offer; an upgraded pair also lists its pending Ministry halves. */
export interface ChurchBootstrapInvitationEmail {
  kind: 'invitation.church-bootstrap';
  to: string;
  churchName: string;
  expiresAt: Instant;
  /** The Church Timezone `expiresAt` is read in. */
  churchTimezone: string;
  redemptionUrl: string;
  ministryOffers?: ChurchOfferMinistryFacts[];
}

/**
 * One digest per affected Ministry, addressed to every active leader —
 * `to` is a list because a Ministry may have more than one. Never names the
 * destination Church (spec §8.8): disclosing where the Volunteer went is not
 * required to re-schedule, and the move is one the former Church cannot veto.
 */
export interface TransferMinistryDigestEmail
  extends TransferDigestDeliveryFacts {
  kind: 'transfer.ministry-digest';
  to: string[];
}

/**
 * Escalation to every ChurchAdmin when the departure left the Ministry with
 * no active leader to reach — same content as the digest, plus the no-leader
 * explanation.
 */
export interface TransferLeaderlessMinistryEmail
  extends TransferDigestDeliveryFacts {
  kind: 'transfer.leaderless-ministry';
  to: string[];
}

export type TransferDigestEmail =
  | TransferMinistryDigestEmail
  | TransferLeaderlessMinistryEmail;

/** Availability opened (initial Ask) and its reminder: same facts, own words. */
export interface AvailabilityEmail {
  kind: 'availability.opened' | 'availability.reminder';
  to: string;
  churchName: string;
  recipientFirstName: string;
  ministryName: string;
  cycleName: string;
  cycleStartDate: CalendarDay;
  cycleEndDate: CalendarDay;
  actionUrl: string;
  /** Absent only on rows frozen before these facts existed. */
  shiftCount?: number;
  answerBy?: CalendarDay;
  deadlinePassed?: boolean;
}

export interface SchedulePublishedEmailShift {
  eventTitle: string;
  roleName: string;
  sectorName: string;
  startsAt: Instant;
  endsAt: Instant;
}

export interface SchedulePublishedEmail {
  kind: 'schedule.published';
  to: string;
  churchName: string;
  recipientFirstName: string;
  ministryName: string;
  cycleName: string;
  /** The Church Timezone the Instants are read in. */
  churchTimezone: string;
  shifts: SchedulePublishedEmailShift[];
  actionUrl: string;
}

export type ScheduleUpdatedEmailChange =
  | {
      kind: 'added' | 'removed';
      assignment: SchedulePublishedEmailShift & {
        swapRequestCovered?: boolean;
      };
    }
  | {
      kind: 'moved';
      before: SchedulePublishedEmailShift & { swapRequestCovered?: boolean };
      after: SchedulePublishedEmailShift;
    };

export interface ScheduleUpdatedEmail
  extends Omit<SchedulePublishedEmail, 'kind' | 'shifts'> {
  kind: 'schedule.updated';
  changes: ScheduleUpdatedEmailChange[];
}

/** N2: a sent Cycle the recipient's Ministries now prepare. */
export interface CycleReadyToPrepareEmail {
  kind: 'cycle.ready-to-prepare';
  to: string;
  churchName: string;
  recipientFirstName: string;
  cycleName: string;
  cycleStartDate: CalendarDay;
  cycleEndDate: CalendarDay;
  eventCount: number;
  ministryNames: string[];
  actionUrl: string;
}

/** N10: an admin changed an Event of a Sent Cycle. */
export interface EventChangedEmail {
  kind: 'event.changed';
  to: string;
  churchName: string;
  recipientFirstName: string;
  cycleName: string;
  eventTitle: string;
  adminName: string;
  churchTimezone: string;
  ministryNames: string[];
  change: NotificationDataOf<'event_changed'>['change'];
  actionUrl: string;
}

/** N9: an admin cancelled the recipient's published Shifts. */
export interface EventCancelledEmail {
  kind: 'event.cancelled';
  to: string;
  churchName: string;
  recipientFirstName: string;
  eventTitle: string;
  /** The cancelled scope's start; its day names the message. */
  start: Instant;
  churchTimezone: string;
  shifts: SchedulePublishedEmailShift[];
  actionUrl: string;
}

/** N7: a Volunteer raised a Swap request; the note is leader-facing. */
export interface SwapRequestEmail {
  kind: 'swap.request';
  to: string;
  churchName: string;
  recipientFirstName: string;
  ministryName: string;
  churchTimezone: string;
  volunteerName: string;
  shift: SchedulePublishedEmailShift;
  note?: string;
  actionUrl: string;
}

/** N8: the leader kept the Volunteer on an Assignment and answered. */
export interface SwapRequestAnsweredEmail {
  kind: 'swap-request.answered';
  to: string;
  churchName: string;
  recipientFirstName: string;
  ministryName: string;
  leaderName: string;
  churchTimezone: string;
  shift: SchedulePublishedEmailShift;
  reply?: string;
  actionUrl: string;
}

export type EmailPayload =
  | EventCancelledEmail
  | EventChangedEmail
  | SwapRequestAnsweredEmail
  | SwapRequestEmail
  | AvailabilityEmail
  | CycleReadyToPrepareEmail
  | SchedulePublishedEmail
  | ScheduleUpdatedEmail
  | ChainedInvitationEmail
  | MinistryInvitationEmail
  | VerificationCodeEmail
  | PasswordResetEmail
  | ChurchBootstrapInvitationEmail
  | TransferMinistryDigestEmail
  | TransferLeaderlessMinistryEmail;

export type EmailLocale = 'en' | 'pt-BR';

/** The exact provider request: what a retry must resend byte for byte.
 * Every newly prepared layout request carries its plain-text alternative. */
export interface EmailRequest {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

/** A request without plain text: saved before the shared layout existed.
 * Replayed as stored, never re-rendered to add text. */
export type HtmlOnlyEmailRequest = Omit<EmailRequest, 'text'> & {
  text?: never;
};

/**
 * A rendered email, fixed once before its first external attempt. Every field
 * is JSON-safe so the outbox can persist it and replay it unchanged — retries
 * never re-render from mutable facts (names, locale, sender, recipient).
 * `payload` is the facts it was rendered from, kept for capture assertions.
 */
export interface PreparedEmail {
  payload: EmailPayload;
  locale: EmailLocale;
  request: EmailRequest;
}

/** A prepared email whose request has no plain text (see HtmlOnlyEmailRequest). */
export interface HtmlOnlyPreparedEmail {
  payload: EmailPayload;
  locale: EmailLocale;
  request: HtmlOnlyEmailRequest;
}

/** What the outbox stores and a transport replays: a layout email, or a
 * historical html-only one. New preparations are always `PreparedEmail`. */
export type ReplayableEmail = PreparedEmail | HtmlOnlyPreparedEmail;

export interface SendEmailResult {
  /** Absent for the capture adapter — nothing was actually dispatched. */
  providerMessageId?: string;
}

export interface PrepareEmailInput {
  payload: EmailPayload;
  /** The recipient's language. */
  locale?: EmailLocale;
}

/** Where a development/staging email can go: the private Mailpit capture
 * or the real Resend provider. */
export type EmailDestination = 'mailpit' | 'resend';

export interface ConfirmEmailDestinationInput {
  destination: EmailDestination;
}

/**
 * An outbox email's routing state. Only the development/staging mode-routing
 * sender reads it; every other sender ignores it.
 */
export interface EmailRouting {
  /** The operator's raw `email_delivery_mode`, frozen when the email was
   * created: untrusted, and absent on older rows. */
  frozenMode: unknown;
  /** Destinations that already confirmed this email: never sent again. */
  confirmed: EmailDestination[];
  /** Persists one destination's confirmation before the next is attempted. */
  confirm(input: ConfirmEmailDestinationInput): Promise<void>;
}

export interface DeliverEmailInput {
  email: ReplayableEmail;
  /**
   * Stable per delivery (derived from the outbox row), so a replay inside the
   * provider's retention window is deduplicated rather than sent twice.
   */
  idempotencyKey?: string;
  routing?: EmailRouting;
}

export interface SendEmailInput {
  payload: EmailPayload;
  /** Resolved by the caller through `recipientLocale`. */
  locale: EmailLocale;
}

/** Renders a payload into the exact request a transport will send. */
export interface EmailPreparer {
  prepare(input: PrepareEmailInput): PreparedEmail;
}

/** Delivers an already-prepared email; never renders. */
export interface EmailTransport {
  deliver(input: DeliverEmailInput): Promise<SendEmailResult>;
}

/**
 * Both halves behind one adapter. `send` prepares and delivers in one step for
 * direct Transactional callers that have no outbox row to key on.
 */
export interface EmailSender extends EmailPreparer, EmailTransport {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
