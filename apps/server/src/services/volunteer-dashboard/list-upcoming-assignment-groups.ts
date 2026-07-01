import type { AssignmentStatus } from '../../domain/entities/assignment';
import type { MinistryId } from '../../domain/entities/ministry';
import type { Volunteer } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';

export interface UpcomingAssignmentItem {
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

export interface UpcomingAssignmentGroup {
  eventId: string;
  eventTitle: string;
  ministryId: string;
  ministryName: string;
  eventStart: string;
  aggregateResponseState: 'pending' | 'confirmed' | 'mixed' | 'declined';
  hasPendingResponse: boolean;
  assignments: UpcomingAssignmentItem[];
}

export interface MinistryContext {
  id: string;
  name: string;
}

export interface AssignmentGroupingContext {
  volunteer: Volunteer;
  ministries: MinistryContext[];
  now: Date;
}

interface GroupAccumulator {
  eventId: string;
  eventTitle: string;
  ministryId: string;
  ministryName: string;
  eventStart: string;
  assignments: UpcomingAssignmentItem[];
}

function isPublishedVolunteerAssignmentStatus(
  status: AssignmentStatus,
): status is 'pending' | 'confirmed' | 'declined' {
  return (
    status === 'pending' || status === 'confirmed' || status === 'declined'
  );
}

function aggregateResponseState(
  statuses: Array<'pending' | 'confirmed' | 'declined'>,
): 'pending' | 'confirmed' | 'mixed' | 'declined' {
  const uniqueStatuses = new Set(statuses);
  if (uniqueStatuses.size === 1) {
    return statuses[0] ?? 'mixed';
  }

  return 'mixed';
}

export async function listUpcomingAssignmentGroups({
  volunteer,
  ministries,
  now,
}: AssignmentGroupingContext): Promise<UpcomingAssignmentGroup[]> {
  const assignments = await repositories.assignments.listByVolunteer(
    volunteer.churchId,
    volunteer.id,
  );
  const ministryById = new Map(
    ministries.map((ministry) => [ministry.id as MinistryId, ministry]),
  );
  const groups = new Map<string, GroupAccumulator>();

  for (const assignment of assignments) {
    if (!isPublishedVolunteerAssignmentStatus(assignment.status)) {
      continue;
    }

    const slot = await repositories.timeSlots.getById(
      volunteer.churchId,
      assignment.slotId,
    );
    const event = await repositories.events.getById(
      volunteer.churchId,
      slot.eventId,
    );

    if (event.status !== 'published' || slot.endTime <= now) {
      continue;
    }

    const role = await repositories.roles.getById(
      volunteer.churchId,
      assignment.roleId,
    );
    const ministry = ministryById.get(event.ministryId);

    if (!ministry) {
      continue;
    }

    const timingState = slot.startTime <= now ? 'in_progress' : 'upcoming';
    const currentGroup = groups.get(event.id) ?? {
      eventId: event.id,
      eventTitle: event.title,
      ministryId: event.ministryId,
      ministryName: ministry.name,
      eventStart: event.startDate.toISOString(),
      assignments: [],
    };

    currentGroup.assignments.push({
      assignmentId: assignment.id,
      slotId: slot.id,
      roleId: assignment.roleId,
      roleName: role.name,
      startTime: slot.startTime.toISOString(),
      endTime: slot.endTime.toISOString(),
      status: assignment.status,
      timingState,
      canRespond: timingState === 'upcoming',
    });
    groups.set(event.id, currentGroup);
  }

  return Array.from(groups.values())
    .map<UpcomingAssignmentGroup>((group) => {
      const sortedAssignments = [...group.assignments].sort(
        (left, right) =>
          new Date(left.startTime).getTime() -
          new Date(right.startTime).getTime(),
      );

      return {
        eventId: group.eventId,
        eventTitle: group.eventTitle,
        ministryId: group.ministryId,
        ministryName: group.ministryName,
        eventStart: group.eventStart,
        aggregateResponseState: aggregateResponseState(
          sortedAssignments.map((assignment) => assignment.status),
        ),
        hasPendingResponse: sortedAssignments.some(
          (assignment) => assignment.status === 'pending',
        ),
        assignments: sortedAssignments,
      };
    })
    .sort(
      (left, right) =>
        new Date(left.eventStart).getTime() -
        new Date(right.eventStart).getTime(),
    );
}
