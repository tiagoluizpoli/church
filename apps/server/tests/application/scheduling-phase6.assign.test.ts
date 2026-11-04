import { appConfig } from '@church/app-config';
import { parseInstant } from '@church/time';
import { describe, expect, it, vi } from 'vitest';
import { DbAssignmentManager } from '@/application/db-assignment-manager';
import { DbParticipationManager } from '@/application/db-participation-manager';
import { DbVolunteerManager } from '@/application/db-volunteer-manager';
import {
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
import { Event } from '@/domain/entities/event';
import { Ministry } from '@/domain/entities/ministry';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { Role } from '@/domain/entities/role';
import { Shift } from '@/domain/entities/shift';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';
import { UnavailableShift } from '@/domain/entities/unavailable-shift';
import { Volunteer } from '@/domain/entities/volunteer';
import { createChurchNotificationsSpy } from '@/tests/test-support/church-notifications-spy';

const churchId = ChurchId.from('church');
const ministryId = MinistryId.from('ministry');
const participationId = MinistryParticipationId.from('participation');
const cycleId = CycleId.from('cycle');
const shiftId = ShiftId.from('shift');
const volunteerId = VolunteerId.from('volunteer');
const actorId = UserId.from('actor');
const shiftRequirementId = ShiftRequirementId.from({ raw: 'requirement' });
const start = parseInstant({ value: '2026-08-10T09:00:00Z' });
const end = parseInstant({ value: '2026-08-10T10:00:00Z' });

function createFixture() {
  const assignmentRepository = {
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
    updateStatus: vi.fn<AssignmentRepository['updateStatus']>(),
    countByVolunteerInRange:
      vi.fn<AssignmentRepository['countByVolunteerInRange']>(),
    deleteByEvent: vi.fn<AssignmentRepository['deleteByEvent']>(),
    deleteById: vi.fn<AssignmentRepository['deleteById']>(),
    listDeclinedByEventTimeBlock:
      vi.fn<AssignmentRepository['listDeclinedByEventTimeBlock']>(),
  } satisfies AssignmentRepository;
  const assignmentAuditRepository = {
    create: vi.fn<AssignmentAuditRepository['create']>(),
    listByCycle: vi.fn<AssignmentAuditRepository['listByCycle']>(),
    listByChurch: vi.fn<AssignmentAuditRepository['listByChurch']>(),
    listByActor: vi.fn<AssignmentAuditRepository['listByActor']>(),
    listByEvent: vi.fn<AssignmentAuditRepository['listByEvent']>(),
  } satisfies AssignmentAuditRepository;
  const shiftRepository = {
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
  const ministryParticipationRepository = {
    getById: vi.fn<MinistryParticipationRepository['getById']>(),
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
  } satisfies VolunteerRepository;
  const unavailableShiftRepository = {
    listByVolunteerForEvent:
      vi.fn<UnavailableShiftRepository['listByVolunteerForEvent']>(),
    listByVolunteers: vi.fn<UnavailableShiftRepository['listByVolunteers']>(),
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
  const planningEventRepository = {
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
  const ministryRepository = {
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
  const roleRepository = {
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
  const notificationRepository = {
    create: vi.fn<NotificationRepository['create']>(),
    list: vi.fn<NotificationRepository['list']>(),
    countUnread: vi.fn<NotificationRepository['countUnread']>(),
    markRead: vi.fn<NotificationRepository['markRead']>(),
    markAllRead: vi.fn<NotificationRepository['markAllRead']>(),
  } satisfies NotificationRepository;
  const eventRepository = {
    getMinistryId: vi.fn<EventRepository['getMinistryId']>(),
    getById: vi.fn<EventRepository['getById']>(),
    getWithEventTimeBlocks: vi.fn<EventRepository['getWithEventTimeBlocks']>(),
    listByMinistry: vi.fn<EventRepository['listByMinistry']>(),
    create: vi.fn<EventRepository['create']>(),
    updateStatus: vi.fn<EventRepository['updateStatus']>(),
    update: vi.fn<EventRepository['update']>(),
  } satisfies EventRepository;
  const availabilityCheckRepository = {
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
  const tx = {} as TransactionContext;
  const unitOfWork: UnitOfWork = {
    run: vi.fn(async (work) => work(tx)),
    runWith: vi.fn(async ({ work }) => work(tx)),
  };
  const notifications = createChurchNotificationsSpy();
  const participation = new MinistryParticipation({
    id: participationId,
    props: {
      churchId,
      ministryId,
      eventId: 'event',
      state: 'availability_requested',
    },
  });
  const shift = new Shift({
    id: shiftId,
    props: {
      churchId,
      participationId,
      eventTimeBlockId: 'block',
      startTime: start,
      endTime: end,
      label: 'Morning',
    },
  });
  const requirement = new ShiftRequirement({
    id: shiftRequirementId,
    props: {
      churchId,
      participationId,
      eventTimeBlockId: 'block',
      shiftId,
      roleId: 'role',
      sectorId: 'sector',
      sectorName: 'Alpha',
      peopleNeeded: 1,
    },
  });
  const assignment = new Assignment({
    id: 'assignment',
    props: {
      churchId,
      participationId,
      eventTimeBlockId: 'block',
      shiftId,
      volunteerId,
      roleId: 'role',
      shiftRequirementId,
      status: 'pending',
    },
  });
  const volunteer = new Volunteer({
    id: volunteerId,
    props: { churchId, userId: 'user', name: 'Alice Alpha' },
  });
  const event = new Event({
    id: 'event',
    props: { churchId, cycleId, title: 'Service', start, end },
  });
  const ministry = new Ministry({
    id: ministryId,
    props: { churchId, name: 'Welcome' },
  });
  shiftRepository.getById.mockResolvedValue(shift);
  shiftRepository.getRequirementForShift.mockResolvedValue(requirement);
  shiftRepository.listRequirementsByParticipation.mockResolvedValue([
    requirement,
  ]);
  ministryParticipationRepository.getById.mockResolvedValue(participation);
  ministryParticipationRepository.findByMinistryEvent.mockResolvedValue(
    participation,
  );
  volunteerRepository.hasMembershipInMinistry.mockResolvedValue(true);
  volunteerRepository.hasRoleQualification.mockResolvedValue(true);
  volunteerRepository.listQualifiedForRole.mockResolvedValue([volunteer]);
  volunteerRepository.listMinistryMemberships.mockResolvedValue([]);
  volunteerRepository.listByIds.mockResolvedValue([volunteer]);
  assignmentRepository.listByShift.mockResolvedValue([]);
  assignmentRepository.listByVolunteers.mockResolvedValue([]);
  assignmentRepository.listByVolunteerInRange.mockResolvedValue([]);
  assignmentRepository.listByParticipation.mockResolvedValue([assignment]);
  assignmentRepository.create.mockResolvedValue(assignment);
  unavailableShiftRepository.listByVolunteers.mockResolvedValue([]);
  planningEventRepository.listCycleEvents.mockResolvedValue([
    { event, eventTimeBlocks: [] },
  ]);
  ministryRepository.getById.mockResolvedValue(ministry);
  const participationManager = new DbParticipationManager({
    participationRepository: ministryParticipationRepository,
    shiftRepository,
    eventRepository: planningEventRepository,
    assignmentRepository,
    unavailableShiftRepository,
    eventTimeBlockRepository,
    volunteerRepository,
    ministryRepository,
    usualSetupRepository,
    eventTemplateRepository,
    cycleRepository,
    roleRepository,
    sectorRepository,
    notifications,
    unitOfWork,
  });
  const assignmentManager = new DbAssignmentManager({
    assignmentRepo: assignmentRepository,
    auditRepo: assignmentAuditRepository,
    shiftRepository,
    participationRepository: ministryParticipationRepository,
    volunteerRepository,
    unavailableShiftRepository,
    cycleRepository,
    unitOfWork,
  });
  const volunteerManager = new DbVolunteerManager({
    volunteerRepo: volunteerRepository,
    assignmentRepo: assignmentRepository,
    unavailableShiftRepo: unavailableShiftRepository,
    notificationRepo: notificationRepository,
    eventRepo: eventRepository,
    shiftRepo: shiftRepository,
    ministryRepo: ministryRepository,
    participationRepo: ministryParticipationRepository,
    roleRepo: roleRepository,
    availabilityCheckRepo: availabilityCheckRepository,
    unitOfWork,
    config: appConfig,
  });
  return {
    participationManager,
    assignmentManager,
    volunteerManager,
    participation,
    shift,
    requirement,
    assignment,
    volunteer,
    event,
    ministry,
    shiftRepository,
    ministryParticipationRepository,
    volunteerRepository,
    assignmentRepository,
    unavailableShiftRepository,
    planningEventRepository,
    eventRepository,
    roleRepository,
    notifications,
    tx,
  };
}

describe('Assignment and publication managers', () => {
  it('caps completion per requirement and excludes declined and cancelled assignments', async () => {
    const f = createFixture();
    const beta = new ShiftRequirement({
      id: 'beta',
      props: {
        churchId,
        participationId,
        eventTimeBlockId: 'block',
        shiftId,
        roleId: 'role',
        sectorId: 'beta-sector',
        sectorName: 'Beta',
        peopleNeeded: 1,
      },
    });
    const extra = new Assignment({
      id: 'extra',
      props: {
        churchId,
        participationId,
        eventTimeBlockId: 'block',
        shiftId,
        volunteerId: 'other',
        roleId: 'role',
        shiftRequirementId,
        status: 'confirmed',
      },
    });
    const declined = new Assignment({
      id: 'declined',
      props: {
        churchId,
        participationId,
        eventTimeBlockId: 'block',
        shiftId,
        volunteerId: 'third',
        roleId: 'role',
        shiftRequirementId: 'beta',
        status: 'declined',
      },
    });
    const cancelled = new Assignment({
      id: 'cancelled',
      props: {
        churchId,
        participationId,
        eventTimeBlockId: 'block',
        shiftId,
        volunteerId: 'fourth',
        roleId: 'role',
        shiftRequirementId: 'beta',
        status: 'cancelled',
      },
    });
    f.shiftRepository.listRequirementsByParticipation.mockResolvedValue([
      f.requirement,
      beta,
    ]);
    f.assignmentRepository.listByParticipation.mockResolvedValue([
      f.assignment,
      extra,
      declined,
      cancelled,
    ]);
    await expect(
      f.participationManager.getCompletion({ churchId, participationId }),
    ).resolves.toMatchObject({
      peopleNeeded: 2,
      assignedCount: 2,
      completionPercent: 50,
    });
  });

  it('creates a pending assignment for the requested requirement and starts assigning', async () => {
    const f = createFixture();
    const result = await f.assignmentManager.createParticipationAssignment({
      churchId,
      shiftId,
      volunteerId,
      shiftRequirementId,
      actorId,
    });
    expect(result.assignment).toBe(f.assignment);
    expect(result.warnings).toEqual([]);
    expect(f.assignmentRepository.create).toHaveBeenCalledWith({
      churchId,
      input: {
        eventTimeBlockId: 'block',
        participationId,
        shiftId,
        volunteerId,
        shiftRequirementId,
        status: 'pending',
        assignedBy: actorId,
      },
      tx: f.tx,
    });
    expect(f.ministryParticipationRepository.updateState).toHaveBeenCalledWith({
      churchId,
      participationId,
      state: 'assigning',
      tx: f.tx,
    });
  });

  it('rejects overlapping active assignments', async () => {
    const f = createFixture();
    const overlap = new Assignment({
      id: 'overlap',
      props: {
        churchId,
        participationId,
        eventTimeBlockId: 'block',
        shiftId: 'other-shift',
        volunteerId,
        roleId: 'role',
        shiftRequirementId,
        status: 'confirmed',
      },
    });
    f.assignmentRepository.listByVolunteerInRange.mockResolvedValue([overlap]);
    await expect(
      f.assignmentManager.createParticipationAssignment({
        churchId,
        shiftId,
        volunteerId,
        shiftRequirementId,
        actorId,
      }),
    ).rejects.toMatchObject({ reason: 'DUPLICATE_ASSIGNMENT' });
    expect(f.assignmentRepository.create).not.toHaveBeenCalled();
  });

  it('requires confirmation before publishing an incomplete participation and notifies its assigned volunteers', async () => {
    const f = createFixture();
    f.assignmentRepository.listByParticipation.mockResolvedValue([]);
    const input = { churchId, cycleId, ministryId, userId: actorId };
    await expect(
      f.participationManager.publishCycle(input),
    ).resolves.toMatchObject({ published: false, belowFull: true });
    expect(
      f.ministryParticipationRepository.updateState,
    ).not.toHaveBeenCalled();
    f.assignmentRepository.listByParticipation.mockResolvedValue([
      f.assignment,
    ]);
    f.shiftRepository.listRequirementsByParticipation.mockResolvedValue([
      new ShiftRequirement({
        id: shiftRequirementId,
        props: {
          churchId,
          participationId,
          eventTimeBlockId: 'block',
          shiftId,
          roleId: 'role',
          sectorId: 'sector',
          sectorName: 'Alpha',
          peopleNeeded: 2,
        },
      }),
    ]);
    await expect(
      f.participationManager.publishCycle({ ...input, confirmBelowFull: true }),
    ).resolves.toMatchObject({ published: true, belowFull: true });
    expect(f.ministryParticipationRepository.updateState).toHaveBeenCalledWith({
      churchId,
      participationId,
      state: 'published',
      tx: f.tx,
    });
    expect(f.notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'schedule_published',
        to: [{ userId: 'user', churchId }],
      }),
    );
  });

  it('shows only published participation assignments with visible statuses', async () => {
    const f = createFixture();
    const published = new MinistryParticipation({
      id: 'published',
      props: { churchId, ministryId, eventId: 'event', state: 'published' },
    });
    const visible = new Assignment({
      id: 'visible',
      props: {
        churchId,
        participationId: 'published',
        eventTimeBlockId: 'block',
        shiftId,
        volunteerId,
        roleId: 'role',
        shiftRequirementId,
        status: 'confirmed',
      },
    });
    const draft = new Assignment({
      id: 'draft',
      props: {
        churchId,
        participationId: 'published',
        eventTimeBlockId: 'block',
        shiftId,
        volunteerId,
        roleId: 'role',
        shiftRequirementId,
        status: 'draft',
      },
    });
    f.assignmentRepository.listByVolunteer.mockResolvedValue([
      visible,
      draft,
      f.assignment,
    ]);
    f.ministryParticipationRepository.listByIds.mockResolvedValue([
      published,
      f.participation,
    ]);
    await expect(
      f.volunteerManager.getPublishedSchedule({ churchId, volunteerId }),
    ).resolves.toEqual([visible]);
  });

  it('ranks available volunteers by earlier service and marks unavailable volunteers last', async () => {
    const f = createFixture();
    const ada = new Volunteer({
      id: 'ada',
      props: { churchId, userId: 'ada-user', name: 'Ada Lovelace' },
    });
    const grace = new Volunteer({
      id: 'grace',
      props: { churchId, userId: 'grace-user', name: 'Grace Hopper' },
    });
    const alan = new Volunteer({
      id: 'alan',
      props: { churchId, userId: 'alan-user', name: 'Alan Turing' },
    });
    const older = new Shift({
      id: 'older',
      props: {
        churchId,
        participationId,
        eventTimeBlockId: 'block',
        startTime: parseInstant({ value: '2026-08-01T09:00:00Z' }),
        endTime: parseInstant({ value: '2026-08-01T10:00:00Z' }),
      },
    });
    const newer = new Shift({
      id: 'newer',
      props: {
        churchId,
        participationId,
        eventTimeBlockId: 'block',
        startTime: parseInstant({ value: '2026-08-02T09:00:00Z' }),
        endTime: parseInstant({ value: '2026-08-02T10:00:00Z' }),
      },
    });
    const prior = (id: string, volunteer: string, priorShift: string) =>
      new Assignment({
        id,
        props: {
          churchId,
          participationId,
          eventTimeBlockId: 'block',
          shiftId: priorShift,
          volunteerId: volunteer,
          roleId: 'role',
          shiftRequirementId,
          status: 'confirmed',
        },
      });
    f.volunteerRepository.listQualifiedForRole.mockResolvedValue([
      grace,
      alan,
      ada,
    ]);
    f.assignmentRepository.listByVolunteers.mockResolvedValue([
      prior('a', 'ada', 'older'),
      prior('g', 'grace', 'newer'),
    ]);
    f.shiftRepository.getById.mockImplementation(async ({ shiftId: id }) =>
      id === older.id ? older : id === newer.id ? newer : f.shift,
    );
    f.unavailableShiftRepository.listByVolunteers.mockResolvedValue([
      new UnavailableShift({
        props: {
          churchId,
          availabilityCheckId: 'check',
          shiftId,
          volunteerId: 'alan',
          shiftStartTime: start,
          shiftEndTime: end,
        },
      }),
    ]);
    const eligible = await f.participationManager.listEligibleVolunteers({
      churchId,
      shiftId,
    });
    expect(
      eligible.map((item) => [item.volunteerName, item.isAvailable]),
    ).toEqual([
      ['Ada Lovelace', true],
      ['Grace Hopper', true],
      ['Alan Turing', false],
    ]);
  });

  it('maps same-role sector requirements to their own assignments and open places', async () => {
    const f = createFixture();
    const beta = new ShiftRequirement({
      id: 'beta',
      props: {
        churchId,
        participationId,
        eventTimeBlockId: 'block',
        shiftId,
        roleId: 'role',
        sectorId: 'beta-sector',
        sectorName: 'Beta',
        peopleNeeded: 1,
      },
    });
    const declined = new Assignment({
      id: 'declined',
      props: {
        churchId,
        participationId,
        eventTimeBlockId: 'block',
        shiftId,
        volunteerId,
        roleId: 'role',
        shiftRequirementId: 'beta',
        status: 'declined',
      },
    });
    f.volunteerRepository.listMemberMinistryIds.mockResolvedValue([ministryId]);
    f.ministryParticipationRepository.listByMinistry.mockResolvedValue([
      f.participation,
    ]);
    f.eventRepository.getById.mockResolvedValue(f.event);
    f.shiftRepository.listByParticipation.mockResolvedValue([f.shift]);
    f.shiftRepository.listRequirementsByParticipation.mockResolvedValue([
      f.requirement,
      beta,
    ]);
    f.assignmentRepository.listByParticipation.mockResolvedValue([
      f.assignment,
      declined,
    ]);
    f.roleRepository.listByMinistry.mockResolvedValue([
      new Role({ id: 'role', props: { churchId, ministryId, name: 'Host' } }),
    ]);
    const schedule = await f.volunteerManager.getMinistrySchedule({
      churchId,
      ministryId,
      volunteerId,
    });
    expect(schedule.events[0]?.rows).toEqual([
      expect.objectContaining({
        roleName: 'Host',
        sectorName: 'Alpha',
        volunteerDisplayName: 'Alice A.',
        confirmationState: 'pending',
      }),
      expect.objectContaining({
        roleName: 'Host',
        sectorName: 'Beta',
        volunteerDisplayName: 'Alice A.',
        confirmationState: 'declined',
      }),
      expect.objectContaining({
        roleName: 'Host',
        sectorName: 'Beta',
        confirmationState: 'open',
      }),
    ]);
    expect(
      f.ministryParticipationRepository.listByMinistry,
    ).toHaveBeenCalledWith({ churchId, ministryId, state: 'published' });
  });

  it('warns when an assignment is requested for an unavailable volunteer', async () => {
    const f = createFixture();
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
    const result = await f.assignmentManager.createParticipationAssignment({
      churchId,
      shiftId,
      volunteerId,
      shiftRequirementId,
      actorId,
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({ type: 'UNAVAILABLE' }),
    ]);
  });

  it('refuses a duplicate on the same shift and a requirement from another shift', async () => {
    const f = createFixture();
    f.assignmentRepository.listByShift.mockResolvedValue([f.assignment]);
    const input = {
      churchId,
      shiftId,
      volunteerId,
      shiftRequirementId,
      actorId,
    };
    await expect(
      f.assignmentManager.createParticipationAssignment(input),
    ).rejects.toMatchObject({ reason: 'DUPLICATE_ASSIGNMENT' });
    expect(f.assignmentRepository.create).not.toHaveBeenCalled();
    f.shiftRepository.getRequirementForShift.mockRejectedValue(
      new Error('Shift requirement not found'),
    );
    await expect(
      f.assignmentManager.createParticipationAssignment(input),
    ).rejects.toThrow('Shift requirement not found');
  });

  it('breaks equal eligibility ties by name and flags overlapping service', async () => {
    const f = createFixture();
    const zoe = new Volunteer({
      id: 'zoe',
      props: { churchId, userId: 'zoe-user', name: 'Zoe' },
    });
    const amy = new Volunteer({
      id: 'amy',
      props: { churchId, userId: 'amy-user', name: 'Amy' },
    });
    f.volunteerRepository.listQualifiedForRole.mockResolvedValue([zoe, amy]);
    const eligible = await f.participationManager.listEligibleVolunteers({
      churchId,
      shiftId,
    });
    expect(eligible.map((item) => item.volunteerName)).toEqual(['Amy', 'Zoe']);
    const overlapShift = new Shift({
      id: 'overlap',
      props: {
        churchId,
        participationId,
        eventTimeBlockId: 'block',
        startTime: start,
        endTime: end,
      },
    });
    const overlap = new Assignment({
      id: 'overlap-assignment',
      props: {
        churchId,
        participationId,
        eventTimeBlockId: 'block',
        shiftId: 'overlap',
        volunteerId: 'amy',
        roleId: 'role',
        shiftRequirementId,
        status: 'confirmed',
      },
    });
    f.assignmentRepository.listByVolunteers.mockResolvedValue([overlap]);
    f.shiftRepository.getById.mockImplementation(async ({ shiftId: id }) =>
      id === overlapShift.id ? overlapShift : f.shift,
    );
    const conflicted = await f.participationManager.listEligibleVolunteers({
      churchId,
      shiftId,
    });
    expect(
      conflicted.find((item) => item.volunteerName === 'Amy'),
    ).toMatchObject({ hasConflict: true });
  });
});
