import { NotFoundError } from '@church/core';
import { parseInstant } from '@church/time';
import { describe, expect, it, vi } from 'vitest';
import { DbEventManager } from '@/application/db-event-manager';
import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  RoleId,
  SectorId,
  ShiftId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import type { IAuthorityManager } from '@/domain/contracts/application/authority-manager';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { EventRepository } from '@/domain/contracts/infrastructure/event.repository';
import type { EventTimeBlockRepository } from '@/domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { RoleRepository } from '@/domain/contracts/infrastructure/role.repository';
import type { SectorRepository } from '@/domain/contracts/infrastructure/sector.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { UnavailableShiftRepository } from '@/domain/contracts/infrastructure/unavailable-shift.repository';
import type {
  MinistryMembership,
  VolunteerRepository,
} from '@/domain/contracts/infrastructure/volunteer.repository';
import { Assignment } from '@/domain/entities/assignment';
import { Event } from '@/domain/entities/event';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { Role } from '@/domain/entities/role';
import { Sector } from '@/domain/entities/sector';
import { Shift } from '@/domain/entities/shift';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';
import { UnavailableShift } from '@/domain/entities/unavailable-shift';
import { Volunteer } from '@/domain/entities/volunteer';

const churchId = '11111111-1111-4111-8111-111111111111' as ChurchId;
const ministryId = '22222222-2222-4222-8222-222222222222' as MinistryId;
const eventId = '33333333-3333-4333-8333-333333333333' as EventId;
const roleId = '44444444-4444-4444-8444-444444444444' as RoleId;
const eventTimeBlockId =
  '55555555-5555-4555-8555-555555555555' as EventTimeBlockId;
const participationId =
  '66666666-6666-4666-8666-666666666666' as MinistryParticipationId;
const userId = '77777777-7777-4777-8777-777777777777' as UserId;
const leaderId = 'leader-1' as VolunteerId;
const teamAVolunteerId = 'volunteer-team-a' as VolunteerId;
const teamBVolunteerId = 'volunteer-team-b' as VolunteerId;
const ownShiftId = 'shift-own' as ShiftId;
const foreignShiftId = 'shift-foreign' as ShiftId;

function buildEvent(): Event {
  return new Event({
    props: {
      churchId,
      cycleId: 'cycle-1',
      title: 'Sunday Service',
      start: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
      end: parseInstant({ value: '2026-08-02T12:00:00.000Z' }),
    },
    id: eventId,
  });
}

function buildParticipation(
  overrides: Partial<{
    id: MinistryParticipationId;
    ministryId: MinistryId;
    eventId: EventId;
  }> = {},
): MinistryParticipation {
  return new MinistryParticipation({
    props: {
      churchId,
      ministryId: overrides.ministryId ?? ministryId,
      eventId: overrides.eventId ?? eventId,
    },
    id: overrides.id ?? participationId,
  });
}

function buildMembership(
  overrides: Partial<MinistryMembership>,
): MinistryMembership {
  return {
    volunteerId: leaderId,
    qualifiedRoleIds: [],
    ministryAccessLevel: 'leader',
    ...overrides,
  } as MinistryMembership;
}

interface Repos {
  eventRepo: EventRepository;
  eventTimeBlockRepo: EventTimeBlockRepository;
  assignmentRepo: AssignmentRepository;
  unavailableShiftRepo: UnavailableShiftRepository;
  volunteerRepo: VolunteerRepository;
  roleRepo: RoleRepository;
  sectorRepo: SectorRepository;
  ministryParticipationRepo: MinistryParticipationRepository;
  authorityManager: {
    decideManageMinistry: ReturnType<
      typeof vi.fn<IAuthorityManager['decideManageMinistry']>
    >;
  };
  shiftRepo: Pick<
    ShiftRepository,
    'listByParticipation' | 'listRequirementsByParticipation'
  >;
}

