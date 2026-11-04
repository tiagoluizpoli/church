import { fromDate, parseCalendarDay } from '@church/time';
import { describe, expect, it, vi } from 'vitest';
import { DbCycleManager } from '@/application/db-cycle-manager';
import { UsualSetupStaffingSeeder } from '@/application/usual-setup-staffing-seeder';
import { ChurchId, CycleId, EventId } from '@/domain/branded-ids';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '@/domain/contracts/infrastructure/cycle.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '@/domain/contracts/infrastructure/planning-event.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { UsualSetupRepository } from '@/domain/contracts/infrastructure/usual-setup.repository';
import { Church } from '@/domain/entities/church';
import { Cycle } from '@/domain/entities/cycle';
import { Event } from '@/domain/entities/event';
import {
  DraftStaffingReconciliationRequiredError,
  OverlappingCycleError,
} from '@/domain/errors';

const churchId = ChurchId.from('church-1');
const cycleId = CycleId.from('cycle-1');
const startDate = new Date('2099-01-01T00:00:00Z');
const endDate = new Date('2099-02-01T00:00:00Z');

function createHarness() {
  const cycle = new Cycle({
    id: cycleId,
    props: {
      churchId,
      name: 'January',
      startDate: parseCalendarDay({ value: '2099-01-01' }),
      endDate: parseCalendarDay({ value: '2099-02-01' }),
    },
  });
  const cycleRepository: CycleRepository = {
    create: vi.fn().mockResolvedValue(cycle),
    list: vi.fn(),
    getById: vi.fn(),
    findOverlapping: vi.fn().mockResolvedValue([]),
    updateState: vi.fn(),
    acquireChurchLock: vi.fn().mockResolvedValue(undefined),
  };
  const eventRepository: PlanningEventRepository = {
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    getEvent: vi.fn(),
    deleteEvent: vi.fn(),
    listCycleEvents: vi.fn(),
    createEventTimeBlock: vi.fn(),
    seedParticipations: vi.fn(),
  };
  const churchRepository: ChurchRepository = {
    getById: vi.fn().mockResolvedValue(
      new Church({
        id: churchId,
        props: { name: 'Church', slug: 'church', timezone: 'UTC' },
      }),
    ),
    getBySlug: vi.fn(),
    listAdminUserIds: vi.fn(),
    findMemberEmail: vi.fn(),
    findMemberContact: vi.fn(),
    findUserName: vi.fn(),
  };
  const participationRepository: MinistryParticipationRepository = {
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
  const usualSetupRepository: UsualSetupRepository = {
    listByMinistry: vi.fn(),
    listByChurch: vi.fn(),
    upsertBlock: vi.fn(),
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
  const unitOfWork = {
    run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work('tx')),
    runWith: vi.fn(),
  } as unknown as UnitOfWork;
  const staffingSeeder = new UsualSetupStaffingSeeder({
    participationRepository,
    shiftRepository,
    usualSetupRepository,
    ministryRepository,
  });
  const manager = new DbCycleManager({
    cycleRepository,
    eventRepository,
    churchRepository,
    unitOfWork,
    participationRepository,
    staffingSeeder,
  });
  return {
    manager,
    cycle,
    cycleRepository,
    eventRepository,
    participationRepository,
    staffingSeeder,
  };
}

describe('DbCycleManager', () => {
  it('creates a non-overlapping cycle while holding the church lock in the transaction', async () => {
    const { manager, cycle, cycleRepository } = createHarness();
    const input = { churchId, name: 'January', startDate, endDate };
    expect(await manager.createCycle(input)).toBe(cycle);
    expect(cycleRepository.acquireChurchLock).toHaveBeenCalledWith({
      churchId,
      tx: 'tx',
    });
    expect(cycleRepository.findOverlapping).toHaveBeenCalledWith({
      churchId,
      startDate,
      endDate,
      tx: 'tx',
    });
    expect(cycleRepository.create).toHaveBeenCalledWith({ ...input, tx: 'tx' });
  });

  it('rejects an overlapping cycle without creating it', async () => {
    const { manager, cycle, cycleRepository } = createHarness();
    vi.mocked(cycleRepository.findOverlapping).mockResolvedValue([cycle]);
    await expect(
      manager.createCycle({ churchId, name: 'January', startDate, endDate }),
    ).rejects.toThrow(OverlappingCycleError);
    expect(cycleRepository.create).not.toHaveBeenCalled();
  });

  it('sends the cycle and seeds staffing in the same transaction', async () => {
    const {
      manager,
      cycle,
      cycleRepository,
      eventRepository,
      participationRepository,
      staffingSeeder,
    } = createHarness();
    vi.mocked(cycleRepository.getById).mockResolvedValue(cycle);
    vi.mocked(participationRepository.hasCycleStaffing).mockResolvedValue(
      false,
    );
    vi.mocked(eventRepository.listCycleEvents).mockResolvedValue([]);
    const setup = {
      entriesByMinistry: new Map(),
      directionByMinistry: new Map(),
      globalDefaultAllIn: false,
      timeZone: 'UTC',
    };
    vi.spyOn(staffingSeeder, 'loadSetup').mockResolvedValue(setup);
    const seed = vi.spyOn(staffingSeeder, 'seed').mockResolvedValue(undefined);
    await manager.sendCycle({ churchId, cycleId });
    expect(cycleRepository.updateState).toHaveBeenCalledWith({
      churchId,
      cycleId,
      state: 'sent',
      tx: 'tx',
    });
    expect(seed).toHaveBeenCalledWith({
      churchId,
      eventTimeBlocks: [],
      setup,
      tx: 'tx',
    });
  });

  it('schedules draft events when sending and reopens an event on request', async () => {
    const {
      manager,
      cycle,
      cycleRepository,
      eventRepository,
      participationRepository,
      staffingSeeder,
    } = createHarness();
    const eventId = EventId.from('event-1');
    const event = new Event({
      id: eventId,
      props: {
        churchId,
        cycleId,
        title: 'Service',
        start: fromDate({ date: new Date('2099-01-02T09:00:00Z') }),
        end: fromDate({ date: new Date('2099-01-02T10:00:00Z') }),
      },
    });
    vi.mocked(cycleRepository.getById).mockResolvedValue(cycle);
    vi.mocked(participationRepository.hasCycleStaffing).mockResolvedValue(
      false,
    );
    vi.mocked(eventRepository.listCycleEvents).mockResolvedValue([
      { event, eventTimeBlocks: [] },
    ]);
    vi.spyOn(staffingSeeder, 'loadSetup').mockResolvedValue({
      entriesByMinistry: new Map(),
      directionByMinistry: new Map(),
      globalDefaultAllIn: false,
      timeZone: 'UTC',
    });
    vi.spyOn(staffingSeeder, 'seed').mockResolvedValue(undefined);
    await manager.sendCycle({ churchId, cycleId });
    expect(eventRepository.updateEvent).toHaveBeenCalledWith({
      churchId,
      eventId,
      status: 'scheduled',
      tx: 'tx',
    });
    const scheduled = new Event({
      id: eventId,
      props: {
        churchId,
        cycleId,
        title: 'Service',
        start: event.start,
        end: event.end,
        status: 'scheduled',
      },
    });
    vi.mocked(eventRepository.getEvent).mockResolvedValue(scheduled);
    await manager.reopenEvent({ churchId, cycleId, eventId });
    expect(eventRepository.updateEvent).toHaveBeenCalledWith({
      churchId,
      eventId,
      status: 'draft',
      tx: 'tx',
    });
  });
  it('refuses to send a draft with existing staffing', async () => {
    const { manager, cycle, cycleRepository, participationRepository } =
      createHarness();
    vi.mocked(cycleRepository.getById).mockResolvedValue(cycle);
    vi.mocked(participationRepository.hasCycleStaffing).mockResolvedValue(true);
    await expect(manager.sendCycle({ churchId, cycleId })).rejects.toThrow(
      DraftStaffingReconciliationRequiredError,
    );
    expect(cycleRepository.updateState).not.toHaveBeenCalled();
  });
  it('marks an expired cycle past when loading its details', async () => {
    const { manager, cycleRepository, eventRepository } = createHarness();
    const expired = new Cycle({
      id: cycleId,
      props: {
        churchId,
        name: 'Expired',
        startDate: parseCalendarDay({ value: '2000-01-01' }),
        endDate: parseCalendarDay({ value: '2000-02-01' }),
      },
    });
    const past = new Cycle({
      id: cycleId,
      props: {
        churchId,
        name: 'Expired',
        startDate: parseCalendarDay({ value: '2000-01-01' }),
        endDate: parseCalendarDay({ value: '2000-02-01' }),
        state: 'past',
      },
    });
    vi.mocked(cycleRepository.getById).mockResolvedValue(expired);
    vi.mocked(cycleRepository.updateState).mockResolvedValue(past);
    vi.mocked(eventRepository.listCycleEvents).mockResolvedValue([]);

    await expect(manager.getCycle({ churchId, cycleId })).resolves.toEqual({
      cycle: past,
      events: [],
    });
    expect(cycleRepository.updateState).toHaveBeenCalledWith({
      churchId,
      cycleId,
      state: 'past',
    });
  });

  it('rejects reopening an event from another cycle without writing', async () => {
    const { manager, cycle, cycleRepository, eventRepository } =
      createHarness();
    const eventId = EventId.from('event-1');
    const event = new Event({
      id: eventId,
      props: {
        churchId,
        cycleId: CycleId.from('other-cycle'),
        title: 'Other event',
        start: fromDate({ date: new Date('2099-01-02T09:00:00Z') }),
        end: fromDate({ date: new Date('2099-01-02T10:00:00Z') }),
      },
    });
    vi.mocked(cycleRepository.getById).mockResolvedValue(cycle);
    vi.mocked(eventRepository.getEvent).mockResolvedValue(event);

    await expect(
      manager.reopenEvent({ churchId, cycleId, eventId }),
    ).rejects.toThrow('Event not found');
    expect(eventRepository.updateEvent).not.toHaveBeenCalled();
  });
});
