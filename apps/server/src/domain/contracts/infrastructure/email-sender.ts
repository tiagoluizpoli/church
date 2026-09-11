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
  expiresAt: Date;
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

/** One withdrawn future Assignment, as listed in a Volunteer Transfer digest (spec §8.8). */
export interface WithdrawnAssignmentSummary {
  eventName: string;
  timeSlotStart: Date;
  roleName: string;
}

/**
 * One digest per affected Ministry, addressed to every active leader —
 * `to` is a list because a Ministry may have more than one. Never names the
 * destination Church (spec §8.8): disclosing where the Volunteer went is not
 * required to re-roster, and the move is one the former Church cannot veto.
 */
export interface TransferMinistryDigestEmail {
  kind: 'transfer.ministry-digest';
  to: string[];
  ministryName: string;
  volunteerName: string;
  withdrawnAssignments: WithdrawnAssignmentSummary[];
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
  withdrawnAssignments: WithdrawnAssignmentSummary[];
}

export type EmailPayload =
  | MinistryInvitationEmail
  | VerificationCodeEmail
  | ChurchBootstrapInvitationEmail
  | RedemptionAcceptedEmail
  | TransferMinistryDigestEmail
  | TransferLeaderlessMinistryEmail;

export interface SendEmailResult {
  /** Absent for the capture adapter — nothing was actually dispatched. */
  providerMessageId?: string;
}

export interface SendEmailInput {
  payload: EmailPayload;
}

export interface EmailSender {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
