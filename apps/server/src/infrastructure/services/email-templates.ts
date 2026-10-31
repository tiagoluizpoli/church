import { m } from '@church/i18n/messages';
import { formatInstant, toDate } from '@church/time';
import type {
  EmailLocale,
  EmailPayload,
  MinistryInvitationEmail,
  PreparedEmail,
  TransferLeaderlessMinistryEmail,
  TransferMinistryDigestEmail,
} from '../../domain/contracts/infrastructure/email-sender';

export interface PrepareEmailFromInput {
  payload: EmailPayload;
  from: string;
  locale?: EmailLocale;
}

/**
 * The one renderer every EmailSender adapter prepares with, so capture and
 * Resend agree on content. The member Ministry Invitation renders from the
 * shared catalog in `locale`; the rest stay English until Spec 10 moves them.
 */
export function prepareEmail({
  payload,
  from,
  locale = 'en',
}: PrepareEmailFromInput): PreparedEmail {
  if (payload.kind === 'invitation.ministry') {
    const { subject, html } = composeMinistryInvitationEmail({
      payload,
      locale,
    });
    return {
      payload,
      locale,
      request: { from, to: payload.to, subject, html },
    };
  }
  const { subject, html } = composeEmail({ payload });
  return {
    payload,
    locale: 'en',
    request: { from, to: payload.to, subject, html },
  };
}

interface ComposeMinistryInvitationEmailInput {
  payload: MinistryInvitationEmail;
  locale: EmailLocale;
}

function composeMinistryInvitationEmail({
  payload,
  locale,
}: ComposeMinistryInvitationEmailInput): ComposedEmail {
  const options = { locale };
  const ministryName = escapeHtml(payload.ministryName);
  const accessLevel =
    payload.ministryAccessLevel === 'leader'
      ? m.email_ministry_invitation_access_leader({}, options)
      : m.email_ministry_invitation_access_volunteer({}, options);
  const roles =
    payload.roleNames.length > 0
      ? `<p>${m.email_ministry_invitation_roles({ roles: payload.roleNames.map(escapeHtml).join(', ') }, options)}</p>`
      : '';
  const expiresAt = formatInstant({
    instant: payload.expiresAt,
    timeZone: payload.churchTimezone,
  });
  return {
    // The subject is plain text: no markup to escape.
    subject: m.notification_ministry_invitation_title(
      { ministryName: payload.ministryName },
      options,
    ),
    html: `
          <p>${m.notification_ministry_invitation_body({ ministryName }, options)}</p>
          <p>${m.email_ministry_invitation_details({ churchName: escapeHtml(payload.churchName), ministryName, accessLevel }, options)}</p>
          ${roles}
          <p>${m.email_ministry_invitation_expires({ expiresAt }, options)}</p>
          <p><a href="${escapeHtml(payload.redemptionUrl)}">${m.email_ministry_invitation_accept({}, options)}</a></p>
        `,
  };
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Interpolated facts are text, never markup. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
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
      // `invitation.ministry` is rendered from the catalog in prepareEmail.
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
