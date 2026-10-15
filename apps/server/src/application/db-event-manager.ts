import type {
  GetScheduleBuilderDataInput,
  IEventManager,
  ListEventsInput,
  ScheduleBuilderData,
} from '../domain/contracts/application/event-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { EventRepository } from '../domain/contracts/infrastructure/event.repository';
import type { EventTimeBlockRepository } from '../domain/contracts/infrastructure/event-time-block.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { SectorRepository } from '../domain/contracts/infrastructure/sector.repository';
import type { UnavailableShiftRepository } from '../domain/contracts/infrastructure/unavailable-shift.repository';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { Event } from '../domain/entities/event';
import { IsolationBreachError } from '../domain/errors/isolation-breach-error';

interface DbEventManagerDependencies {
  eventRepo: EventRepository;
  eventTimeBlockRepo: EventTimeBlockRepository;
  assignmentRepo: AssignmentRepository;
  unavailableShiftRepo: UnavailableShiftRepository;
  volunteerRepo: VolunteerRepository;
  roleRepo: RoleRepository;
  sectorRepo: SectorRepository;
}

export class DbEventManager implements IEventManager {
  private readonly eventRepo: EventRepository;
  private readonly eventTimeBlockRepo: EventTimeBlockRepository;
  private readonly assignmentRepo: AssignmentRepository;
  private readonly unavailableShiftRepo: UnavailableShiftRepository;
  private readonly volunteerRepo: VolunteerRepository;
  private readonly roleRepo: RoleRepository;
  private readonly sectorRepo: SectorRepository;

  constructor({
    eventRepo,
    eventTimeBlockRepo,
    assignmentRepo,
    unavailableShiftRepo,
    volunteerRepo,
    roleRepo,
    sectorRepo,
  }: DbEventManagerDependencies) {
    this.eventRepo = eventRepo;
    this.eventTimeBlockRepo = eventTimeBlockRepo;
    this.assignmentRepo = assignmentRepo;
    this.unavailableShiftRepo = unavailableShiftRepo;
    this.volunteerRepo = volunteerRepo;
    this.roleRepo = roleRepo;
    this.sectorRepo = sectorRepo;
  }

  async getScheduleBuilderData(
    input: GetScheduleBuilderDataInput,
  ): Promise<ScheduleBuilderData> {
    const { churchId, eventId, volunteerId } = input;
    const event = await this.eventRepo.getById(churchId, eventId);
    const ministryId =
      input.ministryId ??
      (await this.eventRepo.getMinistryId(churchId, eventId));

    const memberships = await this.volunteerRepo.listMinistryMemberships(
      churchId,
      ministryId,
    );
    const callerMembership = memberships.find(
      (membership) => membership.volunteerId === volunteerId,
    );
    if (!callerMembership) {
      throw new IsolationBreachError(
        'Volunteer does not belong to the event ministry',
      );
    }
    const isCallerMinistryLeader =
      callerMembership.ministryAccessLevel === 'leader';
    const callerLedTeamIds = new Set(
      callerMembership.teamMemberships
        .filter((membership) => membership.accessLevel === 'leader')
        .map((membership) => membership.teamId),
    );
    if (!isCallerMinistryLeader && callerLedTeamIds.size === 0) {
      throw new IsolationBreachError(
        'Volunteer does not have leader or TeamLeader privileges',
      );
    }
    /**
     * TeamLeader-ness is per-team (`ministry_membership_team.access_level =
     * 'leader'`), orthogonal to the ministry-wide `ministryAccessLevel` — a
     * caller can be an ordinary Ministry Member and still lead one or more
     * Teams (CONTEXT.md's TeamLeader, the direct replacement for the old
     * ministry-wide `sub_leader` flag). Such a caller is scoped to the teams
     * they actually lead, not every team they merely belong to, which is
     * strictly narrower than the old flat `teamIds` scoping. A ministry
     * leader stays unrestricted.
     */
    const callerTeamIds = isCallerMinistryLeader ? null : callerLedTeamIds;

    const [eventTimeBlocks, rawAssignments, volunteersInMinistry, roles] =
      await Promise.all([
        this.eventTimeBlockRepo.listByEvent(churchId, eventId),
        this.assignmentRepo.listByEvent(churchId, eventId),
        this.volunteerRepo.listByMinistry(churchId, ministryId),
        this.roleRepo.listByMinistry(churchId, ministryId),
      ]);
    const allowedVolunteerIds = new Set(
      memberships
        .filter(
          (membership) =>
            callerTeamIds == null ||
            membership.teamMemberships.some((team) =>
              callerTeamIds.has(team.teamId),
            ),
        )
        .map((membership) => membership.volunteerId),
    );
    const rawVolunteers = volunteersInMinistry.filter((volunteer) =>
      allowedVolunteerIds.has(volunteer.id),
    );
    const membershipByVolunteerId = new Map(
      memberships.map((membership) => [membership.volunteerId, membership]),
    );

    const allVolunteerIds = rawVolunteers.map((v) => v.id);
    const rawUnavailableShifts =
      allVolunteerIds.length > 0
        ? await this.unavailableShiftRepo.listByVolunteers(
            churchId,
            allVolunteerIds,
          )
        : [];
    const sectors = await this.sectorRepo.listByMinistry({
      churchId,
      ministryId,
    });

    return {
      events: [{ event, eventTimeBlocks }],
      assignments: rawAssignments,
      unavailableShifts: rawUnavailableShifts,
      volunteers: rawVolunteers.map((v) => {
        const membership = membershipByVolunteerId.get(v.id);
        /**
         * Narrowed to the caller's own scope. A TeamLeader caller already only
         * sees members who share a led team with them, but a member may also
         * belong to teams outside that scope — those memberships must not
         * travel in the payload.
         */
        const teamMemberships = (membership?.teamMemberships ?? []).filter(
          (team) => callerTeamIds == null || callerTeamIds.has(team.teamId),
        );
        return {
          id: v.id,
          name: (v.name ?? v.id) as string,
          ministryAccessLevel: membership?.ministryAccessLevel ?? 'volunteer',
          qualifiedRoleIds: membership?.qualifiedRoleIds ?? [],
          teamIds: teamMemberships.map((team) => team.teamId),
          leadTeamIds: teamMemberships
            .filter((team) => team.accessLevel === 'leader')
            .map((team) => team.teamId),
        };
      }),
      roles: roles.map((role) => ({ id: role.id, name: role.name })),
      sectors: sectors.map((sector) => ({ id: sector.id, name: sector.name })),
      callerTeamIds: callerTeamIds == null ? null : [...callerTeamIds],
    };
  }

  async listEvents(input: ListEventsInput): Promise<Event[]> {
    return this.eventRepo.listByMinistry(
      input.churchId,
      input.ministryId,
      input.status,
    );
  }
}
