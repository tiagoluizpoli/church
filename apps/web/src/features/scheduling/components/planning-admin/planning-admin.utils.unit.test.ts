import { fromTimeColumn, parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import type {
  CycleFormState,
  PlanningCycleEventGroup,
  SelectedPlanningCycle,
  TemplateBlockDraft,
  TemplateFormState,
} from './planning-admin.types';
import {
  calculateTotalSlots,
  canCreateCycle,
  canCreateTemplate,
  cycleIsLocked,
  describeTimeBlockSpan,
  eventStatusBadgeVariant,
  isMultiDayEvent,
  shiftedEnd,
  stateBadgeVariant,
} from './planning-admin.utils';

function makeCycle(
  overrides: Partial<SelectedPlanningCycle> = {},
): SelectedPlanningCycle {
  return {
    id: 'cycle-1',
    churchId: 'church-1',
    name: 'Sunday cycle',
    startDate: '2027-01-01',
    endDate: '2027-01-31',
    state: 'draft',
    createdAt: '2027-01-01T00:00:00.000Z',
    updatedAt: '2027-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeEventGroup(slotCount: number): PlanningCycleEventGroup {
  return {
    event: {
      id: 'event-1',
      churchId: 'church-1',
      planningCycleId: 'cycle-1',
      title: 'Sunday Service',
      start: '2027-01-03T09:00:00.000Z',
      end: '2027-01-03T11:00:00.000Z',
      status: 'scheduled',
      eventType: 'hourly',
      createdAt: '2027-01-01T00:00:00.000Z',
      updatedAt: '2027-01-01T00:00:00.000Z',
    },
    slots: Array.from({ length: slotCount }, (_unused, index) => ({
      id: `slot-${index}`,
      churchId: 'church-1',
      eventId: 'event-1',
      startTime: '2027-01-03T09:00:00.000Z',
      endTime: '2027-01-03T09:30:00.000Z',
      status: 'active',
      requirements: [],
    })),
  };
}

function makeCycleForm(
  overrides: Partial<CycleFormState> = {},
): CycleFormState {
  return {
    name: 'Sunday cycle',
    startDate: '2027-01-01',
    endDate: '2027-01-31',
    ...overrides,
  };
}

function makeTemplateBlock(
  overrides: Partial<TemplateBlockDraft> = {},
): TemplateBlockDraft {
  return {
    id: 'template-block-1',
    label: 'Welcome',
    startTime: fromTimeColumn({ value: '09:00:00' }),
    endTime: fromTimeColumn({ value: '09:30:00' }),
    ...overrides,
  };
}

function makeTemplateForm(
  overrides: Partial<TemplateFormState> = {},
): TemplateFormState {
  return {
    name: 'Sunday',
    weekday: '0',
    blocks: [makeTemplateBlock()],
    ...overrides,
  };
}

describe('canCreateCycle', () => {
  it('allows a complete form whose start precedes its end', () => {
    expect(canCreateCycle({ cycleForm: makeCycleForm() })).toBe(true);
  });

  it('rejects a blank name', () => {
    expect(canCreateCycle({ cycleForm: makeCycleForm({ name: '  ' }) })).toBe(
      false,
    );
  });

  it('rejects a missing start or end date', () => {
    expect(
      canCreateCycle({ cycleForm: makeCycleForm({ startDate: '' }) }),
    ).toBe(false);
    expect(canCreateCycle({ cycleForm: makeCycleForm({ endDate: '' }) })).toBe(
      false,
    );
  });

  it('rejects a start date on or after the end date', () => {
    expect(
      canCreateCycle({
        cycleForm: makeCycleForm({
          startDate: '2027-01-31',
          endDate: '2027-01-01',
        }),
      }),
    ).toBe(false);
    expect(
      canCreateCycle({
        cycleForm: makeCycleForm({
          startDate: '2027-01-01',
          endDate: '2027-01-01',
        }),
      }),
    ).toBe(false);
  });
});

describe('canCreateTemplate', () => {
  it('allows a named template whose blocks are all fully filled', () => {
    expect(canCreateTemplate({ templateForm: makeTemplateForm() })).toBe(true);
  });

  it('rejects a blank name', () => {
    expect(
      canCreateTemplate({
        templateForm: makeTemplateForm({ name: '  ' }),
      }),
    ).toBe(false);
  });

  it('rejects a template with no blocks', () => {
    expect(
      canCreateTemplate({ templateForm: makeTemplateForm({ blocks: [] }) }),
    ).toBe(false);
  });

  it('rejects a block missing its label or either time', () => {
    expect(
      canCreateTemplate({
        templateForm: makeTemplateForm({
          blocks: [makeTemplateBlock({ label: '' })],
        }),
      }),
    ).toBe(false);
    expect(
      canCreateTemplate({
        templateForm: makeTemplateForm({
          blocks: [makeTemplateBlock({ startTime: null })],
        }),
      }),
    ).toBe(false);
    expect(
      canCreateTemplate({
        templateForm: makeTemplateForm({
          blocks: [makeTemplateBlock({ endTime: null })],
        }),
      }),
    ).toBe(false);
  });

  it('allows an overnight block whose end time is earlier than its start time', () => {
    expect(
      canCreateTemplate({
        templateForm: makeTemplateForm({
          blocks: [
            makeTemplateBlock({
              startTime: fromTimeColumn({ value: '22:00:00' }),
              endTime: fromTimeColumn({ value: '06:00:00' }),
            }),
          ],
        }),
      }),
    ).toBe(true);
  });

  it('rejects a zero-length block whose start equals its end (ADR-0003)', () => {
    const time = fromTimeColumn({ value: '09:00:00' });
    expect(
      canCreateTemplate({
        templateForm: makeTemplateForm({
          blocks: [makeTemplateBlock({ startTime: time, endTime: time })],
        }),
      }),
    ).toBe(false);
  });
});

describe('isMultiDayEvent', () => {
  it('is false when the start and end share a calendar day', () => {
    expect(
      isMultiDayEvent({
        eventStart: '2027-01-01T09:00:00.000Z',
        eventEnd: '2027-01-01T17:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('is true when the start and end fall on different calendar days', () => {
    expect(
      isMultiDayEvent({
        eventStart: '2027-01-01T22:00:00.000Z',
        eventEnd: '2027-01-02T06:00:00.000Z',
      }),
    ).toBe(true);
  });
});

describe('shiftedEnd', () => {
  it('shifts the end by the same delta the start moved by (FR-007)', () => {
    const result = shiftedEnd({
      newStart: parseInstant({ value: '2027-01-02T09:00:00.000Z' }),
      originalStart: '2027-01-01T09:00:00.000Z',
      originalEnd: '2027-01-01T10:30:00.000Z',
    });

    expect(result).toBe('2027-01-02T10:30:00.000Z');
  });
});

describe('describeTimeBlockSpan', () => {
  it('describes a same-day block by its duration', () => {
    expect(
      describeTimeBlockSpan({
        startTime: fromTimeColumn({ value: '09:00:00' }),
        endTime: fromTimeColumn({ value: '09:30:00' }),
      }),
    ).toBe('Runs 30m');
  });

  it('marks an overnight block as ending the next day (ADR-0003)', () => {
    expect(
      describeTimeBlockSpan({
        startTime: fromTimeColumn({ value: '22:00:00' }),
        endTime: fromTimeColumn({ value: '02:00:00' }),
      }),
    ).toBe('Runs 4h · ends next day');
  });
});

describe('calculateTotalSlots', () => {
  it('sums slot counts across every event group', () => {
    const events = [makeEventGroup(2), makeEventGroup(1)];

    expect(calculateTotalSlots({ events })).toBe(3);
  });

  it('is zero for undefined events', () => {
    expect(calculateTotalSlots({ events: undefined })).toBe(0);
  });
});

describe('cycleIsLocked', () => {
  it('is true only for a locked cycle', () => {
    expect(cycleIsLocked({ cycle: makeCycle({ state: 'locked' }) })).toBe(true);
    expect(cycleIsLocked({ cycle: makeCycle({ state: 'draft' }) })).toBe(false);
    expect(cycleIsLocked({ cycle: null })).toBe(false);
    expect(cycleIsLocked({ cycle: undefined })).toBe(false);
  });
});

describe('stateBadgeVariant', () => {
  it('maps each cycle state to its badge variant', () => {
    expect(stateBadgeVariant({ state: 'locked' })).toBe('default');
    expect(stateBadgeVariant({ state: 'archived' })).toBe('outline');
    expect(stateBadgeVariant({ state: 'draft' })).toBe('secondary');
  });
});

describe('eventStatusBadgeVariant', () => {
  it('maps each event status to its badge variant', () => {
    expect(eventStatusBadgeVariant({ status: 'scheduled' })).toBe('default');
    expect(eventStatusBadgeVariant({ status: 'cancelled' })).toBe(
      'destructive',
    );
    expect(eventStatusBadgeVariant({ status: 'draft' })).toBe('secondary');
  });
});
