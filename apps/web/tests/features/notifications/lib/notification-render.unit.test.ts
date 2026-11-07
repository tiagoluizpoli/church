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
  eventId: ID,
  cycleId: ID,
  ministryId: ID,
  ministryName: 'Louvor',
  eventTitle: 'Vigília de Natal',
  // 02:30Z is 23:30 the day before in America/Sao_Paulo.
  eventStart: '2026-12-25T02:30:00.000Z',
  eventEnd: '2026-12-25T04:00:00.000Z',
  churchTimezone: 'America/Sao_Paulo',
  shifts: [{ roleName: 'Violão', startsAt: '2026-12-25T02:30:00.000Z' }],
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
  describe('N3/N4 words, the same keys as the email', () => {
    const ptBR = { locale: 'pt-BR' } as const;
    const days = { startDate: '01/12/2026', endDate: '31/12/2026' };
    const names = { ministryName: 'Louvor', cycleName: 'Dezembro 2026' };
    const render = (kind: string, facts: object) =>
      renderNotification({
        ...base,
        kind,
        data: { ...availability, ...facts },
      } as GetNotifications200ItemsItem);
    const lines = (...parts: string[]) => parts.join('\n');
    const markOnly = () => m.notification_availability_mark_only({}, ptBR);
    const shifts = () =>
      m.notification_availability_shifts_other({ count: 12, ...days }, ptBR);
    const deadline = { deadline: '20/11/2026' };
    const answerBy = '2026-11-20';

    it('opened: count, span, mark-only line and the Answer action, in pt-BR', () => {
      overwriteGetLocale(() => 'pt-BR');
      const rendered = render('availability_opened', { shiftCount: 12 });

      expect(rendered.title).toBe(
        m.notification_availability_opened_title(names, ptBR),
      );
      expect(rendered.body).toBe(lines(shifts(), markOnly()));
      expect(rendered.actionLabel).toBe(m.email_availability_action({}, ptBR));
    });

    it('reminder: words the Deadline before and after it passed', () => {
      overwriteGetLocale(() => 'pt-BR');
      const facts = { shiftCount: 12, answerBy };

      expect(render('availability_reminder', facts).title).toBe(
        m.notification_availability_reminder_title(names, ptBR),
      );
      expect(
        render('availability_reminder', { ...facts, deadlinePassed: false })
          .body,
      ).toBe(
        lines(
          shifts(),
          m.notification_availability_answer_by(deadline, ptBR),
          markOnly(),
        ),
      );
      expect(
        render('availability_reminder', { ...facts, deadlinePassed: true })
          .body,
      ).toBe(
        lines(
          shifts(),
          m.notification_availability_deadline_passed(deadline, ptBR),
          markOnly(),
        ),
      );
    });

    it('words one Shift in the singular', () => {
      overwriteGetLocale(() => 'pt-BR');

      expect(render('availability_opened', { shiftCount: 1 }).body).toBe(
        lines(m.notification_availability_shifts_one(days, ptBR), markOnly()),
      );
    });

    it('renders history frozen before the count and Deadline from the span', () => {
      overwriteGetLocale(() => 'pt-BR');
      const { body } = render('availability_reminder', {});

      expect(body).toBe(
        lines(m.notification_availability_span(days, ptBR), markOnly()),
      );
      expect(body).not.toContain('undefined');
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

  it('renders the publication detail in the frozen Church Timezone with the recipient Shifts', () => {
    overwriteGetLocale(() => 'pt-BR');

    const rendered = renderNotification(schedule);

    expect(rendered.title).toBe('Escala de Louvor publicada');
    expect(rendered.body).toBe(
      'Vigília de Natal, em 24/12/2026 23:30, foi publicado para Louvor.\nSeus turnos: Violão (24/12/2026 23:30)',
    );
  });

  it('follows the current locale for the same frozen facts', () => {
    expect(renderNotification(schedule).title).toBe(
      'Louvor schedule published',
    );
  });

  it('says so when the recipient has no Shifts in the event', () => {
    const none = {
      ...schedule,
      data: { ...published, shifts: [] },
    } as GetNotifications200ItemsItem;

    expect(renderNotification(none).body).toContain(
      'You have no shifts in this event.',
    );
  });

  it('links availability to the dashboard availability section', () => {
    expect(resolveNotificationDestination(opened)).toEqual({
      target: { to: '/dashboard', search: { section: 'availability' } },
      isFallback: false,
    });
    expect(resolveNotificationDestination(reminder).target).toEqual({
      to: '/dashboard',
      search: { section: 'availability' },
    });
  });

  it('links publication to the event on the dashboard assignments section', () => {
    expect(resolveNotificationDestination(schedule)).toEqual({
      target: {
        to: '/dashboard',
        search: { section: 'assignments', eventId: ID, ministryId: ID },
      },
      isFallback: false,
    });
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
