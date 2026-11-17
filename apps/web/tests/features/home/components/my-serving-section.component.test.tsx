import { m } from '@church/i18n/messages';
import { parseInstant, setTestClock } from '@church/time';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import {
  HOME_USER_ID,
  renderHomePage,
} from '@/tests/features/home/components/render-home-page';
import {
  activeChurchApiMock,
  DEFAULT_CHURCH_ID,
} from '@/tests/setup/active-church';
import {
  callerCapabilitiesApiMock,
  callerCapabilitiesFixture,
} from '@/tests/setup/caller-capabilities';

const volunteerApi = vi.hoisted(() => ({
  listAvailabilityChecks: vi.fn(),
  getVolunteerDashboard: vi.fn(),
}));
vi.mock('@/utils/api-instances', async () => ({
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
  callerCapabilitiesApi: (await import('@/tests/setup/caller-capabilities'))
    .callerCapabilitiesApiMock,
  volunteerApi,
  notificationsApi: {
    getNotifications: vi.fn().mockResolvedValue({ items: [], unreadCount: 0 }),
  },
  setupApi: {
    getSetupProgress: vi.fn().mockResolvedValue({ hasEverSentCycle: true }),
  },
  adminApi: {
    listCycles: vi.fn().mockResolvedValue({ cycles: [] }),
    listSchedules: vi.fn().mockResolvedValue({ schedules: [], counts: {} }),
    listMinistryDirectory: vi.fn().mockResolvedValue({ counts: {} }),
  },
  peopleApi: { listPeople: vi.fn().mockResolvedValue({ counts: {} }) },
  invitationsApi: {
    listInvitations: vi.fn().mockResolvedValue({ counts: {} }),
  },
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({
    to,
    params = {},
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a
      className={className}
      href={to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? '')}
    >
      {children}
    </a>
  ),
}));

const check = (
  id: string,
  state: 'pending' | 'confirmed',
  answerBy?: string,
) => ({
  id,
  cycleId: `cycle-${id}`,
  cycleName: `Cycle ${id}`,
  ministryId: 'kids',
  ministryName: `Ministry ${id}`,
  state,
  answerBy,
  totalShiftCount: 4,
  unavailableShiftCount: 0,
});

const assignment = (id: string, day: number, swapRequested = false) => ({
  assignmentId: id,
  eventId: 'e',
  eventTitle: 'Sunday',
  shiftId: `s-${id}`,
  startTime: `2026-10-${day}T13:30:00.000Z`,
  endTime: `2026-10-${day}T15:00:00.000Z`,
  ministryId: 'kids',
  ministryName: `Kids ${id}`,
  sectorName: 'Room',
  roleId: 'r',
  roleName: 'Teacher',
  status: 'confirmed' as const,
  timingState: 'upcoming' as const,
  canRespond: true,
  swapRequested,
});

const SERVING = { hasVolunteerMembership: true };

function givenServing(
  input: Parameters<typeof callerCapabilitiesFixture>[0] = SERVING,
) {
  callerCapabilitiesApiMock.getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture(input),
  );
}

