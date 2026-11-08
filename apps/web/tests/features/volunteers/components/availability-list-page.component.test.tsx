import { m } from '@church/i18n/messages';
import { parseInstant, setTestClock } from '@church/time';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailabilityListPage } from '@/features/volunteers/components/availability-list-page';
import { DashboardEntry } from '@/features/volunteers/components/dashboard-entry';
import type { ListAvailabilityChecks200ChecksItem } from '@/infrastructure/api/churchAPI.schemas';
import { CallerCapabilitiesScopeProvider } from '@/shared/components/caller-capabilities-scope';
import { renderWithProviders } from '@/tests/setup/render';

const api = vi.hoisted(() => ({
  listAvailabilityChecks: vi.fn(),
  getCallerCapabilities: vi.fn(),
  getVolunteerDashboard: vi.fn(),
}));
vi.mock('@/utils/api-instances', () => ({
  volunteerApi: api,
  callerCapabilitiesApi: api,
}));

const CHECK: ListAvailabilityChecks200ChecksItem = {
  id: 'kids-check',
  cycleId: 'october',
  cycleName: 'Outubro 2026',
  ministryId: 'kids',
  ministryName: 'Infantil',
  state: 'pending',
  answerBy: '2026-10-01',
  totalShiftCount: 12,
  unavailableShiftCount: 3,
};

function renderPage(content = <AvailabilityListPage />) {
  const root = createRootRoute({
    component: () => (
      <CallerCapabilitiesScopeProvider churchId="church" userId="person">
        {content}
      </CallerCapabilitiesScopeProvider>
    ),
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/availability/$checkId',
  });
  const router = createRouter({
    routeTree: root.addChildren([detail]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return renderWithProviders(<RouterProvider router={router} />, {
    churchTimezone: 'America/Sao_Paulo',
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getCallerCapabilities.mockResolvedValue({
    churchId: 'church',
    isChurchAdmin: false,
    ledMinistries: [],
    hasVolunteerMembership: true,
  });
  api.listAvailabilityChecks.mockResolvedValue({ checks: [CHECK] });
  api.getVolunteerDashboard.mockReturnValue(new Promise(() => {}));
  setTestClock({ instant: parseInstant({ value: '2026-10-02T01:00:00Z' }) });
});

describe('Availability checks list', () => {
  it('shows an independent card per Ministry with pending first and the three answer states', async () => {
    api.listAvailabilityChecks.mockResolvedValue({
      checks: [
        {
          ...CHECK,
          id: 'music-check',
          ministryId: 'music',
          ministryName: 'Louvor',
          state: 'confirmed',
          unavailableShiftCount: 0,
        },
        CHECK,
        {
          ...CHECK,
          id: 'next-check',
          state: 'confirmed',
          cycleName: 'Novembro 2026',
        },
      ],
    });
    renderPage();
    const cards = await screen.findAllByRole('link');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveAttribute('href', '/availability/kids-check');
    expect(within(cards[0]).getByText('Infantil')).toBeVisible();
    expect(within(cards[0]).getByText('Outubro 2026')).toBeVisible();
    expect(
      within(cards[0]).getByText(m.availability_list_not_confirmed()),
    ).toBeVisible();
    expect(
      within(cards[1]).getByText(m.availability_list_confirmed_all()),
    ).toBeVisible();
    expect(
      within(cards[2]).getByText(
        m.availability_list_confirmed_count({ unavailable: 3, total: 12 }),
      ),
    ).toBeVisible();
    expect(cards[1]).toHaveAttribute('href', '/availability/music-check');
  });
  it('keeps the Deadline current through its Church day even when UTC is tomorrow', async () => {
    renderPage();
    expect(
      await screen.findByText(
        m.availability_list_answer_by({ date: '01/10/2026' }),
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(m.availability_list_overdue({ date: '01/10/2026' })),
    ).not.toBeInTheDocument();
  });

  it('shows overdue once the Church CalendarDay passes the Deadline', async () => {
    setTestClock({ instant: parseInstant({ value: '2026-10-02T03:00:00Z' }) });
    renderPage();
    expect(
      await screen.findByText(
        m.availability_list_overdue({ date: '01/10/2026' }),
      ),
    ).toBeVisible();
  });

  it('omits the Deadline when the leader has not set one', async () => {
    api.listAvailabilityChecks.mockResolvedValue({
      checks: [{ ...CHECK, answerBy: null }],
    });
    renderPage();
    await screen.findByText('Infantil');
    expect(
      screen.queryByText(m.availability_list_answer_by({ date: '01/10/2026' })),
    ).not.toBeInTheDocument();
  });

  it('shows the localized empty state for a response without current checks', async () => {
    api.listAvailabilityChecks.mockResolvedValue({ checks: [] });
    renderPage();
    expect(await screen.findByText(m.availability_list_empty())).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows not-serving without requesting checks', async () => {
    api.getCallerCapabilities.mockResolvedValue({
      churchId: 'church',
      isChurchAdmin: false,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });
    renderPage();
    expect(await screen.findByText(m.shell_not_serving())).toBeVisible();
    expect(api.listAvailabilityChecks).not.toHaveBeenCalled();
  });

  it('offers a localized retry after a failed list request', async () => {
    api.listAvailabilityChecks
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce({ checks: [CHECK] });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.availability_list_error(),
    );
    await userEvent.click(
      screen.getByRole('button', { name: m.schedules_retry() }),
    );
    expect(await screen.findByText('Infantil')).toBeVisible();
  });

  it('shows loading while the API request is pending', async () => {
    api.listAvailabilityChecks.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(
      await screen.findByRole('status', {
        name: m.availability_list_loading(),
      }),
    ).toBeVisible();
    expect(
      screen.queryByText(m.availability_list_empty()),
    ).not.toBeInTheDocument();
  });
  it('links the dashboard entry directly to the Availability list', () => {
    renderPage(<DashboardEntry search={{}} />);
    return screen
      .findByRole('link', { name: m.dashboard_entry_availability_link() })
      .then((link) => {
        expect(link).toHaveAttribute('href', '/availability');
      });
  });
});
