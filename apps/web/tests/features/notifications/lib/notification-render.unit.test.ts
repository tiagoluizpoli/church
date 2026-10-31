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
