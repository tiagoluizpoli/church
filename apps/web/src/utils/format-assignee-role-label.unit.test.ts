import { describe, expect, it } from 'vitest';
import { formatAssigneeRoleLabel } from './format-assignee-role-label';

describe('formatAssigneeRoleLabel', () => {
  it('maps "leader" to the "Leader" display label', () => {
    expect(formatAssigneeRoleLabel('leader')).toBe('Leader');
  });

  it('maps "sub_leader" to the "Sub-leader" display label', () => {
    expect(formatAssigneeRoleLabel('sub_leader')).toBe('Sub-leader');
  });

  it('returns undefined for a plain "volunteer" (no badge)', () => {
    expect(formatAssigneeRoleLabel('volunteer')).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(formatAssigneeRoleLabel(undefined)).toBeUndefined();
  });
});
