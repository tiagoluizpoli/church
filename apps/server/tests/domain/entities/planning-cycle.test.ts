import { describe, expect, it } from 'vitest';
import { PlanningCycle } from '../../../src/domain/entities/planning-cycle';
import { IllegalStateTransitionError } from '../../../src/domain/errors/illegal-state-transition';
import { InvalidDateRangeError } from '../../../src/domain/errors/invalid-date-range';

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

describe('PlanningCycle', () => {
  it('defaults new cycles to draft', () => {
    const cycle = createPlanningCycle();

    expect(cycle.state).toBe('draft');
  });

  it('rejects start dates that are not before the end date', () => {
    expect(
      () =>
        new PlanningCycle({
          props: {
            churchId: '11111111-1111-1111-1111-111111111111',
            name: 'Broken',
            startDate: new Date('2026-07-01T00:00:00.000Z'),
            endDate: new Date('2026-07-01T00:00:00.000Z'),
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

  it('evaluates date containment using church-local dates', () => {
    const cycle = createPlanningCycle();

    expect(
      cycle.containsDate({
        date: new Date('2026-07-31T23:00:00.000-03:00'),
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe(true);

    expect(
      cycle.containsDate({
        date: new Date('2026-08-01T00:30:00.000-03:00'),
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe(false);
  });
});
