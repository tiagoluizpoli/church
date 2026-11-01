import type { CalendarDay, Instant } from '@church/time';

/**
 * Typed per-kind email payloads for invitation delivery (issue #56) and
 * Volunteer Transfer notifications (issue #60).
 *
 * `redemptionUrl` is the one place an absolute URL exists in this feature
 * (spec §6.2): the caller composes it from transport configuration plus the
 * invitation's relative redemption path before calling `send` — it is never
 * persisted and never appears in an API response.
 */

/** Chained and Ministry-only invitations render identically — same fields. */
export interface MinistryInvitationEmail {
  kind: 'invitation.chained' | 'invitation.ministry';
  to: string;
  churchName: string;
  ministryName: string;
  ministryAccessLevel: string;
  roleNames: string[];
  expiresAt: Instant;
  /** The Church Timezone `expiresAt` is read in. */
  churchTimezone: string;
  redemptionUrl: string;
}

/** A policy-derived length of time, translated at render time. */
export interface EmailDuration {
  minutes: number;
}

export interface VerificationCodeEmail {
  kind: 'invitation.verification-code';
  to: string;
  churchName: string;
  code: string;
  /** How long the code stays valid, from the same policy that enforces it. */
  codeLifetime: EmailDuration;
}

export interface ChurchBootstrapInvitationEmail {
  kind: 'invitation.church-bootstrap';
  to: string;
  churchName: string;
  redemptionUrl: string;
}

/**
 * One digest per affected Ministry, addressed to every active leader —
 * `to` is a list because a Ministry may have more than one. Never names the
 * destination Church (spec §8.8): disclosing where the Volunteer went is not
 * required to re-schedule, and the move is one the former Church cannot veto.
 */
/** JSON-safe copy of a withdrawn assignment, so a prepared email survives
 * persistence unchanged (an Instant, never a `Date`). */
export interface WithdrawnAssignmentEmailLine {
  eventName: string;
  eventTimeBlockStart: Instant;
  roleName: string;
}

export interface TransferMinistryDigestEmail {
  kind: 'transfer.ministry-digest';
  to: string[];
  ministryName: string;
  volunteerName: string;
  withdrawnAssignments: WithdrawnAssignmentEmailLine[];
}

/**
 * Escalation to every ChurchAdmin when the departure left the Ministry with
 * no active leader to reach — same content as the digest, flagged leaderless.
 */
export interface TransferLeaderlessMinistryEmail {
  kind: 'transfer.leaderless-ministry';
  to: string[];
  ministryName: string;
  volunteerName: string;
  withdrawnAssignments: WithdrawnAssignmentEmailLine[];
}

/** Availability opened (initial Ask) and its reminder: same facts, own words. */
export interface AvailabilityEmail {
  kind: 'availability.opened' | 'availability.reminder';
  to: string;
  ministryName: string;
  cycleName: string;
  cycleStartDate: CalendarDay;
  cycleEndDate: CalendarDay;
  actionUrl: string;
}

export interface SchedulePublishedEmail {
  kind: 'schedule.published';
  to: string;
  ministryName: string;
  eventTitle: string;
  eventStart: Instant;
  /** The Church Timezone the Instants are read in. */
  churchTimezone: string;
  shifts: { roleName: string; startsAt: Instant }[];
  actionUrl: string;
}

export type EmailPayload =
  | AvailabilityEmail
  | SchedulePublishedEmail
  | MinistryInvitationEmail
  | VerificationCodeEmail
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

/** A request without plain text: saved before the shared layout existed, or
 * prepared by a kind not yet moved onto it. Replayed as stored, never
 * re-rendered to add text. */
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

/**
 * What the outbox stores and a transport replays: a layout email, or a
 * historical/unmigrated html-only one. Collapses to `PreparedEmail` for new
 * preparations once every kind renders through the layout (Spec 10).
 */
export type ReplayableEmail = PreparedEmail | HtmlOnlyPreparedEmail;

export interface SendEmailResult {
  /** Absent for the capture adapter — nothing was actually dispatched. */
  providerMessageId?: string;
}

export interface PrepareEmailInput {
  payload: EmailPayload;
  /** The recipient's language; templates not yet on the catalog stay English. */
  locale?: EmailLocale;
}

export interface DeliverEmailInput {
  email: ReplayableEmail;
  /**
   * Stable per delivery (derived from the outbox row), so a replay inside the
   * provider's retention window is deduplicated rather than sent twice.
   */
  idempotencyKey?: string;
}

export interface SendEmailInput {
  payload: EmailPayload;
  /** Resolved by the caller through `recipientLocale`. */
  locale: EmailLocale;
}

/** Renders a payload into the exact request a transport will send. */
export interface EmailPreparer {
  /** Layout kinds return a `PreparedEmail`; unmigrated kinds stay html-only. */
  prepare(input: PrepareEmailInput): ReplayableEmail;
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
