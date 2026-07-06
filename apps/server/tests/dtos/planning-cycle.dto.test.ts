import { describe, expect, it } from 'vitest';
import { planningCycleMapper } from '../../src/api/dtos/planning-cycle.dto';
import { Event } from '../../src/domain/entities/event';
import { PlanningCycle } from '../../src/domain/entities/planning-cycle';
import { TimeSlot } from '../../src/domain/entities/time-slot';

function createPlanningCycle() {
  return new PlanningCycle({
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      name: 'July 2026',
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-08-01T00:00:00.000Z'),
    },
    id: '22222222-2222-2222-2222-222222222222',
  });
}

function createEvent() {
  return new Event(
    {
      churchId: '11111111-1111-1111-1111-111111111111',
      planningCycleId: '22222222-2222-2222-2222-222222222222',
      title: 'Sunday Service',
      startDate: new Date('2026-07-05T13:00:00.000Z'),
      endDate: new Date('2026-07-05T15:00:00.000Z'),
    },
    '33333333-3333-3333-3333-333333333333',
  );
}

function createTimeSlot() {
  return new TimeSlot(
    {
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId: '33333333-3333-3333-3333-333333333333',
      startTime: new Date('2026-07-05T13:00:00.000Z'),
      endTime: new Date('2026-07-05T14:00:00.000Z'),
      label: 'Worship',
    },
    '44444444-4444-4444-4444-444444444444',
  );
}

describe('planningCycleMapper', () => {
  it('maps a planning cycle to its response shape with date-only fields', () => {
    const cycle = createPlanningCycle();

    const response = planningCycleMapper.toResponse(cycle);

    expect(response.id).toBe('22222222-2222-2222-2222-222222222222');
    expect(response.churchId).toBe('11111111-1111-1111-1111-111111111111');
    expect(response.name).toBe('July 2026');
    expect(response.startDate).toBe('2026-07-01');
    expect(response.endDate).toBe('2026-08-01');
    expect(response.state).toBe('draft');
    expect(response.createdAt).toBe(cycle.createdAt.toISOString());
    expect(response.updatedAt).toBe(cycle.updatedAt.toISOString());
  });

  it('maps a non-empty list of planning cycles', () => {
    const response = planningCycleMapper.listToResponse([
      createPlanningCycle(),
    ]);

    expect(response.cycles).toHaveLength(1);
    expect(response.cycles[0]?.id).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('maps an empty list of planning cycles', () => {
    const response = planningCycleMapper.listToResponse([]);

    expect(response.cycles).toEqual([]);
  });

  it('maps planning cycle details with an event that has multiple slots', () => {
    const cycle = createPlanningCycle();
    const event = createEvent();
    const slotOne = createTimeSlot();
    const slotTwo = new TimeSlot(
      {
        churchId: '11111111-1111-1111-1111-111111111111',
        eventId: '33333333-3333-3333-3333-333333333333',
        startTime: new Date('2026-07-05T14:00:00.000Z'),
        endTime: new Date('2026-07-05T15:00:00.000Z'),
        label: 'Fellowship',
      },
      '55555555-5555-5555-5555-555555555555',
    );

    const response = planningCycleMapper.detailsToResponse({
      cycle,
      events: [{ event, slots: [slotOne, slotTwo] }],
    });

    expect(response.cycle.id).toBe('22222222-2222-2222-2222-222222222222');
    expect(response.events).toHaveLength(1);
    expect(response.events[0]?.event.id).toBe(
      '33333333-3333-3333-3333-333333333333',
    );
    expect(response.events[0]?.slots).toHaveLength(2);
    expect(response.events[0]?.slots.map((slot) => slot.id)).toEqual([
      '44444444-4444-4444-4444-444444444444',
      '55555555-5555-5555-5555-555555555555',
    ]);
  });

  it('maps planning cycle details with an empty events array', () => {
    const cycle = createPlanningCycle();

    const response = planningCycleMapper.detailsToResponse({
      cycle,
      events: [],
    });

    expect(response.events).toEqual([]);
  });

  it('maps planning cycle details with an event that has an empty slots array', () => {
    const cycle = createPlanningCycle();
    const event = createEvent();

    const response = planningCycleMapper.detailsToResponse({
      cycle,
      events: [{ event, slots: [] }],
    });

    expect(response.events).toHaveLength(1);
    expect(response.events[0]?.slots).toEqual([]);
  });
});
