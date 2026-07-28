// E2E fixtures entry point (T126). Feature specs import the auth-aware `test`
// + `expect` and the leader storage-state path from here. Domain seeding lives
// server-side and runs in Playwright global setup (see `auth.ts`).
export {
  CHURCH_ADMIN_STORAGE_STATE,
  expect,
  LEADER_STORAGE_STATE,
  signUpLeader,
  TEAM_LEADER_STORAGE_STATE,
  test,
  VOLUNTEER_STORAGE_STATE,
} from './auth';

export const volunteerDashboardFixtureIds = {
  availabilityEventId: 'event-availability-1',
  assignmentEventId: 'event-assignment-1',
  ministryId: 'ministry-1',
  notificationId: 'notification-1',
  assignmentId: 'assignment-1',
} as const;

export interface VolunteerDashboardSnapshotFixture {
  availabilityTasks: VolunteerDashboardAvailabilityTaskFixture[];
  upcomingAssignmentGroups: VolunteerDashboardAssignmentGroupFixture[];
  notificationUnreadCount: number;
  notificationPreview: VolunteerDashboardNotificationFixture[];
  defaultMinistryId?: string;
  ministryOptions: VolunteerDashboardMinistryOptionFixture[];
  fetchedAt: string;
}

export interface VolunteerDashboardAvailabilityTaskFixture {
  eventId: string;
  eventTitle: string;
  ministryId: string;
  ministryName: string;
  eventType: 'hourly' | 'day_based';
  eventStart: string;
  eventEnd: string;
  completionState: 'missing' | 'partial' | 'complete';
}

export interface VolunteerDashboardAssignmentGroupFixture {
  eventId: string;
  eventTitle: string;
  ministryId: string;
  ministryName: string;
  eventStart: string;
  aggregateResponseState: 'pending' | 'confirmed' | 'mixed' | 'declined';
  hasPendingResponse: boolean;
  assignments: VolunteerDashboardAssignmentFixture[];
}

export interface VolunteerDashboardAssignmentFixture {
  assignmentId: string;
  slotId: string;
  roleId: string;
  roleName: string;
  teamId?: string;
  teamName?: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'declined';
  timingState: 'in_progress' | 'upcoming';
  canRespond: boolean;
}

export interface VolunteerDashboardNotificationFixture {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
}

export interface VolunteerDashboardNotificationsPageFixture {
  items: VolunteerDashboardNotificationFixture[];
  nextCursor?: string;
}

export interface VolunteerDashboardMinistryOptionFixture {
  id: string;
  name: string;
}

export function createVolunteerDashboardSnapshotFixture(): VolunteerDashboardSnapshotFixture {
  return {
    availabilityTasks: [
      {
        eventId: volunteerDashboardFixtureIds.availabilityEventId,
        eventTitle: 'Youth Gathering',
        ministryId: volunteerDashboardFixtureIds.ministryId,
        ministryName: 'Adult Ministry',
        eventType: 'hourly',
        eventStart: '2026-07-05T09:00:00.000Z',
        eventEnd: '2026-07-05T11:00:00.000Z',
        completionState: 'missing',
      },
    ],
    upcomingAssignmentGroups: [
      {
        eventId: volunteerDashboardFixtureIds.assignmentEventId,
        eventTitle: 'Sunday Service',
        ministryId: volunteerDashboardFixtureIds.ministryId,
        ministryName: 'Adult Ministry',
        eventStart: '2026-07-06T09:00:00.000Z',
        aggregateResponseState: 'pending',
        hasPendingResponse: true,
        assignments: [
          {
            assignmentId: volunteerDashboardFixtureIds.assignmentId,
            slotId: 'slot-1',
            roleId: 'role-1',
            roleName: 'Usher',
            startTime: '2026-07-06T09:00:00.000Z',
            endTime: '2026-07-06T11:00:00.000Z',
            status: 'pending',
            timingState: 'upcoming',
            canRespond: true,
          },
        ],
      },
    ],
    notificationUnreadCount: 1,
    notificationPreview: [
      {
        id: volunteerDashboardFixtureIds.notificationId,
        type: 'schedule_published',
        title: 'Schedule published',
        body: 'Your latest assignments are ready to review.',
        createdAt: '2026-07-01T08:00:00.000Z',
      },
    ],
    defaultMinistryId: volunteerDashboardFixtureIds.ministryId,
    ministryOptions: [
      {
        id: volunteerDashboardFixtureIds.ministryId,
        name: 'Adult Ministry',
      },
    ],
    fetchedAt: '2026-07-01T08:00:00.000Z',
  };
}

export function createVolunteerDashboardNotificationsPageFixture(): VolunteerDashboardNotificationsPageFixture {
  return {
    items: [
      {
        id: volunteerDashboardFixtureIds.notificationId,
        type: 'schedule_published',
        title: 'Schedule published',
        body: 'Your latest assignments are ready to review.',
        createdAt: '2026-07-01T08:00:00.000Z',
      },
    ],
  };
}
