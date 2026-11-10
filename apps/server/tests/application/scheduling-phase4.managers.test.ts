import { parseCalendarDay, parseInstant, parseTimeOfDay } from '@church/time';
import { expect, it, vi } from 'vitest';
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
import { Church } from '@/domain/entities/church';
import { Cycle } from '@/domain/entities/cycle';
import { Event } from '@/domain/entities/event';
import { EventTemplate } from '@/domain/entities/event-template';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { Ministry } from '@/domain/entities/ministry';
import {
  MinistryParticipation,
  type ParticipationState,
} from '@/domain/entities/ministry-participation';
import { Role } from '@/domain/entities/role';
import { Shift } from '@/domain/entities/shift';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';
import { TemplateTimeBlock } from '@/domain/entities/template-time-block';
import { UsualSetup } from '@/domain/entities/usual-setup';
import { Volunteer } from '@/domain/entities/volunteer';
import {
  InvalidRequiredCountError,
  InvalidShiftSplitError,
} from '@/domain/errors';
import { createChurchNotificationsSpy } from '@/tests/test-support/church-notifications-spy';
import {
  createAssignmentRepositoryFake,
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
  repositories.ministryParticipationRepository.lockById.mockResolvedValue(
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
    availabilityCheckRepository: {
      listActiveMemberships: async () => [],
      listByCycle: async () => [],
    } as never,
    ...repositories,
    participationRepository: repositories.ministryParticipationRepository,
    eventRepository: repositories.planningEventRepository,
    churchRepository: {
      getById: async () =>
        new Church({
          id: churchId,
          props: { name: 'Church', slug: 'church', timezone: 'UTC' },
        }),
    } as never,
    staffingSeeder: {} as never,
    unitOfWork,
    notifications,
  });
  return { manager, repositories, participation, block, notifications };
}

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
  repositories.planningEventRepository.getEvent.mockResolvedValue(
    new Event({
      id: eventId,
      props: {
        churchId,
        cycleId: CycleId.from('cycle'),
        title: 'Service',
        start: startTime,
        end: endTime,
      },
    }),
  );
  repositories.ministryRepository.getById.mockResolvedValue(
    new Ministry({ id: ministryId, props: { churchId, name: 'Worship' } }),
  );
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
  ).mockResolvedValue([
    new ShiftRequirement({
      id: ShiftRequirementId.from({ raw: 'requirement' }),
      props: {
        churchId,
        eventTimeBlockId,
        participationId,
        shiftId,
        roleId: RoleId.from('role'),
        sectorId: SectorId.from('sector'),
        sectorName: 'Door',
        peopleNeeded: 1,
      },
    }),
  ]);
  vi.mocked(
    repositories.volunteerRepository.listQualifiedForRole,
  ).mockResolvedValue([volunteer]);
  vi.mocked(
    repositories.volunteerRepository.listMinistryMemberships,
  ).mockResolvedValue([]);
  vi.mocked(
    repositories.unavailableShiftRepository.listByVolunteers,
  ).mockResolvedValue([]);
  vi.mocked(
    repositories.assignmentRepository.listByVolunteers,
  ).mockResolvedValue([assignment]);
  repositories.shiftRepository.listConflictFacts.mockResolvedValue([
    { shift: otherShift, ministryName: 'Worship', eventTitle: 'Service' },
  ]);
  const result = await manager.listEligibleVolunteers({ churchId, shiftId });
  expect(result).toEqual([
    expect.objectContaining({
      volunteerId,
      volunteerName: 'Alex',
      conflict: expect.objectContaining({ assignmentId: expect.any(String) }),
      answerState: 'not_asked',
    }),
  ]);
  expect(
    repositories.assignmentRepository.listByVolunteers,
  ).toHaveBeenCalledWith({ churchId, volunteerIds: [volunteerId], tx });
});

it('creates a missing participation and returns its unincluded event block', async () => {
  const { manager, repositories, participation, block } =
    createParticipationHarness();
  vi.mocked(repositories.ministryRepository.getById).mockResolvedValue(
    new Ministry({ id: ministryId, props: { churchId, name: 'Worship' } }),
  );
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

it.each([
  { state: 'preparing' as const, code: 'ILLEGAL_STATE_TRANSITION' },
  { state: 'assigning' as const, code: 'SCHEDULE_HAS_NO_ASSIGNMENTS' },
])('refuses publication without eligible Assignments: $state', async ({
  state,
  code,
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
  repositories.cycleRepository.getById.mockResolvedValue(
    new Cycle({
      id: cycleId,
      props: {
        churchId,
        name: 'Cycle',
        startDate: parseCalendarDay({ value: '2099-01-01' }),
        endDate: parseCalendarDay({ value: '2099-02-01' }),
        state: 'sent',
      },
    }),
  );
  repositories.planningEventRepository.listCycleEvents.mockResolvedValue([
    { event, eventTimeBlocks: [block] },
  ]);
  repositories.ministryParticipationRepository.lockSchedule.mockResolvedValue([
    participation,
  ]);
  repositories.shiftRepository.listRequirementsByParticipation.mockResolvedValue(
    [],
  );
  repositories.assignmentRepository.listByParticipation.mockResolvedValue([]);
  await expect(
    manager.publishCycle({
      churchId,
      ministryId,
      cycleId,
      userId: UserId.from('user'),
    }),
  ).rejects.toMatchObject({ code });
  expect(
    repositories.ministryParticipationRepository.updateState,
  ).not.toHaveBeenCalled();
  expect(notifications.enqueue).not.toHaveBeenCalled();
});
