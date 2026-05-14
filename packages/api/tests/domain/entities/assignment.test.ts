import { describe, expect, it } from 'vitest';
import { Assignment } from '../../../src/domain/entities/assignment';

describe('Assignment Entity', () => {
  it('constructs with valid props and defaults', () => {
    const assignment = new Assignment({
      churchId: 'c1',
      slotId: 't1',
      volunteerId: 'v1',
      roleId: 'r1',
    });

    expect(assignment.churchId).toBe('c1');
    expect(assignment.slotId).toBe('t1');
    expect(assignment.volunteerId).toBe('v1');
    expect(assignment.roleId).toBe('r1');
    expect(assignment.status).toBe('pending');
    expect(assignment.assignedAt).toBeInstanceOf(Date);
  });

  it('handles mutations correctly', () => {
    const assignment = new Assignment({
      churchId: 'c1',
      slotId: 't1',
      volunteerId: 'v1',
      roleId: 'r1',
    });

    expect(assignment.status).toBe('pending');

    assignment.confirm();
    expect(assignment.status).toBe('confirmed');

    assignment.decline('Too busy');
    expect(assignment.status).toBe('declined');
    expect(assignment.reason).toBe('Too busy');
  });
});
