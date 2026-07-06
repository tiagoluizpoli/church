import { describe, expect, it } from 'vitest';
import { SlotRequirement } from '../../../src/domain/entities/slot-requirement';
import { InvalidRequiredCountError } from '../../../src/domain/errors/invalid-required-count';

describe('SlotRequirement Entity', () => {
  it('constructs with valid props', () => {
    const req = new SlotRequirement({
      churchId: 'c1',
      slotId: 't1',
      participationId: 'p1',
      roleId: 'r1',
      teamId: 'team1',
      requiredCount: 2,
    });

    expect(req.churchId).toBe('c1');
    expect(req.slotId).toBe('t1');
    expect(req.participationId).toBe('p1');
    expect(req.roleId).toBe('r1');
    expect(req.teamId).toBe('team1');
    expect(req.requiredCount).toBe(2);
  });

  it('exposes optional shiftId and notes when supplied', () => {
    const req = new SlotRequirement({
      churchId: 'c1',
      slotId: 't1',
      shiftId: 's1',
      roleId: 'r1',
      requiredCount: 1,
      notes: 'front row',
    });

    expect(req.shiftId).toBe('s1');
    expect(req.notes).toBe('front row');
  });

  it('throws InvalidRequiredCountError on construction if count < 1', () => {
    expect(() => {
      new SlotRequirement({
        churchId: 'c1',
        slotId: 't1',
        roleId: 'r1',
        requiredCount: 0,
      });
    }).toThrow(InvalidRequiredCountError);
  });

  it('updates count with valid value', () => {
    const req = new SlotRequirement({
      churchId: 'c1',
      slotId: 't1',
      roleId: 'r1',
      requiredCount: 2,
    });

    req.updateCount(5);
    expect(req.requiredCount).toBe(5);
  });

  it('throws InvalidRequiredCountError on update if count < 1', () => {
    const req = new SlotRequirement({
      churchId: 'c1',
      slotId: 't1',
      roleId: 'r1',
      requiredCount: 2,
    });

    expect(() => {
      req.updateCount(0);
    }).toThrow(InvalidRequiredCountError);
  });
});
