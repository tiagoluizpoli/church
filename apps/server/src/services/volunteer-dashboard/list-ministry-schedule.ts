import type { Assignment } from '../../domain/entities/assignment';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { MinistryId } from '../../domain/entities/ministry';
import type { RoleId } from '../../domain/entities/role';
import type { TeamId } from '../../domain/entities/team';
import type { Volunteer, VolunteerId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';

export interface MinistryScheduleRow {
  slotId: string;
  slotLabel: string;
  roleName: string;
  teamName?: string;
  volunteerDisplayName?: string;
  confirmationState: 'pending' | 'confirmed' | 'declined' | 'open';
}

export interface MinistryScheduleEvent {
  eventId: string;
  title: string;
  startDate: string;
  endDate: string;
  assignmentCount: number;
  rows: MinistryScheduleRow[];
}

export interface MinistryScheduleView {
  ministryId: string;
  ministryName: string;
  events: MinistryScheduleEvent[];
}

export interface ListMinistryScheduleInput {
  volunteer: Volunteer;
  ministryId: string;
  now?: Date;
}

interface ScheduleRowSeed {
  slotId: string;
  slotLabel: string;
  roleId: RoleId;
  roleName: string;
  teamId?: TeamId;
}

function isVolunteerFacingAssignment(
  assignment: Assignment,
): assignment is Assignment & {
  status: 'pending' | 'confirmed' | 'declined';
} {
  return (
    assignment.status === 'pending' ||
    assignment.status === 'confirmed' ||
    assignment.status === 'declined'
  );
}

function formatVolunteerDisplayName(
  name: string | undefined,
): string | undefined {
  if (!name) {
    return undefined;
  }

  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return undefined;
  }

  if (tokens.length === 1) {
    return tokens[0];
  }

  const first = tokens[0];
  const lastInitial = tokens[tokens.length - 1]?.[0];

  if (!lastInitial) {
    return first;
  }

  return `${first} ${lastInitial.toUpperCase()}.`;
}

async function listScheduleRowSeeds(
  churchId: ChurchId,
  eventId: EventId,
): Promise<ScheduleRowSeed[]> {
  const slots = await repositories.timeSlots.listByEvent(churchId, eventId);
  const sortedSlots = [...slots].sort(
    (left, right) => left.startTime.getTime() - right.startTime.getTime(),
  );
  const rows: ScheduleRowSeed[] = [];

  for (const slot of sortedSlots) {
    for (const requirement of slot.requirements) {
      const role = await repositories.roles.getById(
        churchId,
        requirement.roleId,
      );
      rows.push({
        slotId: slot.id,
        slotLabel: slot.label ?? slot.startTime.toISOString(),
        roleId: requirement.roleId,
        roleName: role.name,
        teamId: requirement.teamId,
      });
    }
  }

  return rows;
}

async function listTeamNames(
  churchId: ChurchId,
  teamIds: TeamId[],
): Promise<Map<TeamId, string>> {
  if (teamIds.length === 0) {
    return new Map();
  }

  const teams = await repositories.teams.listByIds(churchId, teamIds);
  return new Map(teams.map((team) => [team.id, team.name]));
}

async function listVolunteerNames(
  churchId: ChurchId,
  volunteerIds: VolunteerId[],
): Promise<Map<VolunteerId, string | undefined>> {
  if (volunteerIds.length === 0) {
    return new Map();
  }

  const volunteers = await repositories.volunteers.listByIds(
    churchId,
    volunteerIds,
  );
  return new Map(volunteers.map((volunteer) => [volunteer.id, volunteer.name]));
}

export async function listMinistrySchedule({
  volunteer,
  ministryId,
  now,
}: ListMinistryScheduleInput): Promise<MinistryScheduleView> {
  const effectiveNow = now ?? new Date();
  const typedMinistryId = ministryId as MinistryId;
  const memberMinistryIds = await repositories.volunteers.listMemberMinistryIds(
    volunteer.churchId,
    volunteer.id,
  );

  if (!memberMinistryIds.includes(typedMinistryId)) {
    return {
      ministryId,
      ministryName: '',
      events: [],
    };
  }

  const ministry = await repositories.ministries.getById(
    volunteer.churchId,
    typedMinistryId,
  );
  const events = await repositories.events.listByMinistry(
    volunteer.churchId,
    ministry.id,
  );
  const visibleEvents = events
    .filter(
      (event) => event.status === 'published' && event.endDate > effectiveNow,
    )
    .sort(
      (left, right) => left.startDate.getTime() - right.startDate.getTime(),
    );

  const mappedEvents = await Promise.all(
    visibleEvents.map(async (event) => {
      const rowSeeds = await listScheduleRowSeeds(volunteer.churchId, event.id);
      const assignments = await repositories.assignments.listByEvent(
        volunteer.churchId,
        event.id,
      );
      const visibleAssignments = assignments.filter(
        isVolunteerFacingAssignment,
      );
      const volunteerNames = await listVolunteerNames(
        volunteer.churchId,
        visibleAssignments.map((assignment) => assignment.volunteerId),
      );
      const teamNames = await listTeamNames(
        volunteer.churchId,
        rowSeeds
          .map((row) => row.teamId)
          .filter((teamId): teamId is TeamId => teamId != null),
      );
      const rows: MinistryScheduleRow[] = [];
      // Prevent same assignment appearing in multiple team-scoped rows for the
      // same slotId+roleId when assignments don't carry teamId.
      const claimedAssignmentIds = new Set<string>();

      for (const seed of rowSeeds) {
        const matchingAssignments = visibleAssignments.filter(
          (assignment) =>
            assignment.slotId === seed.slotId &&
            assignment.roleId === seed.roleId &&
            !claimedAssignmentIds.has(assignment.id),
        );

        for (const assignment of matchingAssignments) {
          claimedAssignmentIds.add(assignment.id);
          rows.push({
            slotId: seed.slotId,
            slotLabel: seed.slotLabel,
            roleName: seed.roleName,
            teamName: seed.teamId ? teamNames.get(seed.teamId) : undefined,
            confirmationState: assignment.status,
            volunteerDisplayName: formatVolunteerDisplayName(
              volunteerNames.get(assignment.volunteerId),
            ),
          });
        }

        if (matchingAssignments.length === 0) {
          rows.push({
            slotId: seed.slotId,
            slotLabel: seed.slotLabel,
            roleName: seed.roleName,
            teamName: seed.teamId ? teamNames.get(seed.teamId) : undefined,
            confirmationState: 'open',
          });
        }
      }

      return {
        eventId: event.id,
        title: event.title,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        assignmentCount: visibleAssignments.length,
        rows,
      };
    }),
  );

  return {
    ministryId: ministry.id,
    ministryName: ministry.name,
    events: mappedEvents,
  };
}
