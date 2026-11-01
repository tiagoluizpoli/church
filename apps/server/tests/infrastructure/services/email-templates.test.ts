import { m } from '@church/i18n/messages';
import type { CalendarDay, Instant } from '@church/time';
import { describe, expect, it } from 'vitest';
import type {
  ChainedInvitationEmail,
  ChurchBootstrapInvitationEmail,
  MinistryInvitationEmail,
  TransferDigestEmail,
  TransferMinistryDigestEmail,
} from '@/domain/contracts/infrastructure/email-sender';
import { escapeHtml } from '@/infrastructure/services/email-layout';
import { formatShiftLine } from '@/infrastructure/services/email-shift-line';
import { prepareEmail } from '@/infrastructure/services/email-templates';

const memberInvitation: MinistryInvitationEmail = {
  kind: 'invitation.ministry',
  to: 'member@example.com',
  churchName: 'Grace & <Truth>',
  ministryName: '<b>Worship</b>',
  ministryAccessLevel: 'volunteer',
  roleNames: ['Vocalist <i>lead</i>'],
  // 02:30 UTC is the previous evening on São Paulo's wall clock.
  expiresAt: '2026-12-01T02:30:00.000Z' as Instant,
  churchTimezone: 'America/Sao_Paulo',
  redemptionUrl: 'https://app.church.test/invitations/ministry/abc',
  recipientFirstName: 'Maria',
};

const appName = 'Igreja App';

const ptBR = { locale: 'pt-BR' } as const;
const from = 'church@example.com';

function prepare(
  payload: ChainedInvitationEmail | ChurchBootstrapInvitationEmail,
) {
  return prepareEmail({ payload, from, locale: 'pt-BR', appName });
}

describe('prepareEmail — T1 paired Ministry invitations', () => {
  const { recipientFirstName: _name, ...chainedFacts } = memberInvitation;
  const chained: ChainedInvitationEmail = {
    ...chainedFacts,
    kind: 'invitation.chained',
    ministryAccessLevel: 'volunteer',
    inviterName: 'Ana <Pastor>',
  };
  const leader = { ...chained, ministryAccessLevel: 'leader' };

  it('names inviter, Ministry and lead intent with Roles, expiry in the Church Timezone and one Accept button', () => {
    const email = prepare(leader);
    const { subject, html, text } = email.request;

    expect(email.locale).toBe('pt-BR');
    expect(subject).toBe(
      m.email_invitation_lead_title({ ministryName: '<b>Worship</b>' }, ptBR),
    );
    const body = m.email_invitation_lead_body_inviter(
      {
        inviterName: 'Ana <Pastor>',
        ministryName: '<b>Worship</b>',
        churchName: 'Grace & <Truth>',
      },
      ptBR,
    );
    const roles = m.email_invitation_roles(
      { roles: 'Vocalist <i>lead</i>' },
      ptBR,
    );
    const expires = m.email_invitation_expires(
      { expiresAt: '30/11/2026 23:30' },
      ptBR,
    );
    for (const line of [body, roles, expires, leader.redemptionUrl]) {
      expect(text).toContain(line);
    }
    expect(text).toContain(m.email_invitation_accept({}, ptBR));
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain(`href="${leader.redemptionUrl}"`);
  });

  it('uses serve wording with the inviter and omits empty Roles', () => {
    const email = prepare({ ...chained, roleNames: [] });
    const { text } = email.request;

    expect(text).toContain(
      m.email_invitation_serve_body_inviter(
        {
          inviterName: 'Ana <Pastor>',
          churchName: 'Grace & <Truth>',
          ministryName: '<b>Worship</b>',
        },
        ptBR,
      ),
    );
    expect(text).not.toContain(m.email_invitation_roles({ roles: '' }, ptBR));
  });

  it('uses the neutral greeting, the Church From and the invitation-to-address footer', () => {
    const { request } = prepare(chained);

    expect(request.from).toBe('"Grace & <Truth>" <church@example.com>');
    expect(request.text).toContain(m.email_greeting_transactional({}, ptBR));
    expect(request.text).toContain(
      m.email_footer_invitation(
        { email: 'member@example.com', churchName: 'Grace & <Truth>' },
        ptBR,
      ),
    );
  });

  it('keeps hostile names text in HTML and readable in text', () => {
    const { html, text } = prepare(chained).request;

    expect(html).toContain('&lt;b&gt;Worship&lt;/b&gt;');
    expect(html).toContain('Grace &amp; &lt;Truth&gt;');
    expect(html).toContain('Vocalist &lt;i&gt;lead&lt;/i&gt;');
    expect(html).not.toContain('<b>Worship</b>');
    expect(text).toContain('<b>Worship</b>');
  });
});

