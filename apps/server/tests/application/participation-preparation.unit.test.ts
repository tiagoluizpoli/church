import { NotFoundError } from '@church/core';
import { parseInstant } from '@church/time';
import { describe, expect, it, vi } from 'vitest';
import { DbParticipationManager } from '@/application/db-participation-manager';
import {
  ChurchId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
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
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { Shift } from '@/domain/entities/shift';
import {
  IllegalStateTransitionError,
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
  state: 'preparing' | 'availability_requested' = 'preparing',
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
  const manager = new DbParticipationManager({
    ...repositories,
    participationRepository: repositories.ministryParticipationRepository,
    eventRepository: repositories.planningEventRepository,
    unitOfWork,
    notifications: createChurchNotificationsSpy(),
  });
  return { manager, repositories, participation, block };
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
