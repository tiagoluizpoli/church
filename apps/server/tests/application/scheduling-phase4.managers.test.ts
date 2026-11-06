import { NotFoundError } from '@church/core';
import { parseInstant, parseTimeOfDay } from '@church/time';
import { describe, expect, it, vi } from 'vitest';
import { DbAvailabilityCheckManager } from '@/application/db-availability-check-manager';
import { DbParticipationManager } from '@/application/db-participation-manager';
import {
  AssignmentId,
  ChurchId,
  CycleId,
  EventId,
  EventTemplateId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  ParticipationEventTimeBlockInclusionId,
  RoleId,
  SectorId,
  ShiftId,
  ShiftRequirementId,
  TemplateTimeBlockId,
  UserId,
  UsualSetupId,
  VolunteerId,
} from '@/domain/branded-ids';
import { Assignment } from '@/domain/entities/assignment';
import { AvailabilityCheck } from '@/domain/entities/availability-check';
import { Event } from '@/domain/entities/event';
import { EventTemplate } from '@/domain/entities/event-template';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import {
  MinistryParticipation,
  type ParticipationState,
} from '@/domain/entities/ministry-participation';
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
import {
  createAssignmentRepositoryFake,
  createAvailabilityCheckRepositoryFake,
  createCycleRepositoryFake,
  createEventTemplateRepositoryFake,
  createEventTimeBlockRepositoryFake,
  createMinistryParticipationRepositoryFake,
  createMinistryRepositoryFake,
  createPlanningEventRepositoryFake,
  createRoleRepositoryFake,
  createSectorRepositoryFake,
  createShiftRepositoryFake,
  createTransactionContextFake,
  createUnavailableShiftRepositoryFake,
  createUnitOfWorkFake,
  createUsualSetupRepositoryFake,
  createVolunteerRepositoryFake,
} from '@/tests/test-support/repository-contract-fakes';

const churchId = ChurchId.from('church');
const ministryId = MinistryId.from('ministry');
const eventId = EventId.from('event');
const participationId = MinistryParticipationId.from('participation');
const eventTimeBlockId = EventTimeBlockId.from('block');
const shiftId = ShiftId.from('shift');
const startTime = parseInstant({ value: '2026-08-02T12:00:00.000Z' });
const endTime = parseInstant({ value: '2026-08-02T15:00:00.000Z' });
const tx = createTransactionContextFake();
const cycleId = CycleId.from('cycle');
const members = [
  {
    ministryMembershipId: 'membership-1',
    volunteerId: VolunteerId.from('volunteer-1'),
    userId: UserId.from('user-1'),
    volunteerName: 'One',
  },
  {
    ministryMembershipId: 'membership-2',
    volunteerId: VolunteerId.from('volunteer-2'),
    userId: UserId.from('user-2'),
    volunteerName: 'Two',
  },
];

function createRepositories() {
  return {
    ministryParticipationRepository:
      createMinistryParticipationRepositoryFake(),
    shiftRepository: createShiftRepositoryFake(),
    planningEventRepository: createPlanningEventRepositoryFake(),
    assignmentRepository: createAssignmentRepositoryFake(),
    unavailableShiftRepository: createUnavailableShiftRepositoryFake(),
    eventTimeBlockRepository: createEventTimeBlockRepositoryFake(),
    volunteerRepository: createVolunteerRepositoryFake(),
    ministryRepository: createMinistryRepositoryFake(),
    usualSetupRepository: createUsualSetupRepositoryFake(),
    eventTemplateRepository: createEventTemplateRepositoryFake(),
    cycleRepository: createCycleRepositoryFake(),
    roleRepository: createRoleRepositoryFake(),
    sectorRepository: createSectorRepositoryFake(),
  };
}

