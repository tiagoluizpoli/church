import { NotFoundError } from '@church/core';
import type {
  ChurchId,
  EventId,
  MinistryId,
  MinistryParticipationId,
  UserId,
} from '../domain/branded-ids';
import type { IAuthorityManager } from '../domain/contracts/application/authority-manager';
import type {
  GetScheduleBuilderDataInput,
  IEventManager,
  ListEventsInput,
  ScheduleBuilderData,
} from '../domain/contracts/application/event-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { EventRepository } from '../domain/contracts/infrastructure/event.repository';
import type { EventTimeBlockRepository } from '../domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { SectorRepository } from '../domain/contracts/infrastructure/sector.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { UnavailableShiftRepository } from '../domain/contracts/infrastructure/unavailable-shift.repository';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { Event } from '../domain/entities/event';
import { EventTimeBlock } from '../domain/entities/event-time-block';
import type { ShiftRequirement } from '../domain/entities/shift-requirement';

const SCHEDULE_BUILDER_NOT_FOUND_MESSAGE =
  'Schedule builder resource not found';

interface DbEventManagerDependencies {
  eventRepo: EventRepository;
  eventTimeBlockRepo: EventTimeBlockRepository;
  assignmentRepo: AssignmentRepository;
  unavailableShiftRepo: UnavailableShiftRepository;
  volunteerRepo: VolunteerRepository;
  roleRepo: RoleRepository;
  sectorRepo: SectorRepository;
  ministryParticipationRepo: MinistryParticipationRepository;
  authorityManager: IAuthorityManager;
  shiftRepo: ShiftRepository;
}

interface ResolveScheduleBuilderScopeInput {
  churchId: ChurchId;
  eventId: EventId;
  userId: UserId;
  ministryId?: MinistryId;
}

interface ScheduleBuilderScope {
  ministryId: MinistryId;
  participationId: MinistryParticipationId;
}

interface ScopeEventTimeBlocksInput {
  eventTimeBlocks: EventTimeBlock[];
  requirements: ShiftRequirement[];
}

export class DbEventManager implements IEventManager {
  private readonly eventRepo: EventRepository;
  private readonly eventTimeBlockRepo: EventTimeBlockRepository;
  private readonly assignmentRepo: AssignmentRepository;
  private readonly unavailableShiftRepo: UnavailableShiftRepository;
  private readonly volunteerRepo: VolunteerRepository;
  private readonly roleRepo: RoleRepository;
  private readonly sectorRepo: SectorRepository;
  private readonly ministryParticipationRepo: MinistryParticipationRepository;
  private readonly authorityManager: IAuthorityManager;
  private readonly shiftRepo: ShiftRepository;

  constructor({
    eventRepo,
    eventTimeBlockRepo,
    assignmentRepo,
    unavailableShiftRepo,
    volunteerRepo,
    roleRepo,
    sectorRepo,
    ministryParticipationRepo,
    authorityManager,
    shiftRepo,
  }: DbEventManagerDependencies) {
    this.eventRepo = eventRepo;
    this.eventTimeBlockRepo = eventTimeBlockRepo;
    this.assignmentRepo = assignmentRepo;
    this.unavailableShiftRepo = unavailableShiftRepo;
    this.volunteerRepo = volunteerRepo;
    this.roleRepo = roleRepo;
    this.sectorRepo = sectorRepo;
    this.ministryParticipationRepo = ministryParticipationRepo;
    this.authorityManager = authorityManager;
    this.shiftRepo = shiftRepo;
  }

