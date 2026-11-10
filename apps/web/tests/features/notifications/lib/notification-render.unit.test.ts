import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveNotificationDestination } from '@/features/notifications/lib/notification-navigation';
import { renderNotification } from '@/features/notifications/lib/notification-render';
import type { GetNotifications200ItemsItem } from '@/infrastructure/api/churchAPI.schemas';

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));

const ID = '22222222-2222-4222-8222-222222222222';
const base = { id: ID, createdAt: '2026-12-20T12:00:00.000Z' };
const availability = {
  cycleId: ID,
  ministryId: ID,
  ministryName: 'Louvor',
  cycleName: 'Dezembro 2026',
  cycleStartDate: '2026-12-01',
  cycleEndDate: '2026-12-31',
};
const published = {
  cycleId: ID,
  cycleName: 'Dezembro 2026',
  ministryId: ID,
  ministryName: 'Louvor',
  churchTimezone: 'America/Sao_Paulo',
  shifts: [
    {
      eventTitle: 'Vigília de Natal',
      startsAt: '2026-12-25T02:30:00.000Z',
      endsAt: '2026-12-25T04:00:00.000Z',
      roleName: 'Violão',
      sectorName: 'Palco',
    },
    {
      eventTitle: 'Culto',
      startsAt: '2026-12-26T12:00:00.000Z',
      endsAt: '2026-12-26T13:00:00.000Z',
      roleName: 'Voz',
      sectorName: 'Coro',
    },
  ],
};

const opened = {
  ...base,
  kind: 'availability_opened',
  data: availability,
} as GetNotifications200ItemsItem;
const reminder = {
  ...base,
  kind: 'availability_reminder',
  data: availability,
} as GetNotifications200ItemsItem;
const schedule = {
  ...base,
  kind: 'schedule_published',
  data: published,
} as GetNotifications200ItemsItem;

afterEach(() => overwriteGetLocale(() => 'en'));

