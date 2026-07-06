import { describe, expect, it } from 'vitest';
import type {
  EventId,
  EventTemplateId,
  TimeBlockId,
} from '../../src/domain/branded-ids';
import { EventTemplate } from '../../src/domain/entities/event-template';
import { PlanningCycle } from '../../src/domain/entities/planning-cycle';
import { TimeBlock } from '../../src/domain/entities/time-block';
import {
  CycleEventGenerator,
  type ExistingGeneratedEvent,
  type ExistingGeneratedSlotFingerprint,
  type GeneratedCycleAppendSlotPlan,
  type GeneratedCycleCreateEventPlan,
} from '../../src/domain/services/cycle-event-generator';

const churchId = '11111111-1111-1111-1111-111111111111';
const templateId = '22222222-2222-2222-2222-222222222222' as EventTemplateId;
const blockAId = '33333333-3333-3333-3333-333333333331' as TimeBlockId;
const blockBId = '33333333-3333-3333-3333-333333333332' as TimeBlockId;

// Two-week cycle: 2026-07-01 (Wed) through 2026-07-15 (exclusive),
// so weekday=3 (Wednesday) matches 2026-07-01 and 2026-07-08.
function createCycle(): PlanningCycle {
  return new PlanningCycle({
    props: {
      churchId,
      name: 'July cycle',
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-15T00:00:00.000Z'),
    },
  });
}

function createTemplate(): EventTemplate {
  return new EventTemplate({
    props: {
      churchId,
      name: 'Wednesday Service',
      weekday: 3,
      blocks: [
        new TimeBlock({
          props: {
            churchId,
            templateId,
            label: 'Gathering',
            startTime: '09:00',
            endTime: '10:00',
            order: 1,
          },
          id: blockAId,
        }),
        new TimeBlock({
          props: {
            churchId,
            templateId,
            label: 'Service',
            // 8-char (seconds-qualified) time exercises the branch where
            // normalizeTimeForDateTime does not need to append ':00'.
            startTime: '10:00:00',
            endTime: '11:00:00',
            order: 2,
          },
          id: blockBId,
        }),
      ],
    },
    id: templateId,
  });
}

const generator = new CycleEventGenerator();
const timeZone = 'UTC';

describe('CycleEventGenerator', () => {
  it('creates a new event plan for every matching weekday with slots for each template block', () => {
    const plans = generator.generate({
      cycle: createCycle(),
      templates: [createTemplate()],
      existingEvents: [],
      existingFingerprints: [],
      timeZone,
    });

    expect(plans).toHaveLength(2);
    const [first, second] = plans as GeneratedCycleCreateEventPlan[];

    expect(first?.kind).toBe('create_event');
    expect(first?.sourceTemplateId).toBe(templateId);
    expect(first?.title).toBe('Wednesday Service');
    expect(first?.startDate).toEqual(new Date('2026-07-01T09:00:00.000Z'));
    expect(first?.endDate).toEqual(new Date('2026-07-01T11:00:00.000Z'));
    expect(first?.slots).toHaveLength(2);
    expect(first?.slots[0]).toMatchObject({
      sourceTemplateBlockId: blockAId,
      label: 'Gathering',
      startTime: new Date('2026-07-01T09:00:00.000Z'),
      endTime: new Date('2026-07-01T10:00:00.000Z'),
    });
    expect(first?.slots[1]).toMatchObject({
      sourceTemplateBlockId: blockBId,
      label: 'Service',
      startTime: new Date('2026-07-01T10:00:00.000Z'),
      endTime: new Date('2026-07-01T11:00:00.000Z'),
    });

    expect(second?.kind).toBe('create_event');
    expect(second?.startDate).toEqual(new Date('2026-07-08T09:00:00.000Z'));
    expect(second?.endDate).toEqual(new Date('2026-07-08T11:00:00.000Z'));
  });

  it('appends slots to an existing event for the same date and template instead of creating a new one', () => {
    const existingEvents: ExistingGeneratedEvent[] = [
      {
        eventId: 'existing-event-1' as EventId,
        eventDate: '2026-07-01',
        sourceTemplateId: templateId,
      },
    ];

    const plans = generator.generate({
      cycle: createCycle(),
      templates: [createTemplate()],
      existingEvents,
      existingFingerprints: [],
      timeZone,
    });

    expect(plans).toHaveLength(2);
    const appended = plans[0] as GeneratedCycleAppendSlotPlan;
    expect(appended.kind).toBe('append_slots');
    expect(appended.eventId).toBe('existing-event-1');
    expect(appended.slots).toHaveLength(2);

    const created = plans[1] as GeneratedCycleCreateEventPlan;
    expect(created.kind).toBe('create_event');
  });

  it('ignores existing events without a sourceTemplateId when matching for append', () => {
    const existingEvents: ExistingGeneratedEvent[] = [
      { eventId: 'no-template-event' as EventId, eventDate: '2026-07-01' },
    ];

    const plans = generator.generate({
      cycle: createCycle(),
      templates: [createTemplate()],
      existingEvents,
      existingFingerprints: [],
      timeZone,
    });

    expect(plans).toHaveLength(2);
    expect(plans[0]?.kind).toBe('create_event');
  });

  it('skips blocks whose fingerprint already exists and skips the date entirely once all blocks are generated', () => {
    const existingFingerprints: ExistingGeneratedSlotFingerprint[] = [
      { eventDate: '2026-07-01', sourceTemplateBlockId: blockAId },
      { eventDate: '2026-07-08', sourceTemplateBlockId: blockAId },
      { eventDate: '2026-07-08', sourceTemplateBlockId: blockBId },
    ];

    const plans = generator.generate({
      cycle: createCycle(),
      templates: [createTemplate()],
      existingEvents: [],
      existingFingerprints,
      timeZone,
    });

    // 2026-07-08 has both blocks already fingerprinted, so it is skipped
    // entirely (the slots.length === 0 continue branch).
    expect(plans).toHaveLength(1);
    const plan = plans[0] as GeneratedCycleCreateEventPlan;
    expect(plan.slots).toHaveLength(1);
    expect(plan.slots[0]?.sourceTemplateBlockId).toBe(blockBId);
  });

  it('returns no plans when there are no matching weekdays in the cycle', () => {
    const mondayTemplate = new EventTemplate({
      props: {
        churchId,
        name: 'Monday Group',
        weekday: 1,
        blocks: [
          new TimeBlock({
            props: {
              churchId,
              templateId: 'no-monday-template',
              label: 'Only Block',
              startTime: '09:00',
              endTime: '10:00',
              order: 1,
            },
          }),
        ],
      },
    });

    // Cycle spans a single day (Wednesday 2026-07-01), no Monday inside it.
    const singleDayCycle = new PlanningCycle({
      props: {
        churchId,
        name: 'Single day',
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: new Date('2026-07-02T00:00:00.000Z'),
      },
    });

    const plans = generator.generate({
      cycle: singleDayCycle,
      templates: [mondayTemplate],
      existingEvents: [],
      existingFingerprints: [],
      timeZone,
    });

    expect(plans).toHaveLength(0);
  });
});
