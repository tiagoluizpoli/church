import { describe, expect, it } from 'vitest';
import type { ChurchId, CycleId } from '@/domain/branded-ids';
import { AvailabilityCheck } from '@/domain/entities/availability-check';
import { IllegalStateTransitionError } from '@/domain/errors/illegal-state-transition';

const churchId = '11111111-1111-4111-8111-111111111111' as ChurchId;
const cycleId = '22222222-2222-4222-8222-222222222222' as CycleId;
const ministryVolunteerId = '33333333-3333-4333-8333-333333333333';

function buildCheck(): AvailabilityCheck {
  return new AvailabilityCheck({
    props: { churchId, cycleId, ministryVolunteerId },
  });
}

describe('AvailabilityCheck entity (DL1-AC)', () => {
  it('DL1-AC-01 defaults state to pending', () => {
    const check = buildCheck();

    expect(check.state).toBe('pending');
    expect(check.confirmedAt).toBeUndefined();
    expect(check.churchId).toBe(churchId);
    expect(check.cycleId).toBe(cycleId);
    expect(check.ministryVolunteerId).toBe(ministryVolunteerId);
  });

  it('accepts an explicit initial state', () => {
    const check = new AvailabilityCheck({
      props: {
        churchId,
        cycleId,
        ministryVolunteerId,
        state: 'confirmed',
      },
    });

    expect(check.state).toBe('confirmed');
  });

  it('DL1-AC-02 confirm() transitions pending → confirmed and sets confirmedAt even with zero marks', () => {
    const check = buildCheck();

    check.confirm();

    expect(check.state).toBe('confirmed');
    expect(typeof check.confirmedAt).toBe('string');
  });

  it('DL1-AC-03 confirm() twice throws IllegalStateTransitionError', () => {
    const check = buildCheck();
    check.confirm();

    expect(() => check.confirm()).toThrow(IllegalStateTransitionError);
  });
});