describe('retained scheduling Notifications', () => {
  describe.each([
    'en',
    'pt-BR',
  ] as const)('N3/N4 words in %s, the same keys as the email', (locale) => {
    const language = { locale };
    const days = { startDate: '01/12/2026', endDate: '31/12/2026' };
    const names = { ministryName: 'Louvor', cycleName: 'Dezembro 2026' };
    const render = (kind: string, facts: object) =>
      renderNotification({
        ...base,
        kind,
        data: { ...availability, ...facts },
      } as GetNotifications200ItemsItem);
    const lines = (...parts: string[]) => parts.join('\n');
    const markOnly = () => m.notification_availability_mark_only({}, language);
    const shifts = () =>
      m.notification_availability_shifts_other({ count: 12 }, language);
    const openedBody = () =>
      m.notification_availability_opened_body(
        { shifts: shifts(), ...days },
        language,
      );
    const reminderBody = () =>
      m.notification_availability_reminder_body(
        { shifts: shifts(), ...days },
        language,
      );
    const deadline = { deadline: '20/11/2026' };
    const answerBy = '2026-11-20';

    it('opened: count, span, mark-only line and the Answer action, in the viewing locale', () => {
      overwriteGetLocale(() => locale);
      const rendered = render('availability_opened', { shiftCount: 12 });

      expect(rendered.title).toBe(
        m.notification_availability_opened_title(names, language),
      );
      expect(rendered.body).toBe(lines(openedBody(), markOnly()));
      expect(rendered.actionLabel).toBe(
        m.email_availability_action({}, language),
      );
    });

    it('opened: always says Answer by, even past the Deadline', () => {
      overwriteGetLocale(() => locale);
      const { body } = render('availability_opened', {
        shiftCount: 12,
        answerBy,
        deadlinePassed: true,
      });

      expect(body).toBe(
        lines(
          openedBody(),
          m.notification_availability_answer_by(deadline, language),
          markOnly(),
        ),
      );
    });

    it('reminder: words the Deadline before and after it passed', () => {
      overwriteGetLocale(() => locale);
      const facts = { shiftCount: 12, answerBy };

      expect(render('availability_reminder', facts).title).toBe(
        m.notification_availability_reminder_title(names, language),
      );
      expect(
        render('availability_reminder', { ...facts, deadlinePassed: false })
          .body,
      ).toBe(
        lines(
          reminderBody(),
          m.notification_availability_answer_by(deadline, language),
          markOnly(),
        ),
      );
      expect(
        render('availability_reminder', { ...facts, deadlinePassed: true })
          .body,
      ).toBe(
        lines(
          reminderBody(),
          m.notification_availability_deadline_passed(deadline, language),
          markOnly(),
        ),
      );
    });

    it('words one Shift in the singular', () => {
      overwriteGetLocale(() => locale);

      expect(render('availability_opened', { shiftCount: 1 }).body).toBe(
        lines(
          m.notification_availability_opened_body(
            {
              shifts: m.notification_availability_shifts_one({}, language),
              ...days,
            },
            language,
          ),
          markOnly(),
        ),
      );
    });

    it.each([
      'availability_opened',
      'availability_reminder',
    ])('%s history frozen before the count and Deadline stays readable', (kind) => {
      overwriteGetLocale(() => locale);
      const rendered = render(kind, {});
      const { body } = rendered;

      expect(body).toBe(
        lines(m.notification_availability_span(days, language), markOnly()),
      );
      expect(body).not.toContain('undefined');
      expect(rendered.actionLabel).toBe(
        m.email_availability_action({}, language),
      );
    });
  });

  it('distinguishes availability opened from the reminder', () => {
    expect(renderNotification(opened).title).not.toBe(
      renderNotification(reminder).title,
    );
    expect(renderNotification(opened).kindLabel).not.toBe(
      renderNotification(reminder).kindLabel,
    );
  });

  it('renders the opened title and Cycle days in pt-BR', () => {
    overwriteGetLocale(() => 'pt-BR');

    expect(renderNotification(opened)).toMatchObject({
      title:
        'O ministério Louvor precisa da sua disponibilidade · Dezembro 2026',
      body: 'De 01/12/2026 a 31/12/2026.\nMarque só os turnos em que não pode servir e confirme.',
      kindLabel: 'Disponibilidade solicitada',
    });
    expect(renderNotification(reminder).title).toBe(
      'Lembrete: confirme sua disponibilidade · Louvor · Dezembro 2026',
    );
  });

  it.each([
    'en',
    'pt-BR',
  ] as const)('renders every published Shift in %s', (locale) => {
    overwriteGetLocale(() => locale);
    const rendered = renderNotification(schedule);
    const options = { locale };
    expect(rendered.title).toBe(
      m.notification_schedule_published_title(
        { ministryName: 'Louvor' },
        options,
      ),
    );
    expect(rendered.body).toContain(
      m.notification_schedule_published_body(
        { cycleName: 'Dezembro 2026', ministryName: 'Louvor' },
        options,
      ),
    );
    expect(rendered.body).toContain(
      locale === 'en' ? 'Thu 24 Dec' : 'qui 24 dez',
    );
    expect(rendered.body).toContain(
      locale === 'en' ? 'Sat 26 Dec' : 'sáb 26 dez',
    );
    expect(rendered.body).toContain(
      '23:30–01:00 · Vigília de Natal · Violão · Palco',
    );
    expect(rendered.body).toContain('09:00–10:00 · Culto · Voz · Coro');
    expect(rendered.actionLabel).toBe(
      m.email_schedule_published_action({}, options),
    );
  });

  it.each([
    'en',
    'pt-BR',
  ] as const)('renders personal Schedule changes in %s', (locale) => {
    overwriteGetLocale(() => locale);
    const [first, second] = published.shifts;
    if (!first || !second) throw new Error('missing shifts');
    const item: GetNotifications200ItemsItem = {
      ...base,
      kind: 'schedule_updated',
      data: {
        cycleId: ID,
        cycleName: published.cycleName,
        ministryId: ID,
        ministryName: published.ministryName,
        churchTimezone: published.churchTimezone,
        changes: [
          { kind: 'added', assignment: first },
          {
            kind: 'removed',
            assignment: { ...second, swapRequestCovered: true },
          },
          { kind: 'moved', before: first, after: second },
        ],
      },
    };
    const rendered = renderNotification(item);
    const options = { locale };
    expect(rendered.title).toBe(
      m.notification_schedule_updated_title(
        { ministryName: 'Louvor' },
        options,
      ),
    );
    expect(rendered.body).toContain(
      m.notification_schedule_updated_covered({}, options),
    );
    expect(rendered.body).toContain('23:30–01:00 · Vigília de Natal');
    expect(rendered.body).toContain('09:00–10:00 · Culto');
    expect(resolveNotificationDestination(item).target).toEqual({
      to: '/my-schedule',
    });
  });

  it.each([
    'availability_opened',
    'availability_reminder',
  ] as const)('%s keeps its availability deep link for old and new facts', (kind) => {
    for (const facts of [{}, { shiftCount: 12, answerBy: '2026-11-20' }]) {
      const item: GetNotifications200ItemsItem = {
        ...base,
        kind,
        data: { ...availability, ...facts },
      };
      expect(resolveNotificationDestination(item)).toEqual({
        target: { to: '/availability' },
        isFallback: false,
      });
    }
  });

  it.each([
    'availability_opened',
    'availability_reminder',
  ] as const)('%s opens the recipient check when its id was frozen in the data', (kind) => {
    const item: GetNotifications200ItemsItem = {
      ...base,
      kind,
      data: { ...availability, checkId: ID },
    };
    expect(resolveNotificationDestination(item)).toEqual({
      target: { to: '/availability/$checkId', params: { checkId: ID } },
      isFallback: false,
    });
    expect(renderNotification(item).actionLabel).toBe(
      m.email_availability_action(),
    );
  });
});

