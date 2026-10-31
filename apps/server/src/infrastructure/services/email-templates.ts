import { formatInstant, toDate } from '@church/time';
import type {
  EmailPayload,
  PreparedEmail,
  TransferLeaderlessMinistryEmail,
  TransferMinistryDigestEmail,
} from '../../domain/contracts/infrastructure/email-sender';

export interface PrepareEmailFromInput {
  payload: EmailPayload;
  from: string;
}

/**
 * The one renderer every EmailSender adapter prepares with, so capture and
 * Resend agree on content. Templates are English-only until Spec 10 moves
 * them onto the shared catalog, hence the fixed `locale`.
 */
export function prepareEmail({
  payload,
  from,
}: PrepareEmailFromInput): PreparedEmail {
  const { subject, html } = composeEmail({ payload });
  return {
    payload,
    locale: 'en',
    request: { from, to: payload.to, subject, html },
  };
}

interface ComposedEmail {
  subject: string;
  html: string;
}

interface ComposeEmailInput {
  payload: EmailPayload;
}

function composeEmail({ payload }: ComposeEmailInput): ComposedEmail {
  switch (payload.kind) {
    case 'invitation.chained':
    case 'invitation.ministry':
      return {
        subject: `You're invited to serve at ${payload.churchName}`,
        html: `
          <p>You've been invited to join <strong>${payload.ministryName}</strong> at ${payload.churchName} as a ${payload.ministryAccessLevel}.</p>
          ${payload.roleNames.length > 0 ? `<p>Roles: ${payload.roleNames.join(', ')}</p>` : ''}
          <p>This invitation expires on ${toDate({ instant: payload.expiresAt }).toDateString()}.</p>
          <p><a href="${payload.redemptionUrl}">Accept invitation</a></p>
        `,
      };
    case 'invitation.verification-code':
      return {
        subject: `Your ${payload.churchName} verification code`,
        html: `<p>Your verification code is <strong>${payload.code}</strong>.</p><p>It expires in 10 minutes.</p>`,
      };
    case 'invitation.church-bootstrap':
      return {
        subject: `You're invited to administer ${payload.churchName}`,
        html: `
          <p>You've been invited to become an administrator of ${payload.churchName}.</p>
          <p><a href="${payload.redemptionUrl}">Accept invitation</a></p>
        `,
      };
    case 'redemption.accepted':
      return {
        subject: `Welcome to ${payload.ministryName} at ${payload.churchName}`,
        html: `<p>Your invitation to serve with <strong>${payload.ministryName}</strong> at ${payload.churchName} has been accepted.</p>`,
      };
    case 'transfer.ministry-digest':
      return {
        subject: `${payload.volunteerName} has transferred out of ${payload.ministryName}`,
        html: renderTransferDigestHtml({ payload }),
      };
    case 'transfer.leaderless-ministry':
      return {
        subject: `${payload.ministryName} has no active leader`,
        html: `
          <p><strong>${payload.ministryName}</strong> has no active leader: ${payload.volunteerName} — its last active leader — has transferred out.</p>
          ${renderTransferDigestHtml({ payload })}
        `,
      };
  }
}

interface RenderTransferDigestHtmlInput {
  payload: TransferMinistryDigestEmail | TransferLeaderlessMinistryEmail;
}

/** Shared body for both transfer notification kinds — only the framing
 * differs. No Church Timezone is available at this layer, so times read
 * UTC — a seam-armed swap of the prior raw `toLocaleString`, not a
 * timezone-correctness fix. */
function renderTransferDigestHtml({
  payload,
}: RenderTransferDigestHtmlInput): string {
  const items = payload.withdrawnAssignments
    .map(
      (a) =>
        `<li>${a.eventName} — ${formatInstant({ instant: a.eventTimeBlockStart, timeZone: 'UTC' })} — ${a.roleName}</li>`,
    )
    .join('');
  return `
    <p>${payload.volunteerName} transferred to another Church and their future assignments in <strong>${payload.ministryName}</strong> were withdrawn:</p>
    <ul>${items}</ul>
  `;
}
