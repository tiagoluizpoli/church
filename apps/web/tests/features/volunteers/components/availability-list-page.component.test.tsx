import { m } from '@church/i18n/messages';
import { parseInstant, setTestClock } from '@church/time';
import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailabilityListPage } from '@/features/volunteers/components/availability-list-page';
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

/** The list response as the server sends it, header counts included. */
function listOf(checks: ListAvailabilityChecks200ChecksItem[]) {
  const pending = checks.filter((check) => check.state === 'pending').length;
  return {
    checks,
    counts: {
      total: checks.length,
      pending,
      confirmed: checks.length - pending,
    },
  };
}

function renderPage(
  content = <AvailabilityListPage />,
  queryClient?: QueryClient,
) {
  const root = createRootRoute({
    component: () => (
      <CallerCapabilitiesScopeProvider churchId="church" userId="person">
        {content}
      </CallerCapabilitiesScopeProvider>
    ),
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/app/availability/$checkId',
  });
  const router = createRouter({
    routeTree: root.addChildren([detail]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const view = renderWithProviders(<RouterProvider router={router} />, {
    churchTimezone: 'America/Sao_Paulo',
    queryClient,
  });
  return { ...view, router };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getCallerCapabilities.mockResolvedValue({
    churchId: 'church',
    isChurchAdmin: false,
    ledMinistries: [],
    hasVolunteerMembership: true,
  });
  api.listAvailabilityChecks.mockResolvedValue(listOf([CHECK]));
  api.getVolunteerDashboard.mockReturnValue(new Promise(() => {}));
  setTestClock({ instant: parseInstant({ value: '2026-10-02T01:00:00Z' }) });
});

function mobileList() {
  return screen.getByTestId('data-table-mobile-list');
}

function desktopTable() {
  return screen.getByRole('grid', { name: m.nav_availability() });
}

describe('Availability checks list', () => {
  it('lists the checks in server order as one standard table and as mobile cards, with a state badge and one action each', async () => {
    api.listAvailabilityChecks.mockResolvedValue(
      listOf([
        CHECK,
        { ...CHECK, id: 'kids-december', cycleName: 'Dezembro 2026' },
        {
          ...CHECK,
          id: 'music-check',
          ministryId: 'music',
          ministryName: 'Louvor',
          state: 'confirmed',
          confirmedAt: '2026-09-20T15:00:00Z',
          unavailableShiftCount: 0,
        },
      ]),
    );
    renderPage();
    const cards = within(
      await screen.findByTestId('data-table-mobile-list'),
    ).getAllByRole('listitem');
    expect(
      screen.getByText(
        `${m.availability_list_pending_count({ count: 2 })} ${m.availability_list_help()}`,
      ),
    ).toBeVisible();
    expect(screen.getByTestId('availability-total-chip')).toHaveTextContent(
      `${m.availability_list_chip_total()}3`,
    );
    expect(screen.getByTestId('availability-pending-chip')).toHaveTextContent(
      `${m.availability_list_chip_pending()}2`,
    );
    expect(screen.getByTestId('availability-confirmed-chip')).toHaveTextContent(
      `${m.availability_list_chip_confirmed()}1`,
    );
    // The intro panel and the table card are separate surfaces, as on every list page.
    expect(
      screen
        .getByRole('heading', { level: 1 })
        .closest('section')
        ?.contains(desktopTable()),
    ).toBe(false);

    expect(cards.map((card) => card.dataset.testid)).toEqual([
      'availability-check-kids-check',
      'availability-check-kids-december',
      'availability-check-music-check',
    ]);
    expect(within(cards[0]).getByText('Infantil')).toBeVisible();
    expect(
      within(cards[0]).getByText(m.availability_list_pending()),
    ).toHaveClass('text-amber-700');
    expect(
      within(cards[0]).getByText(
        `Outubro 2026 · ${m.availability_list_shift_count({ count: 12 })}`,
      ),
    ).toBeVisible();
    expect(
      within(cards[0]).getByRole('link', {
        name: m.availability_list_answer_label({
          name: 'Infantil · Outubro 2026',
        }),
      }),
    ).toHaveAttribute('href', '/app/availability/kids-check');
    expect(
      within(cards[2]).getByText(m.availability_detail_confirmed()),
    ).toHaveClass('text-green-700');
    expect(
      within(cards[2]).getByText(m.availability_list_available_all()),
    ).toBeVisible();
    expect(
      within(cards[2]).getByRole('link', {
        name: m.availability_list_review_label({
          name: 'Louvor · Outubro 2026',
        }),
      }),
    ).toHaveAttribute('href', '/app/availability/music-check');

    const grid = desktopTable();
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      m.availability_list_column_ministry(),
      m.schedules_column_cycle(),
      m.cycles_column_status(),
      m.availability_list_column_detail(),
      m.availability_list_column_actions(),
    ]);
    const rows = within(grid).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      'availability-check-kids-check',
      'availability-check-kids-december',
      'availability-check-music-check',
    ]);
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent(
      'Infantil',
    );
    expect(
      within(rows[0]).getByText(
        `· ${m.availability_list_shift_count({ count: 12 })}`,
      ),
    ).toHaveClass('text-muted-foreground');
    expect(
      within(rows[0]).getByText(m.availability_list_pending()),
    ).toBeVisible();
    expect(
      within(rows[0]).getByRole('link', {
        name: m.availability_list_answer_label({
          name: 'Infantil · Outubro 2026',
        }),
      }),
    ).toHaveTextContent(m.availability_list_answer());
    expect(
      within(rows[2]).getByText(m.availability_list_available_all()),
    ).toHaveClass('text-muted-foreground');
    expect(
      within(rows[2]).getByRole('link', {
        name: m.availability_list_review_label({
          name: 'Louvor · Outubro 2026',
        }),
      }),
    ).toHaveTextContent(m.availability_list_review());
  });

  it.each([
    [12, 3, m.availability_list_available_count({ available: 9, total: 12 })],
    [12, 0, m.availability_list_available_all()],
    [12, 12, m.availability_list_unavailable_all()],
    [1, 0, m.availability_list_available()],
    [1, 1, m.availability_list_unavailable()],
  ])('summarises an answer for %i shifts with %i unavailable plainly', async (totalShiftCount, unavailableShiftCount, text) => {
    api.listAvailabilityChecks.mockResolvedValue(
      listOf([
        {
          ...CHECK,
          state: 'confirmed',
          confirmedAt: '2026-09-20T15:00:00Z',
          totalShiftCount,
          unavailableShiftCount,
        },
      ]),
    );
    renderPage();
    expect(
      await within(
        await screen.findByTestId('data-table-mobile-list'),
      ).findByText(text),
    ).toBeVisible();
    expect(within(desktopTable()).getByText(text)).toBeVisible();
  });
  it('acknowledges the check just answered with a banner and a marker on its row', async () => {
    api.listAvailabilityChecks.mockResolvedValue(
      listOf([
        CHECK,
        {
          ...CHECK,
          id: 'music-check',
          ministryName: 'Louvor',
          state: 'confirmed',
        },
      ]),
    );
    renderPage(<AvailabilityListPage answeredCheckId="music-check" />);
    expect(
      await screen.findByText(
        m.availability_list_answered({ ministry: 'Louvor' }),
      ),
    ).toHaveAttribute('role', 'status');
    const rows = within(desktopTable()).getAllByRole('row').slice(1);
    expect(
      within(rows[1]).getByText(m.availability_list_sent_now()),
    ).toBeVisible();
    expect(
      within(rows[0]).queryByText(m.availability_list_sent_now()),
    ).not.toBeInTheDocument();
    expect(
      within(mobileList()).getAllByText(m.availability_list_sent_now()),
    ).toHaveLength(1);
  });

  it('shows no acknowledgement without a just-answered check', async () => {
    renderPage();
    await screen.findAllByRole('row');
    expect(
      screen.queryByText(m.availability_list_sent_now()),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(m.availability_list_answered({ ministry: 'Kids' })),
    ).not.toBeInTheDocument();
  });

  it('says every check is answered when none is pending', async () => {
    api.listAvailabilityChecks.mockResolvedValue(
      listOf([
        {
          ...CHECK,
          state: 'confirmed',
          totalShiftCount: 1,
          unavailableShiftCount: 1,
        },
      ]),
    );
    renderPage();
    expect(
      await screen.findByText(m.availability_list_all_answered()),
    ).toBeVisible();
    expect(
      within(mobileList()).getByText(m.availability_list_unavailable()),
    ).toBeVisible();
    expect(screen.queryByText(m.availability_list_pending())).toBeNull();
    expect(
      screen.queryByText(m.availability_list_help(), { exact: false }),
    ).toBeNull();
  });

  it('keeps the Deadline current through its Church day even when UTC is tomorrow', async () => {
    renderPage();
    await screen.findByTestId('data-table-mobile-list');
    expect(
      within(mobileList()).getByText(m.availability_list_due_today()),
    ).toBeVisible();
    expect(
      screen.queryByText(m.availability_list_overdue({ date: 'qui 1 out' })),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['2026-10-02', m.availability_list_due_tomorrow()],
    [
      '2026-10-04',
      m.availability_list_due_in_days({ date: 'dom 4 out', days: 3 }),
    ],
  ])('marks a pending Deadline on %s as due soon in amber', async (answerBy, text) => {
    api.listAvailabilityChecks.mockResolvedValue(
      listOf([{ ...CHECK, answerBy }]),
    );
    renderPage();
    await screen.findByTestId('data-table-mobile-list');
    expect(within(mobileList()).getByText(text).parentElement).toHaveClass(
      'text-amber-700',
    );
    expect(within(desktopTable()).getByText(text)).toBeVisible();
  });

  it('keeps a pending Deadline beyond three days muted', async () => {
    api.listAvailabilityChecks.mockResolvedValue(
      listOf([{ ...CHECK, answerBy: '2026-10-05' }]),
    );
    renderPage();
    await screen.findByTestId('data-table-mobile-list');
    expect(
      within(mobileList()).getByText(
        m.availability_list_answer_by({ date: 'seg 5 out' }),
      ).parentElement,
    ).toHaveClass('text-muted-foreground');
  });

  it('names the Deadline by weekday, adding the year only outside the current one', async () => {
    api.listAvailabilityChecks.mockResolvedValue(
      listOf([{ ...CHECK, answerBy: '2027-01-05' }]),
    );
    renderPage();
    await screen.findByTestId('data-table-mobile-list');
    expect(m.availability_list_answer_by({ date: 'ter 5 jan 2027' })).toBe(
      'Responda até ter 5 jan 2027',
    );
    expect(
      within(mobileList()).getByText(
        m.availability_list_answer_by({ date: 'ter 5 jan 2027' }),
      ),
    ).toBeVisible();
  });

  it('shows overdue in amber, not alarm red, once the Church CalendarDay passes the Deadline, still inviting an answer', async () => {
    setTestClock({ instant: parseInstant({ value: '2026-10-02T03:00:00Z' }) });
    renderPage();
    await screen.findByTestId('data-table-mobile-list');
    expect(m.availability_list_overdue({ date: 'qui 1 out' })).toBe(
      'Prazo passou (qui 1 out) · ainda dá para responder',
    );
    const overdue = within(mobileList()).getByText(
      m.availability_list_overdue({ date: 'qui 1 out' }),
    ).parentElement;
    expect(overdue).toHaveClass('text-amber-700', 'font-semibold');
    expect(overdue).not.toHaveClass('text-destructive');
    expect(
      within(mobileList()).getByRole('link', {
        name: m.availability_list_answer_label({
          name: 'Infantil · Outubro 2026',
        }),
      }),
    ).toBeVisible();
  });

  it('says a check has no Deadline when the leader has not set one', async () => {
    api.listAvailabilityChecks.mockResolvedValue(
      listOf([{ ...CHECK, answerBy: null }]),
    );
    renderPage();
    await screen.findByTestId('data-table-mobile-list');
    expect(document.querySelector('time')).toBeNull();
    expect(
      within(mobileList()).getByText(m.availability_list_no_deadline()),
    ).toHaveClass('text-muted-foreground');
    expect(
      within(desktopTable()).getByText(m.availability_list_no_deadline()),
    ).toBeVisible();
  });

  it('shows the localized empty state for a response without current checks, with no instruction to act', async () => {
    api.listAvailabilityChecks.mockResolvedValue(listOf([]));
    renderPage();
    expect(await screen.findByText(m.availability_list_empty())).toBeVisible();
    expect(
      screen.queryByText(m.availability_list_description(), { exact: false }),
    ).toBeNull();
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

  it('offers a localized retry after a failed list request, showing loading while it refetches', async () => {
    let resolveRetry: (value: ReturnType<typeof listOf>) => void = () => {};
    api.listAvailabilityChecks
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRetry = resolve;
        }),
      );
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(m.availability_list_error());
    expect(m.availability_list_error()).toBe(
      'Não foi possível carregar as consultas de disponibilidade. Verifique sua conexão.',
    );
    expect(
      screen.queryByText(m.availability_list_description(), { exact: false }),
    ).toBeNull();
    expect(alert).toHaveClass('text-destructive');
    await userEvent.click(
      within(alert).getByRole('button', { name: m.common_retry() }),
    );
    // The retry swaps the error for the loading region, so a tap is never silent.
    expect(
      await screen.findByRole('status', {
        name: m.availability_list_loading(),
      }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => resolveRetry(listOf([CHECK])));
    expect(await screen.findByTestId('data-table-mobile-list')).toBeVisible();
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
});

describe('loading states', () => {
  it('shows its skeleton only after the pending delay on first load', async () => {
    api.listAvailabilityChecks.mockReturnValue(new Promise(() => {}));
    renderPage(undefined, new QueryClient());
    const region = await screen.findByRole('status', {
      name: m.availability_list_loading(),
    });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toBeEmptyDOMElement();
    await waitFor(() =>
      expect(region.querySelector('[data-slot="skeleton"]')).not.toBeNull(),
    );
  });

  it('keeps the shown data, with no skeleton, while a refetch is in flight', async () => {
    const queryClient = new QueryClient();
    api.listAvailabilityChecks.mockResolvedValue(listOf([CHECK]));
    renderPage(undefined, queryClient);
    expect(await screen.findByTestId('data-table-mobile-list')).toBeVisible();
    api.listAvailabilityChecks.mockClear();
    api.listAvailabilityChecks.mockReturnValue(new Promise(() => {}));
    void queryClient.invalidateQueries();
    await waitFor(() =>
      expect(api.listAvailabilityChecks).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByTestId('data-table-mobile-list')).toBeVisible();
    expect(
      screen.queryByRole('status', { name: m.availability_list_loading() }),
    ).toBeNull();
  });
});
