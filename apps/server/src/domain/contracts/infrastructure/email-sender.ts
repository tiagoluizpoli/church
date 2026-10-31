import type { Instant } from '@church/time';

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
  redemptionUrl: string;
}

export interface VerificationCodeEmail {
  kind: 'invitation.verification-code';
  to: string;
  churchName: string;
  code: string;
}

export interface ChurchBootstrapInvitationEmail {
  kind: 'invitation.church-bootstrap';
  to: string;
  churchName: string;
  redemptionUrl: string;
}

export interface RedemptionAcceptedEmail {
  kind: 'redemption.accepted';
  to: string;
  churchName: string;
  ministryName: string;
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

export type EmailPayload =
  | MinistryInvitationEmail
  | VerificationCodeEmail
  | ChurchBootstrapInvitationEmail
  | RedemptionAcceptedEmail
  | TransferMinistryDigestEmail
  | TransferLeaderlessMinistryEmail;

export type EmailLocale = 'en' | 'pt-BR';

/** The exact provider request: what a retry must resend byte for byte. */
export interface EmailRequest {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
}

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

export interface SendEmailResult {
  /** Absent for the capture adapter — nothing was actually dispatched. */
  providerMessageId?: string;
}

export interface PrepareEmailInput {
  payload: EmailPayload;
}

export interface DeliverEmailInput {
  email: PreparedEmail;
  /**
   * Stable per delivery (derived from the outbox row), so a replay inside the
   * provider's retention window is deduplicated rather than sent twice.
   */
  idempotencyKey?: string;
}

export interface SendEmailInput {
  payload: EmailPayload;
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