function createRepos(): Repos {
  const eventRepo: EventRepository = {
    getMinistryId: vi.fn(async () => ministryId),
    getById: vi.fn(async () => buildEvent()),
    getWithEventTimeBlocks: vi.fn(),
    listByMinistry: vi.fn(async () => []),
    create: vi.fn(),
    updateStatus: vi.fn(async () => undefined),
    update: vi.fn(),
  };

  const eventTimeBlockRepo: EventTimeBlockRepository = {
    getById: vi.fn(),
    listByEvent: vi.fn(async () => []),
    create: vi.fn(
      async ({ input }) =>
        new EventTimeBlock({ props: { ...input, churchId } }),
    ),
    update: vi.fn(async ({ eventTimeBlockId: id, input }) => {
      const eventTimeBlock = new EventTimeBlock({
        props: {
          churchId,
          eventId,
          startTime:
            input.startTime ??
            parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
          endTime:
            input.endTime ??
            parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
          label: input.label,
        },
        id,
      });
      return eventTimeBlock;
    }),
    deleteById: vi.fn(async () => undefined),
    findOverlapping: vi.fn(),
    deleteByEvent: vi.fn(),
    countActiveAssignments: vi.fn(),
  };

  const assignmentRepo: AssignmentRepository = {
    create: vi.fn(),
    getById: vi.fn(),
    findByEventTimeBlockAndVolunteer: vi.fn(),
    listByEventTimeBlock: vi.fn(),
    listByEvent: vi.fn(async () => []),
    listByParticipation: vi.fn(async () => []),
    listByShift: vi.fn(),
    listByVolunteer: vi.fn(),
    listByVolunteers: vi.fn(),
    listByVolunteerInRange: vi.fn(),
    listByRange: vi.fn(),
    updateStatus: vi.fn(),
    countByVolunteerInRange: vi.fn(),
    deleteByEvent: vi.fn(),
    deleteById: vi.fn(),
    listDeclinedByEventTimeBlock: vi.fn(),
  };

  const unavailableShiftRepo: UnavailableShiftRepository = {
    listByVolunteerForEvent: vi.fn(),
    listByVolunteers: vi.fn(async () => []),
    listUnavailableShiftsByCheck: vi.fn(),
    replaceUnavailableShiftsForCheck: vi.fn(),
  };

  const volunteerRepo: VolunteerRepository = {
    getById: vi.fn(),
    findByUserId: vi.fn(),
    listByMinistry: vi.fn(async () => []),
    hasMembershipInMinistry: vi.fn(),
    hasRoleQualification: vi.fn(),
    listQualifiedForRole: vi.fn(),
    updateStatus: vi.fn(),
    findByUserIdGlobally: vi.fn(),
    hasLeadershipInMinistry: vi.fn(),
    listLedMinistries: vi.fn(),
    listByIds: vi.fn(),
    listMemberMinistryIds: vi.fn(),
    listMinistryMemberships: vi.fn(async () => []),
    listActiveLeaderEmails: vi.fn(),
    listActiveLeaderUserIds: vi.fn(),
  };

  const roleRepo: RoleRepository = {
    getById: vi.fn(),
    listByMinistry: vi.fn(async () => []),
  };

  const sectorRepo: SectorRepository = {
    getById: vi.fn(),
    listByMinistry: vi.fn(async () => []),
  };

  const ministryParticipationRepo: MinistryParticipationRepository = {
    getById: vi.fn(),
    findByMinistryEvent: vi.fn(async () => buildParticipation()),
    create: vi.fn(),
    listByEvent: vi.fn(async () => [buildParticipation()]),
    listByMinistry: vi.fn(),
    listByIds: vi.fn(),
    updateState: vi.fn(),
    listInclusions: vi.fn(),
    replaceInclusions: vi.fn(),
    addInclusion: vi.fn(),
    touch: vi.fn(),
    listScheduleSummaries: vi.fn(),
  };

  const authorityManager = {
    decideManageMinistry: vi.fn<IAuthorityManager['decideManageMinistry']>(
      async () => ({ allowed: true }),
    ),
  };

  const shiftRepo = {
    listByParticipation: vi.fn(async () => []),
    listRequirementsByParticipation: vi.fn(async () => []),
  };

  return {
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
  };
}

function createManager(repos: Repos): DbEventManager {
  return new DbEventManager({
    eventRepo: repos.eventRepo,
    eventTimeBlockRepo: repos.eventTimeBlockRepo,
    assignmentRepo: repos.assignmentRepo,
    unavailableShiftRepo: repos.unavailableShiftRepo,
    volunteerRepo: repos.volunteerRepo,
    roleRepo: repos.roleRepo,
    sectorRepo: repos.sectorRepo,
    ministryParticipationRepo: repos.ministryParticipationRepo,
    authorityManager: repos.authorityManager as never,
    shiftRepo: repos.shiftRepo as never,
  });
}

