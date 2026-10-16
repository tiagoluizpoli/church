import { parseInstant } from '@church/time';
import { describe, expect, it, vi } from 'vitest';
import { DbEventManager } from '@/application/db-event-manager';
import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  RoleId,
  SectorId,
  VolunteerId,
} from '@/domain/branded-ids';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { EventRepository } from '@/domain/contracts/infrastructure/event.repository';
import type { EventTimeBlockRepository } from '@/domain/contracts/infrastructure/event-time-block.repository';
import type { RoleRepository } from '@/domain/contracts/infrastructure/role.repository';
import type { SectorRepository } from '@/domain/contracts/infrastructure/sector.repository';
import type { UnavailableShiftRepository } from '@/domain/contracts/infrastructure/unavailable-shift.repository';
import type {
  MinistryMembership,
  VolunteerRepository,
} from '@/domain/contracts/infrastructure/volunteer.repository';
import { Assignment } from '@/domain/entities/assignment';
import { Event } from '@/domain/entities/event';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { Role } from '@/domain/entities/role';
import { Sector } from '@/domain/entities/sector';
import { UnavailableShift } from '@/domain/entities/unavailable-shift';
import { Volunteer } from '@/domain/entities/volunteer';
import { IsolationBreachError } from '@/domain/errors/isolation-breach-error';

const churchId = '11111111-1111-4111-8111-111111111111' as ChurchId;
const ministryId = '22222222-2222-4222-8222-222222222222' as MinistryId;
const eventId = '33333333-3333-4333-8333-333333333333' as EventId;
const roleId = '44444444-4444-4444-8444-444444444444' as RoleId;
const eventTimeBlockId =
  '55555555-5555-4555-8555-555555555555' as EventTimeBlockId;
const leaderId = 'leader-1' as VolunteerId;
const teamAVolunteerId = 'volunteer-team-a' as VolunteerId;
const teamBVolunteerId = 'volunteer-team-b' as VolunteerId;