  async getScheduleBuilderData(
    input: GetScheduleBuilderDataInput,
  ): Promise<ScheduleBuilderData> {
    const { churchId, eventId, userId } = input;
    const scope = await this.resolveScheduleBuilderScope({
      churchId,
      eventId,
      userId,
      ministryId: input.ministryId,
    });
    const { ministryId, participationId } = scope;

    const [
      eventTimeBlocks,
      rawAssignments,
      volunteersInMinistry,
      roles,
      shifts,
      requirements,
    ] = await Promise.all([
      this.eventTimeBlockRepo.listByEvent(churchId, eventId),
      this.assignmentRepo.listByParticipation(churchId, participationId),
      this.volunteerRepo.listByMinistry(churchId, ministryId),
      this.roleRepo.listByMinistry(churchId, ministryId),
      this.shiftRepo.listByParticipation({ churchId, participationId }),
      this.shiftRepo.listRequirementsByParticipation({
        churchId,
        participationId,
      }),
    ]);
    const memberships = await this.volunteerRepo.listMinistryMemberships(
      churchId,
      ministryId,
    );
    const rawVolunteers = volunteersInMinistry;
    const membershipByVolunteerId = new Map(
      memberships.map((membership) => [membership.volunteerId, membership]),
    );

    const allVolunteerIds = rawVolunteers.map((volunteer) => volunteer.id);
    const participationShiftIds = new Set(shifts.map((shift) => shift.id));
    const rawUnavailableShifts =
      allVolunteerIds.length > 0
        ? await this.unavailableShiftRepo.listByVolunteers(
            churchId,
            allVolunteerIds,
          )
        : [];
    const unavailableShifts = rawUnavailableShifts.filter((unavailableShift) =>
      participationShiftIds.has(unavailableShift.shiftId),
    );
    const sectors = await this.sectorRepo.listByMinistry({
      churchId,
      ministryId,
    });

    return {
      events: [
        {
          event: await this.eventRepo.getById(churchId, eventId),
          eventTimeBlocks: this.scopeEventTimeBlocks({
            eventTimeBlocks,
            requirements,
          }),
        },
      ],
      assignments: rawAssignments,
      unavailableShifts,
      volunteers: rawVolunteers.map((volunteer) => {
        const membership = membershipByVolunteerId.get(volunteer.id);
        return {
          id: volunteer.id,
          name: (volunteer.name ?? volunteer.id) as string,
          ministryAccessLevel: membership?.ministryAccessLevel ?? 'volunteer',
          qualifiedRoleIds: membership?.qualifiedRoleIds ?? [],
        };
      }),
      roles: roles.map((role) => ({ id: role.id, name: role.name })),
      sectors: sectors.map((sector) => ({ id: sector.id, name: sector.name })),
    };
  }

  async listEvents(input: ListEventsInput): Promise<Event[]> {
    return this.eventRepo.listByMinistry(
      input.churchId,
      input.ministryId,
      input.status,
    );
  }

  private async resolveScheduleBuilderScope(
    input: ResolveScheduleBuilderScopeInput,
  ): Promise<ScheduleBuilderScope> {
    const { churchId, eventId, userId, ministryId } = input;
    await this.eventRepo.getById(churchId, eventId);

    const participation = ministryId
      ? await this.ministryParticipationRepo.findByMinistryEvent({
          churchId,
          ministryId,
          eventId,
        })
      : (
          await this.ministryParticipationRepo.listByEvent({
            churchId,
            eventId,
          })
        )[0];

    if (!participation) {
      throw new NotFoundError(SCHEDULE_BUILDER_NOT_FOUND_MESSAGE);
    }

    const decision = await this.authorityManager.decideManageMinistry({
      churchId,
      ministryId: participation.ministryId,
      userId,
    });
    if (!decision.allowed) {
      throw new NotFoundError(SCHEDULE_BUILDER_NOT_FOUND_MESSAGE);
    }

    return {
      ministryId: participation.ministryId,
      participationId: participation.id,
    };
  }

  private scopeEventTimeBlocks({
    eventTimeBlocks,
    requirements,
  }: ScopeEventTimeBlocksInput): EventTimeBlock[] {
    return eventTimeBlocks.map((eventTimeBlock) => {
      const visibleRequirements = requirements.filter(
        (requirement) => requirement.eventTimeBlockId === eventTimeBlock.id,
      );
      return new EventTimeBlock(
        {
          churchId: eventTimeBlock.churchId,
          eventId: eventTimeBlock.eventId,
          sourceTemplateTimeBlockId: eventTimeBlock.sourceTemplateTimeBlockId,
          startTime: eventTimeBlock.startTime,
          endTime: eventTimeBlock.endTime,
          label: eventTimeBlock.label,
          status: eventTimeBlock.status,
          requirements: visibleRequirements,
        },
        eventTimeBlock.id,
        eventTimeBlock.createdAt,
        eventTimeBlock.updatedAt,
      );
    });
  }
}
