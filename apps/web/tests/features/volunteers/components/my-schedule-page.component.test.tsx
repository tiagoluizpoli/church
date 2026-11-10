import { overwriteGetLocale } from '@church/i18n/runtime';
import { cleanup, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MySchedulePage } from '@/features/volunteers/components/my-schedule-page';
import type { GetPublishedVolunteerSchedule200 } from '@/infrastructure/api/churchAPI.schemas';
import { renderWithProviders } from '@/tests/setup/render';

const api = vi.hoisted(() => ({ getPublishedVolunteerSchedule: vi.fn() }));
vi.mock('@/utils/api-instances', () => ({ volunteerApi: api }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string;
    params: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a href={to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? '')}>
      {children}
    </a>
  ),
}));

const item = (id: string, startTime: string, endTime: string) => ({
  assignmentId: id,
  eventId: 'e',
  eventTitle: 'Sunday',
  shiftId: `s-${id}`,
  startTime,
  endTime,
  ministryId: 'kids',
  ministryName: 'Kids',
  sectorName: 'Babies Room',
  roleId: 'r',
  roleName: 'Teacher',
  status: 'confirmed' as const,
});

// 13:30Z is 10:30 in São Paulo.
const DATA: GetPublishedVolunteerSchedule200 = {
  assignments: [
    item('a-1', '2026-10-12T13:30:00.000Z', '2026-10-12T15:00:00.000Z'),
    item('a-2', '2026-10-12T17:00:00.000Z', '2026-10-12T18:00:00.000Z'),
    item('a-3', '2026-10-19T13:30:00.000Z', '2026-10-19T15:00:00.000Z'),
  ],
  schedules: [
    {
      ministryId: 'kids',
      ministryName: 'Kids',
      cycleId: 'c-1',
      cycleName: 'October',
    },
  ],
};

beforeEach(() => {
  overwriteGetLocale(() => 'en');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-12T14:00:00.000Z'));
});

afterEach(() => {
  window.localStorage.clear();
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

const renderPage = () =>
  renderWithProviders(<MySchedulePage />, {
    churchTimezone: 'America/Sao_Paulo',
  });

describe('MySchedulePage', () => {
  it('groups cards by day, marks only the running Shift, links to detail and cycle', async () => {
    api.getPublishedVolunteerSchedule.mockResolvedValue(DATA);
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Mon 12 Oct' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Mon 19 Oct' })).toBeVisible();
    const first = screen.getAllByRole('link', { name: /10:30–12:00/ })[0];
    expect(first).toHaveTextContent('Kids · Teacher · Babies Room');
    expect(first).toHaveAttribute('href', '/my-schedule/a-1');
    expect(screen.getAllByText('In progress')).toHaveLength(1);
    expect(first).toHaveTextContent('In progress');
    expect(
      screen.getByRole('link', { name: 'Kids · October' }),
    ).toHaveAttribute('href', '/my-schedule/kids/c-1');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('mounts the offline banner when the browser is offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    api.getPublishedVolunteerSchedule.mockResolvedValue(DATA);
    renderPage();
    expect(await screen.findByText('Offline mode')).toBeVisible();
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('shows the cached schedule after a reload while offline, flagged as cached', async () => {
    window.localStorage.setItem(
      'my-schedule:schedule',
      JSON.stringify({ ...DATA, fetchedAt: '2026-10-12T12:00:00.000Z' }),
    );
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    api.getPublishedVolunteerSchedule.mockRejectedValue(new Error('offline'));
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Mon 12 Oct' }),
    ).toBeVisible();
    expect(screen.getByText('Offline mode')).toBeVisible();
    expect(screen.getByText('Last updated: 12/10/2026 09:00')).toBeVisible();
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('shows the empty state in pt-BR', async () => {
    overwriteGetLocale(() => 'pt-BR');
    api.getPublishedVolunteerSchedule.mockResolvedValue({
      assignments: [],
      schedules: [],
    });
    renderPage();
    expect(
      await screen.findByText(/Você ainda não está em nenhuma escala/),
    ).toBeVisible();
    expect(screen.getByText('Nenhuma escala publicada ainda.')).toBeVisible();
  });

  it('shows the empty state in en', async () => {
    api.getPublishedVolunteerSchedule.mockResolvedValue({
      assignments: [],
      schedules: [],
    });
    renderPage();
    expect(
      await screen.findByText(
        "You're not on a schedule yet. You'll get a notice when your leader publishes one.",
      ),
    ).toBeVisible();
  });

  it('renders the not-serving refusal on 403', async () => {
    api.getPublishedVolunteerSchedule.mockRejectedValue(
      new AxiosError('x', '403', undefined, undefined, {
        status: 403,
        data: {},
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
      }),
    );
    renderPage();
    expect(
      await screen.findByText("You don't serve in a Ministry yet."),
    ).toBeVisible();
  });
});
