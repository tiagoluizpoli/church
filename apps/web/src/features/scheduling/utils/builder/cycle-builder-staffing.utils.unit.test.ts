import { describe, expect, it } from 'vitest';
import {
  staffingStatusClasses,
  summarizeCycleCounts,
  summarizeCycleStaffing,
} from './cycle-builder-staffing.utils';
import type {
  CycleBuilderEventSummary,
  CycleBuilderShiftSummary,
  CycleBuilderSlotSummary,
} from '@/features/scheduling/hooks/use-cycle-builder';

function makeShift(
  overrides: Partial<CycleBuilderShiftSummary> = {},
): CycleBuilderShiftSummary {
  return {
    shiftId: 'shift-1',
    slotId: 'slot-1',
    label: 'manhã',
    startTime: '2027-01-04T12:00:00.000Z',
    endTime: '2027-01-04T13:00:00.000Z',
    requiredCount: 1,
    assignedCount: 0,
    requirements: [],
    assignments: [],
    eligibleVolunteerCount: 0,
    eligibleVolunteers: [],
    ...overrides,
  };
}

function makeSlot(
  overrides: Partial<CycleBuilderSlotSummary> = {},
): CycleBuilderSlotSummary {
  return {
    slotId: 'slot-1',
    label: 'manhã',
    startTime: '2027-01-04T12:00:00.000Z',
    endTime: '2027-01-04T13:00:00.000Z',
    included: true,
    requiredCount: 1,
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
    state: 'rostering',
    eventId: 'event-1',
    title: 'teste',
    startDate: '2027-01-04T03:00:00.000Z',
    endDate: '2027-01-05T02:59:59.999Z',
    status: 'draft',
    eventType: 'hourly',
    fillRatio: 0,
    requiredCount: 1,
    assignedCount: 0,
    slotCount: 1,
    slots: [makeSlot()],
    ...overrides,
  };
}

describe('summarizeCycleStaffing (B-4)', () => {
  it('counts filled, required and shifts below target across included slots', () => {
    const data = {
      events: [
        makeEvent({
          slots: [
            makeSlot({
              shifts: [
                makeShift({
                  shiftId: 'shift-1',
                  requiredCount: 2,
                  assignedCount: 2,
                }),
                makeShift({
                  shiftId: 'shift-2',
                  requiredCount: 3,
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

  it('ignores slots this ministry is not serving, so the denominator cannot lie', () => {
    const data = {
      events: [
        makeEvent({
          slots: [
            makeSlot({
              slotId: 'slot-included',
              shifts: [makeShift({ requiredCount: 2, assignedCount: 1 })],
            }),
            makeSlot({
              slotId: 'slot-excluded',
              included: false,
              shifts: [
                makeShift({
                  shiftId: 'shift-x',
                  requiredCount: 9,
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
          slots: [makeSlot({ shifts: [makeShift({ requiredCount: 0 })] })],
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
  it('counts events, included slots, and shifts, passing assignedCount through unchanged', () => {
    const data = {
      events: [
        makeEvent({
          eventId: 'event-1',
          slots: [
            makeSlot({
              slotId: 'slot-1',
              shifts: [
                makeShift({ shiftId: 'shift-1', assignedCount: 2 }),
                makeShift({ shiftId: 'shift-2', assignedCount: 1 }),
              ],
            }),
          ],
        }),
        makeEvent({
          eventId: 'event-2',
          slots: [
            makeSlot({
              slotId: 'slot-2',
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
      slotCount: 2,
      shiftCount: 3,
      assignedCount: 3,
    });
  });

  it('excludes slots this ministry is not serving from every count but the event total', () => {
    const data = {
      events: [
        makeEvent({
          slots: [
            makeSlot({
              slotId: 'slot-included',
              shifts: [makeShift({ shiftId: 'shift-1', assignedCount: 1 })],
            }),
            makeSlot({
              slotId: 'slot-excluded',
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
      slotCount: 1,
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
