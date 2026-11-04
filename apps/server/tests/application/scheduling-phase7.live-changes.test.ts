import { appConfig } from '@church/app-config';
import { parseInstant } from '@church/time';
import { describe, expect, it, vi } from 'vitest';
import { DbAssignmentManager } from '@/application/db-assignment-manager';
import { DbParticipationManager } from '@/application/db-participation-manager';
import { DbVolunteerManager } from '@/application/db-volunteer-manager';
import {
  AssignmentId,
  ChurchId,
  CycleId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
  ShiftRequirementId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '@/domain/contracts/infrastructure/assignment-audit.repository';
import type { AvailabilityCheckRepository } from '@/domain/contracts/infrastructure/availability-check.repository';
import type { CycleRepository } from '@/domain/contracts/infrastructure/cycle.repository';
import type { EventRepository } from '@/domain/contracts/infrastructure/event.repository';
import type { EventTemplateRepository } from '@/domain/contracts/infrastructure/event-template.repository';
import type { EventTimeBlockRepository } from '@/domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { NotificationRepository } from '@/domain/contracts/infrastructure/notification.repository';
import type { PlanningEventRepository } from '@/domain/contracts/infrastructure/planning-event.repository';
import type { RoleRepository } from '@/domain/contracts/infrastructure/role.repository';
import type { SectorRepository } from '@/domain/contracts/infrastructure/sector.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnavailableShiftRepository } from '@/domain/contracts/infrastructure/unavailable-shift.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { UsualSetupRepository } from '@/domain/contracts/infrastructure/usual-setup.repository';
import type { VolunteerRepository } from '@/domain/contracts/infrastructure/volunteer.repository';
import { Assignment } from '@/domain/entities/assignment';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { Shift } from '@/domain/entities/shift';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';
import { UnavailableShift } from '@/domain/entities/unavailable-shift';
import { AssignmentAccessDeniedError } from '@/domain/errors/assignment-access-denied';
import { CancelWindowClosedError } from '@/domain/errors/cancel-window-closed';
import { createChurchNotificationsSpy } from '@/tests/test-support/church-notifications-spy';

const churchId = ChurchId.from('church');
const shiftId = ShiftId.from('shift');
const requirementId = ShiftRequirementId.from({ raw: 'requirement' });
const volunteerId = VolunteerId.from('volunteer');
const replacementId = VolunteerId.from('replacement');
const assignmentId = AssignmentId.from('assignment');
const actorId = UserId.from('actor');
const ministryId = MinistryId.from('ministry');
const start = parseInstant({ value: '2099-01-01T09:00:00Z' });
const end = parseInstant({ value: '2099-01-01T10:00:00Z' });

function fixture() {
  const tx = {} as TransactionContext;
  const shift = new Shift({
    id: shiftId,
    props: {
      churchId,
      participationId: 'participation',
      eventTimeBlockId: 'block',
      startTime: start,
      endTime: end,
    },
  });
  const requirement = new ShiftRequirement({
    id: requirementId,
    props: {
      churchId,
      eventTimeBlockId: 'block',
      participationId: 'participation',
      shiftId,
      roleId: 'role',
      sectorId: 'sector',
      sectorName: 'Sector',
      peopleNeeded: 1,
    },
  });
  const participation = new MinistryParticipation({
    id: 'participation',
    props: { churchId, ministryId, eventId: 'event', state: 'assigning' },
  });
  const assignment = new Assignment({
    id: assignmentId,
    props: {
      churchId,
      eventTimeBlockId: 'block',
      participationId: 'participation',
      shiftId,
      volunteerId,
      roleId: 'role',
      shiftRequirementId: requirementId,
      status: 'confirmed',
    },
  });
  const assignmentRepo = {
    create: vi.fn<AssignmentRepository['create']>(
      async ({ input }) =>
        new Assignment({
          id: 'new-assignment',
          props: {
            churchId,
            eventTimeBlockId: 'block',
            participationId: 'participation',
            shiftId,
            volunteerId: input.volunteerId,
            roleId: 'role',
            shiftRequirementId: requirementId,
            status: 'pending',
          },
        }),
    ),
    getById: vi.fn<AssignmentRepository['getById']>(async () => assignment),
    findByEventTimeBlockAndVolunteer:
      vi.fn<AssignmentRepository['findByEventTimeBlockAndVolunteer']>(),
    listByEventTimeBlock: vi.fn<AssignmentRepository['listByEventTimeBlock']>(),
    listByEvent: vi.fn<AssignmentRepository['listByEvent']>(),
    listByParticipation: vi.fn<AssignmentRepository['listByParticipation']>(),
    listByShift: vi.fn<AssignmentRepository['listByShift']>(async () => []),
    listByVolunteer: vi.fn<AssignmentRepository['listByVolunteer']>(),
    listByVolunteers: vi.fn<AssignmentRepository['listByVolunteers']>(),
    listByVolunteerInRange: vi.fn<
      AssignmentRepository['listByVolunteerInRange']
    >(async () => []),
    listByRange: vi.fn<AssignmentRepository['listByRange']>(),
    updateStatus: vi.fn<AssignmentRepository['updateStatus']>(),
    countByVolunteerInRange:
      vi.fn<AssignmentRepository['countByVolunteerInRange']>(),
    deleteByEvent: vi.fn<AssignmentRepository['deleteByEvent']>(),
    deleteById: vi.fn<AssignmentRepository['deleteById']>(),
    listDeclinedByEventTimeBlock:
      vi.fn<AssignmentRepository['listDeclinedByEventTimeBlock']>(),
  } satisfies AssignmentRepository;
  const auditRepo = {
    create: vi.fn<AssignmentAuditRepository['create']>(),
    listByCycle: vi.fn<AssignmentAuditRepository['listByCycle']>(),
    listByChurch: vi.fn<AssignmentAuditRepository['listByChurch']>(),
    listByActor: vi.fn<AssignmentAuditRepository['listByActor']>(),
    listByEvent: vi.fn<AssignmentAuditRepository['listByEvent']>(),
  } satisfies AssignmentAuditRepository;
  const shiftRepository = {
    createMany: vi.fn<ShiftRepository['createMany']>(),
    getById: vi.fn<ShiftRepository['getById']>(async () => shift),
    listByParticipation: vi.fn<ShiftRepository['listByParticipation']>(),
    listByEventTimeBlock: vi.fn<ShiftRepository['listByEventTimeBlock']>(),
    update: vi.fn<ShiftRepository['update']>(),
    deleteById: vi.fn<ShiftRepository['deleteById']>(),
    deleteByEventTimeBlock: vi.fn<ShiftRepository['deleteByEventTimeBlock']>(),
    upsertRequirement: vi.fn<ShiftRepository['upsertRequirement']>(),
    listRequirementsByParticipation:
      vi.fn<ShiftRepository['listRequirementsByParticipation']>(),
    getRequirementForShift: vi.fn<ShiftRepository['getRequirementForShift']>(
      async () => requirement,
    ),
  } satisfies ShiftRepository;
  const participationRepository = {
    getById: vi.fn<MinistryParticipationRepository['getById']>(
      async () => participation,
    ),
    findByMinistryEvent:
      vi.fn<MinistryParticipationRepository['findByMinistryEvent']>(),
    create: vi.fn<MinistryParticipationRepository['create']>(),
    listByEvent: vi.fn<MinistryParticipationRepository['listByEvent']>(),
    hasCycleStaffing:
      vi.fn<MinistryParticipationRepository['hasCycleStaffing']>(),
    listByMinistry: vi.fn<MinistryParticipationRepository['listByMinistry']>(),
    listByIds: vi.fn<MinistryParticipationRepository['listByIds']>(),
    updateState: vi.fn<MinistryParticipationRepository['updateState']>(),
    listInclusions: vi.fn<MinistryParticipationRepository['listInclusions']>(),
    replaceInclusions:
      vi.fn<MinistryParticipationRepository['replaceInclusions']>(),
    addInclusion: vi.fn<MinistryParticipationRepository['addInclusion']>(),
    touch: vi.fn<MinistryParticipationRepository['touch']>(),
    listScheduleSummaries:
      vi.fn<MinistryParticipationRepository['listScheduleSummaries']>(),
  } satisfies MinistryParticipationRepository;
  const volunteerRepository = {
    getById: vi.fn<VolunteerRepository['getById']>(),
    findByUserId: vi.fn<VolunteerRepository['findByUserId']>(),
    listByMinistry: vi.fn<VolunteerRepository['listByMinistry']>(),
    hasMembershipInMinistry: vi.fn<
      VolunteerRepository['hasMembershipInMinistry']
    >(async () => true),
    hasRoleQualification: vi.fn<VolunteerRepository['hasRoleQualification']>(
      async () => true,
    ),
    listQualifiedForRole: vi.fn<VolunteerRepository['listQualifiedForRole']>(),
    updateStatus: vi.fn<VolunteerRepository['updateStatus']>(),
    findByUserIdGlobally: vi.fn<VolunteerRepository['findByUserIdGlobally']>(),
    hasLeadershipInMinistry:
      vi.fn<VolunteerRepository['hasLeadershipInMinistry']>(),
    listLedMinistries: vi.fn<VolunteerRepository['listLedMinistries']>(),
    listByIds: vi.fn<VolunteerRepository['listByIds']>(),
    listMemberMinistryIds:
      vi.fn<VolunteerRepository['listMemberMinistryIds']>(),
    listMinistryMemberships:
      vi.fn<VolunteerRepository['listMinistryMemberships']>(),
    listActiveLeaderUserIds:
      vi.fn<VolunteerRepository['listActiveLeaderUserIds']>(),
  } satisfies VolunteerRepository;
  const unavailableShiftRepository = {
    listByVolunteerForEvent:
      vi.fn<UnavailableShiftRepository['listByVolunteerForEvent']>(),
    listByVolunteers: vi.fn<UnavailableShiftRepository['listByVolunteers']>(
      async () => [],
    ),
    listUnavailableShiftsByCheck:
      vi.fn<UnavailableShiftRepository['listUnavailableShiftsByCheck']>(),
    replaceUnavailableShiftsForCheck:
      vi.fn<UnavailableShiftRepository['replaceUnavailableShiftsForCheck']>(),
  } satisfies UnavailableShiftRepository;
  const cycleRepository = {
    create: vi.fn<CycleRepository['create']>(),
    list: vi.fn<CycleRepository['list']>(),
    getById: vi.fn<CycleRepository['getById']>(),
    findOverlapping: vi.fn<CycleRepository['findOverlapping']>(),
    updateState: vi.fn<CycleRepository['updateState']>(),
    acquireChurchLock: vi.fn<CycleRepository['acquireChurchLock']>(),
  } satisfies CycleRepository;
  const notificationRepo = {
    create: vi.fn<NotificationRepository['create']>(),
    list: vi.fn<NotificationRepository['list']>(),
    countUnread: vi.fn<NotificationRepository['countUnread']>(),
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
  const ministryRepo = {
    getById: vi.fn<MinistryRepository['getById']>(),
    listByChurch: vi.fn<MinistryRepository['listByChurch']>(),
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
    getCheckContext: vi.fn<AvailabilityCheckRepository['getCheckContext']>(),
    listByVolunteer: vi.fn<AvailabilityCheckRepository['listByVolunteer']>(),
    listCheckShifts: vi.fn<AvailabilityCheckRepository['listCheckShifts']>(),
    listMinistryLeaderVolunteerIds:
      vi.fn<AvailabilityCheckRepository['listMinistryLeaderVolunteerIds']>(),
    confirm: vi.fn<AvailabilityCheckRepository['confirm']>(),
  } satisfies AvailabilityCheckRepository;
  const eventRepository = {
    createEvent: vi.fn<PlanningEventRepository['createEvent']>(),
    updateEvent: vi.fn<PlanningEventRepository['updateEvent']>(),
    getEvent: vi.fn<PlanningEventRepository['getEvent']>(),
    deleteEvent: vi.fn<PlanningEventRepository['deleteEvent']>(),
    listCycleEvents: vi.fn<PlanningEventRepository['listCycleEvents']>(),
    createEventTimeBlock:
      vi.fn<PlanningEventRepository['createEventTimeBlock']>(),
    seedParticipations: vi.fn<PlanningEventRepository['seedParticipations']>(),
  } satisfies PlanningEventRepository;
  const eventTimeBlockRepository = {
    getById: vi.fn<EventTimeBlockRepository['getById']>(),
    listByEvent: vi.fn<EventTimeBlockRepository['listByEvent']>(),
    create: vi.fn<EventTimeBlockRepository['create']>(),
    update: vi.fn<EventTimeBlockRepository['update']>(),
    deleteById: vi.fn<EventTimeBlockRepository['deleteById']>(),
    findOverlapping: vi.fn<EventTimeBlockRepository['findOverlapping']>(),
    deleteByEvent: vi.fn<EventTimeBlockRepository['deleteByEvent']>(),
    countActiveAssignments:
      vi.fn<EventTimeBlockRepository['countActiveAssignments']>(),
  } satisfies EventTimeBlockRepository;
  const usualSetupRepository = {
    listByMinistry: vi.fn<UsualSetupRepository['listByMinistry']>(),
    listByChurch: vi.fn<UsualSetupRepository['listByChurch']>(),
    upsertBlock: vi.fn<UsualSetupRepository['upsertBlock']>(),
  } satisfies UsualSetupRepository;
  const eventTemplateRepository = {
    create: vi.fn<EventTemplateRepository['create']>(),
    update: vi.fn<EventTemplateRepository['update']>(),
    delete: vi.fn<EventTemplateRepository['delete']>(),
    list: vi.fn<EventTemplateRepository['list']>(),
    getById: vi.fn<EventTemplateRepository['getById']>(),
    getByIds: vi.fn<EventTemplateRepository['getByIds']>(),
    getUsage: vi.fn<EventTemplateRepository['getUsage']>(),
  } satisfies EventTemplateRepository;
  const sectorRepository = {
    listByMinistry: vi.fn<SectorRepository['listByMinistry']>(),
    getById: vi.fn<SectorRepository['getById']>(),
    lockActive: vi.fn<SectorRepository['lockActive']>(),
    create: vi.fn<SectorRepository['create']>(),
    rename: vi.fn<SectorRepository['rename']>(),
    lockActiveForArchive: vi.fn<SectorRepository['lockActiveForArchive']>(),
    listArchiveBlockers: vi.fn<SectorRepository['listArchiveBlockers']>(),
    markArchived: vi.fn<SectorRepository['markArchived']>(),
  } satisfies SectorRepository;
  const unitOfWork: UnitOfWork = {
    run: vi.fn(async (work) => work(tx)),
    runWith: vi.fn(async ({ work }) => work(tx)),
  };
  const manager = new DbAssignmentManager({
    assignmentRepo,
    auditRepo,
    shiftRepository,
    participationRepository,
    volunteerRepository,
    unavailableShiftRepository,
    cycleRepository,
    unitOfWork,
  });
  const notifications = createChurchNotificationsSpy();
  const participationManager = new DbParticipationManager({
    participationRepository,
    shiftRepository,
    assignmentRepository: assignmentRepo,
    unavailableShiftRepository,
    volunteerRepository,
    cycleRepository,
    eventRepository,
    eventTimeBlockRepository,
    usualSetupRepository,
    eventTemplateRepository,
    sectorRepository,
    ministryRepository: ministryRepo,
    roleRepository: roleRepo,
    notifications,
    unitOfWork,
  });
  const volunteerManager = new DbVolunteerManager({
    volunteerRepo: volunteerRepository,
    assignmentRepo,
    shiftRepo: shiftRepository,
    participationRepo: participationRepository,
    unavailableShiftRepo: unavailableShiftRepository,
    unitOfWork,
    config: appConfig,
    notificationRepo,
    eventRepo,
    ministryRepo,
    roleRepo,
    availabilityCheckRepo,
  });
  return {
    manager,
    volunteerManager,
    participationManager,
    requirement,
    notifications,
    assignmentRepo,
    auditRepo,
    shiftRepository,
    participationRepository,
    volunteerRepository,
    unavailableShiftRepository,
    cycleRepository,
    assignment,
    notificationRepo,
    shift,
    tx,
  };
}

const createInput = {
  churchId,
  shiftId,
  shiftRequirementId: requirementId,
  volunteerId,
  actorId,
};

describe('live assignment changes', () => {
  it('cancels an owner’s assignment outside the window', async () => {
    const f = fixture();
    await f.volunteerManager.cancelOwnAssignment({
      churchId,
      assignmentId,
      volunteerId,
    });
    expect(f.assignmentRepo.deleteById).toHaveBeenCalledWith({
      churchId,
      assignmentId,
    });
    expect(f.notificationRepo.create).not.toHaveBeenCalled();
  });
  it('reports the reopened participation after cancellation', async () => {
    const f = fixture();
    f.shiftRepository.listRequirementsByParticipation.mockResolvedValue([
      f.requirement,
    ]);
    f.assignmentRepo.listByParticipation
      .mockResolvedValueOnce([f.assignment])
      .mockResolvedValueOnce([]);
    const participationId = MinistryParticipationId.from('participation');
    const before = await f.participationManager.getCompletion({
      churchId,
      participationId,
    });
    await f.volunteerManager.cancelOwnAssignment({
      churchId,
      assignmentId,
      volunteerId,
    });
    const after = await f.participationManager.getCompletion({
      churchId,
      participationId,
    });
    expect(before).toMatchObject({
      assignedCount: 1,
      peopleNeeded: 1,
      completionPercent: 100,
    });
    expect(after).toMatchObject({
      assignedCount: 0,
      peopleNeeded: 1,
      completionPercent: 0,
    });
    expect(f.notifications.enqueue).not.toHaveBeenCalled();
  });
  it('rejects another volunteer without deleting the assignment', async () => {
    const f = fixture();
    await expect(
      f.volunteerManager.cancelOwnAssignment({
        churchId,
        assignmentId,
        volunteerId: replacementId,
      }),
    ).rejects.toBeInstanceOf(AssignmentAccessDeniedError);
    expect(f.assignmentRepo.deleteById).not.toHaveBeenCalled();
  });
  it('rejects cancellation within the configured lead time', async () => {
    const f = fixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-01-01T08:00:00Z'));
    try {
      await expect(
        f.volunteerManager.cancelOwnAssignment({
          churchId,
          assignmentId,
          volunteerId,
        }),
      ).rejects.toBeInstanceOf(CancelWindowClosedError);
      expect(f.assignmentRepo.deleteById).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('creates a pending assignment and requests an audit even with the audit panel parked', async () => {
    const f = fixture();
    expect(appConfig.parked.auditPanel).toBe(false);
    const result = await f.manager.createParticipationAssignment(createInput);
    expect(result.assignment).toMatchObject({
      shiftId,
      eventTimeBlockId: 'block',
      participationId: 'participation',
      status: 'pending',
      volunteerId,
    });
    expect(result.warnings).toEqual([]);
    expect(f.auditRepo.create).toHaveBeenCalledWith({
      churchId,
      input: { assignmentId: result.assignment.id, actorId, action: 'created' },
      tx: f.tx,
    });
    expect(f.assignmentRepo.create).toHaveBeenCalledWith({
      churchId,
      input: {
        shiftId,
        eventTimeBlockId: 'block',
        participationId: 'participation',
        shiftRequirementId: requirementId,
        volunteerId,
        status: 'pending',
        assignedBy: actorId,
      },
      tx: f.tx,
    });
  });
  it('rejects volunteers outside the ministry', async () => {
    const f = fixture();
    f.volunteerRepository.hasMembershipInMinistry.mockResolvedValue(false);
    await expect(
      f.manager.createParticipationAssignment(createInput),
    ).rejects.toMatchObject({ reason: 'NOT_IN_MINISTRY' });
    expect(f.assignmentRepo.create).not.toHaveBeenCalled();
  });
  it('returns a qualification warning', async () => {
    const f = fixture();
    f.volunteerRepository.hasRoleQualification.mockResolvedValue(false);
    const result = await f.manager.createParticipationAssignment(createInput);
    expect(result.warnings).toEqual([
      expect.objectContaining({ type: 'NOT_QUALIFIED' }),
    ]);
  });
  it('returns an unavailability warning', async () => {
    const f = fixture();
    f.unavailableShiftRepository.listByVolunteers.mockResolvedValue([
      new UnavailableShift({
        props: {
          churchId,
          availabilityCheckId: 'check',
          shiftId,
          volunteerId,
          shiftStartTime: start,
          shiftEndTime: end,
        },
      }),
    ]);
    const result = await f.manager.createParticipationAssignment(createInput);
    expect(result.warnings).toEqual([
      expect.objectContaining({ type: 'UNAVAILABLE' }),
    ]);
  });
  it('reassigns the same shift and requirement and requests both audit entries', async () => {
    const f = fixture();
    const result = await f.manager.reassignParticipationAssignment({
      churchId,
      assignmentId,
      volunteerId: replacementId,
      actorId,
    });
    expect(result).toMatchObject({
      shiftId,
      roleId: 'role',
      shiftRequirementId: requirementId,
      volunteerId: replacementId,
    });
    expect(f.assignmentRepo.deleteById).toHaveBeenCalledWith({
      churchId,
      assignmentId,
      tx: f.tx,
    });
    expect(f.auditRepo.create).toHaveBeenNthCalledWith(1, {
      churchId,
      input: { assignmentId: result.id, actorId, action: 'created' },
      tx: f.tx,
    });
    expect(f.auditRepo.create).toHaveBeenNthCalledWith(2, {
      churchId,
      input: { assignmentId: result.id, actorId, action: 'updated' },
      tx: f.tx,
    });
  });
  it('requests audit before deletion in the same transaction', async () => {
    const f = fixture();
    await f.manager.deleteAssignment({ churchId, assignmentId, actorId });
    expect(f.auditRepo.create).toHaveBeenCalledWith({
      churchId,
      input: { assignmentId, actorId, action: 'deleted' },
      tx: f.tx,
    });
    expect(f.assignmentRepo.deleteById).toHaveBeenCalledWith({
      churchId,
      assignmentId,
      tx: f.tx,
    });
    expect(f.auditRepo.create.mock.invocationCallOrder[0]).toBeLessThan(
      f.assignmentRepo.deleteById.mock.invocationCallOrder[0] ?? 0,
    );
  });
  it('checks the cycle before listing its audit', async () => {
    const f = fixture();
    const cycleId = CycleId.from('cycle');
    f.auditRepo.listByCycle.mockResolvedValue([]);
    await expect(
      f.manager.listAuditLogForCycle({ churchId, cycleId, ministryId }),
    ).resolves.toEqual([]);
    expect(f.cycleRepository.getById).toHaveBeenCalledWith({
      churchId,
      cycleId,
    });
    expect(f.auditRepo.listByCycle).toHaveBeenCalledWith({
      churchId,
      cycleId,
      ministryId,
    });
  });
});