describe('Cycle ready to prepare Notification (N2)', () => {
  const MINISTRY_A = '33333333-3333-4333-8333-333333333331';
  const MINISTRY_B = '33333333-3333-4333-8333-333333333332';
  const ready = (ministries: { id: string; name: string }[], eventCount = 3) =>
    ({
      ...base,
      kind: 'cycle_ready_to_prepare',
      data: {
        cycleId: ID,
        cycleName: 'Dezembro 2026',
        cycleStartDate: '2026-12-01',
        cycleEndDate: '2026-12-31',
        eventCount,
        ministries,
      },
    }) as GetNotifications200ItemsItem;

  it('renders the Cycle, its inclusive days, Event count and the recipient Ministries in pt-BR', () => {
    overwriteGetLocale(() => 'pt-BR');

    expect(
      renderNotification(
        ready([
          { id: MINISTRY_A, name: 'Louvor' },
          { id: MINISTRY_B, name: 'Kids' },
        ]),
      ),
    ).toEqual({
      title: 'Hora de preparar Dezembro 2026',
      body: 'Dezembro 2026 (01/12/2026 – 31/12/2026) foi enviado com 3 eventos para preparar.\nSeus ministérios: Louvor, Kids',
      kindLabel: 'Ciclo pronto para preparar',
      actionLabel: 'Preparar',
    });
  });

  it('uses the singular for one Event and one Ministry', () => {
    overwriteGetLocale(() => 'en');
    const { body } = renderNotification(
      ready([{ id: MINISTRY_A, name: 'Louvor' }], 1),
    );

    expect(body).toBe(
      'Dezembro 2026 (01/12/2026 – 31/12/2026) was sent with 1 Event to prepare.\nYour Ministry: Louvor',
    );
  });

  it("opens a single Ministry's Schedule for the Cycle", () => {
    expect(
      resolveNotificationDestination(
        ready([{ id: MINISTRY_A, name: 'Louvor' }]),
      ),
    ).toEqual({
      target: {
        to: '/schedules/$ministryId/$cycleId',
        params: { ministryId: MINISTRY_A, cycleId: ID },
      },
      isFallback: false,
    });
  });

  it('opens the Cycle-preserving picker for several Ministries', () => {
    expect(
      resolveNotificationDestination(
        ready([
          { id: MINISTRY_A, name: 'Louvor' },
          { id: MINISTRY_B, name: 'Kids' },
        ]),
      ),
    ).toEqual({
      target: {
        to: '/schedules',
        search: { cycleId: ID, ministryIds: `${MINISTRY_A},${MINISTRY_B}` },
      },
      isFallback: false,
    });
  });
});

