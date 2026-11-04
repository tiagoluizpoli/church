import { fromDate, parseCalendarDay, parseTimeOfDay } from '@church/time';
import { describe, expect, it, vi } from 'vitest';
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
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '@/domain/contracts/infrastructure/cycle.repository';
import type { EventTemplateRepository } from '@/domain/contracts/infrastructure/event-template.repository';
import type { EventTimeBlockRepository } from '@/domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '@/domain/contracts/infrastructure/planning-event.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { UsualSetupRepository } from '@/domain/contracts/infrastructure/usual-setup.repository';
import { Church } from '@/domain/entities/church';
import { Cycle } from '@/domain/entities/cycle';
import { Event, type EventStatus } from '@/domain/entities/event';
import { EventTemplate } from '@/domain/entities/event-template';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { Ministry } from '@/domain/entities/ministry';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { TemplateTimeBlock } from '@/domain/entities/template-time-block';
import { UsualSetup } from '@/domain/entities/usual-setup';
import {
  EventOutsideCycleError,
  IllegalStateTransitionError,
  LastRemainingEventTimeBlockError,
} from '@/domain/errors';

const churchId = ChurchId.from('church-1');
const cycleId = CycleId.from('cycle-1');
const eventId = EventId.from('event-1');
const eventTimeBlockId = EventTimeBlockId.from('block-1');
const start = new Date('2099-01-02T09:00:00Z');
const end = new Date('2099-01-02T10:00:00Z');
const instant = (date: Date) => fromDate({ date });

