import { m } from '@church/i18n/messages';
import type { CalendarDay, Instant } from '@church/time';
import { describe, expect, it } from 'vitest';
import type {
  MinistryInvitationEmail,
  TransferMinistryDigestEmail,
} from '@/domain/contracts/infrastructure/email-sender';
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

const ptBR = { locale: 'pt-BR' } as const;

describe('prepareEmail — member Ministry Invitation (N1)', () => {
  const prepare = () =>
    prepareEmail({
      payload: memberInvitation,
      from: 'Church <church@example.com>',
      locale: 'pt-BR',
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
      m.email_greeting_member({ firstName: 'Maria' }, ptBR),
    );
    expect(request.text).toContain(
      m.notification_ministry_invitation_body(
        { ministryName: '<b>Worship</b>' },
        ptBR,
      ),
    );
    expect(request.text).toContain('30/11/2026 23:30');
    expect(request.text).toContain('- Vocalist <i>lead</i>');
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
    }).request;

    expect(text?.startsWith(m.email_greeting_transactional({}, ptBR))).toBe(
      true,
    );
  });
});

describe('prepareEmail — Volunteer Transfer digests', () => {
  const digest: TransferMinistryDigestEmail = {
    kind: 'transfer.ministry-digest',
    to: ['leader@example.com'],
    ministryName: '<b>Hospitality</b>',
    volunteerName: 'Ana & <Bia>',
    withdrawnAssignments: [
      {
        eventName: 'Culto <Domingo>',
        eventTimeBlockStart: '2026-12-06T12:00:00.000Z' as Instant,
        roleName: 'Recepção',
      },
    ],
  };

  it('renders the shared catalog in the recipient locale, escaping every fact', () => {
    const email = prepareEmail({
      payload: digest,
      from: 'church@example.com',
      locale: 'pt-BR',
    });

    expect(email.locale).toBe('pt-BR');
    expect(email.request.to).toEqual(['leader@example.com']);
    expect(email.request.subject).toBe(
      m.email_transfer_digest_subject(
        { volunteerName: 'Ana & <Bia>', ministryName: '<b>Hospitality</b>' },
        { locale: 'pt-BR' },
      ),
    );
    expect(email.request.html).toContain('Ana &amp; &lt;Bia&gt;');
    expect(email.request.html).toContain('Culto &lt;Domingo&gt;');
    expect(email.request.html).toContain('06/12/2026 12:00');
    expect(email.request.html).not.toContain('<b>Hospitality</b>');
  });

  it('frames the leaderless escalation and says when nothing was withdrawn', () => {
    const email = prepareEmail({
      payload: {
        ...digest,
        kind: 'transfer.leaderless-ministry',
        withdrawnAssignments: [],
      },
      from: 'church@example.com',
      locale: 'pt-BR',
    });

    expect(email.request.subject).toBe(
      m.email_transfer_leaderless_subject(
        { ministryName: '<b>Hospitality</b>' },
        { locale: 'pt-BR' },
      ),
    );
    expect(email.request.html).toContain(
      m.email_transfer_digest_no_assignments({}, { locale: 'pt-BR' }),
    );
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
    });
    const reminder = prepareEmail({
      payload: { kind: 'availability.reminder', ...facts },
      from: 'church@example.com',
      locale: 'pt-BR',
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
      m.email_greeting_member({ firstName: 'João' }, ptBR),
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
    });

    expect(request.from).toBe(
      '"Grace Bcc: victim@example.com" <hi@church.test>',
    );
  });
});
