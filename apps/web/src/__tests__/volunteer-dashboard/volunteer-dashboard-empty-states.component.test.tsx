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

describe('VolunteerDashboard empty-state regressions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("hides the availability tab badge when there are no outstanding tasks, and shows each remaining tab's empty state on demand", async () => {
    const user = userEvent.setup();

    mockedUseVolunteerDashboard.mockReturnValue(
      createVolunteerDashboardHookResult(),
    );

    renderWithProviders(<VolunteerDashboard />);

    expect(
      screen.getByRole('tab', { name: /Availability Needed/i }),
    ).not.toHaveTextContent(/\d/);

    expect(
      screen.getByText(
        'You are not currently scheduled for any upcoming published assignments.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Availability Needed/i }));
    expect(
      screen.queryByText('Availability needed', { exact: true }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Ministry Schedule' }));
    expect(
      screen.getByText(
        'Published events for this ministry will appear here when leaders finalize them.',
      ),
    ).toBeInTheDocument();
  });

  it('surfaces an outstanding availability task via the tab badge and its own tab content, without switching away from the default tab', async () => {
    const user = userEvent.setup();

    mockedUseVolunteerDashboard.mockReturnValue(
      createVolunteerDashboardHookResult({
        availabilityTasks: [
          {
            completionState: 'missing',
            eventEnd: '2099-01-06T11:00:00.000Z',
            eventId: 'event-1',
            eventStart: '2099-01-06T09:00:00.000Z',
            eventTitle: 'Youth Gathering',
            eventType: 'hourly',
            ministryId: 'ministry-1',
            ministryName: 'Adult Ministry',
          },
        ],
      }),
    );

    renderWithProviders(<VolunteerDashboard />);

    expect(screen.getByText('My Upcoming Assignments')).toBeInTheDocument();
    expect(
      screen.queryByText('Availability needed', { exact: true }),
    ).not.toBeInTheDocument();

    const availabilityTab = screen.getByRole('tab', {
      name: /Availability Needed/i,
    });
    expect(availabilityTab).toHaveTextContent('1');

    await user.click(availabilityTab);
    expect(screen.getByText('Availability needed')).toBeInTheDocument();
    expect(screen.getByText('Youth Gathering')).toBeInTheDocument();
  });
});
