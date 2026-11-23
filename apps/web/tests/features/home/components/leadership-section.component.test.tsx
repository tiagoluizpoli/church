import { m } from '@church/i18n/messages';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListSchedules200SchedulesItem } from '@/infrastructure/api/churchAPI.schemas';
import {
  activeChurchApiMock,
  DEFAULT_CHURCH_ID,
} from '@/tests/setup/active-church';
import {
  callerCapabilitiesApiMock,
  callerCapabilitiesFixture,
} from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getSession = vi.fn().mockResolvedValue({
  data: { user: { id: 'u1' }, session: {} },
});
vi.mock('@/lib/auth-client', () => ({
  authClient: { getSession: (...args: unknown[]) => getSession(...args) },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

const adminApiMock = vi.hoisted(() => ({
  listSchedules: vi.fn(),
  getCycleAnchors: vi.fn().mockResolvedValue({ current: null, next: null }),
  getScheduleInsights: vi.fn().mockResolvedValue({ cycles: [], focus: null }),
  listMinistryDirectory: vi
    .fn()
    .mockResolvedValue({ counts: { review: 0, noSectors: 0 } }),
}));
vi.mock('@/utils/api-instances', async () => ({
  adminApi: adminApiMock,
  setupApi: {
    getSetupProgress: vi.fn().mockResolvedValue({ hasEverSentCycle: true }),
  },
  notificationsApi: {
    getNotifications: vi.fn().mockResolvedValue({ items: [], unreadCount: 0 }),
  },
  peopleApi: {
    listPeople: vi.fn().mockResolvedValue({
      counts: {
        total: 0,
        admins: 0,
        leaders: 0,
        volunteers: 0,
        withoutMinistry: 0,
      },
    }),
  },
  invitationsApi: {
    listInvitations: vi
      .fn()
      .mockResolvedValue({ counts: { pending: 0, expired: 0 } }),
  },
  volunteerApi: {
    getVolunteerDashboard: vi.fn().mockResolvedValue({
      nextAssignment: null,
      upcomingAssignmentGroups: [],
    }),
    listAvailabilityChecks: vi.fn().mockResolvedValue({ checks: [] }),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
  callerCapabilitiesApi: (await import('@/tests/setup/caller-capabilities'))
    .callerCapabilitiesApiMock,
}));

function schedule(
  input: Partial<ListSchedules200SchedulesItem> & { name: string },
): ListSchedules200SchedulesItem {
  const { name, ...rest } = input;
  return {
    ministry: { id: `m-${name}`, name },
    cycle: {
      id: `c-${name}`,
      name: 'October',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      state: 'sent',
    },
    stage: 'to_prepare',
    lateMarkCount: 0,
    openSwapRequestCount: 0,
    gapCount: 0,
    affectedVolunteerCount: 0,
    ...rest,
  };
}

function givenSchedules(schedules: ListSchedules200SchedulesItem[]) {
  adminApiMock.listSchedules.mockResolvedValue({
    schedules,
    counts: {
      ['to_prepare']: 0,
      asking: 0,
      assigning: 0,
      published: 0,
      ['not_serving']: 0,
    },
  });
}

function renderHomePage() {
  return renderRoute({ initialPath: '/app', churchTimezone: 'UTC' });
}

function givenCapabilities(
  input: Parameters<typeof callerCapabilitiesFixture>[0],
) {
  callerCapabilitiesApiMock.getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture(input),
  );
}

describe('LeadershipSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeChurchApiMock.listActiveChurchOptions.mockResolvedValue({
      churches: [{ churchId: DEFAULT_CHURCH_ID, name: 'St. Peter', areas: [] }],
    });
    givenCapabilities({ ledMinistries: 1 });
  });

  it('renders stage, outstanding count and next-step link per row, for a leader', async () => {
    givenSchedules([
      schedule({ name: 'Prep' }),
      schedule({
        name: 'Ask',
        stage: 'asking',
        asking: { asked: 5, confirmed: 2 },
      }),
      schedule({ name: 'Assign', stage: 'assigning', gapCount: 4 }),
      schedule({ name: 'Pub', stage: 'published', openSwapRequestCount: 2 }),
    ]);
    renderHomePage();

    expect(await screen.findByText(/Prep · October/)).toBeVisible();
    expect(
      screen.getByText(m.schedules_asking_outstanding({ count: 3 })),
    ).toBeVisible();
    expect(
      screen.getByText(m.schedules_assigning_gaps({ count: 4 })),
    ).toBeVisible();
    expect(
      screen.getByText(
        `${m.schedules_published()} · ${m.schedules_swap_requests_other({ count: 2 })}`,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Prep · October/ }),
    ).toHaveAttribute('href', '/app/schedules/m-Prep/c-Prep');
  });

  it('shows every Ministry for a ChurchAdmin without a leader scope', async () => {
    givenCapabilities({ isChurchAdmin: true });
    givenSchedules([schedule({ name: 'Alpha' }), schedule({ name: 'Beta' })]);
    renderHomePage();

    expect(await screen.findByText(/Alpha · October/)).toBeVisible();
    expect(screen.getByText(/Beta · October/)).toBeVisible();
  });

  it('asks the server for the first page that needs the leader, without a see-all link when it is the only one', async () => {
    givenSchedules([schedule({ name: 'Prep' })]);
    renderHomePage();

    expect(await screen.findByText(/Prep · October/)).toBeVisible();
    expect(adminApiMock.listSchedules).toHaveBeenCalledWith({
      attention: 'true',
      limit: 5,
    });
    expect(
      screen.getByRole('link', { name: m.home_see_all() }),
    ).toHaveAttribute('href', '/app/schedules?attention=true');
  });

  it('opens the Schedules page filtered to those needing attention when more need the leader', async () => {
    adminApiMock.listSchedules.mockResolvedValue({
      schedules: [schedule({ name: 'Prep' })],
      nextCursor: 'next',
    });
    const { router } = renderHomePage();

    await userEvent.click(
      await screen.findByRole('link', { name: m.home_see_all() }),
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/app/schedules'),
    );
    await waitFor(() =>
      expect(adminApiMock.listSchedules).toHaveBeenLastCalledWith({
        attention: 'true',
      }),
    );
    expect(
      await screen.findByRole('combobox', {
        name: m.schedules_filter_status(),
      }),
    ).toHaveTextContent(m.schedules_filter_needs_attention());
  });

  it('shows the empty state when nothing needs the leader', async () => {
    givenSchedules([]);
    renderHomePage();

    expect(await screen.findByText(m.home_leadership_empty())).toBeVisible();
    expect(
      screen.queryByRole('link', { name: m.home_see_all() }),
    ).not.toBeInTheDocument();
  });

  it('keeps Asking and Assigning rows with a zero outstanding count', async () => {
    givenSchedules([
      schedule({
        name: 'Answered',
        stage: 'asking',
        asking: { asked: 2, confirmed: 2 },
      }),
      schedule({ name: 'Full', stage: 'assigning', gapCount: 0 }),
    ]);
    renderHomePage();

    expect(
      await screen.findByText(m.schedules_asking_outstanding({ count: 0 })),
    ).toBeVisible();
    expect(
      screen.getByText(m.schedules_assigning_gaps({ count: 0 })),
    ).toBeVisible();
  });

  it('shows an open Swap request count on a non-published row', async () => {
    givenSchedules([
      schedule({ name: 'Full', stage: 'assigning', openSwapRequestCount: 2 }),
    ]);
    renderHomePage();

    expect(
      await screen.findByText(
        `${m.schedules_assigning_gaps({ count: 0 })} · ${m.schedules_swap_requests_other({ count: 2 })}`,
      ),
    ).toBeVisible();
  });

  it('does not render the former all-Ministry rows after an admin becomes a leader', async () => {
    givenCapabilities({ isChurchAdmin: true });
    givenSchedules([schedule({ name: 'Alpha' }), schedule({ name: 'Beta' })]);
    const { queryClient } = renderHomePage();
    expect(await screen.findByText(/Beta · October/)).toBeVisible();

    givenCapabilities({ ledMinistries: 1 });
    givenSchedules([schedule({ name: 'Alpha' })]);
    await queryClient.invalidateQueries({ queryKey: ['caller-capabilities'] });

    await waitFor(() =>
      expect(screen.queryByText(/Beta · October/)).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(/Alpha · October/)).toBeVisible();
    const cached = queryClient
      .getQueryCache()
      .findAll({ queryKey: ['home', 'leadership'] });
    // Schedules and insights, both read under the new leader scope only.
    expect(cached.map(({ queryKey }) => queryKey[4]).sort()).toEqual([
      'insights',
      'schedules',
    ]);
    expect(new Set(cached.map(({ queryKey }) => queryKey.at(-1))).size).toBe(1);
  });

  it('distinguishes loading and error from empty, and retries', async () => {
    adminApiMock.listSchedules
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new Error('down'));
    const first = renderHomePage();
    expect(
      await screen.findByRole('heading', {
        name: m.home_attention_schedules(),
      }),
    ).toBeVisible();
    expect(screen.queryByText(m.home_leadership_empty())).toBeNull();
    first.unmount();

    renderHomePage();
    expect(
      (await screen.findAllByText(m.schedules_error())).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(m.home_leadership_empty())).toBeNull();

    givenSchedules([]);
    await userEvent.click(
      screen.getAllByRole('button', { name: m.home_retry() })[0],
    );
    expect(await screen.findByText(m.home_leadership_empty())).toBeVisible();
  });

  it('is absent for a plain Volunteer', async () => {
    givenCapabilities({ hasVolunteerMembership: true });
    givenSchedules([schedule({ name: 'Prep' })]);
    renderHomePage();

    await screen.findByRole('heading', { name: m.home_next_assignment() });
    expect(
      screen.queryByRole('heading', { name: m.home_attention_schedules() }),
    ).not.toBeInTheDocument();
    expect(adminApiMock.listSchedules).not.toHaveBeenCalled();
  });
});
