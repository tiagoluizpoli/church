import { isInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import { Assignment } from '@/domain/entities/assignment';

describe('Assignment Entity', () => {
  it('constructs with valid props and defaults', () => {
    const assignment = new Assignment({
      churchId: 'c1',
      eventTimeBlockId: 't1',
      volunteerId: 'v1',
      roleId: 'r1',
      shiftRequirementId: '00000000-0000-0000-0000-000000000021' as never,
    });

    expect(assignment.churchId).toBe('c1');
    expect(assignment.eventTimeBlockId).toBe('t1');
    expect(assignment.volunteerId).toBe('v1');
    expect(assignment.roleId).toBe('r1');
    expect(assignment.status).toBe('draft');
    expect(isInstant({ value: assignment.assignedAt })).toBe(true);
  });

  it('handles mutations correctly', () => {
    const assignment = new Assignment({
      churchId: 'c1',
      eventTimeBlockId: 't1',
      volunteerId: 'v1',
      roleId: 'r1',
      shiftRequirementId: '00000000-0000-0000-0000-000000000021' as never,
    });

    expect(assignment.status).toBe('draft');

    assignment.markAsPending();
    expect(assignment.status).toBe('pending');

    assignment.confirm();
    expect(assignment.status).toBe('confirmed');

    assignment.decline('Too busy');
    expect(assignment.status).toBe('declined');
    expect(assignment.reason).toBe('Too busy');

    assignment.cancel();
    expect(assignment.status).toBe('cancelled');
  });
});