describe('Event changed Notification (N10 add)', () => {
  const MINISTRY_A = '33333333-3333-4333-8333-333333333331';
  const MINISTRY_B = '33333333-3333-4333-8333-333333333332';
  const added = (ministries: { id: string; name: string }[]) =>
    ({
      ...base,
      kind: 'event_changed',
      data: {
        cycleId: ID,
        cycleName: 'Outubro',
        eventId: ID,
        eventTitle: 'Vigília',
        adminName: 'Ana',
        churchTimezone: 'America/Sao_Paulo',
        ministries,
        // 22:00Z is 19:00 in America/Sao_Paulo.
        change: {
          kind: 'add',
          start: '2026-10-14T22:00:00.000Z',
          end: '2026-10-15T00:00:00.000Z',
        },
      },
    }) as GetNotifications200ItemsItem;

  it('renders the pt-BR title, admin, Church-Timezone time and Ministries', () => {
    overwriteGetLocale(() => 'pt-BR');
    const { title, body, kindLabel, actionLabel } = renderNotification(
      added([{ id: MINISTRY_A, name: 'Louvor' }]),
    );

    expect(title).toBe('Novo evento em Outubro: Vigília');
    expect(body).toContain('Ana adicionou em');
    expect(body).toContain('19:00–21:00');
    expect(body).toContain('Seu ministério: Louvor');
    expect(kindLabel).toBe('Evento alterado');
    expect(actionLabel).toBe('Abrir escala');
  });

  it('renders the English anchor title', () => {
    overwriteGetLocale(() => 'en');

    expect(
      renderNotification(added([{ id: MINISTRY_A, name: 'A' }])).title,
    ).toBe('New event in Outubro: Vigília');
  });

  it('opens one Ministry Schedule, or the Cycle-preserving picker for several', () => {
    expect(
      resolveNotificationDestination(added([{ id: MINISTRY_A, name: 'A' }])),
    ).toEqual({
      target: {
        to: '/schedules/$ministryId/$cycleId',
        params: { ministryId: MINISTRY_A, cycleId: ID },
      },
      isFallback: false,
    });
    expect(
      resolveNotificationDestination(
        added([
          { id: MINISTRY_A, name: 'A' },
          { id: MINISTRY_B, name: 'B' },
        ]),
      ),
    ).toEqual({
      target: {
        to: '/schedules',
        search: { cycleId: ID, ministryIds: `${MINISTRY_A},${MINISTRY_B}` },
      },
      isFallback: false,
    });
  });

  it('renders a pt-BR move: new time in the title, old time and count in the body, one line per Ministry', () => {
    overwriteGetLocale(() => 'pt-BR');
    const moved = {
      ...base,
      kind: 'event_changed',
      data: {
        cycleId: ID,
        cycleName: 'Outubro',
        eventId: ID,
        eventTitle: 'Vigília',
        adminName: 'Ana',
        churchTimezone: 'America/Sao_Paulo',
        ministries: [
          { id: MINISTRY_A, name: 'Louvor' },
          { id: MINISTRY_B, name: 'Recepção' },
        ],
        change: {
          kind: 'move',
          previousStart: '2026-10-14T22:00:00.000Z',
          previousEnd: '2026-10-15T00:00:00.000Z',
          start: '2026-10-21T22:00:00.000Z',
          end: '2026-10-22T00:00:00.000Z',
          volunteerCount: 1,
          impacts: [
            {
              ministryId: MINISTRY_A,
              ministryName: 'Louvor',
              volunteerCount: 1,
              answersGiven: true,
            },
            {
              ministryId: MINISTRY_B,
              ministryName: 'Recepção',
              volunteerCount: 0,
              answersGiven: false,
            },
          ],
        },
      },
    } as GetNotifications200ItemsItem;

    const { title, body } = renderNotification(moved);

    expect(title).toMatch(/^Alterado: Vigília → .*19:00–21:00$/);
    expect(body).toContain('Ana alterou o horário, que era');
    expect(body).toContain('1 dos seus voluntários foi afetado');
    expect(body).toContain(
      `Louvor: 1 voluntário afetado · ${m.prepare_answers_coverage_note({}, { locale: 'pt-BR' })}`,
    );
    expect(body).toContain('Recepção: 0 voluntários afetados');
    expect(body).not.toContain('Recepção: 0 voluntários afetados ·');
  });
});

