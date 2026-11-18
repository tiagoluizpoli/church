import {
  isCalendarDay,
  isInstant,
  parseCalendarDay,
  parseInstant,
} from '@church/time';
import { describe, expect, it } from 'vitest';
import { cycleMapper, cycleResponseSchema } from '@/api/dtos/cycle.dto';
import { Cycle } from '@/domain/entities/cycle';
import { Event } from '@/domain/entities/event';
import { EventTimeBlock } from '@/domain/entities/event-time-block';

function createCycle() {
  return new Cycle({
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      name: 'July 2026',
      startDate: parseCalendarDay({ value: '2026-07-01' }),
      endDate: parseCalendarDay({ value: '2026-08-01' }),
    },
    id: '22222222-2222-2222-2222-222222222222',
  });
}

function createEvent() {
  return new Event({
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      cycleId: '22222222-2222-2222-2222-222222222222',
      title: 'Sunday Service',
      start: parseInstant({ value: '2026-07-05T13:00:00.000Z' }),
      end: parseInstant({ value: '2026-07-05T15:00:00.000Z' }),
    },
    id: '33333333-3333-3333-3333-333333333333',
  });
}

function createEventTimeBlock() {
  return new EventTimeBlock({
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId: '33333333-3333-3333-3333-333333333333',
      startTime: parseInstant({ value: '2026-07-05T13:00:00.000Z' }),
      endTime: parseInstant({ value: '2026-07-05T14:00:00.000Z' }),
      label: 'Worship',
    },
    id: '44444444-4444-4444-4444-444444444444',
  });
}

describe('cycleMapper', () => {
  it('maps a cycle to its response shape with date-only fields', () => {
    const cycle = createCycle();

    const response = cycleMapper.toResponse(cycle);

    expect(response.id).toBe('22222222-2222-2222-2222-222222222222');
    expect(response.churchId).toBe('11111111-1111-1111-1111-111111111111');
    expect(response.name).toBe('July 2026');
    expect(response.startDate).toBe('2026-07-01');
    expect(response.endDate).toBe('2026-08-01');
    expect(response.state).toBe('draft');
    expect(response.createdAt).toBe(cycle.createdAt.toISOString());
    expect(response.updatedAt).toBe(cycle.updatedAt.toISOString());
    expect(() => cycleResponseSchema.parse(response)).not.toThrow();
    expect(isCalendarDay({ value: response.startDate })).toBe(true);
    expect(isCalendarDay({ value: response.endDate })).toBe(true);
    expect(isInstant({ value: response.createdAt })).toBe(true);
    expect(isInstant({ value: response.updatedAt })).toBe(true);
  });

  it('maps a non-empty list of cycles', () => {
    const response = cycleMapper.listToResponse([createCycle()]);

    expect(response.cycles).toHaveLength(1);
    expect(response.cycles[0]?.id).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('maps an empty list of cycles', () => {
    const response = cycleMapper.listToResponse([]);

    expect(response.cycles).toEqual([]);
  });

  it('maps cycle details with an event that has multiple event time blocks', () => {
    const cycle = createCycle();
    const event = createEvent();
    const eventTimeBlockOne = createEventTimeBlock();
    const eventTimeBlockTwo = new EventTimeBlock({
      props: {
        churchId: '11111111-1111-1111-1111-111111111111',
        eventId: '33333333-3333-3333-3333-333333333333',
        startTime: parseInstant({ value: '2026-07-05T14:00:00.000Z' }),
        endTime: parseInstant({ value: '2026-07-05T15:00:00.000Z' }),
        label: 'Fellowship',
      },
      id: '55555555-5555-5555-5555-555555555555',
    });

    const response = cycleMapper.detailsToResponse({
      cycle,
      events: [
        { event, eventTimeBlocks: [eventTimeBlockOne, eventTimeBlockTwo] },
      ],
    });

    expect(response.cycle.id).toBe('22222222-2222-2222-2222-222222222222');
    expect(response.events).toHaveLength(1);
    expect(response.events[0]?.event.id).toBe(
      '33333333-3333-3333-3333-333333333333',
    );
    expect(response.events[0]?.eventTimeBlocks).toHaveLength(2);
    expect(
      response.events[0]?.eventTimeBlocks.map(
        (eventTimeBlock) => eventTimeBlock.id,
      ),
    ).toEqual([
      '44444444-4444-4444-4444-444444444444',
      '55555555-5555-5555-5555-555555555555',
    ]);
  });

  it('maps cycle details with an empty events array', () => {
    const cycle = createCycle();

    const response = cycleMapper.detailsToResponse({
      cycle,
      events: [],
    });

    expect(response.events).toEqual([]);
  });

  it('maps cycle details with an event that has an empty event time blocks array', () => {
    const cycle = createCycle();
    const event = createEvent();

    const response = cycleMapper.detailsToResponse({
      cycle,
      events: [{ event, eventTimeBlocks: [] }],
    });

    expect(response.events).toHaveLength(1);
    expect(response.events[0]?.eventTimeBlocks).toEqual([]);
  });
});
