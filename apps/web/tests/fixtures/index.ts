// Volunteer dashboard response fixtures (T126). E2E specs load their domain
// data from server recipes: `journey-recipes.ts` and `shared-personas.ts`.

export const volunteerDashboardFixtureIds = {
  assignmentEventId: 'event-assignment-1',
  ministryId: 'ministry-1',
  notificationId: 'notification-1',
  assignmentId: 'assignment-1',
} as const;

export interface VolunteerDashboardSnapshotFixture {
  upcomingAssignmentGroups: VolunteerDashboardAssignmentGroupFixture[];
  notificationUnreadCount: number;
  notificationPreview: VolunteerDashboardNotificationFixture[];
  defaultMinistryId?: string;
  ministryOptions: VolunteerDashboardMinistryOptionFixture[];
  fetchedAt: string;
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
  eventTimeBlockId: string;
  roleId: string;
  roleName: string;
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
            eventTimeBlockId: 'event-time-block-1',
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
