import { fromTimeColumn, parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import type {
  CycleEventGroup,
  CycleFormState,
  SelectedCycle,
  TemplateFormState,
  TemplateTimeBlockDraft,
} from '@/features/scheduling/components/planning-admin/planning-admin.types';
import {
  calculateTotalEventTimeBlocks,
  canCreateCycle,
  canSaveTemplate,
  cycleIsSent,
  describeTemplateTimeBlockSpan,
  eventSpanLabel,
  eventStatusBadgeVariant,
  isMultiDayEvent,
  shiftedEnd,
  stateBadgeVariant,
  templateBlockErrors,
  toTemplateRequestBlocks,
} from '@/features/scheduling/components/planning-admin/planning-admin.utils';

function makeCycle(overrides: Partial<SelectedCycle> = {}): SelectedCycle {
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

function makeEventGroup(eventTimeBlockCount: number): CycleEventGroup {
  return {
    event: {
      id: 'event-1',
      churchId: 'church-1',
      cycleId: 'cycle-1',
      title: 'Sunday Service',
      start: '2027-01-03T09:00:00.000Z',
      end: '2027-01-03T11:00:00.000Z',
      status: 'scheduled',
      createdAt: '2027-01-01T00:00:00.000Z',
      updatedAt: '2027-01-01T00:00:00.000Z',
    },
    eventTimeBlocks: Array.from(
      { length: eventTimeBlockCount },
      (_unused, index) => ({
        id: `event-time-block-${index}`,
        churchId: 'church-1',
        eventId: 'event-1',
        startTime: '2027-01-03T09:00:00.000Z',
        endTime: '2027-01-03T09:30:00.000Z',
        status: 'active',
        requirements: [],
      }),
    ),
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

function makeTemplateTimeBlock(
  overrides: Partial<TemplateTimeBlockDraft> = {},
): TemplateTimeBlockDraft {
  return {
    key: 'template-time-block-1',
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
    blocks: [makeTemplateTimeBlock()],
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

describe('canSaveTemplate', () => {
  it('allows a named template whose blocks are all fully filled', () => {
    expect(canSaveTemplate({ templateForm: makeTemplateForm() })).toBe(true);
  });

  it('rejects a blank name', () => {
    expect(
      canSaveTemplate({
        templateForm: makeTemplateForm({ name: '  ' }),
      }),
    ).toBe(false);
  });

  it('rejects a template with no blocks', () => {
    expect(
      canSaveTemplate({ templateForm: makeTemplateForm({ blocks: [] }) }),
    ).toBe(false);
  });

  it('rejects a block missing its label or either time', () => {
    expect(
      canSaveTemplate({
        templateForm: makeTemplateForm({
          blocks: [makeTemplateTimeBlock({ label: '' })],
        }),
      }),
    ).toBe(false);
    expect(
      canSaveTemplate({
        templateForm: makeTemplateForm({
          blocks: [makeTemplateTimeBlock({ startTime: null })],
        }),
      }),
    ).toBe(false);
    expect(
      canSaveTemplate({
        templateForm: makeTemplateForm({
          blocks: [makeTemplateTimeBlock({ endTime: null })],
        }),
      }),
    ).toBe(false);
  });

  it('allows an overnight block whose end time is earlier than its start time', () => {
    expect(
      canSaveTemplate({
        templateForm: makeTemplateForm({
          blocks: [
            makeTemplateTimeBlock({
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
      canSaveTemplate({
        templateForm: makeTemplateForm({
          blocks: [makeTemplateTimeBlock({ startTime: time, endTime: time })],
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

describe('eventSpanLabel', () => {
  const timeZone = 'America/Sao_Paulo';

  it('labels a Sao Paulo single day hourly', () => {
    expect(
      eventSpanLabel({
        start: '2026-06-28T03:00:00.000Z',
        end: '2026-06-29T02:59:59.999Z',
        timeZone,
      }),
    ).toBe('hourly');
  });

  it('labels a Sao Paulo evening event hourly', () => {
    expect(
      eventSpanLabel({
        start: '2026-06-28T23:00:00.000Z',
        end: '2026-06-29T02:00:00.000Z',
        timeZone,
      }),
    ).toBe('hourly');
  });

  it('labels a two-day span day_based', () => {
    expect(
      eventSpanLabel({
        start: '2026-06-28T03:00:00.000Z',
        end: '2026-06-30T02:59:59.999Z',
        timeZone,
      }),
    ).toBe('day_based');
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

describe('describeTemplateTimeBlockSpan', () => {
  it('describes a same-day block by its duration', () => {
    expect(
      describeTemplateTimeBlockSpan({
        startTime: fromTimeColumn({ value: '09:00:00' }),
        endTime: fromTimeColumn({ value: '09:30:00' }),
      }),
    ).toBe('Dura 30 min');
  });

  it('marks an overnight block as ending the next day (ADR-0003)', () => {
    expect(
      describeTemplateTimeBlockSpan({
        startTime: fromTimeColumn({ value: '22:00:00' }),
        endTime: fromTimeColumn({ value: '02:00:00' }),
      }),
    ).toBe('Dura 4 h · termina no dia seguinte');
  });
});

describe('calculateTotalEventTimeBlocks', () => {
  it('sums time block counts across every event group', () => {
    const events = [makeEventGroup(2), makeEventGroup(1)];

    expect(calculateTotalEventTimeBlocks({ events })).toBe(3);
  });

  it('is zero for undefined events', () => {
    expect(calculateTotalEventTimeBlocks({ events: undefined })).toBe(0);
  });
});

describe('cycleIsSent', () => {
  it('is true only for a sent cycle', () => {
    expect(cycleIsSent({ cycle: makeCycle({ state: 'sent' }) })).toBe(true);
    expect(cycleIsSent({ cycle: makeCycle({ state: 'draft' }) })).toBe(false);
    expect(cycleIsSent({ cycle: null })).toBe(false);
    expect(cycleIsSent({ cycle: undefined })).toBe(false);
  });
});

describe('stateBadgeVariant', () => {
  it('maps each cycle state to its badge variant', () => {
    expect(stateBadgeVariant({ state: 'sent' })).toBe('default');
    expect(stateBadgeVariant({ state: 'past' })).toBe('outline');
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

describe('templateBlockErrors', () => {
  it('flags case-insensitive duplicate labels and equal endpoints by row key', () => {
    const errors = templateBlockErrors({
      blocks: [
        makeTemplateTimeBlock({ key: 'a', label: 'Welcome' }),
        makeTemplateTimeBlock({ key: 'b', label: ' welcome ' }),
        makeTemplateTimeBlock({
          key: 'c',
          label: 'Same',
          endTime: fromTimeColumn({ value: '09:00:00' }),
        }),
        makeTemplateTimeBlock({ key: 'd', label: '' }),
        makeTemplateTimeBlock({ key: 'e', label: '' }),
      ],
    });

    expect([...errors.duplicateLabelKeys].sort()).toEqual(['a', 'b']);
    expect([...errors.equalTimeKeys]).toEqual(['c']);
  });

  it('keeps a template with duplicate labels from being saved', () => {
    expect(
      canSaveTemplate({
        templateForm: makeTemplateForm({
          blocks: [
            makeTemplateTimeBlock({ key: 'a', label: 'Same' }),
            makeTemplateTimeBlock({ key: 'b', label: 'same' }),
          ],
        }),
      }),
    ).toBe(false);
  });
});

describe('toTemplateRequestBlocks', () => {
  it('trims labels, sends no order, and sends an id only for persisted blocks', () => {
    expect(
      toTemplateRequestBlocks({
        blocks: [
          makeTemplateTimeBlock({ key: 'row-1', label: ' New ' }),
          makeTemplateTimeBlock({
            key: 'row-2',
            persistedId: 'stored-id',
            label: 'Kept',
          }),
        ],
      }),
    ).toEqual([
      { label: 'New', startTime: '09:00', endTime: '09:30' },
      { id: 'stored-id', label: 'Kept', startTime: '09:00', endTime: '09:30' },
    ]);
  });
});
