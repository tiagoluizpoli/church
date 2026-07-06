import { screen } from '@testing-library/react';
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

  it('hides availability section when there are no tasks and keeps other empty states visible in dashboard order', () => {
    mockedUseVolunteerDashboard.mockReturnValue(
      createVolunteerDashboardHookResult(),
    );

    renderWithProviders(<VolunteerDashboard volunteerName="Alex" />);

    expect(
      screen.queryByText('Availability needed', { exact: true }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText('Scheduling updates and reminders will appear here.'),
    ).not.toBeInTheDocument();

    const assignmentsEmptyState = screen.getByText(
      'You are not currently scheduled for any upcoming published assignments.',
    );
    const ministryEmptyState = screen.getByText(
      'Published events for this ministry will appear here when leaders finalize them.',
    );

    expect(
      assignmentsEmptyState.compareDocumentPosition(ministryEmptyState),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('keeps availability needed above upcoming assignments when only assignments are empty', () => {
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

    renderWithProviders(<VolunteerDashboard volunteerName="Alex" />);

    const availabilityHeading = screen.getByText('Availability needed');
    const assignmentsHeading = screen.getByText('My Upcoming Assignments');

    expect(
      availabilityHeading.compareDocumentPosition(assignmentsHeading),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
