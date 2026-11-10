import { vi } from 'vitest';
import type { IAuthorityManager } from '@/domain/contracts/application/authority-manager';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '@/domain/contracts/infrastructure/assignment-audit.repository';
import type { AvailabilityCheckRepository } from '@/domain/contracts/infrastructure/availability-check.repository';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
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
import type { SwapRequestRepository } from '@/domain/contracts/infrastructure/swap-request.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnavailableShiftRepository } from '@/domain/contracts/infrastructure/unavailable-shift.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { UsualSetupRepository } from '@/domain/contracts/infrastructure/usual-setup.repository';
import type { VolunteerRepository } from '@/domain/contracts/infrastructure/volunteer.repository';

// Typed repository-contract stubs for manager unit tests (#701). Every method
// is a bare `vi.fn()` with no behavior: each test configures the responses its
// scenario needs. These are not in-memory repositories and must stay that way.

/** The opaque transaction token a fake UnitOfWork hands to its work. */
export function createTransactionContextFake() {
  // The brand is compile-time only; managers pass the token through untouched.
  return {} as TransactionContext;
}

interface UnitOfWorkFakeInput {
  tx: TransactionContext;
}

export function createUnitOfWorkFake({ tx }: UnitOfWorkFakeInput) {
  // Generic methods cannot be typed through vi.fn<T>, so annotate the object.
  const unitOfWork: UnitOfWork = {
    run: vi.fn(async (work) => work(tx)),
    runWith: vi.fn(async ({ work }) => work(tx)),
  };
  return unitOfWork;
}

export function createAssignmentRepositoryFake() {
  return {
    create: vi.fn<AssignmentRepository['create']>(),
    getById: vi.fn<AssignmentRepository['getById']>(),
    findByEventTimeBlockAndVolunteer:
      vi.fn<AssignmentRepository['findByEventTimeBlockAndVolunteer']>(),
    listByEventTimeBlock: vi.fn<AssignmentRepository['listByEventTimeBlock']>(),
    listByEvent: vi.fn<AssignmentRepository['listByEvent']>(),
    listByParticipation: vi.fn<AssignmentRepository['listByParticipation']>(),
    listByShift: vi.fn<AssignmentRepository['listByShift']>(),
    listByVolunteer: vi.fn<AssignmentRepository['listByVolunteer']>(),
    listByVolunteers: vi.fn<AssignmentRepository['listByVolunteers']>(),
    listByVolunteerInRange:
      vi.fn<AssignmentRepository['listByVolunteerInRange']>(),
    listByRange: vi.fn<AssignmentRepository['listByRange']>(),
    move: vi.fn<AssignmentRepository['move']>(),
    updateStatus: vi.fn<AssignmentRepository['updateStatus']>(),
    countByVolunteerInRange:
      vi.fn<AssignmentRepository['countByVolunteerInRange']>(),
    deleteByEvent: vi.fn<AssignmentRepository['deleteByEvent']>(),
    deleteById: vi.fn<AssignmentRepository['deleteById']>(),
    listDeclinedByEventTimeBlock:
      vi.fn<AssignmentRepository['listDeclinedByEventTimeBlock']>(),
  } satisfies AssignmentRepository;
}

export function createAssignmentAuditRepositoryFake() {
  return {
    create: vi.fn<AssignmentAuditRepository['create']>(),
    listByCycle: vi.fn<AssignmentAuditRepository['listByCycle']>(),
    listByChurch: vi.fn<AssignmentAuditRepository['listByChurch']>(),
    listByActor: vi.fn<AssignmentAuditRepository['listByActor']>(),
    listByEvent: vi.fn<AssignmentAuditRepository['listByEvent']>(),
  } satisfies AssignmentAuditRepository;
}

