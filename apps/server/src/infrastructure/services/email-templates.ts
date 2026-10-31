import { m } from '@church/i18n/messages';
import { formatCalendarDay, formatInstant, toDate } from '@church/time';
import type {
  AvailabilityEmail,
  EmailLocale,
  EmailPayload,
  MinistryInvitationEmail,
  PreparedEmail,
  SchedulePublishedEmail,
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
 * Resend agree on content. The member Ministry Invitation and the transfer
 * digests render from the shared catalog in `locale`; the rest stay English
 * until Spec 10 moves them.
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
  if (
    payload.kind === 'availability.opened' ||
    payload.kind === 'availability.reminder'
  ) {
    const { subject, html } = composeAvailabilityEmail({ payload, locale });
    return {
      payload,
      locale,
      request: { from, to: payload.to, subject, html },
    };
  }
  if (payload.kind === 'schedule.published') {
    const { subject, html } = composeSchedulePublishedEmail({
      payload,
      locale,
    });
    return {
      payload,
      locale,
      request: { from, to: payload.to, subject, html },
    };
  }
  if (
    payload.kind === 'transfer.ministry-digest' ||
    payload.kind === 'transfer.leaderless-ministry'
  ) {
    const { subject, html } = composeTransferDigestEmail({ payload, locale });
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

interface ComposeAvailabilityEmailInput {
  payload: AvailabilityEmail;
  locale: EmailLocale;
}

function composeAvailabilityEmail({
  payload,
  locale,
}: ComposeAvailabilityEmailInput): ComposedEmail {
  const options = { locale };
  const isReminder = payload.kind === 'availability.reminder';
  const subjectInput = { ministryName: payload.ministryName };
  const bodyInput = {
    ministryName: escapeHtml(payload.ministryName),
    cycleName: escapeHtml(payload.cycleName),
    startDate: formatCalendarDay({ day: payload.cycleStartDate }),
    endDate: formatCalendarDay({ day: payload.cycleEndDate }),
  };
  return {
    subject: isReminder
      ? m.email_availability_reminder_subject(subjectInput, options)
      : m.email_availability_opened_subject(subjectInput, options),
    html: `
          <p>${isReminder ? m.email_availability_reminder_body(bodyInput, options) : m.email_availability_opened_body(bodyInput, options)}</p>
          <p><a href="${escapeHtml(payload.actionUrl)}">${m.email_availability_action({}, options)}</a></p>
        `,
  };
}

interface ComposeSchedulePublishedEmailInput {
  payload: SchedulePublishedEmail;
  locale: EmailLocale;
}

function composeSchedulePublishedEmail({
  payload,
  locale,
}: ComposeSchedulePublishedEmailInput): ComposedEmail {
  const options = { locale };
  const at = (instant: SchedulePublishedEmail['eventStart']) =>
    formatInstant({ instant, timeZone: payload.churchTimezone });
  const shifts =
    payload.shifts.length > 0
      ? `<p>${m.email_schedule_published_shifts({}, options)}</p><ul>${payload.shifts
          .map(
            (shift) =>
              `<li>${m.email_schedule_published_shift({ roleName: escapeHtml(shift.roleName), startsAt: at(shift.startsAt) }, options)}</li>`,
          )
          .join('')}</ul>`
      : '';
  return {
    subject: m.email_schedule_published_subject(
      { ministryName: payload.ministryName },
      options,
    ),
    html: `
          <p>${m.email_schedule_published_body({ eventTitle: escapeHtml(payload.eventTitle), startsAt: at(payload.eventStart), ministryName: escapeHtml(payload.ministryName) }, options)}</p>
          ${shifts}
          <p><a href="${escapeHtml(payload.actionUrl)}">${m.email_schedule_published_action({}, options)}</a></p>
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
    case 'availability.opened':
    case 'availability.reminder':
    case 'schedule.published':
      // Rendered from the catalog in prepareEmail.
      throw new Error(`Email kind "${payload.kind}" renders in prepareEmail`);
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
    case 'transfer.leaderless-ministry':
      // Rendered from the catalog in prepareEmail.
      return composeTransferDigestEmail({ payload, locale: 'en' });
  }
}

interface ComposeTransferDigestEmailInput {
  payload: TransferMinistryDigestEmail | TransferLeaderlessMinistryEmail;
  locale: EmailLocale;
}

/** Both transfer kinds share the digest body; the leaderless escalation adds
 * its framing. Never names the destination Church. Times read UTC until
 * Spec 10 adds the Church Timezone. */
function composeTransferDigestEmail({
  payload,
  locale,
}: ComposeTransferDigestEmailInput): ComposedEmail {
  const options = { locale };
  const volunteerName = escapeHtml(payload.volunteerName);
  const ministryName = `<strong>${escapeHtml(payload.ministryName)}</strong>`;
  const items = payload.withdrawnAssignments
    .map(
      (line) =>
        `<li>${escapeHtml(line.eventName)} — ${formatInstant({ instant: line.eventTimeBlockStart, timeZone: 'UTC' })} — ${escapeHtml(line.roleName)}</li>`,
    )
    .join('');
  const assignments =
    items.length > 0
      ? `<ul>${items}</ul>`
      : `<p>${m.email_transfer_digest_no_assignments({}, options)}</p>`;
  const digest = `
    <p>${m.email_transfer_digest_body({ volunteerName, ministryName }, options)}</p>
    ${assignments}
  `;
  // Subjects are plain text: no markup to escape.
  if (payload.kind === 'transfer.leaderless-ministry') {
    return {
      subject: m.email_transfer_leaderless_subject(
        { ministryName: payload.ministryName },
        options,
      ),
      html: `
          <p>${m.email_transfer_leaderless_body({ ministryName, volunteerName }, options)}</p>
          ${digest}
        `,
    };
  }
  return {
    subject: m.email_transfer_digest_subject(
      {
        volunteerName: payload.volunteerName,
        ministryName: payload.ministryName,
      },
      options,
    ),
    html: digest,
  };
}
