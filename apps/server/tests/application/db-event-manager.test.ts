import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { DbEventManager } from '../../src/application/db-event-manager';
import type {
  ChurchId,
  EventId,
  MinistryId,
  RoleId,
  TeamId,
  TimeSlotId,
  VolunteerId,
} from '../../src/domain/branded-ids';
import type { AssignmentRepository } from '../../src/domain/contracts/infrastructure/assignment.repository';
import type { AvailabilityRepository } from '../../src/domain/contracts/infrastructure/availability.repository';
import type { EventRepository } from '../../src/domain/contracts/infrastructure/event.repository';
import type { NotificationService } from '../../src/domain/contracts/infrastructure/notification-service';
import type { RoleRepository } from '../../src/domain/contracts/infrastructure/role.repository';
import type { TimeSlotRepository } from '../../src/domain/contracts/infrastructure/time-slot.repository';
import type {
  MinistryMembership,
  MinistryTeamMembership,
  VolunteerRepository,
} from '../../src/domain/contracts/infrastructure/volunteer.repository';
import { Assignment } from '../../src/domain/entities/assignment';
import { Availability } from '../../src/domain/entities/availability';
import { Event } from '../../src/domain/entities/event';
import { Role } from '../../src/domain/entities/role';
import { TimeSlot } from '../../src/domain/entities/time-slot';
import { Volunteer } from '../../src/domain/entities/volunteer';
import { IsolationBreachError } from '../../src/domain/errors/isolation-breach-error';

const churchId = '11111111-1111-4111-8111-111111111111' as ChurchId;
const ministryId = '22222222-2222-4222-8222-222222222222' as MinistryId;
const eventId = '33333333-3333-4333-8333-333333333333' as EventId;
const roleId = '44444444-4444-4444-8444-444444444444' as RoleId;
const slotId = '55555555-5555-4555-8555-555555555555' as TimeSlotId;
const leaderId = 'leader-1' as VolunteerId;
const teamLeaderId = 'team-leader-1' as VolunteerId;
const teamAVolunteerId = 'volunteer-team-a' as VolunteerId;
const teamBVolunteerId = 'volunteer-team-b' as VolunteerId;
const teamA = 'team-a' as TeamId;

interface BuildTeamMembershipInput {
  teamId: string;
  accessLevel?: MinistryTeamMembership['accessLevel'];
}

function teamMembership({
  teamId,
  accessLevel = 'member',
}: BuildTeamMembershipInput): MinistryTeamMembership {
  return { teamId, accessLevel };
}

function buildEvent(): Event {
  return new Event(
    {
      churchId,
      planningCycleId: 'cycle-1',
      title: 'Sunday Service',
      startDate: new Date('2026-08-02T09:00:00.000Z'),
      endDate: new Date('2026-08-02T12:00:00.000Z'),
    },
    eventId,
  );
}

function buildMembership(
  overrides: Partial<MinistryMembership>,
): MinistryMembership {
  return {
    volunteerId: leaderId,
    teamMemberships: [],
    qualifiedRoleIds: [],
    ministryAccessLevel: 'leader',
    ...overrides,
  } as MinistryMembership;
}

interface Repos {
  eventRepo: EventRepository;
  slotRepo: TimeSlotRepository;
  assignmentRepo: AssignmentRepository;
  availabilityRepo: AvailabilityRepository;
  volunteerRepo: VolunteerRepository;
  roleRepo: RoleRepository;
  notificationService: NotificationService;
}