describe('DbEventManager', () => {
  describe('getScheduleBuilderData', () => {
    it("returns the event Ministry's Sectors in repository order", async () => {
      const repos = createRepos();
      vi.mocked(repos.volunteerRepo.listMinistryMemberships).mockResolvedValue([
        buildMembership({}),
      ]);
      const kidsId = '66666666-6666-4666-8666-666666666661' as SectorId;
      const maternalId = '66666666-6666-4666-8666-666666666662' as SectorId;
      vi.mocked(repos.sectorRepo.listByMinistry).mockResolvedValue([
        new Sector({
          props: { churchId, ministryId, name: 'Kids' },
          id: kidsId,
        }),
        new Sector({
          props: { churchId, ministryId, name: 'Maternal' },
          id: maternalId,
        }),
      ]);

      const result = await createManager(repos).getScheduleBuilderData({
        churchId,
        eventId,
        userId,
        ministryId,
      });

      expect(result.sectors).toEqual([
        { id: kidsId, name: 'Kids' },
        { id: maternalId, name: 'Maternal' },
      ]);
      expect(repos.sectorRepo.listByMinistry).toHaveBeenCalledWith({
        churchId,
        ministryId,
      });
    });

    it('derives the selected Ministry from a MinistryParticipation instead of the legacy event fallback', async () => {
      const repos = createRepos();
      const participation = buildParticipation();
      vi.mocked(repos.ministryParticipationRepo.listByEvent).mockResolvedValue([
        participation,
      ]);

      await createManager(repos).getScheduleBuilderData({
        churchId,
        eventId,
        userId,
      });

      expect(repos.ministryParticipationRepo.listByEvent).toHaveBeenCalledWith({
        churchId,
        eventId,
      });
      expect(repos.eventRepo.getMinistryId).not.toHaveBeenCalled();
      expect(repos.authorityManager.decideManageMinistry).toHaveBeenCalledWith({
        churchId,
        ministryId,
        userId,
      });
    });

    it('uses the supplied MinistryParticipation and never consults the legacy event fallback', async () => {
      const repos = createRepos();
      const participation = buildParticipation();
      vi.mocked(
        repos.ministryParticipationRepo.findByMinistryEvent,
      ).mockResolvedValue(participation);

      await createManager(repos).getScheduleBuilderData({
        churchId,
        eventId,
        userId,
        ministryId,
      });

      expect(
        repos.ministryParticipationRepo.findByMinistryEvent,
      ).toHaveBeenCalledWith({ churchId, ministryId, eventId });
      expect(
        repos.ministryParticipationRepo.listByEvent,
      ).not.toHaveBeenCalled();
      expect(repos.eventRepo.getMinistryId).not.toHaveBeenCalled();
    });

    it('conceals a missing or hidden Ministry as NotFound after the caller passed the function gate', async () => {
      const repos = createRepos();
      vi.mocked(
        repos.ministryParticipationRepo.findByMinistryEvent,
      ).mockResolvedValue(null);

      await expect(
        createManager(repos).getScheduleBuilderData({
          churchId,
          eventId,
          userId,
          ministryId,
        }),
      ).rejects.toThrow(NotFoundError);
      expect(
        repos.authorityManager.decideManageMinistry,
      ).not.toHaveBeenCalled();
      expect(repos.eventTimeBlockRepo.listByEvent).not.toHaveBeenCalled();
    });

    it('conceals an existing Event without a matching participation as the same NotFound', async () => {
      const repos = createRepos();
      vi.mocked(
        repos.ministryParticipationRepo.findByMinistryEvent,
      ).mockResolvedValue(null);

      await expect(
        createManager(repos).getScheduleBuilderData({
          churchId,
          eventId,
          userId,
          ministryId,
        }),
      ).rejects.toThrow('Schedule builder resource not found');
    });

    it('conceals an unauthorized selected Ministry as NotFound and reads no payload', async () => {
      const repos = createRepos();
      repos.authorityManager.decideManageMinistry.mockResolvedValue({
        allowed: false,
        reason: 'OUTSIDE_SCOPE',
      });

      await expect(
        createManager(repos).getScheduleBuilderData({
          churchId,
          eventId,
          userId,
          ministryId,
        }),
      ).rejects.toThrow(NotFoundError);
      expect(repos.eventTimeBlockRepo.listByEvent).not.toHaveBeenCalled();
      expect(repos.assignmentRepo.listByEvent).not.toHaveBeenCalled();
    });

    it('lets a leader see every volunteer in the ministry regardless of team', async () => {
      const repos = createRepos();
      vi.mocked(repos.volunteerRepo.listMinistryMemberships).mockResolvedValue([
        buildMembership({
          volunteerId: leaderId,
          ministryAccessLevel: 'leader',
        }),
        buildMembership({
          volunteerId: teamAVolunteerId,
          ministryAccessLevel: 'volunteer',
          qualifiedRoleIds: [roleId as string],
        }),
        buildMembership({
          volunteerId: teamBVolunteerId,
          ministryAccessLevel: 'volunteer',
        }),
      ]);
      const volunteers = [
        new Volunteer({
          props: { churchId, userId: 'u-leader', name: 'Leader' },
          id: leaderId,
        }),
        new Volunteer({
          props: { churchId, userId: 'u-a', name: 'Team A Vol' },
          id: teamAVolunteerId,
        }),
        new Volunteer({
          props: { churchId, userId: 'u-b', name: 'Team B Vol' },
          id: teamBVolunteerId,
        }),
      ];
      vi.mocked(repos.volunteerRepo.listByMinistry).mockResolvedValue(
        volunteers,
      );
      const roles = [
        new Role({
          props: { churchId, ministryId, name: 'Usher' },
          id: roleId,
        }),
      ];
      vi.mocked(repos.roleRepo.listByMinistry).mockResolvedValue(roles);
      const unavailableShifts = [
        new UnavailableShift({
          props: {
            churchId,
            availabilityCheckId: 'check-1' as never,
            shiftId: ownShiftId,
            volunteerId: teamAVolunteerId,
            shiftStartTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
            shiftEndTime: parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
          },
        }),
      ];
      vi.mocked(repos.unavailableShiftRepo.listByVolunteers).mockResolvedValue(
        unavailableShifts,
      );
      vi.mocked(repos.shiftRepo.listByParticipation).mockResolvedValue([
        new Shift({
          props: {
            churchId,
            participationId,
            eventTimeBlockId,
            startTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
            endTime: parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
          },
          id: ownShiftId,
        }),
      ]);

      const result = await createManager(repos).getScheduleBuilderData({
        churchId,
        eventId,
        userId,
        ministryId,
      });

      expect(result.volunteers.map((volunteer) => volunteer.id)).toEqual(
        expect.arrayContaining([leaderId, teamAVolunteerId, teamBVolunteerId]),
      );
      expect(result.volunteers).toHaveLength(3);
      expect(result.volunteers).toEqual(
        expect.arrayContaining([
          {
            id: leaderId,
            name: 'Leader',
            ministryAccessLevel: 'leader',
            qualifiedRoleIds: [],
          },
          {
            id: teamAVolunteerId,
            name: 'Team A Vol',
            ministryAccessLevel: 'volunteer',
            qualifiedRoleIds: [roleId as string],
          },
          {
            id: teamBVolunteerId,
            name: 'Team B Vol',
            ministryAccessLevel: 'volunteer',
            qualifiedRoleIds: [],
          },
        ]),
      );
      expect(result.roles).toEqual([{ id: roleId, name: 'Usher' }]);
      expect(result.assignments).toEqual([]);
      expect(result.unavailableShifts).toEqual(unavailableShifts);
    });

    it('falls back to the volunteer id as the name when name is missing', async () => {
      const repos = createRepos();
      vi.mocked(repos.volunteerRepo.listMinistryMemberships).mockResolvedValue([
        buildMembership({
          volunteerId: leaderId,
          ministryAccessLevel: 'leader',
        }),
      ]);
      vi.mocked(repos.volunteerRepo.listByMinistry).mockResolvedValue([
        new Volunteer({
          props: { churchId, userId: 'u-leader' },
          id: leaderId,
        }),
      ]);

      const result = await createManager(repos).getScheduleBuilderData({
        churchId,
        eventId,
        userId,
        ministryId,
      });

      expect(result.volunteers).toEqual([
        {
          id: leaderId,
          name: leaderId,
          ministryAccessLevel: 'leader',
          qualifiedRoleIds: [],
        },
      ]);
    });

    it('scopes requirements, assignments and unavailable shifts to the selected participation', async () => {
      const repos = createRepos();
      const selectedParticipation = buildParticipation();
      const ownRequirement = new ShiftRequirement({
        props: {
          churchId,
          eventTimeBlockId,
          participationId,
          shiftId: ownShiftId,
          roleId,
          sectorId: 'sector-1' as never,
          sectorName: 'Kids',
          peopleNeeded: 2,
        },
        id: 'requirement-own' as never,
      });
      const foreignRequirement = new ShiftRequirement({
        props: {
          churchId,
          eventTimeBlockId,
          participationId: 'participation-foreign' as never,
          shiftId: foreignShiftId,
          roleId,
          sectorId: 'sector-2' as never,
          sectorName: 'Maternal',
          peopleNeeded: 1,
        },
        id: 'requirement-foreign' as never,
      });
      const eventTimeBlock = new EventTimeBlock({
        props: {
          churchId,
          eventId,
          startTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
          endTime: parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
          requirements: [ownRequirement, foreignRequirement],
        },
        id: eventTimeBlockId,
      });
      const ownShift = new Shift({
        props: {
          churchId,
          participationId,
          eventTimeBlockId,
          startTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
          endTime: parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
        },
        id: ownShiftId,
      });
      const assignments = [
        new Assignment({
          props: {
            churchId,
            eventTimeBlockId,
            participationId,
            volunteerId: leaderId,
            roleId,
            shiftRequirementId: '00000000-0000-0000-0000-000000000021' as never,
          },
          id: 'assignment-1',
        }),
      ];

      vi.mocked(repos.eventTimeBlockRepo.listByEvent).mockResolvedValue([
        eventTimeBlock,
      ]);
      vi.mocked(
        repos.ministryParticipationRepo.findByMinistryEvent,
      ).mockResolvedValue(selectedParticipation);
      vi.mocked(repos.volunteerRepo.listByMinistry).mockResolvedValue([
        new Volunteer({
          props: { churchId, userId: 'u-leader', name: 'Leader' },
          id: leaderId,
        }),
      ]);
      vi.mocked(repos.assignmentRepo.listByParticipation).mockResolvedValue(
        assignments,
      );
      vi.mocked(repos.shiftRepo.listByParticipation).mockResolvedValue([
        ownShift,
      ]);
      vi.mocked(
        repos.shiftRepo.listRequirementsByParticipation,
      ).mockResolvedValue([ownRequirement]);
      vi.mocked(repos.unavailableShiftRepo.listByVolunteers).mockResolvedValue([
        new UnavailableShift({
          props: {
            churchId,
            availabilityCheckId: 'check-own' as never,
            shiftId: ownShiftId,
            volunteerId: leaderId,
            shiftStartTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
            shiftEndTime: parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
          },
        }),
        new UnavailableShift({
          props: {
            churchId,
            availabilityCheckId: 'check-foreign' as never,
            shiftId: foreignShiftId,
            volunteerId: leaderId,
            shiftStartTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
            shiftEndTime: parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
          },
        }),
      ]);

      const result = await createManager(repos).getScheduleBuilderData({
        churchId,
        eventId,
        userId,
        ministryId,
      });

      const [scheduledEvent] = result.events;
      if (!scheduledEvent) throw new Error('Expected a scheduled Event');
      const [scheduledTimeBlock] = scheduledEvent.eventTimeBlocks;
      if (!scheduledTimeBlock) {
        throw new Error('Expected an Event time block');
      }
      const [unavailableShift] = result.unavailableShifts;
      if (!unavailableShift) throw new Error('Expected an unavailable Shift');

      expect(scheduledTimeBlock.requirements).toEqual([ownRequirement]);
      expect(result.assignments).toBe(assignments);
      expect(result.unavailableShifts).toHaveLength(1);
      expect(unavailableShift.shiftId).toBe(ownShiftId);
      expect(repos.assignmentRepo.listByEvent).not.toHaveBeenCalled();
      expect(repos.assignmentRepo.listByParticipation).toHaveBeenCalledWith({
        churchId,
        participationId: selectedParticipation.id,
      });
    });

    it('skips the availability bulk lookup when the selected Ministry has no visible volunteers', async () => {
      const repos = createRepos();
      vi.mocked(repos.volunteerRepo.listByMinistry).mockResolvedValue([]);

      const result = await createManager(repos).getScheduleBuilderData({
        churchId,
        eventId,
        userId,
        ministryId,
      });

      expect(result.unavailableShifts).toEqual([]);
      expect(
        repos.unavailableShiftRepo.listByVolunteers,
      ).not.toHaveBeenCalled();
    });
  });

  describe('listEvents', () => {
    it('passes through to eventRepo.listByMinistry with the optional status filter', async () => {
      const repos = createRepos();
      const events = [buildEvent()];
      vi.mocked(repos.eventRepo.listByMinistry).mockResolvedValue(events);
      const manager = createManager(repos);

      const result = await manager.listEvents({
        churchId,
        ministryId,
        status: 'scheduled',
      });

      expect(result).toBe(events);
      expect(repos.eventRepo.listByMinistry).toHaveBeenCalledWith({
        churchId,
        ministryId,
        status: 'scheduled',
      });
    });
  });
});
