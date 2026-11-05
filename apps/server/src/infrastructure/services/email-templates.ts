import { m } from '@church/i18n/messages';
import { formatCalendarDay, formatInstant } from '@church/time';
import type {
  AvailabilityEmail,
  ChainedInvitationEmail,
  ChurchBootstrapInvitationEmail,
  ChurchOfferMinistryFacts,
  CycleReadyToPrepareEmail,
  EmailLocale,
  EmailPayload,
  MinistryInvitationEmail,
  PasswordResetEmail,
  PreparedEmail,
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
  appName: string;
}

/**
 * The one renderer every EmailSender adapter prepares with, so capture and
 * Resend agree on content. Every kind renders on the shared layout, with plain
 * text and the Church sender (the app name for church-less kinds).
 */
export function prepareEmail({
  payload,
  from,
  locale = 'en',
  appName,
}: PrepareEmailFromInput): PreparedEmail {
  const sender = (displayName: string) =>
    emailSender({ displayName, configuredFrom: from });
  switch (payload.kind) {
    case 'invitation.verification-code':
      return prepareLayoutEmail({
        payload,
        locale,
        from: sender(payload.churchName),
        content: verificationCodeContent({ payload, locale }),
      });
    case 'auth.password-reset':
      return prepareLayoutEmail({
        payload,
        locale,
        from: sender(appName),
        content: passwordResetContent({ payload, locale, appName }),
      });
    case 'invitation.chained':
    case 'invitation.church-bootstrap':
      return prepareLayoutEmail({
        payload,
        locale,
        from: sender(payload.churchName),
        content: invitationContent({ payload, locale }),
      });
    case 'invitation.ministry':
    case 'availability.opened':
    case 'availability.reminder':
    case 'schedule.published':
      return prepareLayoutEmail({
        payload,
        locale,
        from: sender(payload.churchName),
        content: memberNotificationContent({ payload, locale }),
      });
    case 'cycle.ready-to-prepare':
      return prepareLayoutEmail({
        payload,
        locale,
        from: sender(payload.churchName),
        content: cycleReadyToPrepareContent({ payload, locale }),
      });
    case 'transfer.ministry-digest':
    case 'transfer.leaderless-ministry':
      return prepareLayoutEmail({
        payload,
        locale,
        from: sender(payload.churchName),
        content: transferDigestContent({ payload, locale }),
      });
    default: {
      const unhandled: never = payload;
      throw new Error(`No email template for ${JSON.stringify(unhandled)}`);
    }
  }
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
  const firstName = payload.recipientFirstName.trim();
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
  if (payload.kind === 'invitation.ministry') {
    return {
      ...base,
      ...ministryOfferContent({ offer: payload, locale }),
      action: {
        label: m.notification_ministry_invitation_action({}, options),
        url: payload.redemptionUrl,
      },
    };
  }
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

interface CycleReadyToPrepareContentInput {
  payload: CycleReadyToPrepareEmail;
  locale: EmailLocale;
}

/** N2 on the bell's catalog keys: Cycle, its dates and Events, the Ministries. */
function cycleReadyToPrepareContent({
  payload,
  locale,
}: CycleReadyToPrepareContentInput): EmailContent {
  const options = { locale };
  const { churchName, cycleName, eventCount, ministryNames } = payload;
  const firstName = payload.recipientFirstName.trim();
  const title = m.notification_cycle_ready_to_prepare_title(
    { cycleName },
    options,
  );
  const events =
    eventCount === 1
      ? m.notification_cycle_ready_to_prepare_events_one({}, options)
      : m.notification_cycle_ready_to_prepare_events_other(
          { count: eventCount },
          options,
        );
  const ministryList = { ministryNames: ministryNames.join(', ') };
  return {
    subject: title,
    greeting: firstName
      ? m.email_greeting_notification({ firstName }, options)
      : m.email_greeting_transactional({}, options),
    heading: title,
    facts: [
      m.notification_cycle_ready_to_prepare_body(
        {
          cycleName,
          startDate: formatCalendarDay({ day: payload.cycleStartDate }),
          endDate: formatCalendarDay({ day: payload.cycleEndDate }),
          events,
        },
        options,
      ),
      ministryNames.length === 1
        ? m.notification_cycle_ready_to_prepare_ministries_one(
            ministryList,
            options,
          )
        : m.notification_cycle_ready_to_prepare_ministries_other(
            ministryList,
            options,
          ),
    ],
    action: {
      label: m.notification_cycle_ready_to_prepare_action({}, options),
      url: payload.actionUrl,
    },
    footer: m.email_footer_membership({ churchName }, options),
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
  payload: ChainedInvitationEmail | ChurchBootstrapInvitationEmail;
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
      // An upgraded pair: each retained Ministry offer, on one line.
      list: (payload.ministryOffers ?? []).map((offer) =>
        ministryOfferLines({ offer: { ...offer, churchName }, locale }).join(
          ' ',
        ),
      ),
    };
  }
  return { ...common, ...ministryOfferContent({ offer: payload, locale }) };
}