describe('Ministry invitation Notification (N1)', () => {
  const pt = { locale: 'pt-BR' } as const;
  const legacy = {
    ...base,
    kind: 'ministry_invitation',
    data: { ministryInvitationId: ID, ministryId: ID, ministryName: 'Louvor' },
  } as GetNotifications200ItemsItem;
  const offer = {
    ...legacy,
    data: {
      ...legacy.data,
      churchName: 'Igreja Graça',
      churchTimezone: 'America/Sao_Paulo',
      inviterName: 'Ana <b>Souza</b>',
      ministryAccessLevel: 'volunteer',
      roleNames: ['Violão', 'Voz'],
      // 02:00Z is 23:00 the evening before in America/Sao_Paulo.
      expiresAt: '2026-11-09T02:00:00.000Z',
    },
  } as GetNotifications200ItemsItem;
  const names = {
    inviterName: 'Ana <b>Souza</b>',
    ministryName: 'Louvor',
    churchName: 'Igreja Graça',
  };

  it("renders T1's inviter-led serve offer with Roles, Church-Timezone expiry and See invitation in pt-BR", () => {
    overwriteGetLocale(() => 'pt-BR');

    expect(renderNotification(offer)).toEqual({
      title: m.email_invitation_serve_title(names, pt),
      body: [
        m.email_invitation_serve_body_inviter(names, pt),
        m.email_invitation_roles({ roles: 'Violão, Voz' }, pt),
        m.email_invitation_expires({ expiresAt: '08/11/2026 23:00' }, pt),
      ].join('\n'),
      kindLabel: m.notification_kind_ministry_invitation({}, pt),
      actionLabel: m.notification_ministry_invitation_action({}, pt),
    });
    expect(renderNotification(offer).actionLabel).toBe('Ver convite');
  });

  it('renders the lead offer without a Roles line for a zero-Role leader', () => {
    overwriteGetLocale(() => 'pt-BR');
    const leader = {
      ...offer,
      data: { ...offer.data, ministryAccessLevel: 'leader', roleNames: [] },
    } as GetNotifications200ItemsItem;

    const rendered = renderNotification(leader);

    expect(rendered.title).toBe(m.email_invitation_lead_title(names, pt));
    expect(rendered.body).toBe(
      [
        m.email_invitation_lead_body_inviter(names, pt),
        m.email_invitation_expires({ expiresAt: '08/11/2026 23:00' }, pt),
      ].join('\n'),
    );
  });

  it('keeps an inbox row stored before the offer facts readable and openable, inventing nothing', () => {
    overwriteGetLocale(() => 'pt-BR');

    expect(renderNotification(legacy)).toEqual({
      title: m.notification_ministry_invitation_title(
        { ministryName: 'Louvor' },
        pt,
      ),
      body: m.notification_ministry_invitation_body(
        { ministryName: 'Louvor' },
        pt,
      ),
      kindLabel: m.notification_kind_ministry_invitation({}, pt),
      actionLabel: m.notification_ministry_invitation_action({}, pt),
    });
    expect(resolveNotificationDestination(legacy)).toEqual({
      target: {
        to: '/invitations/ministry/$invitationId',
        params: { invitationId: ID },
      },
      isFallback: false,
    });
  });

  it('follows the viewing locale for the same frozen facts', () => {
    expect(renderNotification(offer).actionLabel).toBe('See invitation');
  });
});

