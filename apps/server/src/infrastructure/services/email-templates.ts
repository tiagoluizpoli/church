import { m } from '@church/i18n/messages';
import { formatCalendarDay, formatInstant } from '@church/time';
import type {
  AvailabilityEmail,
  ChurchBootstrapInvitationEmail,
  EmailLocale,
  EmailPayload,
  MinistryInvitationEmail,
  PasswordResetEmail,
  PreparedEmail,
  ReplayableEmail,
  SchedulePublishedEmail,
  TransferDigestEmail,
  VerificationCodeEmail,
} from '../../domain/contracts/infrastructure/email-sender';
import {
  type EmailContent,
  emailSender,
  formatEmailDuration,
  renderEmailLayout,
} from './email-layout';
import { formatShiftLine } from './email-shift-line';

export interface PrepareEmailFromInput {
  payload: EmailPayload;
  from: string;
  locale?: EmailLocale;
  /** Display name for app-branded kinds; injected from composition. */
  appName?: string;
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
  appName,
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
  if (payload.kind === 'auth.password-reset') {
    if (!appName) throw new Error('Password reset email requires an appName.');
    return prepareLayoutEmail({
      payload,
      locale,
      from: emailSender({ displayName: appName, configuredFrom: from }),
      content: passwordResetContent({ payload, locale, appName }),
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
      ? m.email_greeting_notification({ firstName }, options)
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

interface PasswordResetContentInput {
  payload: PasswordResetEmail;
  locale: EmailLocale;
  appName: string;
}

/** T3: no Church; the action opens the supplied reset URL. */
function passwordResetContent({
  payload,
  locale,
  appName,
}: PasswordResetContentInput): EmailContent {
  const options = { locale };
  const { to: email, resetUrl } = payload;
  const duration = formatEmailDuration({
    duration: payload.linkLifetime,
    locale,
  });
  return {
    subject: m.email_password_reset_subject({ appName }, options),
    greeting: m.email_greeting_transactional({}, options),
    heading: m.email_password_reset_heading({}, options),
    facts: [
      m.email_password_reset_body({ email }, options),
      m.email_password_reset_ignore({}, options),
      m.email_password_reset_expires({ duration }, options),
    ],
    action: {
      label: m.email_password_reset_action({}, options),
      url: resetUrl,
    },
    footer: m.email_footer_password_reset({ email, appName }, options),
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
    case 'auth.password-reset':
    case 'invitation.chained':
    case 'invitation.ministry':
    case 'invitation.church-bootstrap':
      // Rendered from the catalog in prepareEmail.
      throw new Error(`Email kind "${payload.kind}" renders in prepareEmail`);
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
