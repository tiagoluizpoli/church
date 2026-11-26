import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MySchedulePage } from '@/features/volunteers/components/my-schedule-page';
import type { MyScheduleFilters } from '@/features/volunteers/lib/my-schedule-filters';
import type { GetPublishedVolunteerSchedule200 } from '@/infrastructure/api/churchAPI.schemas';
import { CallerCapabilitiesScopeProvider } from '@/shared/components/caller-capabilities-scope';
import { renderWithProviders } from '@/tests/setup/render';

const api = vi.hoisted(() => ({ getPublishedVolunteerSchedule: vi.fn() }));
vi.mock('@/utils/api-instances', () => ({ volunteerApi: api }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params = {},
    children,
    'aria-label': ariaLabel,
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
    'aria-label'?: string;
  }) => (
    <a
      href={to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? '')}
      aria-label={ariaLabel}
    >
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
  status: 'pending' as const,
  swapRequested: false,
});

// 13:30Z is 10:30 in São Paulo. Shaped like a copy stored before `next` and `options`, which the page still reads.
const DATA: Omit<GetPublishedVolunteerSchedule200, 'next' | 'options'> = {
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
  counts: { upcoming: 3, thisMonth: 3, openSwaps: 0 },
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

const onFiltersChange = vi.fn();

const renderPage = (userId = 'user-1', filters: MyScheduleFilters = {}) =>
  renderWithProviders(
    <CallerCapabilitiesScopeProvider churchId="church-1" userId={userId}>
      <MySchedulePage filters={filters} onFiltersChange={onFiltersChange} />
    </CallerCapabilitiesScopeProvider>,
    { churchTimezone: 'America/Sao_Paulo' },
  );

const FULL: GetPublishedVolunteerSchedule200 = {
  ...DATA,
  assignments: [
    ...DATA.assignments,
    item('a-5', '2026-11-02T13:30:00.000Z', '2026-11-02T15:00:00.000Z'),
  ],
  next: DATA.assignments[0],
  options: {
    months: ['2026-10', '2026-11'],
    ministries: [
      { id: 'kids', name: 'Kids' },
      { id: 'media', name: 'Media' },
    ],
  },
};

describe('MySchedulePage', () => {
  it('shows the server counts as header chips', async () => {
    api.getPublishedVolunteerSchedule.mockResolvedValue({
      ...DATA,
      counts: { upcoming: 7, thisMonth: 4, openSwaps: 1 },
    });
    renderPage();
    expect(
      await screen.findByTestId('my-schedule-upcoming-chip'),
    ).toHaveTextContent('Upcoming7');
    expect(screen.getByTestId('my-schedule-this-month-chip')).toHaveTextContent(
      'This month4',
    );
    expect(screen.getByTestId('my-schedule-swaps-chip')).toHaveTextContent(
      'Swaps1',
    );
  });

  it('leads with the next Assignment, then lists every Assignment by day without repeating the date', async () => {
    api.getPublishedVolunteerSchedule.mockResolvedValue(DATA);
    renderPage();
    const next = await screen.findByRole('region', {
      name: 'Next assignment',
    });
    const hero = within(next).getByRole('link');
    expect(hero).toHaveAttribute('href', '/app/my-schedule/a-1');
    expect(hero).toHaveTextContent(
      'Today Mon 12 Oct 10:30–12:00 Sunday Teacher · Babies Room',
    );
    expect(hero).toHaveTextContent('In progress');
    // The hero, then its row in the mobile list and in the desktop table.
    expect(screen.getAllByText('In progress')).toHaveLength(3);
    // Mobile list: one heading per day owns the date; the card shows only time and place.
    expect(
      screen.getByRole('heading', { name: 'Today Mon 12 Oct' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Mon 19 Oct' })).toBeVisible();
    // Grouped by month by default: the month heads the days.
    expect(
      screen.getByRole('heading', { level: 3, name: 'October 2026' }),
    ).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(2);
    // Each row's action names what it opens, once per layout.
    for (const link of screen.getAllByRole('link', {
      name: 'Open Sunday, Mon 12 Oct 14:00–15:00',
    })) {
      expect(link).toHaveAttribute('href', '/app/my-schedule/a-2');
      expect(link.closest('[role="listitem"], [role="row"]')).toHaveTextContent(
        '14:00–15:00',
      );
    }
    expect(
      screen.getAllByRole('link', {
        name: 'Open Sunday, Mon 19 Oct 10:30–12:00',
      }),
    ).toHaveLength(2);
    expect(
      screen.getByRole('link', { name: 'Kids · October' }),
    ).toHaveAttribute('href', '/app/my-schedule/kids/c-1');
    // Assignments are informational: no response actions.
    expect(
      screen.queryByRole('button', { name: /accept|decline/i }),
    ).toBeNull();
  });

  it('says Tomorrow for the next Church day and the date after that', async () => {
    vi.setSystemTime(new Date('2026-10-18T14:00:00.000Z'));
    api.getPublishedVolunteerSchedule.mockResolvedValue({
      ...DATA,
      assignments: [
        DATA.assignments[2],
        item('a-4', '2026-10-20T13:30:00.000Z', '2026-10-20T15:00:00.000Z'),
      ],
    });
    renderPage();
    expect(
      within(
        await screen.findByRole('region', { name: 'Next assignment' }),
      ).getByRole('link'),
    ).toHaveTextContent('Tomorrow Mon 19 Oct 10:30–12:00');
    expect(screen.getByRole('heading', { name: 'Tue 20 Oct' })).toBeVisible();
  });

  it('names the Ministry only when the Volunteer serves in more than one, and never twice', async () => {
    api.getPublishedVolunteerSchedule.mockResolvedValue({
      ...DATA,
      assignments: [
        DATA.assignments[0],
        {
          ...DATA.assignments[1],
          ministryId: 'media',
          ministryName: 'Media',
          sectorName: 'Media',
          roleName: 'Camera',
        },
      ],
    });
    renderPage();
    expect(
      within(
        await screen.findByRole('region', { name: 'Next assignment' }),
      ).getByRole('link'),
    ).toHaveTextContent('Teacher · Babies Room · Kids');
    // Mobile card and desktop row.
    expect(screen.getAllByText('Camera · Media')).toHaveLength(2);
  });

  it('tags only the Assignment that has a swap request', async () => {
    api.getPublishedVolunteerSchedule.mockResolvedValue({
      ...DATA,
      assignments: [
        DATA.assignments[0],
        { ...DATA.assignments[1], swapRequested: true },
      ],
    });
    renderPage();
    // One tag on the mobile row, one in the desktop table row.
    const tags = await screen.findAllByText('Swap requested');
    expect(tags).toHaveLength(2);
    for (const tag of tags) {
      expect(
        within(
          tag.closest('[role="listitem"], [role="row"]') as HTMLElement,
        ).getByRole('link'),
      ).toHaveAttribute('href', '/app/my-schedule/a-2');
    }
    expect(
      within(
        screen.getByRole('region', { name: 'Next assignment' }),
      ).queryByText('Swap requested'),
    ).toBeNull();
  });

  it('counts down to the next Assignment', async () => {
    vi.setSystemTime(new Date('2026-10-11T21:00:00.000Z'));
    api.getPublishedVolunteerSchedule.mockResolvedValue(DATA);
    renderPage();
    expect(
      within(
        await screen.findByRole('region', { name: 'Next assignment' }),
      ).getByText('in 16 hours'),
    ).toBeVisible();
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
    // A copy stored before the counts existed still loads, just without chips.
    const { counts: _counts, ...beforeCounts } = CACHED;
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(beforeCounts));
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    api.getPublishedVolunteerSchedule.mockRejectedValue(new Error('offline'));
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Mon 19 Oct' }),
    ).toBeVisible();
    expect(screen.getByText('Offline mode')).toBeVisible();
    expect(screen.getByText('Last updated: 12/10/2026 09:00')).toBeVisible();
    expect(screen.queryByTestId('my-schedule-upcoming-chip')).toBeNull();
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
    expect(screen.queryByRole('heading', { name: 'Mon 19 Oct' })).toBeNull();
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
        <MySchedulePage filters={{}} onFiltersChange={onFiltersChange} />
      </CallerCapabilitiesScopeProvider>,
      { churchTimezone: 'America/Sao_Paulo', queryClient },
    );
    expect(
      await screen.findByRole('heading', { name: 'Mon 19 Oct' }),
    ).toBeVisible();
    api.getPublishedVolunteerSchedule.mockRejectedValue(new Error('boom'));
    await act(() => queryClient.refetchQueries({ queryKey: ['my-schedule'] }));
    expect(screen.getByRole('heading', { name: 'Mon 19 Oct' })).toBeVisible();
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
    // No published schedules means no empty "full schedules" panel either.
    expect(
      screen.queryByRole('heading', { name: 'Escalas completas' }),
    ).toBeNull();
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
    expect(
      screen.getByRole('link', { name: 'Answer availability' }),
    ).toHaveAttribute('href', '/app/availability');
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

describe('filters and grouping', () => {
  it('nests shifts under month and day rows by default', async () => {
    api.getPublishedVolunteerSchedule.mockResolvedValue(FULL);
    renderPage();
    const table = await screen.findByRole('grid', { name: 'My schedule' });
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      // Each group row ends with how many shifts it holds.
      'October 20263',
      'Today Mon 12 Oct2',
      expect.stringMatching(/^10:30–12:00Sunday/),
      expect.stringMatching(/^14:00–15:00Sunday/),
      'Mon 19 Oct1',
      expect.stringMatching(/^10:30–12:00Sunday/),
      'November 20261',
      'Mon 2 Nov1',
      expect.stringMatching(/^10:30–12:00Sunday/),
    ]);
    // Under day rows the Day column goes.
    expect(
      within(table).queryByRole('columnheader', { name: 'Day' }),
    ).toBeNull();
    const pressed = (name: string) =>
      screen.getByRole('button', { name }).getAttribute('aria-pressed');
    expect([pressed('Month'), pressed('Week'), pressed('Day')]).toEqual([
      'true',
      'false',
      'true',
    ]);
    screen.getByRole('button', { name: 'Week' }).click();
    expect(onFiltersChange).toHaveBeenCalledWith({
      group: ['month', 'week', 'day'],
    });
  });

  it('folds any group and everything inside it, and opens them all again', async () => {
    api.getPublishedVolunteerSchedule.mockResolvedValue(FULL);
    renderPage();
    const table = await screen.findByRole('grid', { name: 'My schedule' });
    const rowCount = () => within(table).getAllByRole('row').length;
    expect(rowCount()).toBe(10);
    // Each group has its fold button once per layout; the desktop one is enough here.
    within(table)
      .getByRole('button', { name: 'Collapse October 2026' })
      .click();
    await waitFor(() => expect(rowCount()).toBe(5));
    expect(
      within(table).getByRole('button', { name: 'Expand October 2026' }),
    ).toHaveAttribute('aria-expanded', 'false');
    within(table).getByRole('button', { name: 'Collapse Mon 2 Nov' }).click();
    await waitFor(() => expect(rowCount()).toBe(4));
    screen.getByRole('button', { name: 'Expand all' }).click();
    await waitFor(() => expect(rowCount()).toBe(10));
    screen.getByRole('button', { name: 'Collapse all' }).click();
    await waitFor(() => expect(rowCount()).toBe(3));
  });

  it('nests Sunday-to-Saturday weeks between months and days', async () => {
    api.getPublishedVolunteerSchedule.mockResolvedValue(FULL);
    renderPage('user-1', { group: ['day', 'month', 'week'] });
    expect(
      await screen.findByRole('heading', { level: 3, name: 'October 2026' }),
    ).toBeVisible();
    // Mon 12 and Mon 19 Oct sit in the weeks starting Sun 11 and Sun 18.
    const weeks = screen.getAllByRole('heading', { level: 4 });
    expect(weeks).toHaveLength(3);
    [
      m.cycle_review_week({ start: '11/10/2026', end: '17/10/2026' }),
      m.cycle_review_week({ start: '18/10/2026', end: '24/10/2026' }),
      m.cycle_review_week({ start: '01/11/2026', end: '07/11/2026' }),
    ].forEach((name, index) => {
      expect(weeks[index]).toHaveAccessibleName(name);
    });
    expect(screen.getAllByRole('heading', { level: 5 })).toHaveLength(3);
  });

  it('lists every row flat, each with its day, when no grouping is chosen', async () => {
    api.getPublishedVolunteerSchedule.mockResolvedValue(FULL);
    renderPage('user-1', { group: [] });
    expect((await screen.findAllByText('Mon 2 Nov')).length).toBeGreaterThan(1);
    expect(screen.queryByText('November 2026')).toBeNull();
    expect(
      screen.queryByRole('heading', { level: 3, name: 'Mon 2 Nov' }),
    ).toBeNull();
    screen.getByRole('button', { name: 'Month' }).click();
    expect(onFiltersChange).toHaveBeenCalledWith({ group: ['month'] });
  });

  it('sends the filters to the server and keeps the next shift and counters whole', async () => {
    api.getPublishedVolunteerSchedule.mockResolvedValue({
      ...FULL,
      assignments: [FULL.assignments[3]],
    });
    renderPage('user-1', { month: '2026-11', search: 'Sun', group: [] });
    expect(
      within(
        await screen.findByRole('region', { name: 'Next assignment' }),
      ).getByRole('link'),
    ).toHaveAttribute('href', '/app/my-schedule/a-1');
    expect(api.getPublishedVolunteerSchedule).toHaveBeenCalledWith({
      search: 'Sun',
      month: '2026-11',
      ministryId: undefined,
    });
    expect(screen.getByLabelText('Search event')).toHaveValue('Sun');
    expect(screen.getByLabelText('Ministry')).toBeVisible();
    // A filtered list is never stored as the offline copy.
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('offers to clear the filters when nothing matches, keeping the grouping choice', async () => {
    api.getPublishedVolunteerSchedule.mockResolvedValue({
      ...FULL,
      assignments: [],
    });
    renderPage('user-1', { search: 'zzz', group: [] });
    (
      await screen.findByRole('button', { name: m.invitations_clear_filters() })
    ).click();
    expect(screen.getByText('No shifts match these filters.')).toBeVisible();
    expect(onFiltersChange).toHaveBeenCalledWith({ group: [] });
  });

  it('hides the Ministry filter for a Volunteer in one Ministry', async () => {
    api.getPublishedVolunteerSchedule.mockResolvedValue({
      ...FULL,
      options: { ...FULL.options, ministries: [{ id: 'kids', name: 'Kids' }] },
    });
    renderPage();
    expect(await screen.findByLabelText('Month')).toBeVisible();
    expect(screen.queryByLabelText('Ministry')).toBeNull();
  });
});

describe('loading states', () => {
  it('shows its skeleton only after the pending delay on first load', async () => {
    api.getPublishedVolunteerSchedule.mockReturnValue(new Promise(() => {}));
    renderWithProviders(
      <CallerCapabilitiesScopeProvider churchId="church-1" userId="user-1">
        <MySchedulePage filters={{}} onFiltersChange={onFiltersChange} />
      </CallerCapabilitiesScopeProvider>,
      { churchTimezone: 'America/Sao_Paulo', queryClient: new QueryClient() },
    );
    const region = screen.getByRole('status', {
      name: m.my_schedule_loading(),
    });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toBeEmptyDOMElement();
    await waitFor(() =>
      expect(region.querySelector('[data-slot="skeleton"]')).not.toBeNull(),
    );
  });

  it('keeps the shown data, with no skeleton, while a refetch is in flight', async () => {
    const queryClient = new QueryClient();
    api.getPublishedVolunteerSchedule.mockResolvedValue(DATA);
    renderWithProviders(
      <CallerCapabilitiesScopeProvider churchId="church-1" userId="user-1">
        <MySchedulePage filters={{}} onFiltersChange={onFiltersChange} />
      </CallerCapabilitiesScopeProvider>,
      { churchTimezone: 'America/Sao_Paulo', queryClient: queryClient },
    );
    expect(
      await screen.findByRole('heading', { name: 'Mon 19 Oct' }),
    ).toBeVisible();
    api.getPublishedVolunteerSchedule.mockClear();
    api.getPublishedVolunteerSchedule.mockReturnValue(new Promise(() => {}));
    void queryClient.invalidateQueries();
    await waitFor(() =>
      expect(api.getPublishedVolunteerSchedule).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByRole('heading', { name: 'Mon 19 Oct' })).toBeVisible();
    expect(
      screen.queryByRole('status', { name: m.my_schedule_loading() }),
    ).toBeNull();
  });
});