describe('Swap request Notification (N7)', () => {
  const swap = {
    ...base,
    kind: 'swap_request',
    data: {
      swapRequestId: ID,
      cycleId: ID,
      ministryId: ID,
      ministryName: 'Recepção',
      churchTimezone: 'America/Sao_Paulo',
      volunteerName: 'Maria Souza',
      shift: {
        eventTitle: 'Culto',
        roleName: 'Recepcionista',
        sectorName: 'Portaria',
        startsAt: '2030-10-13T13:00:00.000Z',
        endsAt: '2030-10-13T15:00:00.000Z',
      },
      note: 'João cobre',
    },
  } as GetNotifications200ItemsItem;

  it('renders the Volunteer, Ministry, Shift line and note in pt-BR and opens the board', () => {
    overwriteGetLocale(() => 'pt-BR');
    const pt = { locale: 'pt-BR' } as const;

    const words = renderNotification(swap);

    expect(words.title).toBe(
      m.notification_swap_request_title({ volunteerName: 'Maria Souza' }, pt),
    );
    expect(words.body).toContain(
      m.notification_swap_request_body(
        {
          ministryName: 'Recepção',
          shift: 'dom 13 out · 10:00–12:00 · Culto · Recepcionista · Portaria',
        },
        pt,
      ),
    );
    expect(words.body).toContain(
      m.notification_swap_request_note({ note: 'João cobre' }, pt),
    );
    expect(words.kindLabel).toBe(m.notification_kind_swap_request({}, pt));
    expect(resolveNotificationDestination(swap)).toEqual({
      target: {
        to: '/schedules/$ministryId/$cycleId/assign',
        params: { ministryId: ID, cycleId: ID },
        // The same deep link the email carries.
        search: { swapRequest: ID },
      },
      isFallback: false,
    });
  });
});

describe('Swap request answered Notification (N8)', () => {
  const answered = (reply?: string) =>
    ({
      ...base,
      kind: 'swap_request_answered',
      data: {
        assignmentId: ID,
        ministryId: ID,
        ministryName: 'Louvor',
        leaderName: 'Lídia',
        churchTimezone: 'America/Sao_Paulo',
        shift: {
          eventTitle: 'Culto',
          roleName: 'Violão',
          sectorName: 'Palco',
          startsAt: '2026-12-13T13:30:00.000Z',
          endsAt: '2026-12-13T15:00:00.000Z',
        },
        reply,
      },
    }) as GetNotifications200ItemsItem;

  it('renders the kept Shift and the reply in pt-BR, and opens the Assignment page', () => {
    overwriteGetLocale(() => 'pt-BR');
    const item = answered('Fica com a gente');

    expect(renderNotification(item)).toEqual({
      title: 'Seu pedido de troca foi respondido',
      body: 'Lídia manteve você em:\ndom 13 dez · 10:30–12:00 · Culto · Violão · Palco\nResposta: Fica com a gente\nVocê pode pedir de novo pelo turno.',
      kindLabel: 'Pedido de troca respondido',
      actionLabel: 'Ver detalhes',
    });
    expect(resolveNotificationDestination(item)).toEqual({
      target: {
        to: '/my-schedule/$assignmentId',
        params: { assignmentId: ID },
      },
      isFallback: false,
    });
  });

  it('omits the reply line when there is none', () => {
    overwriteGetLocale(() => 'en');
    expect(renderNotification(answered()).body).not.toContain('Reply:');
  });
});
