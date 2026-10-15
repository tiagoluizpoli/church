import { parseCalendarDay, parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import { Cycle } from '@/domain/entities/cycle';
import { IllegalStateTransitionError } from '@/domain/errors/illegal-state-transition';
import { InvalidDateRangeError } from '@/domain/errors/invalid-date-range';

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

describe('Cycle', () => {
  it('defaults new cycles to draft', () => {
    const cycle = createCycle();

    expect(cycle.state).toBe('draft');
    expect(cycle.churchId).toBe('11111111-1111-1111-1111-111111111111');
    expect(cycle.name).toBe('July 2026');
  });

  it('accepts an explicit initial state', () => {
    const cycle = new Cycle({
      props: {
        churchId: '11111111-1111-1111-1111-111111111111',
        name: 'Pre-locked',
        startDate: parseCalendarDay({ value: '2026-07-01' }),
        endDate: parseCalendarDay({ value: '2026-08-01' }),
        state: 'sent',
      },
    });

    expect(cycle.state).toBe('sent');
  });

  it('rejects start dates that are not before the end date', () => {
    expect(
      () =>
        new Cycle({
          props: {
            churchId: '11111111-1111-1111-1111-111111111111',
            name: 'Broken',
            startDate: parseCalendarDay({ value: '2026-07-01' }),
            endDate: parseCalendarDay({ value: '2026-07-01' }),
          },
        }),
    ).toThrow(InvalidDateRangeError);
  });

  it('locks from draft to locked', () => {
    const cycle = createCycle();

    cycle.send();

    expect(cycle.state).toBe('sent');
  });

  it('rejects locking once no longer draft', () => {
    const locked = createCycle();
    locked.send();

    expect(() => locked.send()).toThrow(IllegalStateTransitionError);

    const archived = createCycle();
    archived.markPast();

    expect(() => archived.send()).toThrow(IllegalStateTransitionError);
  });

  it('archives draft and sent cycles', () => {
    const draft = createCycle();
    draft.markPast();
    expect(draft.state).toBe('past');

    const locked = createCycle();
    locked.send();
    locked.markPast();
    expect(locked.state).toBe('past');
  });

  it('rejects archiving an already archived cycle', () => {
    const archived = createCycle();
    archived.markPast();

    expect(() => archived.markPast()).toThrow(IllegalStateTransitionError);
  });

  it('only allows reopening events while the cycle is locked', () => {
    const draft = createCycle();
    expect(() =>
      draft.assertCanReopenEvent({ eventState: 'scheduled' }),
    ).toThrow(IllegalStateTransitionError);

    const archived = createCycle();
    archived.markPast();
    expect(() =>
      archived.assertCanReopenEvent({ eventState: 'scheduled' }),
    ).toThrow(IllegalStateTransitionError);

    const locked = createCycle();
    locked.send();
    expect(() =>
      locked.assertCanReopenEvent({ eventState: 'scheduled' }),
    ).not.toThrow();
  });

  it('rejects reopening events that are cancelled or past even while locked', () => {
    const lockedForCancelled = createCycle();
    lockedForCancelled.send();
    expect(() =>
      lockedForCancelled.assertCanReopenEvent({ eventState: 'cancelled' }),
    ).toThrow(IllegalStateTransitionError);

    const lockedForPast = createCycle();
    lockedForPast.send();
    expect(() =>
      lockedForPast.assertCanReopenEvent({ eventState: 'past' }),
    ).toThrow(IllegalStateTransitionError);
  });

  it('evaluates date containment using church-local dates', () => {
    const cycle = createCycle();

    // 2026-07-31T23:00:00-03:00 is still church-local July 31.
    expect(
      cycle.containsDate({
        instant: parseInstant({ value: '2026-08-01T02:00:00.000Z' }),
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe(true);

    // 2026-08-01T00:30:00-03:00 is church-local August 1, the exclusive end.
    expect(
      cycle.containsDate({
        instant: parseInstant({ value: '2026-08-01T03:30:00.000Z' }),
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe(false);
  });
});