interface ParticipationHarnessInput {
  state?: ParticipationState;
}
function createParticipationHarness({
  state = 'preparing',
}: ParticipationHarnessInput = {}) {
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
  repositories.ministryParticipationRepository.getById.mockResolvedValue(
    participation,
  );
  repositories.ministryParticipationRepository.listInclusions.mockResolvedValue(
    [],
  );
  repositories.eventTimeBlockRepository.getById.mockResolvedValue(block);
  repositories.shiftRepository.listByEventTimeBlock.mockResolvedValue([]);
  repositories.shiftRepository.getById.mockResolvedValue(shift);
  repositories.shiftRepository.createMany.mockImplementation(
    async ({ shifts }) => shifts,
  );
  const unitOfWork = createUnitOfWorkFake({ tx });
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

function createAvailabilityCheckHarness() {
  const participation = new MinistryParticipation({
    id: participationId,
    props: { churchId, ministryId, eventId },
  });
  const event = new Event({
    id: eventId,
    props: {
      churchId,
      cycleId,
      title: 'Service',
      start: parseInstant({ value: '2026-08-02T09:00:00Z' }),
      end: parseInstant({ value: '2026-08-02T10:00:00Z' }),
    },
  });
  const participationRepository = createMinistryParticipationRepositoryFake();
  participationRepository.getById.mockResolvedValue(participation);
  const eventRepository = createPlanningEventRepositoryFake();
  eventRepository.getEvent.mockResolvedValue(event);
  const availabilityCheckRepository = createAvailabilityCheckRepositoryFake();
  availabilityCheckRepository.listActiveMemberships.mockResolvedValue(members);
  availabilityCheckRepository.listByCycle.mockResolvedValue([]);
  availabilityCheckRepository.createMany.mockImplementation(
    async ({ checks }) =>
      checks.map(
        (check) => new AvailabilityCheck({ props: { churchId, ...check } }),
      ),
  );
  const cycleRepository = createCycleRepositoryFake();
  const unitOfWork = createUnitOfWorkFake({ tx });
  const notifications = createChurchNotificationsSpy();
  const manager = new DbAvailabilityCheckManager({
    participationRepository,
    eventRepository,
    availabilityCheckRepository,
    cycleRepository,
    unitOfWork,
    notifications,
  });
  return {
    manager,
    participation,
    participationRepository,
    eventRepository,
    availabilityCheckRepository,
    cycleRepository,
    unitOfWork,
    notifications,
    tx,
  };
}

describe('participation preparation', () => {
  it('includes a block by requesting a shift spanning the block', async () => {
    const { manager, repositories } = createParticipationHarness();
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
    const { manager, repositories } = createParticipationHarness();
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
    const { manager, repositories } = createParticipationHarness();
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
    const { manager, repositories } = createParticipationHarness();
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
    const { manager, repositories } = createParticipationHarness({
      state: 'availability_requested',
    });
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
  const { manager, repositories } = createParticipationHarness();
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
  const { manager, repositories } = createParticipationHarness();
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
  const { manager, repositories } = createParticipationHarness();
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
  const { manager, repositories } = createParticipationHarness();
  const row = {
    cycleId: CycleId.from('cycle'),
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
  const { manager, repositories } = createParticipationHarness();
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
    id: ShiftRequirementId.from({ raw: 'requirement' }),
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
  const { manager, repositories } = createParticipationHarness();
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
    new UsualSetup({
      id: UsualSetupId.from('setup'),
      props: { churchId, ministryId, ...entry },
    }),
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
  const { manager, repositories } = createParticipationHarness();
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
    id: AssignmentId.from('assignment'),
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
  const { manager, repositories, participation, block } =
    createParticipationHarness();
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
  vi.mocked(
    repositories.unavailableShiftRepository.listByParticipation,
  ).mockResolvedValue([]);
  vi.mocked(
    repositories.assignmentRepository.listByParticipation,
  ).mockResolvedValue([]);
  vi.mocked(
    repositories.ministryParticipationRepository.findAvailabilityRequestedAt,
  ).mockResolvedValue(null);
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
    expect.objectContaining({
      eventTimeBlock: block,
      included: false,
      shiftsChangedAfterAsk: false,
    }),
  ]);
  expect(view.events[0]?.generatedFromTemplate).toBe(false);
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
  const { manager, repositories } = createParticipationHarness();
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
  const { manager, repositories } = createParticipationHarness({
    state: 'availability_requested',
  });
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
  const { manager, repositories } = createParticipationHarness();
  vi.mocked(
    repositories.ministryParticipationRepository.listInclusions,
  ).mockResolvedValue([
    new ParticipationEventTimeBlockInclusion({
      props: { churchId, participationId, eventTimeBlockId },
      id: ParticipationEventTimeBlockInclusionId.from('inclusion'),
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
    createParticipationHarness({ state });
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

describe('availability requests', () => {
  it('creates checks for active memberships and requests their notification', async () => {
    const {
      manager,
      availabilityCheckRepository: checks,
      participationRepository,
      eventRepository,
      notifications,
      tx,
    } = createAvailabilityCheckHarness();
    await expect(
      manager.askAvailability({ churchId, participationId }),
    ).resolves.toEqual({ createdCheckCount: 2, notifiedVolunteerCount: 2 });
    expect(checks.listActiveMemberships).toHaveBeenCalledWith({
      churchId,
      ministryId,
      tx,
    });
    expect(checks.listByCycle).toHaveBeenCalledWith({
      churchId,
      cycleId,
      ministryMembershipIds: ['membership-1', 'membership-2'],
      tx,
    });
    expect(checks.createMany).toHaveBeenCalledWith({
      churchId,
      checks: [
        { cycleId, ministryMembershipId: 'membership-1' },
        { cycleId, ministryMembershipId: 'membership-2' },
      ],
      tx,
    });
    expect(participationRepository.getById).toHaveBeenCalledWith({
      churchId,
      participationId,
      tx,
    });
    expect(eventRepository.getEvent).toHaveBeenCalledWith({
      churchId,
      eventId,
      tx,
    });
    expect(participationRepository.updateState).toHaveBeenCalledWith({
      churchId,
      participationId,
      state: 'availability_requested',
      tx,
    });
    expect(notifications.enqueue).toHaveBeenCalledWith({
      tx,
      kind: 'availability_opened',
      to: [
        { userId: UserId.from('user-1'), churchId },
        { userId: UserId.from('user-2'), churchId },
      ],
      data: { cycleId, ministryId },
    });
  });
  it('reuses existing checks and notifies only newly requested members', async () => {
    const {
      manager,
      availabilityCheckRepository: checks,
      notifications,
      tx,
    } = createAvailabilityCheckHarness();
    checks.listByCycle.mockResolvedValue([
      new AvailabilityCheck({
        props: { churchId, cycleId, ministryMembershipId: 'membership-1' },
      }),
    ]);
    await expect(
      manager.askAvailability({ churchId, participationId }),
    ).resolves.toEqual({ createdCheckCount: 1, notifiedVolunteerCount: 1 });
    expect(checks.createMany).toHaveBeenCalledWith({
      churchId,
      checks: [{ cycleId, ministryMembershipId: 'membership-2' }],
      tx,
    });
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [{ churchId, userId: UserId.from('user-2') }],
      }),
    );
  });

  it('rejects a repeated request and a reminder before requesting', async () => {
    const {
      manager,
      participation,
      availabilityCheckRepository: checks,
    } = createAvailabilityCheckHarness();
    await expect(
      manager.resendReminder({ churchId, participationId }),
    ).rejects.toThrow(IllegalStateTransitionError);
    participation.askAvailability();
    await expect(
      manager.askAvailability({ churchId, participationId }),
    ).rejects.toThrow(IllegalStateTransitionError);
    expect(checks.createMany).not.toHaveBeenCalled();
  });

  it('reminds only pending members without creating checks', async () => {
    const {
      manager,
      participation,
      availabilityCheckRepository: checks,
      notifications,
      tx,
    } = createAvailabilityCheckHarness();
    participation.askAvailability();
    checks.listByCycle.mockResolvedValue([
      new AvailabilityCheck({
        props: { churchId, cycleId, ministryMembershipId: 'membership-1' },
      }),
      new AvailabilityCheck({
        props: {
          churchId,
          cycleId,
          ministryMembershipId: 'membership-2',
          state: 'confirmed',
        },
      }),
    ]);
    await manager.resendReminder({ churchId, participationId });
    expect(checks.createMany).not.toHaveBeenCalled();
    expect(notifications.enqueue).toHaveBeenCalledWith({
      tx,
      kind: 'availability_reminder',
      to: [{ churchId, userId: UserId.from('user-1') }],
      data: { cycleId, ministryId },
    });
  });

  it('propagates a scoped participation lookup failure', async () => {
    const {
      manager,
      participationRepository,
      availabilityCheckRepository: checks,
      tx,
    } = createAvailabilityCheckHarness();
    participationRepository.getById.mockRejectedValue(
      new NotFoundError('participation'),
    );
    await expect(
      manager.askAvailability({ churchId, participationId }),
    ).rejects.toThrow(NotFoundError);
    expect(participationRepository.getById).toHaveBeenCalledWith({
      churchId,
      participationId,
      tx,
    });
    expect(checks.createMany).not.toHaveBeenCalled();
  });

  it('lists pending, confirmed, and never-requested members through both status surfaces', async () => {
    const {
      manager,
      availabilityCheckRepository: checks,
      cycleRepository,
      participationRepository,
      eventRepository,
    } = createAvailabilityCheckHarness();
    const confirmedAt = parseInstant({ value: '2026-08-01T12:00:00Z' });
    checks.listActiveMemberships.mockResolvedValue([
      ...members,
      {
        ministryMembershipId: 'membership-3',
        volunteerId: VolunteerId.from('volunteer-3'),
        userId: UserId.from('user-3'),
        volunteerName: 'Three',
      },
    ]);
    checks.listByCycle.mockResolvedValue([
      new AvailabilityCheck({
        props: { churchId, cycleId, ministryMembershipId: 'membership-1' },
      }),
      new AvailabilityCheck({
        props: {
          churchId,
          cycleId,
          ministryMembershipId: 'membership-2',
          state: 'confirmed',
          confirmedAt,
        },
      }),
    ]);
    const expected = [
      {
        volunteerId: VolunteerId.from('volunteer-1'),
        volunteerName: 'One',
        state: 'pending',
        confirmedAt: undefined,
      },
      {
        volunteerId: VolunteerId.from('volunteer-2'),
        volunteerName: 'Two',
        state: 'confirmed',
        confirmedAt,
      },
      {
        volunteerId: VolunteerId.from('volunteer-3'),
        volunteerName: 'Three',
        state: undefined,
        confirmedAt: undefined,
      },
    ];
    await expect(
      manager.listCheckStatuses({ churchId, participationId }),
    ).resolves.toEqual(expected);
    await expect(
      manager.listCycleCheckStatuses({ churchId, cycleId, ministryId }),
    ).resolves.toEqual(expected);
    expect(participationRepository.getById).toHaveBeenCalledWith({
      churchId,
      participationId,
    });
    expect(eventRepository.getEvent).toHaveBeenCalledWith({
      churchId,
      eventId,
    });
    expect(cycleRepository.getById).toHaveBeenCalledWith({ churchId, cycleId });
    expect(checks.listByCycle).toHaveBeenCalledWith({
      churchId,
      cycleId,
      ministryMembershipIds: ['membership-1', 'membership-2', 'membership-3'],
    });
  });
});
