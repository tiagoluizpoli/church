import { describe, expect, it } from 'vitest';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';
import { InvalidRequiredCountError } from '@/domain/errors/invalid-required-count';

describe('ShiftRequirement Entity', () => {
  it('constructs with valid props', () => {
    const req = new ShiftRequirement({
      churchId: 'c1',
      eventTimeBlockId: 't1',
      participationId: 'p1',
      roleId: 'r1',
      sectorId: 'sector1',
      peopleNeeded: 2,
    });

    expect(req.churchId).toBe('c1');
    expect(req.eventTimeBlockId).toBe('t1');
    expect(req.participationId).toBe('p1');
    expect(req.roleId).toBe('r1');
    expect(req.sectorId).toBe('sector1');
    expect(req.peopleNeeded).toBe(2);
  });

  it('exposes optional shiftId and notes when supplied', () => {
    const req = new ShiftRequirement({
      churchId: 'c1',
      eventTimeBlockId: 't1',
      shiftId: 's1',
      roleId: 'r1',
      sectorId: 'sector1',
      peopleNeeded: 1,
      notes: 'front row',
    });

    expect(req.shiftId).toBe('s1');
    expect(req.notes).toBe('front row');
  });

  it('throws InvalidRequiredCountError on construction if count < 1', () => {
    expect(() => {
      new ShiftRequirement({
        churchId: 'c1',
        eventTimeBlockId: 't1',
        roleId: 'r1',
        sectorId: 'sector1',
        peopleNeeded: 0,
      });
    }).toThrow(InvalidRequiredCountError);
  });

  it('updates count with valid value', () => {
    const req = new ShiftRequirement({
      churchId: 'c1',
      eventTimeBlockId: 't1',
      roleId: 'r1',
      sectorId: 'sector1',
      peopleNeeded: 2,
    });

    req.updateCount(5);
    expect(req.peopleNeeded).toBe(5);
  });

  it('throws InvalidRequiredCountError on update if count < 1', () => {
    const req = new ShiftRequirement({
      churchId: 'c1',
      eventTimeBlockId: 't1',
      roleId: 'r1',
      sectorId: 'sector1',
      peopleNeeded: 2,
    });

    expect(() => {
      req.updateCount(0);
    }).toThrow(InvalidRequiredCountError);
  });
});
