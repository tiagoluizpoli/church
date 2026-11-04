import { fromDate, parseCalendarDay, parseTimeOfDay } from '@church/time';
import { describe, expect, it, vi } from 'vitest';
import { DbCycleManager } from '@/application/db-cycle-manager';
import { DbPlanningEventManager } from '@/application/db-planning-event-manager';
import { UsualSetupStaffingSeeder } from '@/application/usual-setup-staffing-seeder';
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
  TemplateTimeBlockId,
} from '@/domain/branded-ids';
import { Church } from '@/domain/entities/church';
import { Cycle, type CycleState } from '@/domain/entities/cycle';
import { Event, type EventStatus } from '@/domain/entities/event';
import { EventTemplate } from '@/domain/entities/event-template';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { Ministry } from '@/domain/entities/ministry';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { TemplateTimeBlock } from '@/domain/entities/template-time-block';
import { UsualSetup } from '@/domain/entities/usual-setup';
import {
  DraftStaffingReconciliationRequiredError,
  EventOutsideCycleError,
  IllegalStateTransitionError,
  LastRemainingEventTimeBlockError,
  OverlappingCycleError,
} from '@/domain/errors';
import {
  createChurchRepositoryFake,
  createCycleRepositoryFake,
  createEventTemplateRepositoryFake,
  createEventTimeBlockRepositoryFake,
  createMinistryParticipationRepositoryFake,
  createMinistryRepositoryFake,
  createPlanningEventRepositoryFake,
  createShiftRepositoryFake,
  createTransactionContextFake,
  createUnitOfWorkFake,
  createUsualSetupRepositoryFake,
} from '@/tests/test-support/repository-contract-fakes';

const churchId = ChurchId.from('church-1');
const cycleId = CycleId.from('cycle-1');
const eventId = EventId.from('event-1');
const eventTimeBlockId = EventTimeBlockId.from('block-1');
const startDate = new Date('2099-01-01T00:00:00Z');
const endDate = new Date('2099-02-01T00:00:00Z');
const start = new Date('2099-01-02T09:00:00Z');
const end = new Date('2099-01-02T10:00:00Z');
const instant = (date: Date) => fromDate({ date });
const tx = createTransactionContextFake();

/** The staffing seeder and repositories both planning managers share. */
function createPlanningDependencies() {
  const cycleRepository = createCycleRepositoryFake();
  const eventRepository = createPlanningEventRepositoryFake();
  const churchRepository = createChurchRepositoryFake();
  churchRepository.getById.mockResolvedValue(
    new Church({
      id: churchId,
      props: { name: 'Church', slug: 'church', timezone: 'UTC' },
    }),
  );
  const participationRepository = createMinistryParticipationRepositoryFake();
  const shiftRepository = createShiftRepositoryFake();
  const usualSetupRepository = createUsualSetupRepositoryFake();
  const ministryRepository = createMinistryRepositoryFake();
  const unitOfWork = createUnitOfWorkFake({ tx });
  const staffingSeeder = new UsualSetupStaffingSeeder({
    participationRepository,
    shiftRepository,
    usualSetupRepository,
    ministryRepository,
  });
  return {
    cycleRepository,
    eventRepository,
    churchRepository,
    participationRepository,
    shiftRepository,
    usualSetupRepository,
    ministryRepository,
    unitOfWork,
    staffingSeeder,
  };
}

function createCycleHarness() {
  const cycle = new Cycle({
    id: cycleId,
    props: {
      churchId,
      name: 'January',
      startDate: parseCalendarDay({ value: '2099-01-01' }),
      endDate: parseCalendarDay({ value: '2099-02-01' }),
    },
  });
  const dependencies = createPlanningDependencies();
  dependencies.cycleRepository.create.mockResolvedValue(cycle);
  dependencies.cycleRepository.findOverlapping.mockResolvedValue([]);
  dependencies.cycleRepository.acquireChurchLock.mockResolvedValue(undefined);
  const manager = new DbCycleManager(dependencies);
  return { manager, cycle, ...dependencies };
}

