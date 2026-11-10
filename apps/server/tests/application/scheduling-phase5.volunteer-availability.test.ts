import { appConfig } from '@church/app-config';
import { parseCalendarDay, parseInstant } from '@church/time';
import { describe, expect, it, vi } from 'vitest';
import { DbVolunteerManager } from '@/application/db-volunteer-manager';
import {
  AssignmentId,
  AvailabilityCheckId,
  ChurchId,
  CycleId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  MinistryInvitationId,
  MinistryParticipationId,
  RoleId,
  SectorId,
  ShiftId,
  ShiftRequirementId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import type {
  CheckContext,
  CheckShiftRow,
} from '@/domain/contracts/infrastructure/availability-check.repository';
import { Assignment } from '@/domain/entities/assignment';
import { AvailabilityCheck } from '@/domain/entities/availability-check';
import { Cycle } from '@/domain/entities/cycle';
import { Event } from '@/domain/entities/event';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { Ministry } from '@/domain/entities/ministry';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { Notification } from '@/domain/entities/notification';
import { Role } from '@/domain/entities/role';
import { Shift } from '@/domain/entities/shift';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';
import { IsolationBreachError } from '@/domain/errors/isolation-breach-error';
import {
  createAssignmentRepositoryFake,
  createAuthorityManagerFake,
  createAvailabilityCheckRepositoryFake,
  createChurchRepositoryFake,
  createCycleRepositoryFake,
  createEventRepositoryFake,
  createMinistryParticipationRepositoryFake,
  createMinistryRepositoryFake,
  createNotificationRepositoryFake,
  createRoleRepositoryFake,
  createShiftRepositoryFake,
  createTransactionContextFake,
  createUnavailableShiftRepositoryFake,
  createUnitOfWorkFake,
  createVolunteerRepositoryFake,
} from '@/tests/test-support/repository-contract-fakes';

const churchId = ChurchId.from('church');
const volunteerId = VolunteerId.from('volunteer');
const checkId = AvailabilityCheckId.from('check');
const cycleId = CycleId.from('cycle');
const ministryId = MinistryId.from('ministry');
const eventId = EventId.from('event');
const morning = ShiftId.from('morning');
const evening = ShiftId.from('evening');
const instant = (value: string) => parseInstant({ value });
const shifts: [CheckShiftRow, CheckShiftRow] = [
  {
    published: false,
    shiftId: morning,
    eventId,
    eventTitle: 'Service',
    startTime: instant('2026-08-02T12:00:00Z'),
    endTime: instant('2026-08-02T15:00:00Z'),
  },
  {
    published: false,
    shiftId: evening,
    eventId,
    eventTitle: 'Service',
    startTime: instant('2026-08-02T18:00:00Z'),
    endTime: instant('2026-08-02T22:00:00Z'),
  },
];
const input = { churchId, volunteerId, checkId };
function createHarness() {
  const tx = createTransactionContextFake();
  const check = new AvailabilityCheck({
    id: checkId,
    props: { churchId, cycleId, ministryMembershipId: 'membership' },
  });
  const context: CheckContext = {
    answerBy: null,
    readOnly: false,
    check,
    volunteerId,
    ministryId,
    ministryName: 'Music',
    cycleName: 'August',
    timeZone: 'America/Sao_Paulo',
  };
  const volunteerRepo = createVolunteerRepositoryFake();
  volunteerRepo.listMemberMinistryIds.mockResolvedValue([]);
  const assignmentRepo = createAssignmentRepositoryFake();
  assignmentRepo.listByVolunteer.mockResolvedValue([]);
  const unavailableShiftRepo = createUnavailableShiftRepositoryFake();
  unavailableShiftRepo.listUnavailableShiftsByCheck.mockResolvedValue([]);
  const notificationRepo = createNotificationRepositoryFake();
  notificationRepo.list.mockResolvedValue({ items: [] });
  notificationRepo.countUnread.mockResolvedValue(0);
  const cycleRepo = createCycleRepositoryFake();
  const eventRepo = createEventRepositoryFake();
  const shiftRepo = createShiftRepositoryFake();
  const ministryRepo = createMinistryRepositoryFake();
  ministryRepo.listByChurch.mockResolvedValue([]);
  const participationRepo = createMinistryParticipationRepositoryFake();
  participationRepo.listByIds.mockResolvedValue([]);
  const roleRepo = createRoleRepositoryFake();
  const availabilityCheckRepo = createAvailabilityCheckRepositoryFake();
  availabilityCheckRepo.getCheckContext.mockResolvedValue(context);
  availabilityCheckRepo.listByVolunteer.mockResolvedValue([context]);
  availabilityCheckRepo.listCheckShifts.mockResolvedValue(shifts);
  const unitOfWork = createUnitOfWorkFake({ tx });
  const manager = new DbVolunteerManager({
    volunteerRepo,
    assignmentRepo,
    unavailableShiftRepo,
    notificationRepo,
    cycleRepo,
    eventRepo,
    shiftRepo,
    ministryRepo,
    participationRepo,
    roleRepo,
    availabilityCheckRepo,
    churchRepo: createChurchRepositoryFake(),
    authorityManager: createAuthorityManagerFake(),
    unitOfWork,
    config: appConfig,
  });
  return {
    manager,
    tx,
    context,
    volunteerRepo,
    assignmentRepo,
    unavailableShiftRepo,
    notificationRepo,
    eventRepo,
    shiftRepo,
    ministryRepo,
    participationRepo,
    roleRepo,
    availabilityCheckRepo,
    cycleRepo,
  };
}

describe('volunteer availability', () => {
  it('lists and resolves shifts as available by default', async () => {
    const { manager } = createHarness();
    expect(
      await manager.listAvailabilityChecks({ churchId, volunteerId }),
    ).toEqual([
      expect.objectContaining({
        id: checkId,
        state: 'pending',
        totalShiftCount: 2,
        unavailableShiftCount: 0,
      }),
    ]);
    const detail = await manager.getAvailabilityCheck(input);
    expect(detail.shifts.map((shift) => shift.available)).toEqual([true, true]);
  });
  it('denies a ministry schedule to a non-member', async () => {
    const { manager } = createHarness();
    await expect(
      manager.getMinistrySchedule({
        churchId,
        volunteerId,
        ministryId,
        cycleId,
      }),
    ).rejects.toBeInstanceOf(IsolationBreachError);
  });
});

describe('volunteer dashboard', () => {
  it('composes published assignments, notification preview and ministry options', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));
    try {
      const f = createHarness();
      const userId = UserId.from('user');
      const event = new Event({
        id: eventId,
        props: {
          churchId,
          cycleId,
          title: 'Service',
          start: shifts[0].startTime,
          end: shifts[1].endTime,
        },
      });
      const block = new EventTimeBlock({
        id: EventTimeBlockId.from('block'),
        props: {
          churchId,
          eventId,
          startTime: shifts[0].startTime,
          endTime: shifts[0].endTime,
        },
      });
      const participation = new MinistryParticipation({
        id: MinistryParticipationId.from('participation'),
        props: { churchId, ministryId, eventId, state: 'published' },
      });
      const shift = new Shift({
        id: morning,
        props: {
          churchId,
          participationId: participation.id,
          eventTimeBlockId: block.id,
          startTime: shifts[0].startTime,
          endTime: shifts[0].endTime,
        },
      });
      const assignment = new Assignment({
        id: AssignmentId.from('assignment'),
        props: {
          churchId,
          volunteerId,
          eventTimeBlockId: block.id,
          participationId: participation.id,
          shiftId: shift.id,
          roleId: RoleId.from('role'),
          shiftRequirementId: ShiftRequirementId.from({ raw: 'requirement' }),
          status: 'confirmed',
        },
      });
      const notification = new Notification({
        props: {
          churchId,
          userId,
          sourceOutboxId: 'outbox',
          kind: 'ministry_invitation',
          data: {
            ministryInvitationId: MinistryInvitationId.from('invitation'),
            ministryId,
            ministryName: 'Music',
          },
        },
      });
      f.volunteerRepo.listMemberMinistryIds.mockResolvedValue([ministryId]);
      f.ministryRepo.listByChurch.mockResolvedValue([
        new Ministry({ id: ministryId, props: { churchId, name: 'Music' } }),
      ]);
      f.eventRepo.listByMinistry.mockResolvedValue([event]);
      f.eventRepo.getWithEventTimeBlocks.mockResolvedValue({
        event,
        eventTimeBlocks: [block],
      });
      f.eventRepo.getById.mockResolvedValue(event);
      f.unavailableShiftRepo.listByVolunteerForEvent.mockResolvedValue([]);
      f.assignmentRepo.listByVolunteer.mockResolvedValue([assignment]);
      f.participationRepo.listByIds.mockResolvedValue([participation]);
      f.shiftRepo.getById.mockResolvedValue(shift);
      f.roleRepo.getById.mockResolvedValue(
        new Role({
          id: RoleId.from('role'),
          props: { churchId, ministryId, name: 'Singer' },
        }),
      );
      f.notificationRepo.countUnread.mockResolvedValue(2);
      f.notificationRepo.list.mockResolvedValue({ items: [notification] });
      const dashboard = await f.manager.getDashboard({
        churchId,
        volunteerId,
        userId,
      });
      expect(dashboard.upcomingAssignmentGroups).toEqual([
        expect.objectContaining({
          eventId,
          ministryId,
          assignments: [
            expect.objectContaining({
              assignmentId: AssignmentId.from('assignment'),
              status: 'confirmed',
            }),
          ],
        }),
      ]);
      expect(dashboard.unreadNotificationCount).toBe(2);
      expect(dashboard.notificationPreview).toEqual([notification]);
      expect(f.notificationRepo.list).toHaveBeenCalledWith({
        churchId,
        userId,
        limit: 3,
      });
      expect(dashboard.defaultMinistryId).toBe(ministryId);
      expect(dashboard.ministryOptions).toEqual([
        { id: ministryId, name: 'Music' },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
  it('lists in-progress and later assignments with names, and the published schedules of its ministries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z'));
    try {
      const f = createHarness();
      const event = new Event({
        id: eventId,
        props: {
          churchId,
          cycleId,
          title: 'Service',
          start: instant('2026-08-01T10:00:00Z'),
          end: instant('2026-10-01T00:00:00Z'),
        },
      });
      const participation = new MinistryParticipation({
        id: MinistryParticipationId.from('participation'),
        props: { churchId, ministryId, eventId, state: 'published' },
      });
      const requirementId = ShiftRequirementId.from({ raw: 'requirement' });
      const makeAssignment = (id: string) =>
        new Assignment({
          id,
          props: {
            churchId,
            volunteerId,
            eventTimeBlockId: EventTimeBlockId.from('block'),
            participationId: participation.id,
            shiftId: id,
            roleId: RoleId.from('role'),
            shiftRequirementId: requirementId,
            status: 'confirmed',
          },
        });
      const bounds: Record<string, [string, string]> = {
        ended: ['2026-08-01T08:00:00Z', '2026-08-01T10:00:00Z'],
        running: ['2026-08-01T11:00:00Z', '2026-08-01T13:00:00Z'],
        far: ['2026-09-15T00:00:00Z', '2026-09-15T01:00:00Z'],
      };
      f.volunteerRepo.listMemberMinistryIds.mockResolvedValue([ministryId]);
      f.ministryRepo.listByChurch.mockResolvedValue([
        new Ministry({ id: ministryId, props: { churchId, name: 'Music' } }),
      ]);
      f.participationRepo.listByMinistry.mockResolvedValue([participation]);
      f.assignmentRepo.listByVolunteer.mockResolvedValue(
        ['far', 'ended', 'running'].map(makeAssignment),
      );
      f.participationRepo.listByIds.mockResolvedValue([participation]);
      f.eventRepo.getById.mockResolvedValue(event);
      f.cycleRepo.getById.mockResolvedValue(
        new Cycle({
          id: cycleId,
          props: {
            churchId,
            name: 'August',
            startDate: parseCalendarDay({ value: '2026-08-01' }),
            endDate: parseCalendarDay({ value: '2026-08-31' }),
            state: 'sent',
          },
        }),
      );
      f.shiftRepo.getById.mockImplementation(
        async ({ shiftId }) =>
          new Shift({
            id: shiftId,
            props: {
              churchId,
              participationId: participation.id,
              eventTimeBlockId: EventTimeBlockId.from('block'),
              startTime: instant(bounds[shiftId as string]?.[0] as string),
              endTime: instant(bounds[shiftId as string]?.[1] as string),
            },
          }),
      );
      f.shiftRepo.listRequirementsByParticipation.mockResolvedValue([
        new ShiftRequirement({
          id: requirementId,
          props: {
            churchId,
            eventTimeBlockId: EventTimeBlockId.from('block'),
            participationId: participation.id,
            shiftId: ShiftId.from('running'),
            roleId: RoleId.from('role'),
            sectorId: SectorId.from('sector'),
            sectorName: 'Main Door',
            peopleNeeded: 1,
          },
        }),
      ]);
      f.roleRepo.getById.mockResolvedValue(
        new Role({
          id: RoleId.from('role'),
          props: { churchId, ministryId, name: 'Greeter' },
        }),
      );

      const schedule = await f.manager.getPublishedSchedule({
        churchId,
        volunteerId,
      });

      expect(schedule.assignments).toEqual([
        expect.objectContaining({
          assignmentId: 'running',
          eventTitle: 'Service',
          ministryName: 'Music',
          sectorName: 'Main Door',
          roleName: 'Greeter',
          startTime: instant('2026-08-01T11:00:00Z'),
          endTime: instant('2026-08-01T13:00:00Z'),
        }),
        expect.objectContaining({ assignmentId: 'far' }),
      ]);
      expect(schedule.schedules).toEqual([
        { ministryId, ministryName: 'Music', cycleId, cycleName: 'August' },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
