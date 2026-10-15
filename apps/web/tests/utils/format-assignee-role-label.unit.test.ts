import { describe, expect, it } from 'vitest';
import { formatAssigneeRoleLabel } from '@/utils/format-assignee-role-label';

describe('formatAssigneeRoleLabel', () => {
  it('maps a ministry "leader" to the "Leader" display label', () => {
    expect(
      formatAssigneeRoleLabel({
        membership: { ministryAccessLevel: 'leader' },
      }),
    ).toBe('Leader');
  });

  it('maps a plain "volunteer" to no badge', () => {
    expect(
      formatAssigneeRoleLabel({
        membership: { ministryAccessLevel: 'volunteer' },
      }),
    ).toBeUndefined();
  });

  it('returns undefined when membership is undefined', () => {
    expect(formatAssigneeRoleLabel({ membership: undefined })).toBeUndefined();
  });
});
