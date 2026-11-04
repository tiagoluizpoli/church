import { appConfig } from '@church/app-config';
import { parseInstant } from '@church/time';
import { describe, expect, it, vi } from 'vitest';
import { DbVolunteerManager } from '@/application/db-volunteer-manager';
import {
  AvailabilityCheckId,
  ChurchId,
  CycleId,
  EventId,
  MinistryId,
  ShiftId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type {
  AvailabilityCheckRepository,
  CheckContext,
  CheckShiftRow,
} from '@/domain/contracts/infrastructure/availability-check.repository';
import type { EventRepository } from '@/domain/contracts/infrastructure/event.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { NotificationRepository } from '@/domain/contracts/infrastructure/notification.repository';
import type { RoleRepository } from '@/domain/contracts/infrastructure/role.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnavailableShiftRepository } from '@/domain/contracts/infrastructure/unavailable-shift.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '@/domain/contracts/infrastructure/volunteer.repository';
import { Assignment } from '@/domain/entities/assignment';
import { AvailabilityCheck } from '@/domain/entities/availability-check';
import { Event } from '@/domain/entities/event';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { Ministry } from '@/domain/entities/ministry';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { Notification } from '@/domain/entities/notification';
import { Role } from '@/domain/entities/role';
import { Shift } from '@/domain/entities/shift';
import { UnavailableShift } from '@/domain/entities/unavailable-shift';
import { CheckAccessDeniedError } from '@/domain/errors/check-access-denied';
import { IsolationBreachError } from '@/domain/errors/isolation-breach-error';

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
    shiftId: morning,
    eventId,
    eventTitle: 'Service',
    startTime: instant('2026-08-02T12:00:00Z'),
    endTime: instant('2026-08-02T15:00:00Z'),
  },
  {
    shiftId: evening,
    eventId,
    eventTitle: 'Service',
    startTime: instant('2026-08-02T18:00:00Z'),
    endTime: instant('2026-08-02T22:00:00Z'),
  },
];
const input = { churchId, volunteerId, checkId };
function createFixture() {
  const tx = {} as TransactionContext;
  const check = new AvailabilityCheck({
    id: checkId,
    props: { churchId, cycleId, ministryMembershipId: 'membership' },
  });
  const context: CheckContext = {
    check,
    volunteerId,
    ministryId,
    ministryName: 'Music',
    cycleName: 'August',
    timeZone: 'America/Sao_Paulo',
  };
  const volunteerRepo = {
    getById: vi.fn<VolunteerRepository['getById']>(),
    findByUserId: vi.fn<VolunteerRepository['findByUserId']>(),
    listByMinistry: vi.fn<VolunteerRepository['listByMinistry']>(),
    hasMembershipInMinistry:
      vi.fn<VolunteerRepository['hasMembershipInMinistry']>(),
    hasRoleQualification: vi.fn<VolunteerRepository['hasRoleQualification']>(),
    listQualifiedForRole: vi.fn<VolunteerRepository['listQualifiedForRole']>(),
    updateStatus: vi.fn<VolunteerRepository['updateStatus']>(),
    findByUserIdGlobally: vi.fn<VolunteerRepository['findByUserIdGlobally']>(),
    hasLeadershipInMinistry:
      vi.fn<VolunteerRepository['hasLeadershipInMinistry']>(),
    listLedMinistries: vi.fn<VolunteerRepository['listLedMinistries']>(),
    listByIds: vi.fn<VolunteerRepository['listByIds']>(),
    listMemberMinistryIds: vi.fn<VolunteerRepository['listMemberMinistryIds']>(
      async () => [],
    ),
    listMinistryMemberships:
      vi.fn<VolunteerRepository['listMinistryMemberships']>(),
    listActiveLeaderUserIds:
      vi.fn<VolunteerRepository['listActiveLeaderUserIds']>(),
  } satisfies VolunteerRepository;
  const assignmentRepo = {
    create: vi.fn<AssignmentRepository['create']>(),
    getById: vi.fn<AssignmentRepository['getById']>(),
    findByEventTimeBlockAndVolunteer:
      vi.fn<AssignmentRepository['findByEventTimeBlockAndVolunteer']>(),
    listByEventTimeBlock: vi.fn<AssignmentRepository['listByEventTimeBlock']>(),
    listByEvent: vi.fn<AssignmentRepository['listByEvent']>(),
    listByParticipation: vi.fn<AssignmentRepository['listByParticipation']>(),
    listByShift: vi.fn<AssignmentRepository['listByShift']>(),
    listByVolunteer: vi.fn<AssignmentRepository['listByVolunteer']>(
      async () => [],
    ),
    listByVolunteers: vi.fn<AssignmentRepository['listByVolunteers']>(),
    listByVolunteerInRange:
      vi.fn<AssignmentRepository['listByVolunteerInRange']>(),
    listByRange: vi.fn<AssignmentRepository['listByRange']>(),
    updateStatus: vi.fn<AssignmentRepository['updateStatus']>(),
    countByVolunteerInRange:
      vi.fn<AssignmentRepository['countByVolunteerInRange']>(),
    deleteByEvent: vi.fn<AssignmentRepository['deleteByEvent']>(),
    deleteById: vi.fn<AssignmentRepository['deleteById']>(),
    listDeclinedByEventTimeBlock:
      vi.fn<AssignmentRepository['listDeclinedByEventTimeBlock']>(),
  } satisfies AssignmentRepository;
  const unavailableShiftRepo = {
    listByVolunteerForEvent:
      vi.fn<UnavailableShiftRepository['listByVolunteerForEvent']>(),
    listByVolunteers: vi.fn<UnavailableShiftRepository['listByVolunteers']>(),
    listUnavailableShiftsByCheck: vi.fn<
      UnavailableShiftRepository['listUnavailableShiftsByCheck']
    >(async () => []),
    replaceUnavailableShiftsForCheck:
      vi.fn<UnavailableShiftRepository['replaceUnavailableShiftsForCheck']>(),
  } satisfies UnavailableShiftRepository;
  const notificationRepo = {
    create: vi.fn<NotificationRepository['create']>(),
    list: vi.fn<NotificationRepository['list']>(async () => ({ items: [] })),
    countUnread: vi.fn<NotificationRepository['countUnread']>(async () => 0),
    markRead: vi.fn<NotificationRepository['markRead']>(),
    markAllRead: vi.fn<NotificationRepository['markAllRead']>(),
  } satisfies NotificationRepository;
  const eventRepo = {
    getMinistryId: vi.fn<EventRepository['getMinistryId']>(),
    getById: vi.fn<EventRepository['getById']>(),
    getWithEventTimeBlocks: vi.fn<EventRepository['getWithEventTimeBlocks']>(),
    listByMinistry: vi.fn<EventRepository['listByMinistry']>(),
    create: vi.fn<EventRepository['create']>(),
    updateStatus: vi.fn<EventRepository['updateStatus']>(),
    update: vi.fn<EventRepository['update']>(),
  } satisfies EventRepository;
  const shiftRepo = {
    createMany: vi.fn<ShiftRepository['createMany']>(),
    getById: vi.fn<ShiftRepository['getById']>(),
    listByParticipation: vi.fn<ShiftRepository['listByParticipation']>(),
    listByEventTimeBlock: vi.fn<ShiftRepository['listByEventTimeBlock']>(),
    update: vi.fn<ShiftRepository['update']>(),
    deleteById: vi.fn<ShiftRepository['deleteById']>(),
    deleteByEventTimeBlock: vi.fn<ShiftRepository['deleteByEventTimeBlock']>(),
    upsertRequirement: vi.fn<ShiftRepository['upsertRequirement']>(),
    listRequirementsByParticipation:
      vi.fn<ShiftRepository['listRequirementsByParticipation']>(),
    getRequirementForShift: vi.fn<ShiftRepository['getRequirementForShift']>(),
  } satisfies ShiftRepository;
  const ministryRepo = {
    getById: vi.fn<MinistryRepository['getById']>(),
    listByChurch: vi.fn<MinistryRepository['listByChurch']>(async () => []),
    create: vi.fn<MinistryRepository['create']>(),
    rename: vi.fn<MinistryRepository['rename']>(),
    lockActive: vi.fn<MinistryRepository['lockActive']>(),
    listUnendedParticipationCycles:
      vi.fn<MinistryRepository['listUnendedParticipationCycles']>(),
    archive: vi.fn<MinistryRepository['archive']>(),
    getSettings: vi.fn<MinistryRepository['getSettings']>(),
    updateDefaultDirection:
      vi.fn<MinistryRepository['updateDefaultDirection']>(),
  } satisfies MinistryRepository;
  const participationRepo = {
    getById: vi.fn<MinistryParticipationRepository['getById']>(),
    findByMinistryEvent:
      vi.fn<MinistryParticipationRepository['findByMinistryEvent']>(),
    create: vi.fn<MinistryParticipationRepository['create']>(),
    listByEvent: vi.fn<MinistryParticipationRepository['listByEvent']>(),
    hasCycleStaffing:
      vi.fn<MinistryParticipationRepository['hasCycleStaffing']>(),
    listByMinistry: vi.fn<MinistryParticipationRepository['listByMinistry']>(),
    listByIds: vi.fn<MinistryParticipationRepository['listByIds']>(
      async () => [],
    ),
    updateState: vi.fn<MinistryParticipationRepository['updateState']>(),
    listInclusions: vi.fn<MinistryParticipationRepository['listInclusions']>(),
    replaceInclusions:
      vi.fn<MinistryParticipationRepository['replaceInclusions']>(),
    addInclusion: vi.fn<MinistryParticipationRepository['addInclusion']>(),
    touch: vi.fn<MinistryParticipationRepository['touch']>(),
    listScheduleSummaries:
      vi.fn<MinistryParticipationRepository['listScheduleSummaries']>(),
  } satisfies MinistryParticipationRepository;
  const roleRepo = {
    getById: vi.fn<RoleRepository['getById']>(),
    listByMinistry: vi.fn<RoleRepository['listByMinistry']>(),
    listActiveByMinistry: vi.fn<RoleRepository['listActiveByMinistry']>(),
    create: vi.fn<RoleRepository['create']>(),
    rename: vi.fn<RoleRepository['rename']>(),
    lockActiveForUse: vi.fn<RoleRepository['lockActiveForUse']>(),
    lockActiveForArchive: vi.fn<RoleRepository['lockActiveForArchive']>(),
    listArchiveBlockers: vi.fn<RoleRepository['listArchiveBlockers']>(),
    archive: vi.fn<RoleRepository['archive']>(),
  } satisfies RoleRepository;
  const availabilityCheckRepo = {
    listActiveMemberships:
      vi.fn<AvailabilityCheckRepository['listActiveMemberships']>(),
    listByCycle: vi.fn<AvailabilityCheckRepository['listByCycle']>(),
    createMany: vi.fn<AvailabilityCheckRepository['createMany']>(),
    getCheckContext: vi.fn<AvailabilityCheckRepository['getCheckContext']>(
      async () => context,
    ),
    listByVolunteer: vi.fn<AvailabilityCheckRepository['listByVolunteer']>(
      async () => [context],
    ),
    listCheckShifts: vi.fn<AvailabilityCheckRepository['listCheckShifts']>(
      async () => shifts,
    ),
    listMinistryLeaderVolunteerIds:
      vi.fn<AvailabilityCheckRepository['listMinistryLeaderVolunteerIds']>(),
    confirm: vi.fn<AvailabilityCheckRepository['confirm']>(),
  } satisfies AvailabilityCheckRepository;
  const unitOfWork: UnitOfWork = {
    run: vi.fn(async (work) => work(tx)),
    runWith: vi.fn(async ({ work }) => work(tx)),
  };
  const manager = new DbVolunteerManager({
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
  };
}

describe('volunteer availability', () => {
  it('marks selected shifts unavailable and leaves others available', async () => {
    const { manager, unavailableShiftRepo, tx } = createFixture();
    unavailableShiftRepo.listUnavailableShiftsByCheck.mockResolvedValue([
      new UnavailableShift({
        props: {
          churchId,
          availabilityCheckId: checkId,
          shiftId: evening,
          volunteerId,
          shiftStartTime: shifts[1].startTime,
          shiftEndTime: shifts[1].endTime,
        },
      }),
    ]);
    const detail = await manager.setUnavailableShifts({
      ...input,
      shiftIds: [evening],
    });
    expect(
      unavailableShiftRepo.replaceUnavailableShiftsForCheck,
    ).toHaveBeenCalledWith({
      churchId,
      availabilityCheckId: checkId,
      shiftIds: [evening],
      tx,
    });
    expect(
      detail.shifts.map(({ shiftId, available }) => [shiftId, available]),
    ).toEqual([
      [morning, true],
      [evening, false],
    ]);
  });
  it('expands a whole church-local day to all its shifts', async () => {
    const { manager, unavailableShiftRepo, tx } = createFixture();
    await manager.setUnavailableShifts({
      ...input,
      shiftIds: [],
      wholeDayDates: ['2026-08-02'],
    });
    expect(
      unavailableShiftRepo.replaceUnavailableShiftsForCheck,
    ).toHaveBeenCalledWith({
      churchId,
      availabilityCheckId: checkId,
      shiftIds: [morning, evening],
      tx,
    });
  });
  it('rejects shifts outside the check scope', async () => {
    const { manager, unavailableShiftRepo } = createFixture();
    await expect(
      manager.setUnavailableShifts({
        ...input,
        shiftIds: [ShiftId.from('other')],
      }),
    ).rejects.toThrow();
    expect(
      unavailableShiftRepo.replaceUnavailableShiftsForCheck,
    ).not.toHaveBeenCalled();
  });
  it('confirms an empty response and persists its confirmation time', async () => {
    const { manager, availabilityCheckRepo, tx } = createFixture();
    const result = await manager.confirmAvailabilityCheck(input);
    expect(result.state).toBe('confirmed');
    expect(availabilityCheckRepo.confirm).toHaveBeenCalledWith({
      churchId,
      checkId,
      confirmedAt: expect.any(Date),
      tx,
    });
  });
  it('confirms independently of other ministries, without requesting leader notifications', async () => {
    const { manager, availabilityCheckRepo, notificationRepo } =
      createFixture();
    expect(await manager.confirmAvailabilityCheck(input)).toEqual(
      expect.objectContaining({ state: 'confirmed' }),
    );
    expect(availabilityCheckRepo.listByVolunteer).not.toHaveBeenCalled();
    expect(
      availabilityCheckRepo.listMinistryLeaderVolunteerIds,
    ).not.toHaveBeenCalled();
    expect(notificationRepo.create).not.toHaveBeenCalled();
  });
  it('denies marking or confirming another volunteer’s check', async () => {
    const { manager, unavailableShiftRepo, availabilityCheckRepo } =
      createFixture();
    const intruder = { ...input, volunteerId: VolunteerId.from('intruder') };
    await expect(
      manager.setUnavailableShifts({ ...intruder, shiftIds: [morning] }),
    ).rejects.toThrow(CheckAccessDeniedError);
    await expect(manager.confirmAvailabilityCheck(intruder)).rejects.toThrow(
      CheckAccessDeniedError,
    );
    expect(
      unavailableShiftRepo.replaceUnavailableShiftsForCheck,
    ).not.toHaveBeenCalled();
    expect(availabilityCheckRepo.confirm).not.toHaveBeenCalled();
  });
  it('lists and resolves shifts as available by default', async () => {
    const { manager } = createFixture();
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
    const { manager } = createFixture();
    await expect(
      manager.getMinistrySchedule({ churchId, volunteerId, ministryId }),
    ).rejects.toBeInstanceOf(IsolationBreachError);
  });
});

describe('volunteer dashboard', () => {
  it('composes availability, published assignments, notification preview and ministry options', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));
    try {
      const f = createFixture();
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
        id: 'block',
        props: {
          churchId,
          eventId,
          startTime: shifts[0].startTime,
          endTime: shifts[0].endTime,
        },
      });
      const participation = new MinistryParticipation({
        id: 'participation',
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
        id: 'assignment',
        props: {
          churchId,
          volunteerId,
          eventTimeBlockId: block.id,
          participationId: participation.id,
          shiftId: shift.id,
          roleId: 'role',
          shiftRequirementId: 'requirement',
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
            ministryInvitationId: 'invitation',
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
          id: 'role',
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
      expect(dashboard.availabilityTasks).toEqual([
        expect.objectContaining({ eventId, completionState: 'missing' }),
      ]);
      expect(dashboard.upcomingAssignmentGroups).toEqual([
        expect.objectContaining({
          eventId,
          ministryId,
          assignments: [
            expect.objectContaining({
              assignmentId: 'assignment',
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
  it('includes only published assignments starting in the next 30 days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));
    try {
      const f = createFixture();
      const participation = new MinistryParticipation({
        id: 'participation',
        props: { churchId, ministryId, eventId, state: 'published' },
      });
      const makeAssignment = (id: string) =>
        new Assignment({
          id,
          props: {
            churchId,
            volunteerId,
            eventTimeBlockId: 'block',
            participationId: participation.id,
            shiftId: id,
            roleId: 'role',
            shiftRequirementId: 'requirement',
            status: 'confirmed',
          },
        });
      const within = makeAssignment('within');
      const beyond = makeAssignment('beyond');
      f.assignmentRepo.listByVolunteer.mockResolvedValue([within, beyond]);
      f.participationRepo.listByIds.mockResolvedValue([participation]);
      f.shiftRepo.getById.mockImplementation(
        async ({ shiftId }) =>
          new Shift({
            id: shiftId,
            props: {
              churchId,
              participationId: participation.id,
              eventTimeBlockId: 'block',
              startTime: instant(
                shiftId === 'within'
                  ? '2026-08-06T00:00:00Z'
                  : '2026-09-15T00:00:00Z',
              ),
              endTime: instant(
                shiftId === 'within'
                  ? '2026-08-06T01:00:00Z'
                  : '2026-09-15T01:00:00Z',
              ),
            },
          }),
      );
      expect(
        await f.manager.getUpcomingAssignments({ churchId, volunteerId }),
      ).toEqual([within]);
    } finally {
      vi.useRealTimers();
    }
  });
});
