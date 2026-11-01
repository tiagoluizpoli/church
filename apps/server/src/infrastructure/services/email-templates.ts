import { m } from '@church/i18n/messages';
import { formatCalendarDay, formatInstant, toDate } from '@church/time';
import type {
  AvailabilityEmail,
  EmailLocale,
  EmailPayload,
  MinistryInvitationEmail,
  PreparedEmail,
  ReplayableEmail,
  SchedulePublishedEmail,
  TransferDigestEmail,
  VerificationCodeEmail,
} from '../../domain/contracts/infrastructure/email-sender';
import {
  type EmailContent,
  emailSender,
  escapeHtml,
  formatEmailDuration,
  renderEmailLayout,
} from './email-layout';
import { formatShiftLine } from './email-shift-line';

export interface PrepareEmailFromInput {
  payload: EmailPayload;
  from: string;
  locale?: EmailLocale;
}

/**
 * The one renderer every EmailSender adapter prepares with, so capture and
 * Resend agree on content. Kinds on the shared layout return a request with
 * plain text and the Church sender; the rest stay html-only until Spec 10
 * moves them.
 */
export function prepareEmail({
  payload,
  from,
  locale = 'en',
}: PrepareEmailFromInput): ReplayableEmail {
  if (payload.kind === 'invitation.verification-code') {
    return prepareLayoutEmail({
      payload,
      locale,
      from: emailSender({
        displayName: payload.churchName,
        configuredFrom: from,
      }),
      content: verificationCodeContent({ payload, locale }),
    });
  }
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
    return prepareLayoutEmail({
      payload,
      locale,
      from: emailSender({
        displayName: payload.churchName,
        configuredFrom: from,
      }),
      content: transferDigestContent({ payload, locale }),
    });
  }
  const { subject, html } = composeEmail({ payload });
  return {
    payload,
    locale: 'en',
    request: { from, to: payload.to, subject, html },
  };
}

interface PrepareLayoutEmailInput {
  payload: EmailPayload;
  locale: EmailLocale;
  /** The composed sender (see `emailSender`). */
  from: string;
  content: EmailContent;
}

/** A kind on the shared layout: HTML and text from the same content. */
export function prepareLayoutEmail({
  payload,
  locale,
  from,
  content,
}: PrepareLayoutEmailInput): PreparedEmail {
  const { subject, html, text } = renderEmailLayout(content);
  return {
    payload,
    locale,
    request: { from, to: payload.to, subject, html, text },
  };
}

interface VerificationCodeContentInput {
  payload: VerificationCodeEmail;
  locale: EmailLocale;
}

/** T2: the code leads; no action, since there is nothing to open. */
function verificationCodeContent({
  payload,
  locale,
}: VerificationCodeContentInput): EmailContent {
  const options = { locale };
  const { code, churchName, to } = payload;
  const duration = formatEmailDuration({
    duration: payload.codeLifetime,
    locale,
  });
  return {
    subject: m.email_verification_code_subject({ code, churchName }, options),
    greeting: m.email_greeting_transactional({}, options),
    heading: m.email_verification_code_heading({ code }, options),
    facts: [
      m.email_verification_code_body({ churchName }, options),
      m.email_verification_code_expires({ duration }, options),
    ],
    footer: m.email_footer_invitation({ email: to, churchName }, options),
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
    case 'invitation.verification-code':
      // Rendered from the catalog in prepareEmail.
      throw new Error(`Email kind "${payload.kind}" renders in prepareEmail`);
    case 'invitation.church-bootstrap':
      return {
        subject: `You're invited to administer ${payload.churchName}`,
        html: `
          <p>You've been invited to become an administrator of ${payload.churchName}.</p>
          <p><a href="${payload.redemptionUrl}">Accept invitation</a></p>
        `,
      };
    case 'transfer.ministry-digest':
    case 'transfer.leaderless-ministry':
      // Rendered from the catalog in prepareEmail.
      throw new Error(`Email kind "${payload.kind}" renders in prepareEmail`);
  }
}

interface TransferDigestContentInput {
  payload: TransferDigestEmail;
  locale: EmailLocale;
}

/** N11–12: both kinds share the digest; the leaderless escalation adds why
 * the recipient got it. Never names the destination Church. */
function transferDigestContent({
  payload,
  locale,
}: TransferDigestContentInput): EmailContent {
  const options = { locale };
  const { churchName, churchTimezone, ministryName, volunteerName } = payload;
  const subject = m.email_transfer_digest_subject(
    { volunteerName, ministryName },
    options,
  );
  const list = payload.withdrawnAssignments.map((line) =>
    formatShiftLine({ ...line, churchTimezone, locale }),
  );
  const withdrawals: string[] =
    list.length > 0
      ? [
          m.email_transfer_digest_body({}, options),
          m.email_transfer_digest_timezone(
            { timeZone: churchTimezone },
            options,
          ),
        ]
      : [m.email_transfer_digest_no_assignments({}, options)];
  const leaderless =
    payload.kind === 'transfer.leaderless-ministry'
      ? [m.email_transfer_leaderless_body({ ministryName }, options)]
      : [];
  return {
    subject,
    greeting: m.email_greeting_notification(
      { firstName: payload.recipientFirstName },
      options,
    ),
    heading: subject,
    facts: [...withdrawals, ...leaderless] as EmailContent['facts'],
    list,
    action: {
      label: m.email_transfer_digest_action({}, options),
      url: payload.actionUrl,
    },
    footer: m.email_footer_membership({ churchName }, options),
  };
}
