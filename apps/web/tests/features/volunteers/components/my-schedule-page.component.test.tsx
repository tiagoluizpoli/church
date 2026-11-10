import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MySchedulePage } from '@/features/volunteers/components/my-schedule-page';
import type { GetPublishedVolunteerSchedule200 } from '@/infrastructure/api/churchAPI.schemas';
import { CallerCapabilitiesScopeProvider } from '@/shared/components/caller-capabilities-scope';
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

const CACHE_KEY = 'my-schedule:user-1:church-1:schedule';
const CACHED = { ...DATA, fetchedAt: '2026-10-12T12:00:00.000Z' };

const renderPage = (userId = 'user-1') =>
  renderWithProviders(
    <CallerCapabilitiesScopeProvider churchId="church-1" userId={userId}>
      <MySchedulePage />
    </CallerCapabilitiesScopeProvider>,
    { churchTimezone: 'America/Sao_Paulo' },
  );

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
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(CACHED));
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

  it("never shows another account's cached schedule as placeholder or offline data", async () => {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(CACHED));
    api.getPublishedVolunteerSchedule.mockReturnValue(new Promise(() => {}));
    renderPage('user-2');
    expect(await screen.findByRole('status')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Mon 12 Oct' })).toBeNull();
  });

  it('ignores a stored copy that fails validation', async () => {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ assignments: 'x' }),
    );
    api.getPublishedVolunteerSchedule.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(await screen.findByRole('status')).toBeVisible();
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('keeps the retained schedule and flags the banner when a refetch fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    api.getPublishedVolunteerSchedule.mockResolvedValueOnce(DATA);
    renderWithProviders(
      <CallerCapabilitiesScopeProvider churchId="church-1" userId="user-1">
        <MySchedulePage />
      </CallerCapabilitiesScopeProvider>,
      { churchTimezone: 'America/Sao_Paulo', queryClient },
    );
    expect(
      await screen.findByRole('heading', { name: 'Mon 12 Oct' }),
    ).toBeVisible();
    api.getPublishedVolunteerSchedule.mockRejectedValue(new Error('boom'));
    await act(() => queryClient.refetchQueries({ queryKey: ['my-schedule'] }));
    expect(screen.getByRole('heading', { name: 'Mon 12 Oct' })).toBeVisible();
    expect(
      await screen.findByText(m.my_schedule_refresh_failed()),
    ).toBeVisible();
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