interface MakeEventInput {
  status?: EventStatus;
  owner?: CycleId;
}
function makeEvent({ status = 'draft', owner = cycleId }: MakeEventInput = {}) {
  return new Event({
    id: eventId,
    props: {
      churchId,
      cycleId: owner,
      title: 'Service',
      start: instant(start),
      end: instant(end),
      status,
    },
  });
}
interface MakeCycleInput {
  state?: CycleState;
}
function makeCycle({ state = 'draft' }: MakeCycleInput = {}) {
  return new Cycle({
    id: cycleId,
    props: {
      churchId,
      name: 'January',
      startDate: parseCalendarDay({ value: '2099-01-01' }),
      endDate: parseCalendarDay({ value: '2099-02-01' }),
      state,
    },
  });
}
interface MakeBlockInput {
  owner?: EventId;
}
function makeBlock({ owner = eventId }: MakeBlockInput = {}) {
  return new EventTimeBlock({
    id: eventTimeBlockId,
    props: {
      churchId,
      eventId: owner,
      startTime: instant(start),
      endTime: instant(end),
      label: 'Worship',
    },
  });
}

function createPlanningEventHarness() {
  const dependencies = createPlanningDependencies();
  const { cycleRepository, eventRepository } = dependencies;
  cycleRepository.getById.mockResolvedValue(makeCycle());
  eventRepository.createEvent.mockResolvedValue(makeEvent());
  eventRepository.updateEvent.mockResolvedValue(makeEvent());
  eventRepository.getEvent.mockResolvedValue(makeEvent());
  eventRepository.listCycleEvents.mockResolvedValue([]);
  const templateRepository = createEventTemplateRepositoryFake();
  templateRepository.getByIds.mockResolvedValue([]);
  const eventTimeBlockRepository = createEventTimeBlockRepositoryFake();
  eventTimeBlockRepository.getById.mockResolvedValue(makeBlock());
  eventTimeBlockRepository.listByEvent.mockResolvedValue([]);
  eventTimeBlockRepository.create.mockResolvedValue(makeBlock());
  eventTimeBlockRepository.update.mockResolvedValue(makeBlock());
  const manager = new DbPlanningEventManager({
    ...dependencies,
    templateRepository,
    eventTimeBlockRepository,
  });
  return {
    manager,
    templateRepository,
    eventTimeBlockRepository,
    ...dependencies,
  };
}