function buildEvent(): Event {
  return new Event(
    {
      churchId,
      cycleId: 'cycle-1',
      title: 'Sunday Service',
      start: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
      end: parseInstant({ value: '2026-08-02T12:00:00.000Z' }),
    },
    eventId,
  );
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
      async (_churchId, input) => new EventTimeBlock({ ...input, churchId }),
    ),
    update: vi.fn(async (_churchId, id, input) => {
      const eventTimeBlock = new EventTimeBlock(
        {
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
      );
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
    listByParticipation: vi.fn(),
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
    isChurchAdmin: vi.fn(),
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
  };

  const roleRepo: RoleRepository = {
    getById: vi.fn(),
    listByMinistry: vi.fn(async () => []),
  };

  const sectorRepo: SectorRepository = {
    getById: vi.fn(),
    listByMinistry: vi.fn(async () => []),
  };

  return {
    eventRepo,
    eventTimeBlockRepo,
    assignmentRepo,
    unavailableShiftRepo,
    volunteerRepo,
    roleRepo,
    sectorRepo,
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
        new Sector({ churchId, ministryId, name: 'Kids' }, kidsId),
        new Sector({ churchId, ministryId, name: 'Maternal' }, maternalId),
      ]);

      const result = await createManager(repos).getScheduleBuilderData({
        churchId,
        eventId,
        ministryId,
        volunteerId: leaderId,
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

    it('throws IsolationBreachError when the caller is not a ministry member', async () => {
      const repos = createRepos();
      vi.mocked(repos.volunteerRepo.listMinistryMemberships).mockResolvedValue([
        buildMembership({ volunteerId: 'someone-else' as VolunteerId }),
      ]);
      const manager = createManager(repos);

      await expect(
        manager.getScheduleBuilderData({
          churchId,
          eventId,
          volunteerId: leaderId,
        }),
      ).rejects.toThrow(IsolationBreachError);
      await expect(
        manager.getScheduleBuilderData({
          churchId,
          eventId,
          volunteerId: leaderId,
        }),
      ).rejects.toThrow('Volunteer does not belong to the event ministry');
    });

    it('throws IsolationBreachError when the caller only has plain volunteer privileges', async () => {
      const repos = createRepos();
      vi.mocked(repos.volunteerRepo.listMinistryMemberships).mockResolvedValue([
        buildMembership({
          volunteerId: leaderId,
          ministryAccessLevel: 'volunteer',
        }),
      ]);
      const manager = createManager(repos);

      await expect(
        manager.getScheduleBuilderData({
          churchId,
          eventId,
          volunteerId: leaderId,
        }),
      ).rejects.toThrow('Volunteer does not have leader privileges');
    });

    it('throws IsolationBreachError when the caller is a plain team member, not a ministry leader or TeamLeader', async () => {
      const repos = createRepos();
      vi.mocked(repos.volunteerRepo.listMinistryMemberships).mockResolvedValue([
        buildMembership({
          volunteerId: teamAVolunteerId,
          ministryAccessLevel: 'volunteer',
        }),
      ]);
      const manager = createManager(repos);

      await expect(
        manager.getScheduleBuilderData({
          churchId,
          eventId,
          volunteerId: teamAVolunteerId,
        }),
      ).rejects.toThrow('Volunteer does not have leader privileges');
    });

    it('derives ministryId from the event when not provided, and skips lookup when provided', async () => {
      const repos = createRepos();
      vi.mocked(repos.volunteerRepo.listMinistryMemberships).mockResolvedValue([
        buildMembership({
          volunteerId: leaderId,
          ministryAccessLevel: 'leader',
        }),
      ]);
      const manager = createManager(repos);

      await manager.getScheduleBuilderData({
        churchId,
        eventId,
        volunteerId: leaderId,
      });
      expect(repos.eventRepo.getMinistryId).toHaveBeenCalledWith(
        churchId,
        eventId,
      );

      vi.mocked(repos.eventRepo.getMinistryId).mockClear();
      await manager.getScheduleBuilderData({
        churchId,
        eventId,
        volunteerId: leaderId,
        ministryId,
      });
      expect(repos.eventRepo.getMinistryId).not.toHaveBeenCalled();
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
        new Volunteer(
          { churchId, userId: 'u-leader', name: 'Leader' },
          leaderId,
        ),
        new Volunteer(
          { churchId, userId: 'u-a', name: 'Team A Vol' },
          teamAVolunteerId,
        ),
        new Volunteer(
          { churchId, userId: 'u-b', name: 'Team B Vol' },
          teamBVolunteerId,
        ),
      ];
      vi.mocked(repos.volunteerRepo.listByMinistry).mockResolvedValue(
        volunteers,
      );
      const roles = [new Role({ churchId, ministryId, name: 'Usher' }, roleId)];
      vi.mocked(repos.roleRepo.listByMinistry).mockResolvedValue(roles);
      const unavailableShifts = [
        new UnavailableShift({
          props: {
            churchId,
            availabilityCheckId: 'check-1' as never,
            shiftId: 'shift-1' as never,
            volunteerId: teamAVolunteerId,
            shiftStartTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
            shiftEndTime: parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
          },
        }),
      ];
      vi.mocked(repos.unavailableShiftRepo.listByVolunteers).mockResolvedValue(
        unavailableShifts,
      );

      const manager = createManager(repos);
      const result = await manager.getScheduleBuilderData({
        churchId,
        eventId,
        volunteerId: leaderId,
      });

      expect(result.volunteers.map((v) => v.id)).toEqual(
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
      expect(result.unavailableShifts).toBe(unavailableShifts);
      expect(repos.unavailableShiftRepo.listByVolunteers).toHaveBeenCalledWith(
        churchId,
        expect.arrayContaining([leaderId, teamAVolunteerId, teamBVolunteerId]),
      );
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
        new Volunteer({ churchId, userId: 'u-leader' }, leaderId),
      ]);

      const manager = createManager(repos);
      const result = await manager.getScheduleBuilderData({
        churchId,
        eventId,
        volunteerId: leaderId,
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

    it('skips availability lookup and returns an empty array when there are no visible volunteers', async () => {
      const repos = createRepos();
      vi.mocked(repos.volunteerRepo.listMinistryMemberships).mockResolvedValue([
        buildMembership({
          volunteerId: leaderId,
          ministryAccessLevel: 'leader',
        }),
      ]);
      vi.mocked(repos.volunteerRepo.listByMinistry).mockResolvedValue([]);

      const manager = createManager(repos);
      const result = await manager.getScheduleBuilderData({
        churchId,
        eventId,
        volunteerId: leaderId,
      });

      expect(result.unavailableShifts).toEqual([]);
      expect(
        repos.unavailableShiftRepo.listByVolunteers,
      ).not.toHaveBeenCalled();
    });

    it('includes the event and its event time blocks plus raw assignments in the result', async () => {
      const repos = createRepos();
      const event = buildEvent();
      const eventTimeBlocks = [
        new EventTimeBlock(
          {
            churchId,
            eventId,
            startTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
            endTime: parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
          },
          eventTimeBlockId,
        ),
      ];
      const assignments = [
        new Assignment(
          {
            churchId,
            eventTimeBlockId,
            volunteerId: leaderId,
            roleId,
          },
          'assignment-1',
        ),
      ];
      vi.mocked(repos.eventRepo.getById).mockResolvedValue(event);
      vi.mocked(repos.eventTimeBlockRepo.listByEvent).mockResolvedValue(
        eventTimeBlocks,
      );
      vi.mocked(repos.assignmentRepo.listByEvent).mockResolvedValue(
        assignments,
      );
      vi.mocked(repos.volunteerRepo.listMinistryMemberships).mockResolvedValue([
        buildMembership({
          volunteerId: leaderId,
          ministryAccessLevel: 'leader',
        }),
      ]);

      const manager = createManager(repos);
      const result = await manager.getScheduleBuilderData({
        churchId,
        eventId,
        volunteerId: leaderId,
      });

      expect(result.events).toEqual([{ event, eventTimeBlocks }]);
      expect(result.assignments).toBe(assignments);
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
      expect(repos.eventRepo.listByMinistry).toHaveBeenCalledWith(
        churchId,
        ministryId,
        'scheduled',
      );
    });
  });
});