interface MinistryOfferContentInput {
  offer: ChainedInvitationEmail | MinistryInvitationEmail;
  locale: EmailLocale;
}

/** T1 and N1 share the inviter-led lead/serve offer: title, body, Roles, expiry. */
function ministryOfferContent({
  offer,
  locale,
}: MinistryOfferContentInput): Pick<
  EmailContent,
  'subject' | 'heading' | 'facts'
> {
  const options = { locale };
  const { churchName, ministryName, inviterName } = offer;
  const input = { churchName, ministryName, inviterName };
  const title =
    offer.ministryAccessLevel === 'leader'
      ? m.email_invitation_lead_title(input, options)
      : m.email_invitation_serve_title(input, options);
  const expires = m.email_invitation_expires(
    {
      expiresAt: formatInstant({
        instant: offer.expiresAt,
        timeZone: offer.churchTimezone,
      }),
    },
    options,
  );
  return {
    subject: title,
    heading: title,
    facts: [...ministryOfferLines({ offer, locale }), expires],
  };
}

interface MinistryOfferLinesInput {
  offer: ChurchOfferMinistryFacts & { churchName: string };
  locale: EmailLocale;
}

/** The inviter-led lead/serve line, then its Roles when there are any. */
function ministryOfferLines({
  offer,
  locale,
}: MinistryOfferLinesInput): [string] | [string, string] {
  const options = { locale };
  const { churchName, ministryName, inviterName, roleNames } = offer;
  const input = { churchName, ministryName, inviterName };
  const body =
    offer.ministryAccessLevel === 'leader'
      ? m.email_invitation_lead_body_inviter(input, options)
      : m.email_invitation_serve_body_inviter(input, options);
  if (roleNames.length === 0) return [body];
  return [
    body,
    m.email_invitation_roles({ roles: roleNames.join(', ') }, options),
  ];
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
  const withdrawals: [string] | [string, string] =
    list.length > 0
      ? [
          m.email_transfer_digest_body({}, options),
          m.email_transfer_digest_timezone(
            { timeZone: churchTimezone },
            options,
          ),
        ]
      : [m.email_transfer_digest_no_assignments({}, options)];
  return {
    subject,
    greeting: m.email_greeting_notification(
      { firstName: payload.recipientFirstName },
      options,
    ),
    heading: subject,
    facts:
      payload.kind === 'transfer.leaderless-ministry'
        ? [
            ...withdrawals,
            m.email_transfer_leaderless_body({ ministryName }, options),
          ]
        : withdrawals,
    list,
    action: {
      label: m.email_transfer_digest_action({}, options),
      url: payload.actionUrl,
    },
    footer: m.email_footer_membership({ churchName }, options),
  };
}
