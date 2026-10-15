import {
  fromTimeColumn,
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
} from '@church/time';
import { describe, expect, it } from 'vitest';
import type {
  EventId,
  EventTemplateId,
  TemplateTimeBlockId,
} from '@/domain/branded-ids';
import { Cycle } from '@/domain/entities/cycle';
import { EventTemplate } from '@/domain/entities/event-template';
import { TemplateTimeBlock } from '@/domain/entities/template-time-block';
import {
  CycleEventGenerator,
  type ExistingGeneratedEvent,
  type ExistingGeneratedEventTimeBlockFingerprint,
  type GeneratedCycleAppendEventTimeBlockPlan,
  type GeneratedCycleCreateEventPlan,
} from '@/domain/services/cycle-event-generator';

const churchId = '11111111-1111-1111-1111-111111111111';
const templateId = '22222222-2222-2222-2222-222222222222' as EventTemplateId;
const blockAId = '33333333-3333-3333-3333-333333333331' as TemplateTimeBlockId;
const blockBId = '33333333-3333-3333-3333-333333333332' as TemplateTimeBlockId;

// Two-week cycle: 2026-07-01 (Wed) through 2026-07-15 (exclusive),
// so weekday=3 (Wednesday) matches 2026-07-01 and 2026-07-08.
function createCycle(): Cycle {
  return new Cycle({
    props: {
      churchId,
      name: 'July cycle',
      startDate: parseCalendarDay({ value: '2026-07-01' }),
      endDate: parseCalendarDay({ value: '2026-07-15' }),
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
        new TemplateTimeBlock({
          props: {
            churchId,
            templateId,
            label: 'Gathering',
            startTime: parseTimeOfDay({ value: '09:00' }),
            endTime: parseTimeOfDay({ value: '10:00' }),
            order: 1,
          },
          id: blockAId,
        }),
        new TemplateTimeBlock({
          props: {
            churchId,
            templateId,
            label: 'Service',
            // Seconds-qualified time exercises the Postgres `time` column shape.
            startTime: fromTimeColumn({ value: '10:00:00' }),
            endTime: fromTimeColumn({ value: '11:00:00' }),
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
  it('creates a new event plan for every matching weekday with event time blocks for each template block', () => {
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
    expect(first?.start).toEqual(
      parseInstant({ value: '2026-07-01T09:00:00.000Z' }),
    );
    expect(first?.end).toEqual(
      parseInstant({ value: '2026-07-01T11:00:00.000Z' }),
    );
    expect(first?.eventTimeBlocks).toHaveLength(2);
    expect(first?.eventTimeBlocks[0]).toMatchObject({
      sourceTemplateTimeBlockId: blockAId,
      label: 'Gathering',
      startTime: parseInstant({ value: '2026-07-01T09:00:00.000Z' }),
      endTime: parseInstant({ value: '2026-07-01T10:00:00.000Z' }),
    });
    expect(first?.eventTimeBlocks[1]).toMatchObject({
      sourceTemplateTimeBlockId: blockBId,
      label: 'Service',
      startTime: parseInstant({ value: '2026-07-01T10:00:00.000Z' }),
      endTime: parseInstant({ value: '2026-07-01T11:00:00.000Z' }),
    });

    expect(second?.kind).toBe('create_event');
    expect(second?.start).toEqual(
      parseInstant({ value: '2026-07-08T09:00:00.000Z' }),
    );
    expect(second?.end).toEqual(
      parseInstant({ value: '2026-07-08T11:00:00.000Z' }),
    );
  });

  it('appends event time blocks to an existing event for the same date and template instead of creating a new one', () => {
    const existingEvents: ExistingGeneratedEvent[] = [
      {
        eventId: 'existing-event-1' as EventId,
        eventDate: parseCalendarDay({ value: '2026-07-01' }),
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
    const appended = plans[0] as GeneratedCycleAppendEventTimeBlockPlan;
    expect(appended.kind).toBe('append_event_time_blocks');
    expect(appended.eventId).toBe('existing-event-1');
    expect(appended.eventTimeBlocks).toHaveLength(2);

    const created = plans[1] as GeneratedCycleCreateEventPlan;
    expect(created.kind).toBe('create_event');
  });

  it('ignores existing events without a sourceTemplateId when matching for append', () => {
    const existingEvents: ExistingGeneratedEvent[] = [
      {
        eventId: 'no-template-event' as EventId,
        eventDate: parseCalendarDay({ value: '2026-07-01' }),
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
    expect(plans[0]?.kind).toBe('create_event');
  });

  it('skips blocks whose fingerprint already exists and skips the date entirely once all blocks are generated', () => {
    const existingFingerprints: ExistingGeneratedEventTimeBlockFingerprint[] = [
      {
        eventDate: parseCalendarDay({ value: '2026-07-01' }),
        sourceTemplateTimeBlockId: blockAId,
      },
      {
        eventDate: parseCalendarDay({ value: '2026-07-08' }),
        sourceTemplateTimeBlockId: blockAId,
      },
      {
        eventDate: parseCalendarDay({ value: '2026-07-08' }),
        sourceTemplateTimeBlockId: blockBId,
      },
    ];

    const plans = generator.generate({
      cycle: createCycle(),
      templates: [createTemplate()],
      existingEvents: [],
      existingFingerprints,
      timeZone,
    });

    // 2026-07-08 has both blocks already fingerprinted, so it is skipped
    // entirely (the eventTimeBlocks.length === 0 continue branch).
    expect(plans).toHaveLength(1);
    const plan = plans[0] as GeneratedCycleCreateEventPlan;
    expect(plan.eventTimeBlocks).toHaveLength(1);
    expect(plan.eventTimeBlocks[0]?.sourceTemplateTimeBlockId).toBe(blockBId);
  });

  it('resolves an overnight block onto the following CalendarDay', () => {
    const overnightBlockId =
      '33333333-3333-3333-3333-333333333333' as TemplateTimeBlockId;
    const overnightTemplateId =
      '22222222-2222-2222-2222-222222222223' as EventTemplateId;
    const overnightTemplate = new EventTemplate({
      props: {
        churchId,
        name: 'Overnight Watch',
        weekday: 3,
        blocks: [
          new TemplateTimeBlock({
            props: {
              churchId,
              templateId: overnightTemplateId,
              label: 'Vigil',
              startTime: parseTimeOfDay({ value: '22:00' }),
              endTime: parseTimeOfDay({ value: '02:00' }),
              order: 1,
            },
            id: overnightBlockId,
          }),
        ],
      },
      id: overnightTemplateId,
    });

    const plans = generator.generate({
      cycle: createCycle(),
      templates: [overnightTemplate],
      existingEvents: [],
      existingFingerprints: [],
      timeZone,
    });

    const [first] = plans as GeneratedCycleCreateEventPlan[];
    expect(first?.eventTimeBlocks[0]).toMatchObject({
      startTime: parseInstant({ value: '2026-07-01T22:00:00.000Z' }),
      endTime: parseInstant({ value: '2026-07-02T02:00:00.000Z' }),
    });
  });

  it('returns no plans when there are no matching weekdays in the cycle', () => {
    const mondayTemplate = new EventTemplate({
      props: {
        churchId,
        name: 'Monday Group',
        weekday: 1,
        blocks: [
          new TemplateTimeBlock({
            props: {
              churchId,
              templateId: 'no-monday-template',
              label: 'Only Block',
              startTime: parseTimeOfDay({ value: '09:00' }),
              endTime: parseTimeOfDay({ value: '10:00' }),
              order: 1,
            },
          }),
        ],
      },
    });

    // Cycle spans a single day (Wednesday 2026-07-01), no Monday inside it.
    const singleDayCycle = new Cycle({
      props: {
        churchId,
        name: 'Single day',
        startDate: parseCalendarDay({ value: '2026-07-01' }),
        endDate: parseCalendarDay({ value: '2026-07-02' }),
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