describe('Home serving widgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setTestClock({
      instant: parseInstant({ value: '2026-10-10T12:00:00.000Z' }),
    });
    activeChurchApiMock.listActiveChurchOptions.mockResolvedValue({
      churches: [{ churchId: DEFAULT_CHURCH_ID, name: 'St. Peter', areas: [] }],
    });
    volunteerApi.listAvailabilityChecks.mockResolvedValue({ checks: [] });
    volunteerApi.getVolunteerDashboard.mockResolvedValue({
      upcomingAssignmentGroups: [],
      nextAssignment: null,
    });
  });

  it('splits next assignment, pending checks and upcoming into server-ordered widgets', async () => {
    givenServing();
    volunteerApi.listAvailabilityChecks.mockResolvedValue({
      checks: [
        check('done', 'confirmed'),
        check('open', 'pending', '2026-10-20'),
        check('soon', 'pending', '2026-10-13'),
        check('late', 'pending', '2026-10-01'),
      ],
    });
    const first = assignment('a-1', 11);
    volunteerApi.getVolunteerDashboard.mockResolvedValue({
      nextAssignment: first,
      upcomingAssignmentGroups: [
        {
          eventId: 'e',
          eventTitle: 'Sunday',
          ministryId: 'kids',
          ministryName: 'Kids',
          assignments: [first, assignment('a-2', 12), assignment('a-3', 13)],
        },
      ],
    });
    renderHomePage();

    const widget = async (title: string) =>
      (await screen.findByRole('heading', { name: title })).closest(
        'section',
      ) as HTMLElement;
    const hrefs = (section: HTMLElement) =>
      within(section)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'));

    const next = await widget(m.home_next_assignment());
    await within(next).findByRole('link', { name: 'Sunday' });
    expect(hrefs(next)).toEqual(['/my-schedule/a-1']);
    expect(within(next).getByText(/^domingo, 11 de outubro · /)).toBeVisible();
    expect(within(next).getByText('Kids a-1 · Room · Teacher')).toBeVisible();

    const checks = await widget(m.home_pending_checks());
    await within(checks).findByText(/Ministry open/);
    expect(within(checks).queryByText(/Ministry done/)).not.toBeInTheDocument();
    expect(hrefs(checks)).toEqual([
      '/availability/open',
      '/availability/soon',
      '/availability/late',
    ]);
    expect(
      within(checks).getAllByRole('link', {
        name: m.home_answer_availability(),
      }),
    ).toHaveLength(3);
    const deadline = (day: string) =>
      checks.querySelector(`time[datetime="${day}"]`)?.parentElement;
    expect(deadline('2026-10-01')).toHaveClass('text-destructive');
    expect(deadline('2026-10-13')).toHaveClass('text-primary');
    expect(deadline('2026-10-20')).not.toHaveClass('text-destructive');
    expect(deadline('2026-10-20')).not.toHaveClass('text-primary');
    expect(
      within(checks).getByText(
        m.availability_list_answer_by({ date: 'terça-feira, 20 de outubro' }),
      ),
    ).toBeVisible();

    // The next assignment is not repeated in the upcoming list.
    const upcoming = await widget(m.home_upcoming_assignments());
    expect(hrefs(upcoming)).toEqual([
      '/my-schedule',
      '/my-schedule/a-2',
      '/my-schedule/a-3',
    ]);
    expect(
      within(upcoming).getByRole('link', { name: m.home_see_all() }),
    ).toHaveAttribute('href', '/my-schedule');
  });

  it('hides upcoming when it would only repeat the next assignment, and pending checks when none are open', async () => {
    givenServing();
    const first = assignment('a-1', 11);
    volunteerApi.getVolunteerDashboard.mockResolvedValue({
      nextAssignment: first,
      upcomingAssignmentGroups: [
        {
          eventId: 'e',
          eventTitle: 'Sunday',
          ministryId: 'kids',
          ministryName: 'Kids',
          assignments: [first],
        },
      ],
    });
    renderHomePage();

    expect(await screen.findByRole('link', { name: 'Sunday' })).toHaveAttribute(
      'href',
      '/my-schedule/a-1',
    );
    expect(
      screen.queryByRole('heading', { name: m.home_upcoming_assignments() }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: m.home_pending_checks() }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: m.home_respond() }),
    ).not.toBeInTheDocument();
  });

  it('marks a pending next assignment as needing a response', async () => {
    givenServing();
    volunteerApi.getVolunteerDashboard.mockResolvedValue({
      nextAssignment: { ...assignment('a-1', 11), status: 'pending' },
      upcomingAssignmentGroups: [],
    });
    renderHomePage();
    expect(
      await screen.findByText(m.home_next_assignment_pending()),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: m.home_respond() }),
    ).toHaveAttribute('href', '/my-schedule/a-1');
  });

  it('does not show the empty schedule copy beside a pending check', async () => {
    givenServing();
    volunteerApi.listAvailabilityChecks.mockResolvedValue({
      checks: [check('open', 'pending')],
    });
    renderHomePage();

    expect(await screen.findByText(/Ministry open/)).toBeVisible();
    expect(screen.queryByText(m.my_schedule_empty())).not.toBeInTheDocument();
  });

  it('fails each read independently and retries it without masquerading as empty', async () => {
    givenServing();
    volunteerApi.getVolunteerDashboard.mockRejectedValueOnce(new Error('down'));
    volunteerApi.listAvailabilityChecks.mockResolvedValue({
      checks: [check('open', 'pending')],
    });
    renderHomePage();

    expect(await screen.findByText(m.my_schedule_load_error())).toBeVisible();
    expect(screen.getByText(/Ministry open/)).toBeVisible();
    expect(screen.queryByText(m.my_schedule_empty())).not.toBeInTheDocument();

    volunteerApi.getVolunteerDashboard.mockResolvedValue({
      nextAssignment: assignment('a-1', 11),
      upcomingAssignmentGroups: [],
    });
    await userEvent.click(screen.getByRole('button', { name: m.home_retry() }));
    expect(await screen.findByText(/Kids a-1/)).toBeVisible();
  });

  it('shows the checks error alone when only that read fails', async () => {
    givenServing();
    volunteerApi.listAvailabilityChecks.mockRejectedValueOnce(
      new Error('down'),
    );
    renderHomePage();

    expect(await screen.findByText(m.availability_list_error())).toBeVisible();
    expect(screen.queryByText(m.my_schedule_empty())).not.toBeInTheDocument();
  });

  it('shows loading states while the reads resolve', async () => {
    givenServing();
    volunteerApi.listAvailabilityChecks.mockReturnValue(new Promise(() => {}));
    volunteerApi.getVolunteerDashboard.mockReturnValue(new Promise(() => {}));
    renderHomePage();

    expect(
      await screen.findByText(m.availability_list_loading()),
    ).toBeVisible();
    expect(screen.getByText(m.my_schedule_loading())).toBeVisible();
  });

  it('serves a mixed persona and never reads for a non-serving caller', async () => {
    givenServing({ isChurchAdmin: true, hasVolunteerMembership: true });
    renderHomePage();
    await screen.findByText(m.my_schedule_empty());

    volunteerApi.listAvailabilityChecks.mockClear();
    volunteerApi.getVolunteerDashboard.mockClear();
    givenServing({ isChurchAdmin: true });
    renderHomePage({ queryClient: new QueryClient() });
    await screen.findByRole('heading', { name: m.home_section_church() });
    expect(volunteerApi.listAvailabilityChecks).not.toHaveBeenCalled();
    expect(volunteerApi.getVolunteerDashboard).not.toHaveBeenCalled();
  });

  it('scopes reads to Church and user under the Home serving key', async () => {
    givenServing();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderHomePage({ queryClient });
    await screen.findByText(m.my_schedule_empty());

    await waitFor(() =>
      expect(
        queryClient.getQueryData(
          homeSectionQueryKey({
            section: 'serving',
            churchId: DEFAULT_CHURCH_ID,
            userId: HOME_USER_ID,
            parts: ['dashboard'],
          }),
        ),
      ).toBeDefined(),
    );
  });
});