describe('prepareEmail — T1 ChurchAdmin invitation', () => {
  const bootstrap: ChurchBootstrapInvitationEmail = {
    kind: 'invitation.church-bootstrap',
    to: 'admin@example.com',
    churchName: 'Grace Church',
    expiresAt: '2026-12-01T02:30:00.000Z' as Instant,
    churchTimezone: 'America/Sao_Paulo',
    redemptionUrl: 'https://app.church.test/invitations/church/xyz',
  };

  it('renders admin wording with expiry and one Accept button', () => {
    const { subject, text, html } = prepare(bootstrap).request;

    expect(subject).toBe(
      m.email_invitation_admin_title({ churchName: 'Grace Church' }, ptBR),
    );
    expect(text).toContain(
      m.email_invitation_admin_body({ churchName: 'Grace Church' }, ptBR),
    );
    expect(text).toContain(
      m.email_invitation_expires({ expiresAt: '30/11/2026 23:30' }, ptBR),
    );
    expect(text).toContain(bootstrap.redemptionUrl);
    expect(html.match(/<a /g)).toHaveLength(1);
  });
});

describe('prepareEmail — member Ministry Invitation (N1)', () => {
  const prepare = () =>
    prepareEmail({
      payload: memberInvitation,
      from: 'Church <church@example.com>',
      locale: 'pt-BR',
      appName,
    });

  it('renders the layout in the Church Timezone with bell title/body, one action and the raw URL', () => {
    const { locale, request } = prepare();
    const title = m.notification_ministry_invitation_title(
      { ministryName: '<b>Worship</b>' },
      ptBR,
    );

    expect(locale).toBe('pt-BR');
    expect(request.subject).toBe(title);
    expect(request.text).toContain(
      m.email_greeting_notification({ firstName: 'Maria' }, ptBR),
    );
    expect(request.text).toContain(
      m.notification_ministry_invitation_body(
        { ministryName: '<b>Worship</b>' },
        ptBR,
      ),
    );
    expect(request.text).toContain('30/11/2026 23:30');
    expect(request.text).toContain(
      m.email_invitation_roles({ roles: 'Vocalist <i>lead</i>' }, ptBR),
    );
    expect(request.text).toContain(
      `${m.email_ministry_invitation_accept({}, ptBR)}: ${memberInvitation.redemptionUrl}`,
    );
    expect(request.text).toContain(
      m.email_footer_membership({ churchName: 'Grace & <Truth>' }, ptBR),
    );
    expect(request.html).toContain(
      `<a href="${memberInvitation.redemptionUrl}">`,
    );
    expect(request.html.match(/<a /g)).toHaveLength(1);
    expect(request.from).toBe('"Grace & <Truth>" <church@example.com>');
  });

  it('escapes interpolated facts once so they never become markup', () => {
    const { html } = prepare().request;

    expect(html).toContain('&lt;b&gt;Worship&lt;/b&gt;');
    expect(html).toContain('Grace &amp; &lt;Truth&gt;');
    expect(html).toContain('Vocalist &lt;i&gt;lead&lt;/i&gt;');
    expect(html).not.toContain('<b>Worship</b>');
    expect(html).not.toContain('&amp;amp;');
  });

  it('falls back to the neutral greeting without a first name', () => {
    const { text } = prepareEmail({
      payload: { ...memberInvitation, recipientFirstName: '' },
      from: 'church@example.com',
      locale: 'pt-BR',
      appName,
    }).request;

    expect(text?.startsWith(m.email_greeting_transactional({}, ptBR))).toBe(
      true,
    );
  });
});