function makeEvent(status: EventStatus = 'draft', owner = cycleId) {
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
function makeCycle(state: 'draft' | 'sent' | 'past' = 'draft') {
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
function makeBlock(owner = eventId) {
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
function createHarness() {
  const cycleRepository: CycleRepository = {
    create: vi.fn(),
    list: vi.fn(),
    getById: vi.fn().mockResolvedValue(makeCycle()),
    findOverlapping: vi.fn(),
    updateState: vi.fn(),
    acquireChurchLock: vi.fn(),
  };
  const eventRepository: PlanningEventRepository = {
    createEvent: vi.fn().mockResolvedValue(makeEvent()),
    updateEvent: vi.fn().mockResolvedValue(makeEvent()),
    getEvent: vi.fn().mockResolvedValue(makeEvent()),
    deleteEvent: vi.fn(),
    listCycleEvents: vi.fn().mockResolvedValue([]),
    createEventTimeBlock: vi.fn(),
    seedParticipations: vi.fn(),
  };
  const templateRepository: EventTemplateRepository = {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    getByIds: vi.fn().mockResolvedValue([]),
    getUsage: vi.fn(),
  };
  const eventTimeBlockRepository: EventTimeBlockRepository = {
    getById: vi.fn().mockResolvedValue(makeBlock()),
    listByEvent: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(makeBlock()),
    update: vi.fn().mockResolvedValue(makeBlock()),
    deleteById: vi.fn(),
    findOverlapping: vi.fn(),
    deleteByEvent: vi.fn(),
    countActiveAssignments: vi.fn(),
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
  const manager = new DbPlanningEventManager({
    cycleRepository,
    eventRepository,
    templateRepository,
    eventTimeBlockRepository,
    churchRepository,
    unitOfWork,
    staffingSeeder,
  });
  return {
    manager,
    cycleRepository,
    eventRepository,
    templateRepository,
    eventTimeBlockRepository,
    staffingSeeder,
    churchRepository,
    participationRepository,
    shiftRepository,
    usualSetupRepository,
    ministryRepository,
  };
}

describe('DbPlanningEventManager', () => {
  it('applies a template to each matching day', async () => {
    const { manager, templateRepository, eventRepository } = createHarness();
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
        tx: 'tx',
      }),
    );
    expect(eventRepository.createEventTimeBlock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceTemplateTimeBlockId: blockId, tx: 'tx' }),
    );
    expect(eventRepository.seedParticipations).toHaveBeenCalledTimes(4);
  });
  it('does not recreate generated blocks, including cancelled events, and regenerates missing dates', async () => {
    const { manager, templateRepository, eventRepository } = createHarness();
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
    } = createHarness();
    vi.mocked(cycleRepository.getById).mockResolvedValue(makeCycle('sent'));
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
      expect.objectContaining({ status: 'scheduled', tx: 'tx' }),
    );
    expect(seed).toHaveBeenCalledWith(
      expect.objectContaining({
        churchId,
        setup,
        tx: 'tx',
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
    } = createHarness();
    vi.mocked(cycleRepository.getById).mockResolvedValue(makeCycle('sent'));
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
        tx: 'tx',
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
        tx: 'tx',
      }),
    );
    expect(shiftRepository.upsertRequirement).toHaveBeenCalledTimes(8);
    expect(shiftRepository.upsertRequirement).toHaveBeenCalledWith(
      expect.objectContaining({ roleId, sectorId, peopleNeeded: 2, tx: 'tx' }),
    );
  });
  it('creates a draft event and seeds participations in the same transaction', async () => {
    const { manager, eventRepository } = createHarness();
    const result = await manager.createEvent({
      churchId,
      cycleId,
      title: 'Service',
      start,
      end,
    });
    expect(result.title).toBe('Service');
    expect(eventRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ churchId, cycleId, status: 'draft', tx: 'tx' }),
    );
    expect(eventRepository.seedParticipations).toHaveBeenCalledWith({
      churchId,
      eventId,
      tx: 'tx',
    });
  });
  it('accepts a selected church calendar day whose UTC bounds cross midnight', async () => {
    const { manager, churchRepository, eventRepository } = createHarness();
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
    const { manager, cycleRepository, eventRepository } = createHarness();
    vi.mocked(cycleRepository.getById).mockResolvedValue(makeCycle('sent'));
    await manager.createEvent({
      churchId,
      cycleId,
      title: 'Service',
      start,
      end,
    });
    expect(eventRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'scheduled', tx: 'tx' }),
    );
  });
  it('rejects events outside the cycle or in a past cycle without writing', async () => {
    const { manager, cycleRepository, eventRepository } = createHarness();
    await expect(
      manager.createEvent({
        churchId,
        cycleId,
        title: 'Outside',
        start: new Date('2099-03-01T09:00:00Z'),
        end: new Date('2099-03-01T10:00:00Z'),
      }),
    ).rejects.toThrow(EventOutsideCycleError);
    vi.mocked(cycleRepository.getById).mockResolvedValue(makeCycle('past'));
    await expect(
      manager.createEvent({ churchId, cycleId, title: 'Past', start, end }),
    ).rejects.toThrow(IllegalStateTransitionError);
    expect(eventRepository.createEvent).not.toHaveBeenCalled();
  });
  it('rejects another cycle’s event without writing', async () => {
    const { manager, eventRepository } = createHarness();
    vi.mocked(eventRepository.getEvent).mockResolvedValue(
      makeEvent('draft', CycleId.from('other')),
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
    const { manager, eventRepository } = createHarness();
    await manager.cancelEvent({ churchId, cycleId, eventId });
    expect(eventRepository.deleteEvent).toHaveBeenCalledWith({
      churchId,
      eventId,
      tx: 'tx',
    });
    vi.mocked(eventRepository.getEvent).mockResolvedValue(
      makeEvent('scheduled'),
    );
    await manager.cancelEvent({ churchId, cycleId, eventId });
    expect(eventRepository.updateEvent).toHaveBeenCalledWith({
      churchId,
      eventId,
      status: 'cancelled',
      tx: 'tx',
    });
  });
  it('requires a sent cycle event to be reopened before editing or cancellation', async () => {
    const { manager, cycleRepository, eventRepository } = createHarness();
    vi.mocked(cycleRepository.getById).mockResolvedValue(makeCycle('sent'));
    vi.mocked(eventRepository.getEvent).mockResolvedValue(
      makeEvent('scheduled'),
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
        tx: 'tx',
      }),
    );
  });
  it('creates, updates and deletes event time blocks within the transaction', async () => {
    const { manager, eventTimeBlockRepository } = createHarness();
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
      tx: 'tx',
    });
    vi.mocked(eventTimeBlockRepository.listByEvent).mockResolvedValue([
      makeBlock(),
      makeBlock(),
    ]);
    await manager.deleteEventTimeBlock({ ...input, eventTimeBlockId });
    expect(eventTimeBlockRepository.deleteById).toHaveBeenCalledWith({
      churchId,
      eventTimeBlockId,
      tx: 'tx',
    });
  });
  it('protects the last event time block and checks ownership', async () => {
    const { manager, eventTimeBlockRepository } = createHarness();
    const input = { churchId, cycleId, eventId, eventTimeBlockId };
    vi.mocked(eventTimeBlockRepository.listByEvent).mockResolvedValue([
      makeBlock(),
    ]);
    await expect(manager.deleteEventTimeBlock(input)).rejects.toThrow(
      LastRemainingEventTimeBlockError,
    );
    vi.mocked(eventTimeBlockRepository.getById).mockResolvedValue(
      makeBlock(EventId.from('other')),
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
    } = createHarness();
    vi.mocked(cycleRepository.getById).mockResolvedValue(makeCycle('sent'));
    vi.mocked(eventRepository.getEvent).mockResolvedValue(
      makeEvent('scheduled'),
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
      createHarness();
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
    const { manager, eventTimeBlockRepository } = createHarness();
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
      tx: 'tx',
    });
  });
});
