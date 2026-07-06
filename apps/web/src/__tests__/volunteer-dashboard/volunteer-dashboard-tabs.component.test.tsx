import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../setup/render';
import { VolunteerDashboard } from '@/features/volunteers/components/volunteer-dashboard';
import { useVolunteerDashboard } from '@/features/volunteers/hooks/use-volunteer-dashboard';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/features/volunteers/hooks/use-volunteer-dashboard', () => ({
  useVolunteerDashboard: vi.fn(),
}));

function createVolunteerDashboardHookResult(
  overrides: Partial<ReturnType<typeof useVolunteerDashboard>> = {},
): ReturnType<typeof useVolunteerDashboard> {
  return {
    assignmentGroups: [],
    availabilitySlots: [],
    availabilityTasks: [],
    cancelAssignment: {
      isPending: false,
    },
    expandedAssignmentEventId: undefined,
    handleCancelAssignment: vi.fn(),
    handleRespondToAssignment: vi.fn(),
    handleSaveAvailability: vi.fn(),
    handleToggleAssignmentGroup: vi.fn(),
    invalidateVolunteerDashboard: vi.fn().mockResolvedValue(undefined),
    isOnline: true,
    lastUpdatedAt: '2099-01-05T08:00:00.000Z',
    ministryOptions: [{ id: 'ministry-1', name: 'Adult Ministry' }],
    ministrySchedule: {
      ministryId: 'ministry-1',
      ministryName: 'Adult Ministry',
      events: [],
    },
    ministryScheduleQuery: {
      data: {
        ministryId: 'ministry-1',
        ministryName: 'Adult Ministry',
        events: [],
      },
      isLoading: false,
    },
    notificationUnreadCount: 0,
    openAssignmentGroup: vi.fn(),
    respondToAssignment: {
      isPending: false,
    },
    saveAvailability: {
      isError: false,
      isPending: false,
      isSuccess: false,
    },
    selectedMinistryId: 'ministry-1',
    selectedTask: undefined,
    setSelectedEventId: vi.fn(),
    setSelectedMinistryId: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useVolunteerDashboard>;
}

const mockedUseVolunteerDashboard = vi.mocked(useVolunteerDashboard);

const availabilityTasksFixture = [
  {
    completionState: 'missing' as const,
    eventEnd: '2099-01-06T11:00:00.000Z',
    eventId: 'event-1',
    eventStart: '2099-01-06T09:00:00.000Z',
    eventTitle: 'Youth Gathering',
    eventType: 'hourly' as const,
    ministryId: 'ministry-1',
    ministryName: 'Adult Ministry',
  },
  {
    completionState: 'partial' as const,
    eventEnd: '2099-01-07T11:00:00.000Z',
    eventId: 'event-2',
    eventStart: '2099-01-07T09:00:00.000Z',
    eventTitle: 'Sunday Service',
    eventType: 'hourly' as const,
    ministryId: 'ministry-1',
    ministryName: 'Adult Ministry',
  },
];

describe('VolunteerDashboard tabs', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to the Upcoming Assignments tab and keeps other tab content unmounted', () => {
    mockedUseVolunteerDashboard.mockReturnValue(
      createVolunteerDashboardHookResult({
        availabilityTasks: availabilityTasksFixture,
      }),
    );

    renderWithProviders(<VolunteerDashboard volunteerName="Alex" />);

    expect(screen.getByText('My Upcoming Assignments')).toBeInTheDocument();
    expect(screen.queryByText('Availability needed')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Browse published schedule rows without leader-only conflict or audit details.',
      ),
    ).not.toBeInTheDocument();
  });

  it('shows an outstanding-count badge on the Availability Needed tab without switching to it', () => {
    mockedUseVolunteerDashboard.mockReturnValue(
      createVolunteerDashboardHookResult({
        availabilityTasks: availabilityTasksFixture,
      }),
    );

    renderWithProviders(<VolunteerDashboard volunteerName="Alex" />);

    const availabilityTab = screen.getByRole('tab', {
      name: /Availability Needed/i,
    });

    expect(availabilityTab).toHaveTextContent('2');
    expect(screen.queryByText('Availability needed')).not.toBeInTheDocument();
  });

  it('omits the outstanding-count badge when there are no outstanding availability tasks', () => {
    mockedUseVolunteerDashboard.mockReturnValue(
      createVolunteerDashboardHookResult({ availabilityTasks: [] }),
    );

    renderWithProviders(<VolunteerDashboard volunteerName="Alex" />);

    const availabilityTab = screen.getByRole('tab', {
      name: /Availability Needed/i,
    });

    expect(availabilityTab).not.toHaveTextContent(/\d/);
  });

  it('renders Ministry Schedule content only when its tab is active', async () => {
    const user = userEvent.setup();

    mockedUseVolunteerDashboard.mockReturnValue(
      createVolunteerDashboardHookResult(),
    );

    const ministryScheduleDescription =
      'Browse published schedule rows without leader-only conflict or audit details.';

    renderWithProviders(<VolunteerDashboard volunteerName="Alex" />);

    expect(
      screen.queryByText(ministryScheduleDescription),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Ministry Schedule' }));

    expect(screen.getByText(ministryScheduleDescription)).toBeInTheDocument();
    expect(
      screen.queryByText('My Upcoming Assignments'),
    ).not.toBeInTheDocument();
  });

  it('switches to the Availability Needed tab on click and shows its content', async () => {
    const user = userEvent.setup();

    mockedUseVolunteerDashboard.mockReturnValue(
      createVolunteerDashboardHookResult({
        availabilityTasks: availabilityTasksFixture,
      }),
    );

    renderWithProviders(<VolunteerDashboard volunteerName="Alex" />);

    await user.click(screen.getByRole('tab', { name: /Availability Needed/i }));

    expect(screen.getByText('Availability needed')).toBeInTheDocument();
    expect(
      screen.queryByText('My Upcoming Assignments'),
    ).not.toBeInTheDocument();
  });
});