describe('prepareEmail — Volunteer Transfer digests (N11–12)', () => {
  const ptBR = { locale: 'pt-BR' } as const;
  const churchName = 'Grace & <Truth>';
  const ministryName = '<b>Hospitality</b>';
  const volunteerName = 'Ana & <Bia>';
  const actionUrl = 'https://app.church.test/schedules';
  const digest: TransferMinistryDigestEmail = {
    kind: 'transfer.ministry-digest',
    to: ['leader@example.com'],
    churchName,
    churchTimezone: 'America/Sao_Paulo',
    recipientFirstName: 'Léo',
    ministryName,
    volunteerName,
    actionUrl,
    withdrawnAssignments: [
      {
        // 02:30 UTC on the 7th is 23:30 on the 6th on São Paulo's wall clock.
        startsAt: '2026-12-07T02:30:00.000Z' as Instant,
        endsAt: '2026-12-07T03:30:00.000Z' as Instant,
        eventTitle: 'Culto <Domingo>',
        roleName: 'Recepção',
        sectorName: 'Porta "principal"',
      },
    ],
  };
  const shiftLine =
    'dom 6 dez · 23:30–00:30 · Culto <Domingo> · Recepção · Porta "principal"';
  const prepare = (payload: TransferDigestEmail = digest) =>
    prepareEmail({
      payload,
      from: 'Church <hi@church.test>',
      locale: 'pt-BR',
      appName,
    });

  it('lists each actual Shift line in the Church Timezone, with the See schedules action and membership footer', () => {
    const { locale, request } = prepare();
    const subject = m.email_transfer_digest_subject(
      { volunteerName, ministryName },
      ptBR,
    );

    expect(locale).toBe('pt-BR');
    expect(request.to).toEqual(['leader@example.com']);
    expect(request.from).toBe('"Grace & <Truth>" <hi@church.test>');
    expect(request.subject).toBe(subject);
    expect(request.text).toBe(
      [
        m.email_greeting_notification({ firstName: 'Léo' }, ptBR),
        subject,
        m.email_transfer_digest_body({}, ptBR),
        m.email_transfer_digest_timezone(
          { timeZone: 'America/Sao_Paulo' },
          ptBR,
        ),
        `- ${shiftLine}`,
        `${m.email_transfer_digest_action({}, ptBR)}: ${actionUrl}`,
        `--\n${m.email_footer_membership({ churchName }, ptBR)}`,
      ].join('\n\n'),
    );
    expect(request.html).toContain(
      '<li>dom 6 dez · 23:30–00:30 · Culto &lt;Domingo&gt; · Recepção · Porta &quot;principal&quot;</li>',
    );
    expect(request.html).toContain(`<a href="${actionUrl}">`);
    expect(request.html).not.toContain('<b>Hospitality</b>');
    expect(request.html).not.toContain('&amp;amp;');
  });

  it('says explicitly when no Shifts were withdrawn, and the leaderless variant explains the missing leader', () => {
    const { request } = prepare({
      ...digest,
      kind: 'transfer.leaderless-ministry',
      withdrawnAssignments: [],
    });

    expect(request.subject).toBe(
      m.email_transfer_digest_subject({ volunteerName, ministryName }, ptBR),
    );
    expect(request.text).toContain(
      m.email_transfer_digest_no_assignments({}, ptBR),
    );
    expect(request.text).toContain(
      m.email_transfer_leaderless_body({ ministryName }, ptBR),
    );
    expect(request.html).toContain(
      escapeHtml(m.email_transfer_leaderless_body({ ministryName }, ptBR)),
    );
    expect(request.text).not.toContain(m.email_transfer_digest_body({}, ptBR));
    expect(request.html).not.toContain('<li>');
  });

  it('keeps the ordinary digest free of the leaderless explanation', () => {
    const { request } = prepare();

    expect(request.text).not.toContain(
      m.email_transfer_leaderless_body({ ministryName }, ptBR),
    );
  });
});

describe('formatShiftLine', () => {
  it('reads day, start–end, Event, Role and Sector in that order, in the Church Timezone with 24-hour time', () => {
    expect(
      formatShiftLine({
        startsAt: '2026-10-11T13:30:00.000Z' as Instant,
        endsAt: '2026-10-11T15:00:00.000Z' as Instant,
        eventTitle: 'Morning service',
        roleName: 'Usher',
        sectorName: 'Main door',
        churchTimezone: 'America/Sao_Paulo',
        locale: 'en',
      }),
    ).toBe('Sun 11 Oct · 10:30–12:00 · Morning service · Usher · Main door');
  });
});

const cycleDays = {
  cycleStartDate: '2026-12-01' as CalendarDay,
  cycleEndDate: '2026-12-31' as CalendarDay,
};