export function createAvailabilityCheckRepositoryFake() {
  return {
    listActiveMemberships:
      vi.fn<AvailabilityCheckRepository['listActiveMemberships']>(),
    listEligibleMemberships:
      vi.fn<AvailabilityCheckRepository['listEligibleMemberships']>(),
    createAskRecord: vi.fn<AvailabilityCheckRepository['createAskRecord']>(),
    findAskRecord: vi.fn<AvailabilityCheckRepository['findAskRecord']>(),
    stampReminded: vi.fn<AvailabilityCheckRepository['stampReminded']>(),
    setAnswerBy: vi.fn<AvailabilityCheckRepository['setAnswerBy']>(),
    listCheckMarkCounts:
      vi.fn<AvailabilityCheckRepository['listCheckMarkCounts']>(),
    listRelevantShiftTotals:
      vi.fn<AvailabilityCheckRepository['listRelevantShiftTotals']>(),
    findAnswerBy: vi.fn<AvailabilityCheckRepository['findAnswerBy']>(),
    listServedShifts: vi.fn<AvailabilityCheckRepository['listServedShifts']>(),
    listRolesWithoutHolders:
      vi.fn<AvailabilityCheckRepository['listRolesWithoutHolders']>(),
    listByCycle: vi.fn<AvailabilityCheckRepository['listByCycle']>(),
    createMany: vi.fn<AvailabilityCheckRepository['createMany']>(),
    getCheckContext: vi.fn<AvailabilityCheckRepository['getCheckContext']>(),
    listByVolunteer: vi.fn<AvailabilityCheckRepository['listByVolunteer']>(),
    listCheckShifts: vi.fn<AvailabilityCheckRepository['listCheckShifts']>(),
    listMinistryLeaderVolunteerIds:
      vi.fn<AvailabilityCheckRepository['listMinistryLeaderVolunteerIds']>(),
    confirm: vi.fn<AvailabilityCheckRepository['confirm']>(),
  } satisfies AvailabilityCheckRepository;
}

export function createChurchRepositoryFake() {
  return {
    getById: vi.fn<ChurchRepository['getById']>(),
    getBySlug: vi.fn<ChurchRepository['getBySlug']>(),
    listAdminUserIds: vi.fn<ChurchRepository['listAdminUserIds']>(),
    findMemberEmail: vi.fn<ChurchRepository['findMemberEmail']>(),
    findMemberContact: vi.fn<ChurchRepository['findMemberContact']>(),
    findUserName: vi.fn<ChurchRepository['findUserName']>(),
  } satisfies ChurchRepository;
}

export function createCycleRepositoryFake() {
  return {
    create: vi.fn<CycleRepository['create']>(),
    list: vi.fn<CycleRepository['list']>(),
    getById: vi.fn<CycleRepository['getById']>(),
    findOverlapping: vi.fn<CycleRepository['findOverlapping']>(),
    updateState: vi.fn<CycleRepository['updateState']>(),
    update: vi.fn<CycleRepository['update']>(),
    delete: vi.fn<CycleRepository['delete']>(),
    acquireChurchLock: vi.fn<CycleRepository['acquireChurchLock']>(),
  } satisfies CycleRepository;
}

export function createEventRepositoryFake() {
  return {
    getMinistryId: vi.fn<EventRepository['getMinistryId']>(),
    getById: vi.fn<EventRepository['getById']>(),
    getWithEventTimeBlocks: vi.fn<EventRepository['getWithEventTimeBlocks']>(),
    listByMinistry: vi.fn<EventRepository['listByMinistry']>(),
    create: vi.fn<EventRepository['create']>(),
    updateStatus: vi.fn<EventRepository['updateStatus']>(),
    update: vi.fn<EventRepository['update']>(),
  } satisfies EventRepository;
}

export function createEventTemplateRepositoryFake() {
  return {
    create: vi.fn<EventTemplateRepository['create']>(),
    update: vi.fn<EventTemplateRepository['update']>(),
    delete: vi.fn<EventTemplateRepository['delete']>(),
    list: vi.fn<EventTemplateRepository['list']>(),
    getById: vi.fn<EventTemplateRepository['getById']>(),
    getByIds: vi.fn<EventTemplateRepository['getByIds']>(),
    getUsage: vi.fn<EventTemplateRepository['getUsage']>(),
  } satisfies EventTemplateRepository;
}

