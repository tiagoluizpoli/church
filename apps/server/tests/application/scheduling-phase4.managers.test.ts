import { NotFoundError } from '@church/core';
import { parseInstant, parseTimeOfDay } from '@church/time';
import { describe, expect, it, vi } from 'vitest';
import { DbParticipationManager } from '@/application/db-participation-manager';
import {
  ChurchId,
  CycleId,
  EventId,
  EventTemplateId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  RoleId,
  SectorId,
  ShiftId,
  ShiftRequirementId,
  TemplateTimeBlockId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { CycleRepository } from '@/domain/contracts/infrastructure/cycle.repository';
import type { EventTemplateRepository } from '@/domain/contracts/infrastructure/event-template.repository';
import type { EventTimeBlockRepository } from '@/domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
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
import { EventTemplate } from '@/domain/entities/event-template';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { ParticipationEventTimeBlockInclusion } from '@/domain/entities/participation-event-time-block-inclusion';
import { Role } from '@/domain/entities/role';
import { Shift } from '@/domain/entities/shift';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';
import { TemplateTimeBlock } from '@/domain/entities/template-time-block';
import { UsualSetup } from '@/domain/entities/usual-setup';
import { Volunteer } from '@/domain/entities/volunteer';
import {
  IllegalStateTransitionError,
  InvalidRequiredCountError,
  InvalidShiftSplitError,
  ShiftOutOfBoundsError,
} from '@/domain/errors';
import { createChurchNotificationsSpy } from '@/tests/test-support/church-notifications-spy';

function createRepositories() {
  const ministryParticipationRepository: MinistryParticipationRepository = {
    getById: vi.fn(),
    findByMinistryEvent: vi.fn(),
    create: vi.fn(),
    listByEvent: vi.fn(),
    hasCycleStaffing: vi.fn(),
    listByMinistry: vi.fn(),
    listByIds: vi.fn(),
    updateState: vi.fn(),
    listInclusions: vi.fn(),
    replaceInclusions: vi.fn(),
    addInclusion: vi.fn(),
    touch: vi.fn(),
    listScheduleSummaries: vi.fn(),
  };
  const shiftRepository: ShiftRepository = {
    createMany: vi.fn(),
    getById: vi.fn(),
    listByParticipation: vi.fn(),
    listByEventTimeBlock: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn(),
    deleteByEventTimeBlock: vi.fn(),
    upsertRequirement: vi.fn(),
    listRequirementsByParticipation: vi.fn(),
    getRequirementForShift: vi.fn(),
  };
  const planningEventRepository: PlanningEventRepository = {
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    getEvent: vi.fn(),
    deleteEvent: vi.fn(),
    listCycleEvents: vi.fn(),
    createEventTimeBlock: vi.fn(),
    seedParticipations: vi.fn(),
  };
  const assignmentRepository: AssignmentRepository = {
    create: vi.fn(),
    getById: vi.fn(),
    findByEventTimeBlockAndVolunteer: vi.fn(),
    listByEventTimeBlock: vi.fn(),
    listByEvent: vi.fn(),
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
  const unavailableShiftRepository: UnavailableShiftRepository = {
    listByVolunteerForEvent: vi.fn(),
    listByVolunteers: vi.fn(),
    listUnavailableShiftsByCheck: vi.fn(),
    replaceUnavailableShiftsForCheck: vi.fn(),
  };
  const eventTimeBlockRepository: EventTimeBlockRepository = {
    getById: vi.fn(),
    listByEvent: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn(),
    findOverlapping: vi.fn(),
    deleteByEvent: vi.fn(),
    countActiveAssignments: vi.fn(),
  };
  const volunteerRepository: VolunteerRepository = {
    getById: vi.fn(),
    findByUserId: vi.fn(),
    listByMinistry: vi.fn(),
    hasMembershipInMinistry: vi.fn(),
    hasRoleQualification: vi.fn(),
    listQualifiedForRole: vi.fn(),
    updateStatus: vi.fn(),
    findByUserIdGlobally: vi.fn(),
    hasLeadershipInMinistry: vi.fn(),
    listLedMinistries: vi.fn(),
    listByIds: vi.fn(),
    listMemberMinistryIds: vi.fn(),
    listMinistryMemberships: vi.fn(),
    listActiveLeaderUserIds: vi.fn(),
  };
  const ministryRepository: MinistryRepository = {
    getById: vi.fn(),
    listByChurch: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    lockActive: vi.fn(),
    listUnendedParticipationCycles: vi.fn(),
    archive: vi.fn(),
    getSettings: vi.fn(),
    updateDefaultDirection: vi.fn(),
  };
  const usualSetupRepository: UsualSetupRepository = {
    listByMinistry: vi.fn(),
    listByChurch: vi.fn(),
    upsertBlock: vi.fn(),
  };
  const eventTemplateRepository: EventTemplateRepository = {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    getByIds: vi.fn(),
    getUsage: vi.fn(),
  };
  const cycleRepository: CycleRepository = {
    create: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    findOverlapping: vi.fn(),
    updateState: vi.fn(),
    acquireChurchLock: vi.fn(),
  };
  const roleRepository: RoleRepository = {
    getById: vi.fn(),
    listByMinistry: vi.fn(),
    listActiveByMinistry: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    lockActiveForUse: vi.fn(),
    lockActiveForArchive: vi.fn(),
    listArchiveBlockers: vi.fn(),
    archive: vi.fn(),
  };
  const sectorRepository: SectorRepository = {
    listByMinistry: vi.fn(),
    getById: vi.fn(),
    lockActive: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    lockActiveForArchive: vi.fn(),
    listArchiveBlockers: vi.fn(),
    markArchived: vi.fn(),
  };
  return {
    ministryParticipationRepository,
    shiftRepository,
    planningEventRepository,
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
  };
}

const churchId = ChurchId.from('church');
const ministryId = MinistryId.from('ministry');
const eventId = EventId.from('event');
const participationId = MinistryParticipationId.from('participation');
const eventTimeBlockId = EventTimeBlockId.from('block');
const shiftId = ShiftId.from('shift');
const startTime = parseInstant({ value: '2026-08-02T12:00:00.000Z' });
const endTime = parseInstant({ value: '2026-08-02T15:00:00.000Z' });
const tx = {} as TransactionContext;

function createHarness(
  state: 'preparing' | 'availability_requested' | 'assigning' = 'preparing',
) {
  const repositories = createRepositories();
  const participation = new MinistryParticipation({
    props: { churchId, ministryId, eventId, state },
    id: participationId,
  });
  const block = new EventTimeBlock({
    props: { churchId, eventId, startTime, endTime },
    id: eventTimeBlockId,
  });
  const shift = new Shift({
    props: { churchId, participationId, eventTimeBlockId, startTime, endTime },
    id: shiftId,
  });
  vi.mocked(
    repositories.ministryParticipationRepository.getById,
  ).mockResolvedValue(participation);
  vi.mocked(
    repositories.ministryParticipationRepository.listInclusions,
  ).mockResolvedValue([]);
  vi.mocked(repositories.eventTimeBlockRepository.getById).mockResolvedValue(
    block,
  );
  vi.mocked(
    repositories.shiftRepository.listByEventTimeBlock,
  ).mockResolvedValue([]);
  vi.mocked(repositories.shiftRepository.getById).mockResolvedValue(shift);
  vi.mocked(repositories.shiftRepository.createMany).mockImplementation(
    async ({ shifts }) => shifts,
  );
  const unitOfWork: UnitOfWork = {
    run: async (work) => work(tx),
    runWith: async ({ work }) => work(tx),
  };
  const notifications = createChurchNotificationsSpy();
  const manager = new DbParticipationManager({
    ...repositories,
    participationRepository: repositories.ministryParticipationRepository,
    eventRepository: repositories.planningEventRepository,
    unitOfWork,
    notifications,
  });
  return { manager, repositories, participation, block, notifications };
}

describe('participation preparation', () => {
  it('includes a block by requesting a shift spanning the block', async () => {
    const { manager, repositories } = createHarness();
    await manager.setInclusions({
      churchId,
      participationId,
      eventTimeBlockIds: [eventTimeBlockId],
    });
    expect(
      repositories.ministryParticipationRepository.replaceInclusions,
    ).toHaveBeenCalledWith({
      churchId,
      participationId,
      eventTimeBlockIds: [eventTimeBlockId],
      tx,
    });
    expect(repositories.shiftRepository.createMany).toHaveBeenCalledWith({
      churchId,
      shifts: [expect.objectContaining({ startTime, endTime })],
      tx,
    });
    expect(
      repositories.ministryParticipationRepository.touch,
    ).toHaveBeenCalledWith({ churchId, participationId, tx });
  });

  it('splits a block into equal shifts within its bounds', async () => {
    const { manager, repositories } = createHarness();
    const result = await manager.splitShifts({
      churchId,
      participationId,
      eventTimeBlockId,
      strategy: { kind: 'equal-n', n: 3 },
    });
    expect(result).toHaveLength(3);
    expect(result[0]?.startTime).toEqual(startTime);
    expect(result[2]?.endTime).toEqual(endTime);
    expect(
      repositories.shiftRepository.deleteByEventTimeBlock,
    ).toHaveBeenCalledWith({ churchId, participationId, eventTimeBlockId, tx });
    expect(
      repositories.ministryParticipationRepository.addInclusion,
    ).toHaveBeenCalledWith({ churchId, participationId, eventTimeBlockId, tx });
  });

  it('rejects an out-of-bounds split before replacing shifts', async () => {
    const { manager, repositories } = createHarness();
    await expect(
      manager.splitShifts({
        churchId,
        participationId,
        eventTimeBlockId,
        strategy: {
          kind: 'manual',
          spans: [
            {
              startTime: parseInstant({ value: '2026-08-02T11:00:00.000Z' }),
              endTime,
            },
          ],
        },
      }),
    ).rejects.toThrow(ShiftOutOfBoundsError);
    expect(
      repositories.shiftRepository.deleteByEventTimeBlock,
    ).not.toHaveBeenCalled();
  });

  it('treats a block from another event as missing', async () => {
    const { manager, repositories } = createHarness();
    vi.mocked(repositories.eventTimeBlockRepository.getById).mockResolvedValue(
      new EventTimeBlock({
        props: {
          churchId,
          eventId: EventId.from('another-event'),
          startTime,
          endTime,
        },
        id: eventTimeBlockId,
      }),
    );
    await expect(
      manager.splitShifts({
        churchId,
        participationId,
        eventTimeBlockId,
        strategy: { kind: 'equal-n', n: 2 },
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('refuses shift and inclusion changes after availability is requested', async () => {
    const { manager, repositories } = createHarness('availability_requested');
    await expect(
      manager.setInclusions({
        churchId,
        participationId,
        eventTimeBlockIds: [],
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
    await expect(
      manager.splitShifts({
        churchId,
        participationId,
        eventTimeBlockId,
        strategy: { kind: 'equal-n', n: 2 },
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
    await expect(
      manager.updateShift({ churchId, shiftId, label: 'blocked' }),
    ).rejects.toThrow(IllegalStateTransitionError);
    await expect(manager.deleteShift({ churchId, shiftId })).rejects.toThrow(
      IllegalStateTransitionError,
    );
    expect(repositories.shiftRepository.deleteById).not.toHaveBeenCalled();
  });
});

it('reports full completion when no staffing places are required', async () => {
  const { manager, repositories } = createHarness();
  vi.mocked(
    repositories.shiftRepository.listRequirementsByParticipation,
  ).mockResolvedValue([]);
  vi.mocked(
    repositories.assignmentRepository.listByParticipation,
  ).mockResolvedValue([]);
  await expect(
    manager.getCompletion({ churchId, participationId }),
  ).resolves.toEqual({
    participationId,
    peopleNeeded: 0,
    assignedCount: 0,
    completionPercent: 100,
  });
});

it('requests a bounded shift update and deletion during preparation', async () => {
  const { manager, repositories } = createHarness();
  const newStart = new Date('2026-08-02T13:00:00.000Z');
  await manager.updateShift({
    churchId,
    shiftId,
    startTime: newStart,
    label: 'Door',
  });
  expect(repositories.shiftRepository.update).toHaveBeenCalledWith({
    churchId,
    shiftId,
    startTime: newStart,
    endTime: new Date('2026-08-02T15:00:00.000Z'),
    label: 'Door',
    tx,
  });
  await manager.deleteShift({ churchId, shiftId });
  expect(repositories.shiftRepository.deleteById).toHaveBeenCalledWith({
    churchId,
    shiftId,
    tx,
  });
});

it('rejects a staffing requirement below one without writing it', async () => {
  const { manager, repositories } = createHarness();
  await expect(
    manager.upsertRequirement({
      churchId,
      shiftId,
      sectorId: SectorId.from('sector'),
      roleId: RoleId.from('role'),
      peopleNeeded: 0,
    }),
  ).rejects.toThrow(InvalidRequiredCountError);
  expect(repositories.shiftRepository.upsertRequirement).not.toHaveBeenCalled();
});

it('returns schedule summaries including cycles without participation', async () => {
  const { manager, repositories } = createHarness();
  const row = {
    cycleId: 'cycle',
    name: 'Untouched',
    startDate: new Date('2026-10-01T00:00:00Z'),
    endDate: new Date('2026-11-01T00:00:00Z'),
    isPartOf: false,
    eventCount: 0,
    eventTimeBlockCount: 0,
    status: 'not_started' as const,
    availabilityRequestedForAll: false,
    availabilityRequestedForAny: false,
  };
  vi.mocked(
    repositories.ministryParticipationRepository.listScheduleSummaries,
  ).mockResolvedValue([row]);
  await expect(
    manager.listScheduleSummaries({ churchId, ministryId }),
  ).resolves.toEqual([row]);
  expect(
    repositories.ministryParticipationRepository.listScheduleSummaries,
  ).toHaveBeenCalledWith({ churchId, ministryId });
});

it('writes a valid staffing requirement for the participation and touches it', async () => {
  const { manager, repositories } = createHarness();
  const sectorId = SectorId.from('sector');
  const roleId = RoleId.from('role');
  const role = new Role({
    props: { churchId, ministryId, name: 'Usher' },
    id: roleId,
  });
  const requirement = new ShiftRequirement({
    props: {
      churchId,
      eventTimeBlockId,
      participationId,
      shiftId,
      sectorId,
      roleId,
      sectorName: 'Door',
      peopleNeeded: 2,
    },
    id: 'requirement',
  });
  vi.mocked(repositories.sectorRepository.lockActive).mockResolvedValue(
    new Set([sectorId]),
  );
  vi.mocked(repositories.roleRepository.lockActiveForUse).mockResolvedValue([
    role,
  ]);
  vi.mocked(repositories.shiftRepository.upsertRequirement).mockResolvedValue(
    requirement,
  );
  await expect(
    manager.upsertRequirement({
      churchId,
      shiftId,
      sectorId,
      roleId,
      peopleNeeded: 2,
    }),
  ).resolves.toBe(requirement);
  expect(repositories.shiftRepository.upsertRequirement).toHaveBeenCalledWith({
    churchId,
    shiftId,
    participationId,
    sectorId,
    roleId,
    peopleNeeded: 2,
    notes: undefined,
    tx,
  });
  expect(
    repositories.ministryParticipationRepository.touch,
  ).toHaveBeenCalledWith({ churchId, participationId, tx });
});

it('lists and saves a valid usual setup and rejects invalid splits', async () => {
  const { manager, repositories } = createHarness();
  const templateId = EventTemplateId.from('template');
  const sourceTemplateTimeBlockId = TemplateTimeBlockId.from('template-block');
  const block = new TemplateTimeBlock({
    id: sourceTemplateTimeBlockId,
    props: {
      churchId,
      templateId,
      label: 'Welcome',
      startTime: parseTimeOfDay({ value: '09:00' }),
      endTime: parseTimeOfDay({ value: '09:30' }),
      order: 0,
    },
  });
  const template = new EventTemplate({
    id: templateId,
    props: { churchId, name: 'Sunday', weekday: 0, blocks: [block] },
  });
  vi.mocked(repositories.eventTemplateRepository.list).mockResolvedValue([
    template,
  ]);
  vi.mocked(repositories.usualSetupRepository.listByMinistry).mockResolvedValue(
    [],
  );
  const entries = await manager.listUsualSetupBlocks({ churchId, ministryId });
  expect(entries[0]?.entry).toBeUndefined();
  const sectorId = SectorId.from('sector');
  const roleId = RoleId.from('role');
  const entry = {
    sourceTemplateTimeBlockId,
    serves: true,
    shiftSplit: { kind: 'equal' as const, count: 2 },
    headcounts: [{ shiftIndex: 1, sectorId, roleId, peopleNeeded: 1 }],
  };
  vi.mocked(repositories.sectorRepository.lockActive).mockResolvedValue(
    new Set([sectorId]),
  );
  vi.mocked(repositories.roleRepository.lockActiveForUse).mockResolvedValue([
    new Role({ id: roleId, props: { churchId, ministryId, name: 'Usher' } }),
  ]);
  vi.mocked(repositories.usualSetupRepository.upsertBlock).mockResolvedValue(
    new UsualSetup({ id: 'setup', props: { churchId, ministryId, ...entry } }),
  );
  const result = await manager.saveUsualSetupBlock({
    churchId,
    ministryId,
    entry,
  });
  expect(result.entry).toMatchObject(entry);
  expect(repositories.usualSetupRepository.upsertBlock).toHaveBeenCalledWith({
    churchId,
    ministryId,
    entry,
    tx,
  });
  await expect(
    manager.saveUsualSetupBlock({
      churchId,
      ministryId,
      entry: { ...entry, shiftSplit: { kind: 'equal', count: 0 } },
    }),
  ).rejects.toThrow(InvalidShiftSplitError);
  await expect(
    manager.saveUsualSetupBlock({
      churchId,
      ministryId,
      entry: {
        ...entry,
        headcounts: [{ shiftIndex: 1, sectorId, roleId, peopleNeeded: 0 }],
      },
    }),
  ).rejects.toThrow(InvalidRequiredCountError);
});

it('flags an eligible volunteer with an overlapping active assignment', async () => {
  const { manager, repositories } = createHarness();
  const volunteerId = VolunteerId.from('volunteer');
  const otherShiftId = ShiftId.from('other-shift');
  const volunteer = new Volunteer({
    id: volunteerId,
    props: { churchId, userId: UserId.from('user'), name: 'Alex' },
  });
  const otherShift = new Shift({
    id: otherShiftId,
    props: {
      churchId,
      participationId,
      eventTimeBlockId,
      startTime: parseInstant({ value: '2026-08-02T14:00:00.000Z' }),
      endTime,
    },
  });
  const assignment = new Assignment({
    id: 'assignment',
    props: {
      churchId,
      eventTimeBlockId,
      participationId,
      shiftId: otherShiftId,
      volunteerId,
      roleId: RoleId.from('role'),
      shiftRequirementId: ShiftRequirementId.from({ raw: 'requirement' }),
      status: 'confirmed',
    },
  });
  vi.mocked(repositories.shiftRepository.getById).mockImplementation(
    async ({ shiftId: id }) =>
      id === otherShiftId
        ? otherShift
        : new Shift({
            id: shiftId,
            props: {
              churchId,
              participationId,
              eventTimeBlockId,
              startTime,
              endTime,
            },
          }),
  );
  vi.mocked(
    repositories.shiftRepository.listRequirementsByParticipation,
  ).mockResolvedValue([]);
  vi.mocked(repositories.volunteerRepository.listByMinistry).mockResolvedValue([
    volunteer,
  ]);
  vi.mocked(
    repositories.volunteerRepository.listMinistryMemberships,
  ).mockResolvedValue([]);
  vi.mocked(
    repositories.unavailableShiftRepository.listByVolunteers,
  ).mockResolvedValue([]);
  vi.mocked(
    repositories.assignmentRepository.listByVolunteers,
  ).mockResolvedValue([assignment]);
  const result = await manager.listEligibleVolunteers({ churchId, shiftId });
  expect(result).toEqual([
    expect.objectContaining({
      volunteerId,
      volunteerName: 'Alex',
      hasConflict: true,
      isAvailable: true,
    }),
  ]);
  expect(
    repositories.assignmentRepository.listByVolunteers,
  ).toHaveBeenCalledWith({ churchId, volunteerIds: [volunteerId], tx });
});

it('creates a missing participation and returns its unincluded event block', async () => {
  const { manager, repositories, participation, block } = createHarness();
  const cycleId = CycleId.from('cycle');
  const event = new Event({
    id: eventId,
    props: {
      churchId,
      cycleId,
      title: 'Sunday',
      start: startTime,
      end: endTime,
    },
  });
  vi.mocked(
    repositories.planningEventRepository.listCycleEvents,
  ).mockResolvedValue([{ event, eventTimeBlocks: [block] }]);
  vi.mocked(
    repositories.ministryParticipationRepository.findByMinistryEvent,
  ).mockResolvedValue(null);
  vi.mocked(
    repositories.ministryParticipationRepository.create,
  ).mockResolvedValue(participation);
  vi.mocked(repositories.shiftRepository.listByParticipation).mockResolvedValue(
    [],
  );
  vi.mocked(
    repositories.shiftRepository.listRequirementsByParticipation,
  ).mockResolvedValue([]);
  const view = await manager.getCycleParticipation({
    churchId,
    ministryId,
    cycleId,
  });
  expect(view.events).toHaveLength(1);
  expect(view.events[0]?.participation).toMatchObject({
    id: participationId,
    state: 'preparing',
  });
  expect(view.events[0]?.eventTimeBlocks).toEqual([
    expect.objectContaining({ eventTimeBlock: block, included: false }),
  ]);
  expect(
    repositories.ministryParticipationRepository.create,
  ).toHaveBeenCalledWith({ churchId, ministryId, eventId, tx });
  vi.mocked(
    repositories.ministryParticipationRepository.findByMinistryEvent,
  ).mockResolvedValue(participation);
  const again = await manager.getCycleParticipation({
    churchId,
    ministryId,
    cycleId,
  });
  expect(again.events[0]?.participation.id).toBe(participationId);
  expect(
    repositories.ministryParticipationRepository.create,
  ).toHaveBeenCalledTimes(1);
});

it('counts only active assignments towards each required place', async () => {
  const { manager, repositories } = createHarness();
  const roleId = RoleId.from('role');
  const requirementId = ShiftRequirementId.from({ raw: 'requirement' });
  const requirement = new ShiftRequirement({
    id: requirementId,
    props: {
      churchId,
      eventTimeBlockId,
      participationId,
      shiftId,
      roleId,
      sectorId: SectorId.from('sector'),
      sectorName: 'Door',
      peopleNeeded: 2,
    },
  });
  const assignment = (status: 'confirmed' | 'declined') =>
    new Assignment({
      props: {
        churchId,
        eventTimeBlockId,
        participationId,
        shiftId,
        roleId,
        shiftRequirementId: requirementId,
        volunteerId: VolunteerId.from(status),
        status,
      },
    });
  vi.mocked(
    repositories.shiftRepository.listRequirementsByParticipation,
  ).mockResolvedValue([requirement]);
  vi.mocked(
    repositories.assignmentRepository.listByParticipation,
  ).mockResolvedValue([assignment('confirmed'), assignment('declined')]);
  await expect(
    manager.getCompletion({ churchId, participationId }),
  ).resolves.toEqual({
    participationId,
    peopleNeeded: 2,
    assignedCount: 1,
    completionPercent: 50,
  });
});

it('rejects staffing changes after availability is requested', async () => {
  const { manager, repositories } = createHarness('availability_requested');
  await expect(
    manager.upsertRequirement({
      churchId,
      shiftId,
      sectorId: SectorId.from('sector'),
      roleId: RoleId.from('role'),
      peopleNeeded: 1,
    }),
  ).rejects.toThrow(IllegalStateTransitionError);
  expect(repositories.shiftRepository.upsertRequirement).not.toHaveBeenCalled();
});

it('removes shifts when an event time block is excluded', async () => {
  const { manager, repositories } = createHarness();
  vi.mocked(
    repositories.ministryParticipationRepository.listInclusions,
  ).mockResolvedValue([
    new ParticipationEventTimeBlockInclusion({
      props: { churchId, participationId, eventTimeBlockId },
      id: 'inclusion',
    }),
  ]);
  await manager.setInclusions({
    churchId,
    participationId,
    eventTimeBlockIds: [],
  });
  expect(
    repositories.ministryParticipationRepository.replaceInclusions,
  ).toHaveBeenCalledWith({
    churchId,
    participationId,
    eventTimeBlockIds: [],
    tx,
  });
  expect(
    repositories.shiftRepository.deleteByEventTimeBlock,
  ).toHaveBeenCalledWith({ churchId, participationId, eventTimeBlockId, tx });
});

it.each([
  { state: 'preparing' as const, published: false },
  { state: 'assigning' as const, published: true },
])('publishes only eligible participation with no staffing places: $state', async ({
  state,
  published,
}) => {
  const { manager, repositories, participation, block, notifications } =
    createHarness(state);
  const cycleId = CycleId.from('cycle');
  const event = new Event({
    id: eventId,
    props: {
      churchId,
      cycleId,
      title: 'Sunday',
      start: startTime,
      end: endTime,
    },
  });
  vi.mocked(
    repositories.planningEventRepository.listCycleEvents,
  ).mockResolvedValue([{ event, eventTimeBlocks: [block] }]);
  vi.mocked(
    repositories.ministryParticipationRepository.findByMinistryEvent,
  ).mockResolvedValue(participation);
  vi.mocked(
    repositories.shiftRepository.listRequirementsByParticipation,
  ).mockResolvedValue([]);
  vi.mocked(
    repositories.assignmentRepository.listByParticipation,
  ).mockResolvedValue([]);
  vi.mocked(repositories.volunteerRepository.listByIds).mockResolvedValue([]);
  const result = await manager.publishCycle({
    churchId,
    ministryId,
    cycleId,
    userId: UserId.from('user'),
  });
  if (published) {
    expect(result.participations).toHaveLength(1);
    expect(
      repositories.ministryParticipationRepository.updateState,
    ).toHaveBeenCalledWith({
      churchId,
      participationId,
      state: 'published',
      tx,
    });
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ to: [] }),
    );
  } else {
    expect(result.participations).toEqual([]);
    expect(
      repositories.ministryParticipationRepository.updateState,
    ).not.toHaveBeenCalled();
    expect(notifications.enqueue).not.toHaveBeenCalled();
  }
});
