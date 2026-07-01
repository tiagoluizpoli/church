import type { MinistryId } from '../../domain/entities/ministry';
import type { Volunteer } from '../../domain/entities/volunteer';
import type { VolunteerNotification } from '../../domain/entities/volunteer-notification';
import { repositories } from '../../infrastructure/repositories/registry';
import {
  type AvailabilityTaskSummary,
  computeAvailabilityTask,
} from './compute-availability-task';
import {
  listUpcomingAssignmentGroups,
  type MinistryContext,
  type UpcomingAssignmentGroup,
} from './list-upcoming-assignment-groups';

export interface VolunteerDashboardNotificationPreview {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
}

export interface VolunteerDashboardMinistryOption {
  id: string;
  name: string;
}

export interface VolunteerDashboardSnapshot {
  availabilityTasks: AvailabilityTaskSummary[];
  upcomingAssignmentGroups: UpcomingAssignmentGroup[];
  notificationUnreadCount: number;
  notificationPreview: VolunteerDashboardNotificationPreview[];
  defaultMinistryId?: string;
  ministryOptions: VolunteerDashboardMinistryOption[];
  fetchedAt: string;
}

const NOTIFICATION_PREVIEW_LIMIT = 3;

export interface BuildDashboardSnapshotInput {
  volunteer: Volunteer;
  now?: Date;
}

function mapNotificationPreview(
  notification: VolunteerNotification,
): VolunteerDashboardNotificationPreview {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    readAt: notification.readAt?.toISOString(),
    createdAt: notification.createdAt.toISOString(),
  };
}

export function buildNotificationLinkContext(
  snapshot: Pick<
    VolunteerDashboardSnapshot,
    'availabilityTasks' | 'upcomingAssignmentGroups' | 'ministryOptions'
  >,
) {
  return {
    availabilityEventIds: snapshot.availabilityTasks.map(
      (task) => task.eventId,
    ),
    assignmentEventIds: snapshot.upcomingAssignmentGroups.map(
      (group) => group.eventId,
    ),
    ministryIds: snapshot.ministryOptions.map((ministry) => ministry.id),
  };
}

export async function buildDashboardSnapshot(
  input: BuildDashboardSnapshotInput,
): Promise<VolunteerDashboardSnapshot> {
  const now = input.now ?? new Date();
  const ministryIds = await repositories.volunteers.listMemberMinistryIds(
    input.volunteer.churchId,
    input.volunteer.id,
  );
  const ministries = (
    await repositories.ministries.listByChurch(input.volunteer.churchId)
  )
    .filter((ministry) => ministryIds.includes(ministry.id as MinistryId))
    .map<MinistryContext>((ministry) => ({
      id: ministry.id,
      name: ministry.name,
    }));

  const availabilityTasks = (
    await Promise.all(
      ministries.map(async (ministry) => {
        const events = await repositories.events.listByMinistry(
          input.volunteer.churchId,
          ministry.id as MinistryId,
        );

        return Promise.all(
          events.map(async (event) => {
            const eventWithSlots = await repositories.events.getWithSlots(
              input.volunteer.churchId,
              event.id,
            );
            const entries =
              await repositories.availability.listByVolunteerForEvent(
                input.volunteer.churchId,
                input.volunteer.id,
                event.id,
              );

            return computeAvailabilityTask({
              event,
              slots: eventWithSlots.slots,
              ministryName: ministry.name,
              entries,
              now,
            });
          }),
        );
      }),
    )
  )
    .flat(2)
    .filter((task): task is AvailabilityTaskSummary => task != null)
    .sort(
      (left, right) =>
        new Date(left.eventStart).getTime() -
        new Date(right.eventStart).getTime(),
    );

  const upcomingAssignmentGroups = await listUpcomingAssignmentGroups({
    volunteer: input.volunteer,
    ministries,
    now,
  });
  const [notificationUnreadCount, notificationPreviewResult] =
    await Promise.all([
      repositories.volunteerNotifications.countUnread(
        input.volunteer.churchId,
        input.volunteer.id,
      ),
      repositories.volunteerNotifications.listByVolunteer(
        input.volunteer.churchId,
        {
          volunteerId: input.volunteer.id,
          limit: NOTIFICATION_PREVIEW_LIMIT,
        },
      ),
    ]);

  return {
    availabilityTasks,
    upcomingAssignmentGroups,
    notificationUnreadCount,
    notificationPreview: notificationPreviewResult.items.map(
      mapNotificationPreview,
    ),
    defaultMinistryId:
      upcomingAssignmentGroups[0]?.ministryId ?? ministries[0]?.id,
    ministryOptions: ministries,
    fetchedAt: now.toISOString(),
  };
}