export function createEventTimeBlockRepositoryFake() {
  return {
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
}

export function createMinistryRepositoryFake() {
  return {
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
}

export function createMinistryParticipationRepositoryFake() {
  return {
    listScheduleLastTold: vi
      .fn<MinistryParticipationRepository['listScheduleLastTold']>()
      .mockResolvedValue([]),
    saveScheduleLastTold:
      vi.fn<MinistryParticipationRepository['saveScheduleLastTold']>(),
    getById: vi.fn<MinistryParticipationRepository['getById']>(),
    lockById: vi.fn<MinistryParticipationRepository['lockById']>(),
    lockSchedule: vi.fn<MinistryParticipationRepository['lockSchedule']>(),
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
    addInclusion: vi.fn<MinistryParticipationRepository['addInclusion']>(),
    removeInclusion:
      vi.fn<MinistryParticipationRepository['removeInclusion']>(),
    touch: vi.fn<MinistryParticipationRepository['touch']>(),
    findAvailabilityRequestedAt:
      vi.fn<MinistryParticipationRepository['findAvailabilityRequestedAt']>(),
    listScheduleSummaries:
      vi.fn<MinistryParticipationRepository['listScheduleSummaries']>(),
    listScheduleServingStates:
      vi.fn<MinistryParticipationRepository['listScheduleServingStates']>(),
    countScheduleLateMarks:
      vi.fn<MinistryParticipationRepository['countScheduleLateMarks']>(),
    countScheduleChecks:
      vi.fn<MinistryParticipationRepository['countScheduleChecks']>(),
  } satisfies MinistryParticipationRepository;
}

export function createNotificationRepositoryFake() {
  return {
    create: vi.fn<NotificationRepository['create']>(),
    list: vi.fn<NotificationRepository['list']>(),
    countUnread: vi.fn<NotificationRepository['countUnread']>(),
    markRead: vi.fn<NotificationRepository['markRead']>(),
    markAllRead: vi.fn<NotificationRepository['markAllRead']>(),
  } satisfies NotificationRepository;
}

export function createPlanningEventRepositoryFake() {
  return {
    createEvent: vi.fn<PlanningEventRepository['createEvent']>(),
    updateEvent: vi.fn<PlanningEventRepository['updateEvent']>(),
    getEvent: vi.fn<PlanningEventRepository['getEvent']>(),
    deleteEvent: vi.fn<PlanningEventRepository['deleteEvent']>(),
    listCycleEvents: vi.fn<PlanningEventRepository['listCycleEvents']>(),
    createEventTimeBlock:
      vi.fn<PlanningEventRepository['createEventTimeBlock']>(),
    seedParticipations: vi.fn<PlanningEventRepository['seedParticipations']>(),
  } satisfies PlanningEventRepository;
}

export function createRoleRepositoryFake() {
  return {
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
}

export function createSectorRepositoryFake() {
  return {
    listByMinistry: vi.fn<SectorRepository['listByMinistry']>(),
    getById: vi.fn<SectorRepository['getById']>(),
    lockActive: vi.fn<SectorRepository['lockActive']>(),
    create: vi.fn<SectorRepository['create']>(),
    rename: vi.fn<SectorRepository['rename']>(),
    lockActiveForArchive: vi.fn<SectorRepository['lockActiveForArchive']>(),
    listArchiveBlockers: vi.fn<SectorRepository['listArchiveBlockers']>(),
    markArchived: vi.fn<SectorRepository['markArchived']>(),
  } satisfies SectorRepository;
}

export function createShiftRepositoryFake() {
  return {
    listConflictFacts: vi
      .fn<ShiftRepository['listConflictFacts']>()
      .mockResolvedValue([]),
    createMany: vi.fn<ShiftRepository['createMany']>(),
    getById: vi.fn<ShiftRepository['getById']>(),
    listByParticipation: vi.fn<ShiftRepository['listByParticipation']>(),
    listByEventTimeBlock: vi.fn<ShiftRepository['listByEventTimeBlock']>(),
    update: vi.fn<ShiftRepository['update']>(),
    deleteById: vi.fn<ShiftRepository['deleteById']>(),
    deleteByEventTimeBlock: vi.fn<ShiftRepository['deleteByEventTimeBlock']>(),
    saveRequirement: vi.fn<ShiftRepository['saveRequirement']>(),
    deleteRequirements: vi.fn<ShiftRepository['deleteRequirements']>(),
    listRequirementsByParticipation:
      vi.fn<ShiftRepository['listRequirementsByParticipation']>(),
    getRequirementForShift: vi.fn<ShiftRepository['getRequirementForShift']>(),
  } satisfies ShiftRepository;
}

export function createSwapRequestRepositoryFake() {
  return {
    create: vi.fn<SwapRequestRepository['create']>(),
    listForLeader: vi
      .fn<SwapRequestRepository['listForLeader']>()
      .mockResolvedValue([]),
    findOpenByAssignment: vi
      .fn<SwapRequestRepository['findOpenByAssignment']>()
      .mockResolvedValue(null),
    findLatestByAssignment: vi
      .fn<SwapRequestRepository['findLatestByAssignment']>()
      .mockResolvedValue(null),
    listOpenAssignmentIds: vi
      .fn<SwapRequestRepository['listOpenAssignmentIds']>()
      .mockResolvedValue([]),
    closeOpenByAssignment:
      vi.fn<SwapRequestRepository['closeOpenByAssignment']>(),
    findById: vi
      .fn<SwapRequestRepository['findById']>()
      .mockResolvedValue(null),
    closeOpenById: vi.fn<SwapRequestRepository['closeOpenById']>(),
  } satisfies SwapRequestRepository;
}

export function createUnavailableShiftRepositoryFake() {
  return {
    listByVolunteerForEvent:
      vi.fn<UnavailableShiftRepository['listByVolunteerForEvent']>(),
    listByVolunteers: vi.fn<UnavailableShiftRepository['listByVolunteers']>(),
    listByParticipation:
      vi.fn<UnavailableShiftRepository['listByParticipation']>(),
    listUnavailableShiftsByCheck:
      vi.fn<UnavailableShiftRepository['listUnavailableShiftsByCheck']>(),
    replaceUnavailableShiftsForCheck:
      vi.fn<UnavailableShiftRepository['replaceUnavailableShiftsForCheck']>(),
  } satisfies UnavailableShiftRepository;
}

export function createUsualSetupRepositoryFake() {
  return {
    listByMinistry: vi.fn<UsualSetupRepository['listByMinistry']>(),
    listByChurch: vi.fn<UsualSetupRepository['listByChurch']>(),
    upsertBlock: vi.fn<UsualSetupRepository['upsertBlock']>(),
  } satisfies UsualSetupRepository;
}

export function createVolunteerRepositoryFake() {
  return {
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
    listMemberMinistryIds:
      vi.fn<VolunteerRepository['listMemberMinistryIds']>(),
    listMinistryMemberships:
      vi.fn<VolunteerRepository['listMinistryMemberships']>(),
    listActiveLeaderUserIds:
      vi.fn<VolunteerRepository['listActiveLeaderUserIds']>(),
    listActiveMinistryLeaderships:
      vi.fn<VolunteerRepository['listActiveMinistryLeaderships']>(),
  } satisfies VolunteerRepository;
}

export function createAuthorityManagerFake() {
  return {
    decideAuthority: vi.fn<IAuthorityManager['decideAuthority']>(async () => ({
      allowed: true,
    })),
  };
}
