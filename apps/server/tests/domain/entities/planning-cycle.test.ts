import { parseCalendarDay, parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import { PlanningCycle } from '../../../src/domain/entities/planning-cycle';
import { IllegalStateTransitionError } from '../../../src/domain/errors/illegal-state-transition';
import { InvalidDateRangeError } from '../../../src/domain/errors/invalid-date-range';

function createPlanningCycle() {
  return new PlanningCycle({
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      name: 'July 2026',
      startDate: parseCalendarDay({ value: '2026-07-01' }),
      endDate: parseCalendarDay({ value: '2026-08-01' }),
    },
    id: '22222222-2222-2222-2222-222222222222',
  });
}

describe('PlanningCycle', () => {
  it('defaults new cycles to draft', () => {
    const cycle = createPlanningCycle();

    expect(cycle.state).toBe('draft');
    expect(cycle.churchId).toBe('11111111-1111-1111-1111-111111111111');
    expect(cycle.name).toBe('July 2026');
  });

  it('accepts an explicit initial state', () => {
    const cycle = new PlanningCycle({
      props: {
        churchId: '11111111-1111-1111-1111-111111111111',
        name: 'Pre-locked',
        startDate: parseCalendarDay({ value: '2026-07-01' }),
        endDate: parseCalendarDay({ value: '2026-08-01' }),
        state: 'locked',
      },
    });

    expect(cycle.state).toBe('locked');
  });

  it('rejects start dates that are not before the end date', () => {
    expect(
      () =>
        new PlanningCycle({
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
    const cycle = createPlanningCycle();

    cycle.lock();

    expect(cycle.state).toBe('locked');
  });

  it('rejects locking once no longer draft', () => {
    const locked = createPlanningCycle();
    locked.lock();

    expect(() => locked.lock()).toThrow(IllegalStateTransitionError);

    const archived = createPlanningCycle();
    archived.archive();

    expect(() => archived.lock()).toThrow(IllegalStateTransitionError);
  });

  it('archives draft and locked cycles', () => {
    const draft = createPlanningCycle();
    draft.archive();
    expect(draft.state).toBe('archived');

    const locked = createPlanningCycle();
    locked.lock();
    locked.archive();
    expect(locked.state).toBe('archived');
  });

  it('rejects archiving an already archived cycle', () => {
    const archived = createPlanningCycle();
    archived.archive();

    expect(() => archived.archive()).toThrow(IllegalStateTransitionError);
  });

  it('only allows reopening events while the cycle is locked', () => {
    const draft = createPlanningCycle();
    expect(() =>
      draft.assertCanReopenEvent({ eventState: 'scheduled' }),
    ).toThrow(IllegalStateTransitionError);

    const archived = createPlanningCycle();
    archived.archive();
    expect(() =>
      archived.assertCanReopenEvent({ eventState: 'scheduled' }),
    ).toThrow(IllegalStateTransitionError);

    const locked = createPlanningCycle();
    locked.lock();
    expect(() =>
      locked.assertCanReopenEvent({ eventState: 'scheduled' }),
    ).not.toThrow();
  });

  it('rejects reopening events that are cancelled or past even while locked', () => {
    const lockedForCancelled = createPlanningCycle();
    lockedForCancelled.lock();
    expect(() =>
      lockedForCancelled.assertCanReopenEvent({ eventState: 'cancelled' }),
    ).toThrow(IllegalStateTransitionError);

    const lockedForPast = createPlanningCycle();
    lockedForPast.lock();
    expect(() =>
      lockedForPast.assertCanReopenEvent({ eventState: 'past' }),
    ).toThrow(IllegalStateTransitionError);
  });

  it('evaluates date containment using church-local dates', () => {
    const cycle = createPlanningCycle();

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