describe('prepareEmail — retained scheduling Notifications (N3–N5)', () => {
  const member = {
    to: 'member@example.com',
    churchName: 'Igreja & <Graça>',
    recipientFirstName: 'João',
  };

  it('words availability opened and its reminder from the bell keys, with escaped facts', () => {
    const facts = {
      ...member,
      ministryName: 'Louvor & <Banda>',
      cycleName: 'Dezembro',
      ...cycleDays,
      actionUrl: 'https://app.church.test/dashboard?section=availability',
    };
    const opened = prepareEmail({
      payload: { kind: 'availability.opened', ...facts },
      from: 'church@example.com',
      locale: 'pt-BR',
      appName,
    });
    const reminder = prepareEmail({
      payload: { kind: 'availability.reminder', ...facts },
      from: 'church@example.com',
      locale: 'pt-BR',
      appName,
    });
    const ministryName = 'Louvor & <Banda>';
    const days = { startDate: '01/12/2026', endDate: '31/12/2026' };

    expect(opened.request.subject).toBe(
      m.notification_availability_opened_title({ ministryName }, ptBR),
    );
    expect(reminder.request.subject).toBe(
      m.notification_availability_reminder_title({ ministryName }, ptBR),
    );
    expect(opened.request.text).toContain(
      m.notification_availability_opened_body(
        { cycleName: 'Dezembro', ...days },
        ptBR,
      ),
    );
    expect(reminder.request.text).toContain(
      m.notification_availability_reminder_body(
        { ministryName, cycleName: 'Dezembro', ...days },
        ptBR,
      ),
    );
    expect(opened.request.text).toContain(
      m.email_greeting_notification({ firstName: 'João' }, ptBR),
    );
    expect(opened.request.html).toContain('Louvor &amp; &lt;Banda&gt;');
    expect(opened.request.html).not.toContain('&amp;amp;');
    expect(opened.request.html).toContain(
      `<a href="${facts.actionUrl}">${m.email_availability_action({}, ptBR)}</a>`,
    );
    expect(opened.request.text).toContain(`: ${facts.actionUrl}`);
    expect(opened.request.from).toBe('"Igreja & <Graça>" <church@example.com>');
    expect(opened.request.text).toContain(
      m.email_footer_membership({ churchName: member.churchName }, ptBR),
    );
  });

  it('renders publication times and Shifts in the Church Timezone', () => {
    const email = prepareEmail({
      payload: {
        kind: 'schedule.published',
        ...member,
        ministryName: 'Louvor',
        eventTitle: 'Vigília <Natal>',
        // 02:30 UTC is 23:30 the day before in São Paulo.
        eventStart: '2026-12-25T02:30:00.000Z' as Instant,
        churchTimezone: 'America/Sao_Paulo',
        shifts: [
          {
            roleName: 'Violão',
            startsAt: '2026-12-25T02:30:00.000Z' as Instant,
          },
        ],
        actionUrl: 'https://app.church.test/dashboard?section=assignments',
      },
      from: 'church@example.com',
      locale: 'pt-BR',
      appName,
    });

    expect(email.request.subject).toBe(
      m.notification_schedule_published_title({ ministryName: 'Louvor' }, ptBR),
    );
    expect(email.request.html).toContain('Vigília &lt;Natal&gt;');
    expect(email.request.text).toContain('Vigília <Natal>');
    expect(email.request.text).toContain('24/12/2026 23:30');
    expect(email.request.text).toContain('- Violão — 24/12/2026 23:30');
    expect(email.request.html).toContain(
      m.email_schedule_published_action({}, ptBR),
    );
  });
});

