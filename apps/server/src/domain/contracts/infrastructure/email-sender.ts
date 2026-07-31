/**
 * Typed per-kind email payloads for invitation delivery (issue #56).
 * Volunteer-Transfer notification kinds (`transfer.*` on `outbox_message_kind`)
 * are out of scope here — issue #60 defines their content when it's built.
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

export interface ChurchBootstrapInvitationEmail {
  kind: 'invitation.church-bootstrap';
  to: string;
  churchName: string;
  redemptionUrl: string;
}

export type EmailPayload =
  | MinistryInvitationEmail
  | ChurchBootstrapInvitationEmail;

export interface EmailSender {
  send(payload: EmailPayload): Promise<void>;
}
