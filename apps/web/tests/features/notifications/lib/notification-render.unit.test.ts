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
      title: 'Louvor quer a sua disponibilidade',
      body: 'Informe quando você pode servir em Dezembro 2026 (01/12/2026 – 31/12/2026).',
      kindLabel: 'Disponibilidade solicitada',
    });
    expect(renderNotification(reminder).title).toBe(
      'Lembrete: disponibilidade para Louvor',
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
