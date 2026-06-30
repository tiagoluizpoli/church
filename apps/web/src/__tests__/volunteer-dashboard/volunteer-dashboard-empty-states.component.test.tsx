import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../setup/render';
import { VolunteerDashboard } from '@/features/volunteers/components/volunteer-dashboard';
import { useNotificationInbox } from '@/features/volunteers/hooks/use-notification-inbox';
import { useVolunteerDashboard } from '@/features/volunteers/hooks/use-volunteer-dashboard';

vi.mock('@/features/volunteers/hooks/use-volunteer-dashboard', () => ({
  useVolunteerDashboard: vi.fn(),
}));

vi.mock('@/features/volunteers/hooks/use-notification-inbox', () => ({
  useNotificationInbox: vi.fn(),
}));

function createVolunteerDashboardHookResult(
  overrides: Partial<ReturnType<typeof useVolunteerDashboard>> = {},
): ReturnType<typeof useVolunteerDashboard> {
  return {
    assignmentGroups: [],
    availabilitySlots: [],
    availabilityTasks: [],
    expandedAssignmentEventId: undefined,
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

function createNotificationInboxHookResult(
  overrides: Partial<ReturnType<typeof useNotificationInbox>> = {},
): ReturnType<typeof useNotificationInbox> {
  return {
    hasMore: false,
    isLoading: false,
    isLoadingMore: false,
    items: [],
    loadMore: vi.fn(),
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    openNotification: vi.fn(),
    pages: [],
    refresh: vi.fn().mockResolvedValue(undefined),
    selectedNotification: undefined,
    setSelectedNotificationId: vi.fn(),
    unreadCount: 0,
    ...overrides,
  } as unknown as ReturnType<typeof useNotificationInbox>;
}

const mockedUseNotificationInbox = vi.mocked(useNotificationInbox);
const mockedUseVolunteerDashboard = vi.mocked(useVolunteerDashboard);

describe('VolunteerDashboard empty-state regressions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('hides availability section when there are no tasks and keeps other empty states visible in dashboard order', () => {
    mockedUseVolunteerDashboard.mockReturnValue(
      createVolunteerDashboardHookResult(),
    );
    mockedUseNotificationInbox.mockReturnValue(
      createNotificationInboxHookResult(),
    );

    renderWithProviders(<VolunteerDashboard volunteerName="Alex" />);

    expect(
      screen.queryByText('Availability needed', { exact: true }),
    ).not.toBeInTheDocument();

    const assignmentsEmptyState = screen.getByText(
      'You are not currently scheduled for any upcoming published assignments.',
    );
    const notificationsEmptyState = screen.getByText(
      'Scheduling updates and reminders will appear here.',
    );
    const ministryEmptyState = screen.getByText(
      'Published events for this ministry will appear here when leaders finalize them.',
    );

    expect(
      assignmentsEmptyState.compareDocumentPosition(notificationsEmptyState),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      notificationsEmptyState.compareDocumentPosition(ministryEmptyState),
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
    mockedUseNotificationInbox.mockReturnValue(
      createNotificationInboxHookResult(),
    );

    renderWithProviders(<VolunteerDashboard volunteerName="Alex" />);

    const availabilityHeading = screen.getByText('Availability needed');
    const assignmentsHeading = screen.getByText('My Upcoming Assignments');

    expect(
      availabilityHeading.compareDocumentPosition(assignmentsHeading),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
