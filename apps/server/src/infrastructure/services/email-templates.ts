import { m } from '@church/i18n/messages';
import { formatCalendarDay, formatInstant } from '@church/time';
import type {
  AvailabilityEmail,
  ChurchBootstrapInvitationEmail,
  EmailLocale,
  EmailPayload,
  MinistryInvitationEmail,
  PreparedEmail,
  ReplayableEmail,
  SchedulePublishedEmail,
  TransferLeaderlessMinistryEmail,
  TransferMinistryDigestEmail,
  VerificationCodeEmail,
} from '../../domain/contracts/infrastructure/email-sender';
import {
  type EmailContent,
  emailSender,
  escapeHtml,
  formatEmailDuration,
  renderEmailLayout,
} from './email-layout';

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
  if (
    payload.kind === 'invitation.chained' ||
    payload.kind === 'invitation.church-bootstrap'
  ) {
    return prepareLayoutEmail({
      payload,
      locale,
      from: emailSender({
        displayName: payload.churchName,
        configuredFrom: from,
      }),
      content: invitationContent({ payload, locale }),
    });
  }
  if (
    payload.kind === 'invitation.ministry' ||
    payload.kind === 'availability.opened' ||
    payload.kind === 'availability.reminder' ||
    payload.kind === 'schedule.published'
  ) {
    return prepareLayoutEmail({
      payload,
      locale,
      from: emailSender({
        displayName: payload.churchName,
        configuredFrom: from,
      }),
      content: memberNotificationContent({ payload, locale }),
    });
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

type MemberNotificationEmail =
  | MinistryInvitationEmail
  | AvailabilityEmail
  | SchedulePublishedEmail;

interface MemberNotificationContentInput {
  payload: MemberNotificationEmail;
  locale: EmailLocale;
}

/** Title and body reuse the bell's catalog keys, so both channels agree. */
function memberNotificationContent({
  payload,
  locale,
}: MemberNotificationContentInput): EmailContent {
  const options = { locale };
  const { churchName, ministryName } = payload;
  const firstName = payload.recipientFirstName?.trim();
  const base = {
    greeting: firstName
      ? m.email_greeting_member({ firstName }, options)
      : m.email_greeting_transactional({}, options),
    footer: m.email_footer_membership({ churchName }, options),
  };
  if (payload.kind === 'schedule.published') {
    const at = (instant: SchedulePublishedEmail['eventStart']) =>
      formatInstant({ instant, timeZone: payload.churchTimezone });
    const title = m.notification_schedule_published_title(
      { ministryName },
      options,
    );
    const body = m.notification_schedule_published_body(
      {
        eventTitle: payload.eventTitle,
        startsAt: at(payload.eventStart),
        ministryName,
      },
      options,
    );
    return {
      ...base,
      subject: title,
      heading: title,
      facts:
        payload.shifts.length > 0
          ? [body, m.email_schedule_published_shifts({}, options)]
          : [body],
      list: payload.shifts.map((shift) =>
        m.email_schedule_published_shift(
          { roleName: shift.roleName, startsAt: at(shift.startsAt) },
          options,
        ),
      ),
      action: {
        label: m.email_schedule_published_action({}, options),
        url: payload.actionUrl,
      },
    };
  }
  if (
    payload.kind === 'availability.opened' ||
    payload.kind === 'availability.reminder'
  ) {
    const isReminder = payload.kind === 'availability.reminder';
    const input = {
      ministryName,
      cycleName: payload.cycleName,
      startDate: formatCalendarDay({ day: payload.cycleStartDate }),
      endDate: formatCalendarDay({ day: payload.cycleEndDate }),
    };
    const title = isReminder
      ? m.notification_availability_reminder_title({ ministryName }, options)
      : m.notification_availability_opened_title({ ministryName }, options);
    return {
      ...base,
      subject: title,
      heading: title,
      facts: [
        isReminder
          ? m.notification_availability_reminder_body(input, options)
          : m.notification_availability_opened_body(input, options),
      ],
      action: {
        label: m.email_availability_action({}, options),
        url: payload.actionUrl,
      },
    };
  }
  // `kind` cannot narrow the invitation's two-kind union; this field can.
  if (!('redemptionUrl' in payload)) throw new Error('unreachable');
  const title = m.notification_ministry_invitation_title(
    { ministryName },
    options,
  );
  const accessLevel =
    payload.ministryAccessLevel === 'leader'
      ? m.email_ministry_invitation_access_leader({}, options)
      : m.email_ministry_invitation_access_volunteer({}, options);
  return {
    ...base,
    subject: title,
    heading: title,
    facts: [
      m.notification_ministry_invitation_body({ ministryName }, options),
      m.email_ministry_invitation_details(
        { churchName, ministryName, accessLevel },
        options,
      ),
      m.email_ministry_invitation_expires(
        {
          expiresAt: formatInstant({
            instant: payload.expiresAt,
            timeZone: payload.churchTimezone,
          }),
        },
        options,
      ),
    ],
    list: payload.roleNames,
    action: {
      label: m.email_ministry_invitation_accept({}, options),
      url: payload.redemptionUrl,
    },
  };
}

interface InvitationContentInput {
  payload: MinistryInvitationEmail | ChurchBootstrapInvitationEmail;
  locale: EmailLocale;
}

/** T1: ChurchAdmin-only (bootstrap) and paired Ministry invitations. */
function invitationContent({
  payload,
  locale,
}: InvitationContentInput): EmailContent {
  const options = { locale };
  const { to, churchName, churchTimezone, redemptionUrl } = payload;
  const expiresAt = formatInstant({
    instant: payload.expiresAt,
    timeZone: churchTimezone,
  });
  const common = {
    greeting: m.email_greeting_transactional({}, options),
    action: {
      label: m.email_invitation_accept({}, options),
      url: redemptionUrl,
    },
    footer: m.email_footer_invitation({ email: to, churchName }, options),
  };
  const expires = m.email_invitation_expires({ expiresAt }, options);
  if (payload.kind === 'invitation.church-bootstrap') {
    const title = m.email_invitation_admin_title({ churchName }, options);
    return {
      ...common,
      subject: title,
      heading: title,
      facts: [m.email_invitation_admin_body({ churchName }, options), expires],
    };
  }
  const { ministryName, inviterName, roleNames } = payload;
  const isLeader = payload.ministryAccessLevel === 'leader';
  const input = { churchName, ministryName, inviterName: inviterName ?? '' };
  const title = isLeader
    ? m.email_invitation_lead_title(input, options)
    : m.email_invitation_serve_title(input, options);
  const body = isLeader
    ? inviterName
      ? m.email_invitation_lead_body_inviter(input, options)
      : m.email_invitation_lead_body(input, options)
    : inviterName
      ? m.email_invitation_serve_body_inviter(input, options)
      : m.email_invitation_serve_body(input, options);
  const roles = m.email_invitation_roles(
    { roles: roleNames.join(', ') },
    options,
  );
  return {
    ...common,
    subject: title,
    heading: title,
    facts: roleNames.length > 0 ? [body, roles, expires] : [body, expires],
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
    case 'availability.opened':
    case 'availability.reminder':
    case 'schedule.published':
    case 'invitation.verification-code':
    case 'invitation.chained':
    case 'invitation.ministry':
    case 'invitation.church-bootstrap':
      // Rendered from the catalog in prepareEmail.
      throw new Error(`Email kind "${payload.kind}" renders in prepareEmail`);
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