describe('DbCycleManager', () => {
  it('creates a non-overlapping cycle while holding the church lock in the transaction', async () => {
    const { manager, cycle, cycleRepository } = createCycleHarness();
    const input = { churchId, name: 'January', startDate, endDate };
    expect(await manager.createCycle(input)).toBe(cycle);
    expect(cycleRepository.acquireChurchLock).toHaveBeenCalledWith({
      churchId,
      tx,
    });
    expect(cycleRepository.findOverlapping).toHaveBeenCalledWith({
      churchId,
      startDate,
      endDate,
      tx,
    });
    expect(cycleRepository.create).toHaveBeenCalledWith({ ...input, tx });
  });

  it('rejects an overlapping cycle without creating it', async () => {
    const { manager, cycle, cycleRepository } = createCycleHarness();
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
    } = createCycleHarness();
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
      tx,
    });
    expect(seed).toHaveBeenCalledWith({
      churchId,
      eventTimeBlocks: [],
      setup,
      tx,
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
    } = createCycleHarness();
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
      tx,
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
      tx,
    });
  });
  it('refuses to send a draft with existing staffing', async () => {
    const { manager, cycle, cycleRepository, participationRepository } =
      createCycleHarness();
    vi.mocked(cycleRepository.getById).mockResolvedValue(cycle);
    vi.mocked(participationRepository.hasCycleStaffing).mockResolvedValue(true);
    await expect(manager.sendCycle({ churchId, cycleId })).rejects.toThrow(
      DraftStaffingReconciliationRequiredError,
    );
    expect(cycleRepository.updateState).not.toHaveBeenCalled();
  });
  it('marks an expired cycle past when loading its details', async () => {
    const { manager, cycleRepository, eventRepository } = createCycleHarness();
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
      createCycleHarness();
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

describe('DbPlanningEventManager', () => {
  it('applies a template to each matching day', async () => {
    const { manager, templateRepository, eventRepository } =
      createPlanningEventHarness();
    const templateId = EventTemplateId.from('template-1');
    const blockId = TemplateTimeBlockId.from('template-block-1');
    const templateBlock = new TemplateTimeBlock({
      id: blockId,
      props: {
        churchId,
        templateId,
        label: 'Service',
        startTime: parseTimeOfDay({ value: '09:00' }),
        endTime: parseTimeOfDay({ value: '10:00' }),
        order: 0,
      },
    });
    const template = new EventTemplate({
      id: templateId,
      props: { churchId, name: 'Sunday', weekday: 0, blocks: [templateBlock] },
    });
    vi.mocked(templateRepository.getByIds).mockResolvedValue([template]);
    vi.mocked(eventRepository.createEventTimeBlock).mockResolvedValue(
      eventTimeBlockId,
    );
    const result = await manager.generateFromTemplates({
      churchId,
      cycleId,
      templateIds: [templateId],
    });
    expect(result).toEqual({
      generatedEventCount: 4,
      generatedEventTimeBlockCount: 4,
    });
    expect(eventRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceTemplateId: templateId,
        status: 'draft',
        tx,
      }),
    );
    expect(eventRepository.createEventTimeBlock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceTemplateTimeBlockId: blockId, tx }),
    );
    expect(eventRepository.seedParticipations).toHaveBeenCalledTimes(4);
  });
  it('does not recreate generated blocks, including cancelled events, and regenerates missing dates', async () => {
    const { manager, templateRepository, eventRepository } =
      createPlanningEventHarness();
    const templateId = EventTemplateId.from('template-1');
    const blockId = TemplateTimeBlockId.from('template-block-1');
    const templateBlock = new TemplateTimeBlock({
      id: blockId,
      props: {
        churchId,
        templateId,
        label: 'Service',
        startTime: parseTimeOfDay({ value: '09:00' }),
        endTime: parseTimeOfDay({ value: '10:00' }),
        order: 0,
      },
    });
    const template = new EventTemplate({
      id: templateId,
      props: { churchId, name: 'Sunday', weekday: 0, blocks: [templateBlock] },
    });
    vi.mocked(templateRepository.getByIds).mockResolvedValue([template]);
    const existing = [4, 11, 18, 25].map((day, index) => {
      const startTime = new Date(
        `2099-01-${String(day).padStart(2, '0')}T09:00:00Z`,
      );
      const endTime = new Date(
        `2099-01-${String(day).padStart(2, '0')}T10:00:00Z`,
      );
      const event = new Event({
        id: `event-${day}`,
        props: {
          churchId,
          cycleId,
          sourceTemplateId: templateId,
          title: 'Sunday',
          start: instant(startTime),
          end: instant(endTime),
          status: index === 0 ? 'cancelled' : 'draft',
        },
      });
      const block = new EventTimeBlock({
        id: `block-${day}`,
        props: {
          churchId,
          eventId: event.id,
          sourceTemplateTimeBlockId: blockId,
          startTime: instant(startTime),
          endTime: instant(endTime),
        },
      });
      return { event, eventTimeBlocks: [block] };
    });
    vi.mocked(eventRepository.listCycleEvents).mockResolvedValue(existing);
    const input = { churchId, cycleId, templateIds: [templateId] };
    await expect(manager.generateFromTemplates(input)).resolves.toEqual({
      generatedEventCount: 0,
      generatedEventTimeBlockCount: 0,
    });
    expect(eventRepository.createEvent).not.toHaveBeenCalled();
    vi.mocked(eventRepository.listCycleEvents).mockResolvedValue(
      existing.slice(1),
    );
    vi.mocked(eventRepository.createEventTimeBlock).mockResolvedValue(
      eventTimeBlockId,
    );
    await expect(manager.generateFromTemplates(input)).resolves.toEqual({
      generatedEventCount: 1,
      generatedEventTimeBlockCount: 1,
    });
  });
  it('seeds newly generated blocks when applying a template to a sent cycle', async () => {
    const {
      manager,
      cycleRepository,
      eventRepository,
      templateRepository,
      staffingSeeder,
    } = createPlanningEventHarness();
    vi.mocked(cycleRepository.getById).mockResolvedValue(
      makeCycle({ state: 'sent' }),
    );
    const templateId = EventTemplateId.from('template-1');
    const blockId = TemplateTimeBlockId.from('template-block-1');
    const block = new TemplateTimeBlock({
      id: blockId,
      props: {
        churchId,
        templateId,
        label: 'Service',
        startTime: parseTimeOfDay({ value: '09:00' }),
        endTime: parseTimeOfDay({ value: '10:00' }),
        order: 0,
      },
    });
    vi.mocked(templateRepository.getByIds).mockResolvedValue([
      new EventTemplate({
        id: templateId,
        props: { churchId, name: 'Sunday', weekday: 0, blocks: [block] },
      }),
    ]);
    vi.mocked(eventRepository.createEventTimeBlock).mockResolvedValue(
      eventTimeBlockId,
    );
    const setup = {
      entriesByMinistry: new Map(),
      directionByMinistry: new Map(),
      globalDefaultAllIn: false,
      timeZone: 'UTC',
    };
    vi.spyOn(staffingSeeder, 'loadSetup').mockResolvedValue(setup);
    const seed = vi.spyOn(staffingSeeder, 'seed').mockResolvedValue(undefined);
    await manager.generateFromTemplates({
      churchId,
      cycleId,
      templateIds: [templateId],
    });
    expect(eventRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'scheduled', tx }),
    );
    expect(seed).toHaveBeenCalledWith(
      expect.objectContaining({
        churchId,
        setup,
        tx,
        eventTimeBlocks: expect.arrayContaining([
          expect.objectContaining({
            eventTimeBlockId,
            sourceTemplateTimeBlockId: blockId,
          }),
        ]),
      }),
    );
  });
  it('applies usual setup precedence, split shifts and headcounts when seeding a sent cycle', async () => {
    const {
      manager,
      cycleRepository,
      eventRepository,
      templateRepository,
      participationRepository,
      shiftRepository,
      usualSetupRepository,
      ministryRepository,
    } = createPlanningEventHarness();
    vi.mocked(cycleRepository.getById).mockResolvedValue(
      makeCycle({ state: 'sent' }),
    );
    const templateId = EventTemplateId.from('template-1');
    const blockId = TemplateTimeBlockId.from('template-block-1');
    const block = new TemplateTimeBlock({
      id: blockId,
      props: {
        churchId,
        templateId,
        label: 'Service',
        startTime: parseTimeOfDay({ value: '09:00' }),
        endTime: parseTimeOfDay({ value: '10:00' }),
        order: 0,
      },
    });
    vi.mocked(templateRepository.getByIds).mockResolvedValue([
      new EventTemplate({
        id: templateId,
        props: { churchId, name: 'Sunday', weekday: 0, blocks: [block] },
      }),
    ]);
    vi.mocked(eventRepository.createEventTimeBlock).mockResolvedValue(
      eventTimeBlockId,
    );
    const profileId = MinistryId.from('profile');
    const defaultInId = MinistryId.from('default-in');
    const defaultOutId = MinistryId.from('default-out');
    const excludedId = MinistryId.from('excluded');
    const roleId = RoleId.from('role');
    const sectorId = SectorId.from('sector');
    const ministries = [
      [profileId, 'all_out'],
      [defaultInId, 'all_in'],
      [defaultOutId, 'all_out'],
      [excludedId, 'all_in'],
    ] as const;
    vi.mocked(ministryRepository.listByChurch).mockResolvedValue(
      ministries.map(
        ([id, direction]) =>
          new Ministry({
            id,
            props: { churchId, name: id, defaultDirection: direction },
          }),
      ),
    );
    const setup = (ministryId: MinistryId, serves: boolean) =>
      new UsualSetup({
        props: {
          churchId,
          ministryId,
          sourceTemplateTimeBlockId: blockId,
          serves,
          shiftSplit: { kind: 'equal', count: 2 },
          headcounts: serves
            ? [
                { shiftIndex: 0, roleId, sectorId, peopleNeeded: 2 },
                { shiftIndex: 1, roleId, sectorId, peopleNeeded: 2 },
              ]
            : [],
        },
      });
    vi.mocked(usualSetupRepository.listByChurch).mockResolvedValue([
      setup(profileId, true),
      setup(excludedId, false),
    ]);
    vi.mocked(participationRepository.listByEvent).mockResolvedValue(
      ministries.map(
        ([ministryId]) =>
          new MinistryParticipation({
            id: MinistryParticipationId.from(`participation-${ministryId}`),
            props: { churchId, ministryId, eventId },
          }),
      ),
    );
    await manager.generateFromTemplates({
      churchId,
      cycleId,
      templateIds: [templateId],
    });
    expect(participationRepository.addInclusion).toHaveBeenCalledTimes(8);
    expect(participationRepository.addInclusion).toHaveBeenCalledWith(
      expect.objectContaining({
        participationId: MinistryParticipationId.from('participation-profile'),
        tx,
      }),
    );
    expect(participationRepository.addInclusion).not.toHaveBeenCalledWith(
      expect.objectContaining({
        participationId: MinistryParticipationId.from('participation-excluded'),
      }),
    );
    expect(participationRepository.addInclusion).not.toHaveBeenCalledWith(
      expect.objectContaining({
        participationId: MinistryParticipationId.from(
          'participation-default-out',
        ),
      }),
    );
    expect(shiftRepository.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        shifts: expect.arrayContaining([
          expect.objectContaining({
            participationId: MinistryParticipationId.from(
              'participation-profile',
            ),
          }),
        ]),
        tx,
      }),
    );
    expect(shiftRepository.upsertRequirement).toHaveBeenCalledTimes(8);
    expect(shiftRepository.upsertRequirement).toHaveBeenCalledWith(
      expect.objectContaining({ roleId, sectorId, peopleNeeded: 2, tx }),
    );
  });
  it('creates a draft event and seeds participations in the same transaction', async () => {
    const { manager, eventRepository } = createPlanningEventHarness();
    const result = await manager.createEvent({
      churchId,
      cycleId,
      title: 'Service',
      start,
      end,
    });
    expect(result.title).toBe('Service');
    expect(eventRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ churchId, cycleId, status: 'draft', tx }),
    );
    expect(eventRepository.seedParticipations).toHaveBeenCalledWith({
      churchId,
      eventId,
      tx,
    });
  });
  it('accepts a selected church calendar day whose UTC bounds cross midnight', async () => {
    const { manager, churchRepository, eventRepository } =
      createPlanningEventHarness();
    vi.mocked(churchRepository.getById).mockResolvedValue(
      new Church({
        id: churchId,
        props: {
          name: 'Church',
          slug: 'church',
          timezone: 'America/Sao_Paulo',
        },
      }),
    );
    vi.mocked(eventRepository.createEvent).mockImplementation(
      async (input) =>
        new Event({
          id: eventId,
          props: {
            churchId: input.churchId,
            cycleId: input.cycleId,
            title: input.title,
            start: instant(input.start),
            end: instant(input.end),
            status: input.status,
          },
        }),
    );
    const localStart = new Date('2099-01-02T03:00:00Z');
    const localEnd = new Date('2099-01-03T02:59:59.999Z');
    const result = await manager.createEvent({
      churchId,
      cycleId,
      title: 'Local day',
      start: localStart,
      end: localEnd,
    });
    expect(result.start).toBe('2099-01-02T03:00:00.000Z');
    expect(result.end).toBe('2099-01-03T02:59:59.999Z');
  });
  it('creates scheduled events on a sent cycle', async () => {
    const { manager, cycleRepository, eventRepository } =
      createPlanningEventHarness();
    vi.mocked(cycleRepository.getById).mockResolvedValue(
      makeCycle({ state: 'sent' }),
    );
    await manager.createEvent({
      churchId,
      cycleId,
      title: 'Service',
      start,
      end,
    });
    expect(eventRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'scheduled', tx }),
    );
  });
  it('rejects events outside the cycle or in a past cycle without writing', async () => {
    const { manager, cycleRepository, eventRepository } =
      createPlanningEventHarness();
    await expect(
      manager.createEvent({
        churchId,
        cycleId,
        title: 'Outside',
        start: new Date('2099-03-01T09:00:00Z'),
        end: new Date('2099-03-01T10:00:00Z'),
      }),
    ).rejects.toThrow(EventOutsideCycleError);
    vi.mocked(cycleRepository.getById).mockResolvedValue(
      makeCycle({ state: 'past' }),
    );
    await expect(
      manager.createEvent({ churchId, cycleId, title: 'Past', start, end }),
    ).rejects.toThrow(IllegalStateTransitionError);
    expect(eventRepository.createEvent).not.toHaveBeenCalled();
  });
  it('rejects another cycle’s event without writing', async () => {
    const { manager, eventRepository } = createPlanningEventHarness();
    vi.mocked(eventRepository.getEvent).mockResolvedValue(
      makeEvent({ owner: CycleId.from('other') }),
    );
    await expect(
      manager.updateEvent({ churchId, cycleId, eventId, title: 'Changed' }),
    ).rejects.toThrow('Event not found');
    await expect(
      manager.cancelEvent({ churchId, cycleId, eventId }),
    ).rejects.toThrow('Event not found');
    await expect(
      manager.createEventTimeBlock({
        churchId,
        cycleId,
        eventId,
        startTime: start,
        endTime: end,
      }),
    ).rejects.toThrow('Event not found');
    expect(eventRepository.updateEvent).not.toHaveBeenCalled();
    expect(eventRepository.deleteEvent).not.toHaveBeenCalled();
  });
  it('deletes draft events and soft-cancels scheduled events', async () => {
    const { manager, eventRepository } = createPlanningEventHarness();
    await manager.cancelEvent({ churchId, cycleId, eventId });
    expect(eventRepository.deleteEvent).toHaveBeenCalledWith({
      churchId,
      eventId,
      tx,
    });
    vi.mocked(eventRepository.getEvent).mockResolvedValue(
      makeEvent({ status: 'scheduled' }),
    );
    await manager.cancelEvent({ churchId, cycleId, eventId });
    expect(eventRepository.updateEvent).toHaveBeenCalledWith({
      churchId,
      eventId,
      status: 'cancelled',
      tx,
    });
  });
  it('requires a sent cycle event to be reopened before editing or cancellation', async () => {
    const { manager, cycleRepository, eventRepository } =
      createPlanningEventHarness();
    vi.mocked(cycleRepository.getById).mockResolvedValue(
      makeCycle({ state: 'sent' }),
    );
    vi.mocked(eventRepository.getEvent).mockResolvedValue(
      makeEvent({ status: 'scheduled' }),
    );
    await expect(
      manager.updateEvent({ churchId, cycleId, eventId, title: 'Changed' }),
    ).rejects.toThrow(IllegalStateTransitionError);
    await expect(
      manager.cancelEvent({ churchId, cycleId, eventId }),
    ).rejects.toThrow(IllegalStateTransitionError);
    vi.mocked(eventRepository.getEvent).mockResolvedValue(makeEvent());
    await manager.updateEvent({ churchId, cycleId, eventId, title: 'Changed' });
    expect(eventRepository.updateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Changed',
        status: 'scheduled',
        tx,
      }),
    );
  });
  it('creates, updates and deletes event time blocks within the transaction', async () => {
    const { manager, eventTimeBlockRepository } = createPlanningEventHarness();
    const input = { churchId, cycleId, eventId };
    expect(
      (
        await manager.createEventTimeBlock({
          ...input,
          startTime: start,
          endTime: end,
          label: 'Worship',
        })
      ).label,
    ).toBe('Worship');
    await manager.updateEventTimeBlock({
      ...input,
      eventTimeBlockId,
      label: 'Renamed',
    });
    expect(eventTimeBlockRepository.update).toHaveBeenCalledWith({
      churchId,
      eventTimeBlockId,
      input: { startTime: undefined, endTime: undefined, label: 'Renamed' },
      tx,
    });
    vi.mocked(eventTimeBlockRepository.listByEvent).mockResolvedValue([
      makeBlock(),
      makeBlock(),
    ]);
    await manager.deleteEventTimeBlock({ ...input, eventTimeBlockId });
    expect(eventTimeBlockRepository.deleteById).toHaveBeenCalledWith({
      churchId,
      eventTimeBlockId,
      tx,
    });
  });
  it('protects the last event time block and checks ownership', async () => {
    const { manager, eventTimeBlockRepository } = createPlanningEventHarness();
    const input = { churchId, cycleId, eventId, eventTimeBlockId };
    vi.mocked(eventTimeBlockRepository.listByEvent).mockResolvedValue([
      makeBlock(),
    ]);
    await expect(manager.deleteEventTimeBlock(input)).rejects.toThrow(
      LastRemainingEventTimeBlockError,
    );
    vi.mocked(eventTimeBlockRepository.getById).mockResolvedValue(
      makeBlock({ owner: EventId.from('other') }),
    );
    await expect(
      manager.updateEventTimeBlock({ ...input, label: 'Wrong' }),
    ).rejects.toThrow('EventTimeBlock not found');
    expect(eventTimeBlockRepository.deleteById).not.toHaveBeenCalled();
    expect(eventTimeBlockRepository.update).not.toHaveBeenCalled();
  });
  it('rejects event time block edits after the cycle is sent', async () => {
    const {
      manager,
      cycleRepository,
      eventRepository,
      eventTimeBlockRepository,
    } = createPlanningEventHarness();
    vi.mocked(cycleRepository.getById).mockResolvedValue(
      makeCycle({ state: 'sent' }),
    );
    vi.mocked(eventRepository.getEvent).mockResolvedValue(
      makeEvent({ status: 'scheduled' }),
    );
    const input = { churchId, cycleId, eventId, eventTimeBlockId };
    await expect(
      manager.createEventTimeBlock({
        churchId,
        cycleId,
        eventId,
        startTime: start,
        endTime: end,
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
    await expect(
      manager.updateEventTimeBlock({ ...input, label: 'Changed' }),
    ).rejects.toThrow(IllegalStateTransitionError);
    await expect(manager.deleteEventTimeBlock(input)).rejects.toThrow(
      IllegalStateTransitionError,
    );
    expect(eventTimeBlockRepository.update).not.toHaveBeenCalled();
  });
  it('rejects moving an event outside its cycle and leaves blocks alone for a title edit', async () => {
    const { manager, eventRepository, eventTimeBlockRepository } =
      createPlanningEventHarness();
    await expect(
      manager.updateEvent({
        churchId,
        cycleId,
        eventId,
        start: new Date('2099-03-01T09:00:00Z'),
      }),
    ).rejects.toThrow(EventOutsideCycleError);
    expect(eventRepository.updateEvent).not.toHaveBeenCalled();
    await manager.updateEvent({
      churchId,
      cycleId,
      eventId,
      title: 'Retitled',
    });
    expect(eventTimeBlockRepository.listByEvent).not.toHaveBeenCalled();
    expect(eventTimeBlockRepository.update).not.toHaveBeenCalled();
  });
  it('shifts child blocks with the event start in the same transaction', async () => {
    const { manager, eventTimeBlockRepository } = createPlanningEventHarness();
    vi.mocked(eventTimeBlockRepository.listByEvent).mockResolvedValue([
      makeBlock(),
    ]);
    await manager.updateEvent({
      churchId,
      cycleId,
      eventId,
      start: new Date('2099-01-04T12:00:00Z'),
    });
    expect(eventTimeBlockRepository.update).toHaveBeenCalledWith({
      churchId,
      eventTimeBlockId,
      input: {
        startTime: new Date('2099-01-04T12:00:00Z'),
        endTime: new Date('2099-01-04T13:00:00Z'),
      },
      tx,
    });
  });
});
