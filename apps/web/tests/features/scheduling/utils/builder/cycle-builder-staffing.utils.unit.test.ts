import { describe, expect, it } from 'vitest';
import type {
  CycleBuilderEventSummary,
  CycleBuilderEventTimeBlockSummary,
  CycleBuilderShiftSummary,
} from '@/features/scheduling/hooks/use-cycle-builder';
import {
  staffingStatusClasses,
  summarizeCycleCounts,
  summarizeCycleStaffing,
} from '@/features/scheduling/utils/builder/cycle-builder-staffing.utils';

function makeShift(
  overrides: Partial<CycleBuilderShiftSummary> = {},
): CycleBuilderShiftSummary {
  return {
    shiftId: 'shift-1',
    eventTimeBlockId: 'event-time-block-1',
    label: 'manhã',
    startTime: '2027-01-04T12:00:00.000Z',
    endTime: '2027-01-04T13:00:00.000Z',
    peopleNeeded: 1,
    assignedCount: 0,
    requirements: [],
    assignments: [],
    eligibleVolunteerCount: 0,
    eligibleVolunteers: [],
    ...overrides,
  };
}

function makeEventTimeBlock(
  overrides: Partial<CycleBuilderEventTimeBlockSummary> = {},
): CycleBuilderEventTimeBlockSummary {
  return {
    eventTimeBlockId: 'event-time-block-1',
    label: 'manhã',
    startTime: '2027-01-04T12:00:00.000Z',
    endTime: '2027-01-04T13:00:00.000Z',
    included: true,
    peopleNeeded: 1,
    assignedCount: 0,
    shiftCount: 1,
    shifts: [makeShift()],
    ...overrides,
  };
}

function makeEvent(
  overrides: Partial<CycleBuilderEventSummary> = {},
): CycleBuilderEventSummary {
  return {
    participationId: 'participation-1',
    state: 'assigning',
    eventId: 'event-1',
    title: 'teste',
    start: '2027-01-04T03:00:00.000Z',
    end: '2027-01-05T02:59:59.999Z',
    status: 'draft',
    fillRatio: 0,
    peopleNeeded: 1,
    assignedCount: 0,
    eventTimeBlockCount: 1,
    eventTimeBlocks: [makeEventTimeBlock()],
    ...overrides,
  };
}

describe('summarizeCycleStaffing (B-4)', () => {
  it('counts filled, required and shifts below target across included time blocks', () => {
    const data = {
      events: [
        makeEvent({
          eventTimeBlocks: [
            makeEventTimeBlock({
              shifts: [
                makeShift({
                  shiftId: 'shift-1',
                  peopleNeeded: 2,
                  assignedCount: 2,
                }),
                makeShift({
                  shiftId: 'shift-2',
                  peopleNeeded: 3,
                  assignedCount: 1,
                }),
              ],
            }),
          ],
        }),
      ],
      assignments: [],
      roles: [],
    };

    expect(summarizeCycleStaffing({ data })).toEqual({
      filled: 3,
      required: 5,
      percent: 60,
      shiftsBelowTarget: 1,
    });
  });

  it('ignores time blocks this ministry is not serving, so the denominator cannot lie', () => {
    const data = {
      events: [
        makeEvent({
          eventTimeBlocks: [
            makeEventTimeBlock({
              eventTimeBlockId: 'event-time-block-included',
              shifts: [makeShift({ peopleNeeded: 2, assignedCount: 1 })],
            }),
            makeEventTimeBlock({
              eventTimeBlockId: 'event-time-block-excluded',
              included: false,
              shifts: [
                makeShift({
                  shiftId: 'shift-x',
                  peopleNeeded: 9,
                  assignedCount: 0,
                }),
              ],
            }),
          ],
        }),
      ],
      assignments: [],
      roles: [],
    };

    expect(summarizeCycleStaffing({ data })).toEqual({
      filled: 1,
      required: 2,
      percent: 50,
      shiftsBelowTarget: 1,
    });
  });

  it('reports 0% rather than dividing by zero when nothing is required yet', () => {
    const data = {
      events: [
        makeEvent({
          eventTimeBlocks: [
            makeEventTimeBlock({ shifts: [makeShift({ peopleNeeded: 0 })] }),
          ],
        }),
      ],
      assignments: [],
      roles: [],
    };

    expect(summarizeCycleStaffing({ data })).toEqual({
      filled: 0,
      required: 0,
      percent: 0,
      shiftsBelowTarget: 0,
    });
  });
});

describe('summarizeCycleCounts', () => {
  it('counts events, included time blocks, and shifts, passing assignedCount through unchanged', () => {
    const data = {
      events: [
        makeEvent({
          eventId: 'event-1',
          eventTimeBlocks: [
            makeEventTimeBlock({
              eventTimeBlockId: 'event-time-block-1',
              shifts: [
                makeShift({ shiftId: 'shift-1', assignedCount: 2 }),
                makeShift({ shiftId: 'shift-2', assignedCount: 1 }),
              ],
            }),
          ],
        }),
        makeEvent({
          eventId: 'event-2',
          eventTimeBlocks: [
            makeEventTimeBlock({
              eventTimeBlockId: 'event-time-block-2',
              shifts: [makeShift({ shiftId: 'shift-3', assignedCount: 0 })],
            }),
          ],
        }),
      ],
      assignments: [],
      roles: [],
    };

    expect(summarizeCycleCounts({ data, assignedCount: 3 })).toEqual({
      eventCount: 2,
      eventTimeBlockCount: 2,
      shiftCount: 3,
      assignedCount: 3,
    });
  });

  it('excludes time blocks this ministry is not serving from every count but the event total', () => {
    const data = {
      events: [
        makeEvent({
          eventTimeBlocks: [
            makeEventTimeBlock({
              eventTimeBlockId: 'event-time-block-included',
              shifts: [makeShift({ shiftId: 'shift-1', assignedCount: 1 })],
            }),
            makeEventTimeBlock({
              eventTimeBlockId: 'event-time-block-excluded',
              included: false,
              shifts: [makeShift({ shiftId: 'shift-x', assignedCount: 9 })],
            }),
          ],
        }),
      ],
      assignments: [],
      roles: [],
    };

    expect(summarizeCycleCounts({ data, assignedCount: 1 })).toEqual({
      eventCount: 1,
      eventTimeBlockCount: 1,
      shiftCount: 1,
      assignedCount: 1,
    });
  });
});

describe('staffingStatusClasses', () => {
  it('stays neutral with no requirement, and grades green / amber / red above it', () => {
    expect(
      staffingStatusClasses({ percent: 0, hasRequirement: false }).text,
    ).toBe('text-muted-foreground');
    expect(
      staffingStatusClasses({ percent: 100, hasRequirement: true }).bar,
    ).toBe('bg-green-600');
    expect(
      staffingStatusClasses({ percent: 50, hasRequirement: true }).bar,
    ).toBe('bg-yellow-500');
    expect(
      staffingStatusClasses({ percent: 49, hasRequirement: true }).bar,
    ).toBe('bg-destructive');
  });
});