function createRepos(): Repos {
  const eventRepo: EventRepository = {
    getMinistryId: vi.fn(async () => ministryId),
    getById: vi.fn(async () => buildEvent()),
    getWithSlots: vi.fn(),
    listByMinistry: vi.fn(async () => []),
    create: vi.fn(),
    updateStatus: vi.fn(async () => undefined),
    update: vi.fn(),
  };

  const slotRepo: TimeSlotRepository = {
    getById: vi.fn(),
    listByEvent: vi.fn(async () => []),
    bulkCreate: vi.fn(async () => []),
    create: vi.fn(
      async (_churchId, input) => new TimeSlot({ ...input, churchId }),
    ),
    update: vi.fn(async (_churchId, id, input) => {
      const slot = new TimeSlot(
        {
          churchId,
          eventId,
          startTime: input.startTime ?? new Date('2026-08-02T09:00:00.000Z'),
          endTime: input.endTime ?? new Date('2026-08-02T10:00:00.000Z'),
          label: input.label,
        },
        id,
      );
      return slot;
    }),
    deleteById: vi.fn(async () => undefined),
    findOverlapping: vi.fn(),
    deleteByEvent: vi.fn(),
    upsertRequirement: vi.fn(),
    countActiveAssignments: vi.fn(),
  };

  const assignmentRepo: AssignmentRepository = {
    create: vi.fn(),
    getById: vi.fn(),
    findBySlotAndVolunteer: vi.fn(),
    listBySlot: vi.fn(),
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
    listDeclinedBySlot: vi.fn(),
  };

  const availabilityRepo: AvailabilityRepository = {
    listByVolunteerForEvent: vi.fn(),
    listByVolunteers: vi.fn(async () => []),
    listMarksByCheck: vi.fn(),
    replaceMarksForCheck: vi.fn(),
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

  const notificationService: NotificationService = {
    publish: vi.fn(async () => undefined),
    notifyReminder: vi.fn(async () => undefined),
    notifyVolunteer: vi.fn(async () => undefined),
    notifyLeaderOfDecline: vi.fn(async () => undefined),
  };

  return {
    eventRepo,
    slotRepo,
    assignmentRepo,
    availabilityRepo,
    volunteerRepo,
    roleRepo,
    notificationService,
  };
}

function createManager(repos: Repos): DbEventManager {
  return new DbEventManager(
    repos.eventRepo,
    repos.slotRepo,
    repos.assignmentRepo,
    repos.availabilityRepo,
    repos.volunteerRepo,
    repos.roleRepo,
    repos.notificationService,
  );
}

describe('DbEventManager', () => {
  describe('getScheduleBuilderData', () => {
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
      ).rejects.toThrow(
        'Volunteer does not have leader or TeamLeader privileges',
      );
    });

    it('throws IsolationBreachError when the caller is a plain team member, not a ministry leader or TeamLeader', async () => {
      const repos = createRepos();
      vi.mocked(repos.volunteerRepo.listMinistryMemberships).mockResolvedValue([
        buildMembership({
          volunteerId: teamAVolunteerId,
          ministryAccessLevel: 'volunteer',
          teamMemberships: [teamMembership({ teamId: 'team-a' })],
        }),
      ]);
      const manager = createManager(repos);

      await expect(
        manager.getScheduleBuilderData({
          churchId,
          eventId,
          volunteerId: teamAVolunteerId,
        }),
      ).rejects.toThrow(
        'Volunteer does not have leader or TeamLeader privileges',
      );
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
          teamMemberships: [teamMembership({ teamId: 'team-a' })],
        }),
        buildMembership({
          volunteerId: teamAVolunteerId,
          ministryAccessLevel: 'volunteer',
          teamMemberships: [teamMembership({ teamId: 'team-a' })],
          qualifiedRoleIds: [roleId as string],
        }),
        buildMembership({
          volunteerId: teamBVolunteerId,
          ministryAccessLevel: 'volunteer',
          teamMemberships: [teamMembership({ teamId: 'team-b' })],
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
      const availability = [
        new Availability({
          props: {
            churchId,
            availabilityCheckId: 'check-1' as never,
            shiftId: 'shift-1' as never,
            volunteerId: teamAVolunteerId,
            shiftStartTime: new Date('2026-08-02T09:00:00.000Z'),
            shiftEndTime: new Date('2026-08-02T10:00:00.000Z'),
          },
        }),
      ];
      vi.mocked(repos.availabilityRepo.listByVolunteers).mockResolvedValue(
        availability,
      );

      const manager = createManager(repos);
      const result = await manager.getScheduleBuilderData({
        churchId,
        eventId,
        volunteerId: leaderId,
      });

      expect(result.callerTeamIds).toBeNull();
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
            teamIds: ['team-a'],
            leadTeamIds: [],
          },
          {
            id: teamAVolunteerId,
            name: 'Team A Vol',
            ministryAccessLevel: 'volunteer',
            qualifiedRoleIds: [roleId as string],
            teamIds: ['team-a'],
            leadTeamIds: [],
          },
          {
            id: teamBVolunteerId,
            name: 'Team B Vol',
            ministryAccessLevel: 'volunteer',
            qualifiedRoleIds: [],
            teamIds: ['team-b'],
            leadTeamIds: [],
          },
        ]),
      );
      expect(result.roles).toEqual([{ id: roleId, name: 'Usher' }]);
      expect(result.assignments).toEqual([]);
      expect(result.availability).toBe(availability);
      expect(repos.availabilityRepo.listByVolunteers).toHaveBeenCalledWith(
        churchId,
        expect.arrayContaining([leaderId, teamAVolunteerId, teamBVolunteerId]),
      );
    });

    it('scopes a TeamLeader to only the team they lead, not every team they belong to', async () => {
      const repos = createRepos();
      vi.mocked(repos.volunteerRepo.listMinistryMemberships).mockResolvedValue([
        buildMembership({
          volunteerId: teamLeaderId,
          // Ordinary Ministry Member — TeamLeader-ness lives on the team
          // membership below, not on ministryAccessLevel.
          ministryAccessLevel: 'volunteer',
          teamMemberships: [
            teamMembership({ teamId: 'team-a', accessLevel: 'leader' }),
          ],
        }),
        buildMembership({
          volunteerId: teamAVolunteerId,
          ministryAccessLevel: 'volunteer',
          // Also in a team the TeamLeader does not lead.
          teamMemberships: [
            teamMembership({ teamId: 'team-a' }),
            teamMembership({ teamId: 'team-c' }),
          ],
        }),
        buildMembership({
          volunteerId: teamBVolunteerId,
          ministryAccessLevel: 'volunteer',
          teamMemberships: [teamMembership({ teamId: 'team-b' })],
        }),
      ]);
      const volunteers = [
        new Volunteer(
          { churchId, userId: 'u-team-leader', name: 'Team Leader' },
          teamLeaderId,
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

      const manager = createManager(repos);
      const result = await manager.getScheduleBuilderData({
        churchId,
        eventId,
        volunteerId: teamLeaderId,
      });

      expect(result.callerTeamIds).toEqual(['team-a']);
      expect(result.volunteers.map((v) => v.id)).toEqual(
        expect.arrayContaining([teamLeaderId, teamAVolunteerId]),
      );
      expect(result.volunteers).toHaveLength(2);
      // Team B is outside the TeamLeader's led scope entirely.
      expect(result.volunteers.map((v) => v.id)).not.toContain(
        teamBVolunteerId,
      );
      // Team memberships outside the TeamLeader's led scope must not travel,
      // even for a volunteer who is otherwise visible (team-c is dropped).
      expect(
        result.volunteers.find((v) => v.id === teamAVolunteerId)?.teamIds,
      ).toEqual(['team-a']);
      const callerOption = result.volunteers.find((v) => v.id === teamLeaderId);
      expect(callerOption?.ministryAccessLevel).toBe('volunteer');
      expect(callerOption?.leadTeamIds).toEqual(['team-a']);
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
          teamIds: [],
          leadTeamIds: [],
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

      expect(result.availability).toEqual([]);
      expect(repos.availabilityRepo.listByVolunteers).not.toHaveBeenCalled();
    });

    it('includes the event and its slots plus raw assignments in the result', async () => {
      const repos = createRepos();
      const event = buildEvent();
      const slots = [
        new TimeSlot(
          {
            churchId,
            eventId,
            startTime: new Date('2026-08-02T09:00:00.000Z'),
            endTime: new Date('2026-08-02T10:00:00.000Z'),
          },
          slotId,
        ),
      ];
      const assignments = [
        new Assignment(
          {
            churchId,
            slotId,
            volunteerId: leaderId,
            roleId,
          },
          'assignment-1',
        ),
      ];
      vi.mocked(repos.eventRepo.getById).mockResolvedValue(event);
      vi.mocked(repos.slotRepo.listByEvent).mockResolvedValue(slots);
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

      expect(result.events).toEqual([{ event, slots }]);
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

  describe('cancelEvent', () => {
    it('updates the event status to cancelled', async () => {
      const repos = createRepos();
      const manager = createManager(repos);

      await manager.cancelEvent({ churchId, eventId });

      expect(repos.eventRepo.updateStatus).toHaveBeenCalledWith(
        churchId,
        eventId,
        { status: 'cancelled' },
      );
    });
  });

  describe('createSlot', () => {
    it('creates a slot with the given time range and label', async () => {
      const repos = createRepos();
      const manager = createManager(repos);
      const startTime = new Date('2026-08-02T09:00:00.000Z');
      const endTime = new Date('2026-08-02T10:00:00.000Z');

      await manager.createSlot({
        churchId,
        eventId,
        startTime,
        endTime,
        label: 'Morning',
      });

      expect(repos.slotRepo.create).toHaveBeenCalledWith(churchId, {
        eventId,
        startTime,
        endTime,
        label: 'Morning',
      });
    });
  });

  describe('updateSlot', () => {
    it('updates a slot with the provided fields', async () => {
      const repos = createRepos();
      const manager = createManager(repos);
      const startTime = new Date('2026-08-02T09:00:00.000Z');
      const endTime = new Date('2026-08-02T10:00:00.000Z');

      await manager.updateSlot({
        churchId,
        slotId,
        startTime,
        endTime,
        label: 'Renamed',
      });

      expect(repos.slotRepo.update).toHaveBeenCalledWith(churchId, slotId, {
        startTime,
        endTime,
        label: 'Renamed',
      });
    });
  });

  describe('deleteSlot', () => {
    it('deletes the slot by id', async () => {
      const repos = createRepos();
      const manager = createManager(repos);

      await manager.deleteSlot({ churchId, slotId });

      expect(repos.slotRepo.deleteById).toHaveBeenCalledWith(churchId, slotId);
    });
  });

  describe('generateSlots', () => {
    it('generates slots via the domain service and bulk-persists them', async () => {
      const repos = createRepos();
      const event = buildEvent();
      vi.mocked(repos.eventRepo.getById).mockResolvedValue(event);
      vi.mocked(repos.slotRepo.listByEvent).mockResolvedValue([]);
      const createdSlots = [
        new TimeSlot(
          {
            churchId,
            eventId,
            startTime: event.startDate,
            endTime: event.endDate,
          },
          slotId,
        ),
      ];
      vi.mocked(repos.slotRepo.bulkCreate).mockResolvedValue(createdSlots);

      const manager = createManager(repos);
      const result = await manager.generateSlots({
        churchId,
        eventId,
        strategy: { kind: 'equal-split', slotDurationMinutes: 180 },
      });

      expect(result).toBe(createdSlots);
      expect(repos.eventRepo.getById).toHaveBeenCalledWith(churchId, eventId);
      expect(repos.slotRepo.listByEvent).toHaveBeenCalledWith(
        churchId,
        eventId,
      );
      expect(repos.slotRepo.bulkCreate).toHaveBeenCalledTimes(1);
      expect(repos.slotRepo.bulkCreate).toHaveBeenCalledWith(
        churchId,
        expect.objectContaining({
          eventId,
          slots: [
            expect.objectContaining({
              startTime: event.startDate,
              endTime: event.endDate,
              requirements: [],
            }),
          ],
        }),
      );
    });

    it('generates template-based slots with mapped requirements', async () => {
      const repos = createRepos();
      const event = buildEvent();
      vi.mocked(repos.eventRepo.getById).mockResolvedValue(event);
      vi.mocked(repos.slotRepo.listByEvent).mockResolvedValue([]);
      vi.mocked(repos.slotRepo.bulkCreate).mockResolvedValue([]);

      const manager = createManager(repos);
      await manager.generateSlots({
        churchId,
        eventId,
        strategy: {
          kind: 'template-based',
          periods: [
            {
              label: 'Setup',
              startTime: new Date('2026-08-02T09:00:00.000Z'),
              endTime: new Date('2026-08-02T10:00:00.000Z'),
              requirements: [
                {
                  roleId,
                  requiredCount: 2,
                  notes: 'need helpers',
                },
              ],
            },
          ],
        },
      });

      expect(repos.slotRepo.bulkCreate).toHaveBeenCalledWith(
        churchId,
        expect.objectContaining({
          slots: [
            expect.objectContaining({
              label: 'Setup',
              requirements: [
                {
                  roleId,
                  teamId: undefined,
                  requiredCount: 2,
                  notes: 'need helpers',
                },
              ],
            }),
          ],
        }),
      );
    });
  });

  describe('upsertSlotRequirement', () => {
    it('upserts a slot requirement with the given fields', async () => {
      const repos = createRepos();
      const manager = createManager(repos);

      await manager.upsertSlotRequirement({
        churchId,
        slotId,
        roleId,
        teamId: teamA,
        requiredCount: 3,
        notes: 'notes',
      });

      expect(repos.slotRepo.upsertRequirement).toHaveBeenCalledWith(
        churchId,
        slotId,
        {
          roleId,
          teamId: teamA,
          requiredCount: 3,
          notes: 'notes',
        },
      );
    });
  });

  describe('sendReminder', () => {
    it('notifies every volunteer in the event ministry', async () => {
      const repos = createRepos();
      const event = buildEvent();
      vi.mocked(repos.eventRepo.getById).mockResolvedValue(event);
      vi.mocked(repos.eventRepo.getMinistryId).mockResolvedValue(ministryId);
      const volunteers = [
        new Volunteer({ churchId, userId: 'u-1' }, 'vol-1'),
        new Volunteer({ churchId, userId: 'u-2' }, 'vol-2'),
      ];
      vi.mocked(repos.volunteerRepo.listByMinistry).mockResolvedValue(
        volunteers,
      );

      const manager = createManager(repos);
      await manager.sendReminder({ churchId, eventId });

      expect(repos.eventRepo.getById).toHaveBeenCalledWith(churchId, eventId);
      expect(repos.eventRepo.getMinistryId).toHaveBeenCalledWith(
        churchId,
        eventId,
      );
      expect(repos.notificationService.notifyReminder).toHaveBeenCalledTimes(2);
      expect(repos.notificationService.notifyReminder).toHaveBeenCalledWith({
        churchId,
        eventId,
        volunteerId: 'vol-1',
      });
      expect(repos.notificationService.notifyReminder).toHaveBeenCalledWith({
        churchId,
        eventId,
        volunteerId: 'vol-2',
      });
    });

    it('sends no reminders when the ministry has no volunteers', async () => {
      const repos = createRepos();
      vi.mocked(repos.volunteerRepo.listByMinistry).mockResolvedValue([]);
      const manager = createManager(repos);

      await manager.sendReminder({ churchId, eventId });

      expect(repos.notificationService.notifyReminder).not.toHaveBeenCalled();
    });
  });
});
