import { m } from '@church/i18n/messages';
import type { CalendarDay, Instant } from '@church/time';
import { describe, expect, it } from 'vitest';
import type {
  AvailabilityEmail,
  ChainedInvitationEmail,
  ChurchBootstrapInvitationEmail,
  EmailDuration,
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
  inviterName: 'Ana "<Admin>"',
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
  const leader: ChainedInvitationEmail = {
    ...chained,
    ministryAccessLevel: 'leader',
  };

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

  it('lists every retained Ministry offer of an upgraded pair in the same email, escaped', () => {
    const { text, html } = prepare({
      ...bootstrap,
      ministryOffers: [
        {
          ministryName: 'Louvor & <Artes>',
          ministryAccessLevel: 'volunteer',
          roleNames: ['Vocal', 'Bateria'],
          inviterName: 'Ana',
        },
        {
          ministryName: 'Kids',
          ministryAccessLevel: 'leader',
          roleNames: [],
          inviterName: 'Bruno',
        },
      ],
    }).request;
    const input = { churchName: 'Grace Church' };

    expect(text).toContain(m.email_invitation_admin_body(input, ptBR));
    expect(text).toContain(
      `${m.email_invitation_serve_body_inviter(
        { ...input, ministryName: 'Louvor & <Artes>', inviterName: 'Ana' },
        ptBR,
      )} ${m.email_invitation_roles({ roles: 'Vocal, Bateria' }, ptBR)}`,
    );
    expect(text).toContain(
      m.email_invitation_lead_body_inviter(
        { ...input, ministryName: 'Kids', inviterName: 'Bruno' },
        ptBR,
      ),
    );
    expect(html).toContain('Louvor &amp; &lt;Artes&gt;');
    expect(html).not.toContain('<Artes>');
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

  it("renders T1's inviter-led serve offer in the Church Timezone with See invitation and the raw URL", () => {
    const { locale, request } = prepare();
    const offer = {
      churchName: 'Grace & <Truth>',
      ministryName: '<b>Worship</b>',
      inviterName: 'Ana "<Admin>"',
    };
    const title = m.email_invitation_serve_title(offer, ptBR);

    expect(locale).toBe('pt-BR');
    expect(request.subject).toBe(title);
    expect(request.text).toContain(
      m.email_greeting_notification({ firstName: 'Maria' }, ptBR),
    );
    expect(request.text).toContain(
      m.email_invitation_serve_body_inviter(offer, ptBR),
    );
    expect(request.text).toContain(
      m.email_invitation_roles({ roles: 'Vocalist <i>lead</i>' }, ptBR),
    );
    expect(request.text).toContain(
      m.email_invitation_expires({ expiresAt: '30/11/2026 23:30' }, ptBR),
    );
    expect(request.text).toContain(
      `${m.notification_ministry_invitation_action({}, ptBR)}: ${memberInvitation.redemptionUrl}`,
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

    expect(html).toContain('Ana &quot;&lt;Admin&gt;&quot;');
    expect(html).toContain('&lt;b&gt;Worship&lt;/b&gt;');
    expect(html).toContain('Grace &amp; &lt;Truth&gt;');
    expect(html).toContain('Vocalist &lt;i&gt;lead&lt;/i&gt;');
    expect(html).toContain('Ana &quot;&lt;Admin&gt;&quot;');
    expect(html).not.toContain('<b>Worship</b>');
    expect(html).not.toContain('&amp;amp;');
  });

  it('offers a zero-Role leader the lead wording without a Roles line', () => {
    const { subject, text } = prepareEmail({
      payload: {
        ...memberInvitation,
        ministryAccessLevel: 'leader',
        roleNames: [],
      },
      from,
      locale: 'pt-BR',
      appName,
    }).request;
    const offer = {
      churchName: 'Grace & <Truth>',
      ministryName: '<b>Worship</b>',
      inviterName: 'Ana "<Admin>"',
    };

    expect(subject).toBe(m.email_invitation_lead_title(offer, ptBR));
    expect(text).toContain(m.email_invitation_lead_body_inviter(offer, ptBR));
    expect(text).not.toContain(m.email_invitation_roles({ roles: '' }, ptBR));
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

  describe('N3/N4 availability wording', () => {
    const ministryName = 'Louvor & <Banda>';
    const cycleName = 'Dezembro';
    const days = { startDate: '01/12/2026', endDate: '31/12/2026' };
    const facts = {
      ...member,
      ministryName,
      cycleName,
      ...cycleDays,
      actionUrl: 'https://app.church.test/dashboard?section=availability',
    };

    function render(payload: AvailabilityEmail) {
      return prepareEmail({
        payload,
        from: 'church@example.com',
        locale: 'pt-BR',
        appName,
      }).request;
    }

    const shiftWords = m.notification_availability_shifts_other(
      { count: 12 },
      ptBR,
    );
    const openedBody = m.notification_availability_opened_body(
      { shifts: shiftWords, ...days },
      ptBR,
    );
    const reminderBody = m.notification_availability_reminder_body(
      { shifts: shiftWords, ...days },
      ptBR,
    );
    const markOnly = m.notification_availability_mark_only({}, ptBR);
    const answerBy = m.notification_availability_answer_by(
      { deadline: '20/11/2026' },
      ptBR,
    );
    const deadlinePassed = m.notification_availability_deadline_passed(
      { deadline: '20/11/2026' },
      ptBR,
    );

    it('uses the #389 pt-BR text, with no gendered article before the Ministry', () => {
      const opened = render({
        kind: 'availability.opened',
        ...facts,
        ministryName: 'Louvor',
        shiftCount: 2,
        answerBy: '2026-11-20' as CalendarDay,
      });
      const reminder = render({
        kind: 'availability.reminder',
        ...facts,
        ministryName: 'Louvor',
        shiftCount: 1,
        answerBy: '2026-11-20' as CalendarDay,
        deadlinePassed: true,
      });

      expect(opened.subject).toBe(
        'O ministério Louvor precisa da sua disponibilidade · Dezembro',
      );
      expect(opened.text).toContain('2 turnos de 01/12/2026 a 31/12/2026.');
      expect(opened.text).toContain('Responda até 20/11/2026.');
      expect(opened.text).toContain(
        'Marque só os turnos em que não pode servir e confirme.',
      );
      expect(opened.html).toContain('>Responder</a>');
      expect(reminder.subject).toBe(
        'Lembrete: confirme sua disponibilidade · Louvor · Dezembro',
      );
      expect(reminder.text).toContain('1 turno de 01/12/2026 a 31/12/2026.');
      expect(reminder.text).toContain(
        'O prazo era 20/11/2026, mas seu líder ainda precisa da sua resposta.',
      );
    });

    it('opened: Shift count, span and mark-only line, the Deadline only when set', () => {
      const without = render({
        kind: 'availability.opened',
        ...facts,
        shiftCount: 12,
      });
      const withDeadline = render({
        kind: 'availability.opened',
        ...facts,
        shiftCount: 12,
        answerBy: '2026-11-20' as CalendarDay,
      });

      expect(without.subject).toBe(
        m.notification_availability_opened_title(
          { ministryName, cycleName },
          ptBR,
        ),
      );
      expect(without.text).toContain(openedBody);
      expect(without.text).toContain(markOnly);
      expect(without.text).not.toContain(answerBy);
      expect(withDeadline.text).toContain(answerBy);
      expect(withDeadline.text).toContain(markOnly);
    });

    it('opened: always says Answer by, even past the Deadline for a newly eligible Volunteer', () => {
      const { text } = render({
        kind: 'availability.opened',
        ...facts,
        shiftCount: 12,
        answerBy: '2026-11-20' as CalendarDay,
        deadlinePassed: true,
      });

      expect(text).toContain(answerBy);
      expect(text).not.toContain(deadlinePassed);
    });

    it('reminder: no Deadline, before it and after it', () => {
      const reminder = {
        kind: 'availability.reminder',
        ...facts,
        shiftCount: 12,
      } as const;
      const deadline = { answerBy: '2026-11-20' as CalendarDay };
      const without = render(reminder);
      const before = render({
        ...reminder,
        ...deadline,
        deadlinePassed: false,
      });
      const after = render({ ...reminder, ...deadline, deadlinePassed: true });

      expect(without.subject).toBe(
        m.notification_availability_reminder_title(
          { ministryName, cycleName },
          ptBR,
        ),
      );
      expect(without.text).toContain(reminderBody);
      expect(without.text).not.toContain(answerBy);
      expect(without.text).not.toContain(deadlinePassed);
      expect(before.text).toContain(answerBy);
      expect(before.text).not.toContain(deadlinePassed);
      expect(after.text).toContain(deadlinePassed);
      expect(after.text).not.toContain(answerBy);
    });

    it('words one Shift in the singular', () => {
      expect(
        render({ kind: 'availability.opened', ...facts, shiftCount: 1 }).text,
      ).toContain(
        m.notification_availability_opened_body(
          {
            shifts: m.notification_availability_shifts_one({}, ptBR),
            ...days,
          },
          ptBR,
        ),
      );
    });

    it('renders a row frozen before the Shift count from the Cycle span alone', () => {
      const { text } = render({ kind: 'availability.opened', ...facts });

      expect(text).toContain(m.notification_availability_span(days, ptBR));
      expect(text).toContain(markOnly);
      expect(text).not.toContain('undefined');
    });

    it('escapes every interpolated value in the HTML and keeps the plain text intact', () => {
      const { html, text, from } = render({
        kind: 'availability.opened',
        ...facts,
        cycleName: '<i>Dezembro</i>',
        shiftCount: 12,
      });

      expect(html).toContain('Louvor &amp; &lt;Banda&gt;');
      expect(html).toContain('&lt;i&gt;Dezembro&lt;/i&gt;');
      expect(html).not.toContain('<Banda>');
      expect(html).not.toContain('<i>Dezembro');
      expect(html).not.toContain('&amp;amp;');
      expect(text).toContain('Louvor & <Banda>');
      expect(text).toContain('<i>Dezembro</i>');
      expect(html).toContain(
        `<a href="${facts.actionUrl}">${m.email_availability_action({}, ptBR)}</a>`,
      );
      expect(text).toContain(`: ${facts.actionUrl}`);
      expect(from).toBe('"Igreja & <Graça>" <church@example.com>');
      expect(text).toContain(
        m.email_greeting_notification({ firstName: 'João' }, ptBR),
      );
      expect(text).toContain(
        m.email_footer_membership({ churchName: member.churchName }, ptBR),
      );
    });
  });

  it.each([
    'en',
    'pt-BR',
  ] as const)('renders every published Shift in %s with escaped HTML and a full text link', (locale) => {
    const actionUrl = 'https://app.church.test/dashboard?section=assignments';
    const email = prepareEmail({
      payload: {
        kind: 'schedule.published',
        ...member,
        ministryName: 'Louvor',
        cycleName: 'Dezembro 2026',
        churchTimezone: 'America/Sao_Paulo',
        shifts: [
          {
            eventTitle: 'Vigília <Natal>',
            startsAt: '2026-12-25T02:30:00.000Z' as Instant,
            endsAt: '2026-12-25T04:00:00.000Z' as Instant,
            roleName: 'Violão & Voz',
            sectorName: '<Palco>',
          },
          {
            eventTitle: 'Culto',
            startsAt: '2026-12-26T12:00:00.000Z' as Instant,
            endsAt: '2026-12-26T13:00:00.000Z' as Instant,
            roleName: 'Voz',
            sectorName: 'Coro',
          },
        ],
        actionUrl,
      },
      from,
      locale,
      appName,
    });
    const options = { locale };
    expect(email.request.subject).toBe(
      m.notification_schedule_published_title(
        { ministryName: 'Louvor' },
        options,
      ),
    );
    expect(email.request.text).toContain(
      m.notification_schedule_published_body(
        { cycleName: 'Dezembro 2026', ministryName: 'Louvor' },
        options,
      ),
    );
    expect(email.request.text).toContain(
      'Vigília <Natal> · Violão & Voz · <Palco>',
    );
    expect(email.request.text).toContain('Culto · Voz · Coro');
    expect(email.request.text).toContain('23:30–01:00');
    expect(email.request.text).toContain('09:00–10:00');
    expect(email.request.html).toContain(
      'Vigília &lt;Natal&gt; · Violão &amp; Voz · &lt;Palco&gt;',
    );
    expect(email.request.html).toContain(`href="${actionUrl}"`);
    expect(email.request.text).toContain(actionUrl);
    expect(email.request.text).toContain(
      m.email_schedule_published_action({}, options),
    );
    expect(email.request.from).toBe('"Igreja & <Graça>" <church@example.com>');
    expect(email.request.text).toContain(
      m.email_footer_membership({ churchName: member.churchName }, options),
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

describe('prepareEmail — typed email durations', () => {
  interface ResetLifetimeInput {
    linkLifetime: EmailDuration;
    locale: 'en' | 'pt-BR';
  }
  const resetLifetime = ({ linkLifetime, locale }: ResetLifetimeInput) =>
    prepareEmail({
      payload: {
        kind: 'auth.password-reset',
        to: 'user@example.com',
        resetUrl: 'https://app.church.test/reset-password?token=t',
        linkLifetime,
      },
      from: 'Church <hi@church.test>',
      locale,
      appName: 'Church',
    }).request.text;

  it.each([
    [{ hours: 1 }, 'en', 'This link expires in 1 hour.'],
    [{ hours: 1 }, 'pt-BR', 'Este link expira em 1 hora.'],
    [{ hours: 2 }, 'en', 'This link expires in 2 hours.'],
    [{ hours: 2 }, 'pt-BR', 'Este link expira em 2 horas.'],
    [{ days: 1 }, 'en', 'This link expires in 1 day.'],
    [{ days: 3 }, 'pt-BR', 'Este link expira em 3 dias.'],
    [{ minutes: 1 }, 'pt-BR', 'Este link expira em 1 minuto.'],
    [{ minutes: 10 }, 'en', 'This link expires in 10 minutes.'],
  ] as const)('renders %j in %s', (duration, locale, sentence) => {
    expect(resetLifetime({ linkLifetime: duration, locale })).toContain(
      sentence,
    );
  });
});