describe('prepareEmail — verification code (T2)', () => {
  const churchName = `Grace & "Truth" <Church>`;
  const prepare = () =>
    prepareEmail({
      payload: {
        kind: 'invitation.verification-code',
        to: 'invitee@example.com',
        churchName,
        code: '042137',
        codeLifetime: { minutes: 10 },
      },
      from: 'Church <hi@church.test>',
      locale: 'pt-BR',
      appName,
    });

  it('puts the code in the subject and both bodies, with the policy lifetime and invitation footer', () => {
    const { locale, request } = prepare();
    const duration = m.email_duration_minutes_other({ count: 10 }, ptBR);

    expect(locale).toBe('pt-BR');
    expect(request.subject).toBe(
      m.email_verification_code_subject({ code: '042137', churchName }, ptBR),
    );
    expect(request.text).toBe(
      [
        m.email_greeting_transactional({}, ptBR),
        m.email_verification_code_heading({ code: '042137' }, ptBR),
        m.email_verification_code_body({ churchName }, ptBR),
        m.email_verification_code_expires({ duration }, ptBR),
        `--\n${m.email_footer_invitation({ email: 'invitee@example.com', churchName }, ptBR)}`,
      ].join('\n\n'),
    );
    expect(request.html).toContain(
      m.email_verification_code_heading({ code: '042137' }, ptBR),
    );
    expect(request.html).toContain(
      m.email_verification_code_expires({ duration }, ptBR),
    );
  });

  it('escapes the Church name exactly once in HTML and keeps it readable in subject and text', () => {
    const { request } = prepare();
    const escaped = 'Grace &amp; &quot;Truth&quot; &lt;Church&gt;';

    expect(request.html).toContain(escaped);
    expect(request.html).not.toContain(churchName);
    expect(request.html).not.toContain('&amp;amp;');
    expect(request.subject).toContain(churchName);
    expect(request.text).toContain(churchName);
  });

  it('has no button or link, and sends as the Church from the configured mailbox', () => {
    const { request } = prepare();

    expect(request.html).not.toContain('<a ');
    expect(request.text).not.toContain('http');
    expect(request.from).toBe(
      '"Grace & \\"Truth\\" <Church>" <hi@church.test>',
    );
  });
});

describe('prepareEmail — Church sender display name', () => {
  it('flattens line breaks so a Church name never adds a header or recipient', () => {
    const { request } = prepareEmail({
      payload: {
        kind: 'invitation.verification-code',
        to: 'invitee@example.com',
        churchName: 'Grace\r\nBcc: victim@example.com',
        code: '042137',
        codeLifetime: { minutes: 10 },
      },
      from: 'hi@church.test',
      locale: 'pt-BR',
      appName,
    });

    expect(request.from).toBe(
      '"Grace Bcc: victim@example.com" <hi@church.test>',
    );
  });
});

describe('prepareEmail — password reset (T3)', () => {
  const ptBR = { locale: 'pt-BR' } as const;
  const appName = 'Igreja <Fé> & "Paz"';
  const resetUrl = 'https://app.church.test/reset?token=a&b=1';
  const prepare = () =>
    prepareEmail({
      payload: {
        kind: 'auth.password-reset',
        to: 'o"neil@example.com',
        resetUrl,
        linkLifetime: { minutes: 60 },
      },
      from: 'Church <hi@church.test>',
      locale: 'pt-BR',
      appName,
    });

  it('renders equivalent text and HTML with facts, ignore line, duration, action and reason footer', () => {
    const { locale, request } = prepare();
    const email = 'o"neil@example.com';
    const duration = m.email_duration_minutes_other({ count: 60 }, ptBR);
    const action = m.email_password_reset_action({}, ptBR);

    expect(locale).toBe('pt-BR');
    expect(request.subject).toBe(
      m.email_password_reset_subject({ appName }, ptBR),
    );
    const facts = [
      m.email_password_reset_body({ email }, ptBR),
      m.email_password_reset_ignore({}, ptBR),
      m.email_password_reset_expires({ duration }, ptBR),
    ];
    const footer = m.email_footer_password_reset({ email, appName }, ptBR);
    for (const fact of facts) expect(request.text).toContain(fact);
    expect(request.text).toContain(action);
    expect(request.text).toContain(resetUrl);
    expect(request.text).toContain(footer);
    expect(request.html).toContain(escapeHtml(facts[2] as string));
    expect(request.html).toContain(escapeHtml(action));
    expect(request.html).toContain(escapeHtml(footer));
  });

  it('escapes the address, app name and URL once in HTML and is church-less', () => {
    const { request, payload } = prepare();

    expect(request.html).toContain('o&quot;neil@example.com');
    expect(request.html).toContain(
      'href="https://app.church.test/reset?token=a&amp;b=1"',
    );
    expect(request.html).not.toContain('&amp;amp;');
    expect(request.html).not.toContain(appName);
    expect(request.subject).toContain(appName);
    expect(payload).not.toHaveProperty('churchName');
  });

  it('sends as the app from the configured mailbox, with no reply-to', () => {
    const { request } = prepare();

    expect(request.from).toBe('"Igreja <Fé> & \\"Paz\\"" <hi@church.test>');
    expect(request).not.toHaveProperty('replyTo');
  });
});
