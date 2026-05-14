import { describe, expect, it } from 'vitest';
import { AssignmentAudit } from '../../../src/domain/entities/assignment-audit';

describe('AssignmentAudit Entity', () => {
  it('constructs with valid props', () => {
    const audit = new AssignmentAudit({
      churchId: 'c1',
      assignmentId: 'a1',
      leaderId: 'u1',
      action: 'created',
    });

    expect(audit.churchId).toBe('c1');
    expect(audit.assignmentId).toBe('a1');
    expect(audit.leaderId).toBe('u1');
    expect(audit.action).toBe('created');
    expect(audit.timestamp).toBeInstanceOf(Date);
  });
});
