import { isInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import { MinistryMembership } from '@/domain/entities/ministry-membership';

describe('MinistryMembership Entity', () => {
  it('constructs with minimum props', () => {
    const mv = new MinistryMembership({
      props: {
        churchId: 'c1',
        volunteerId: 'v1',
        ministryId: 'm1',
      },
    });

    expect(mv.churchId).toBe('c1');
    expect(mv.volunteerId).toBe('v1');
    expect(mv.ministryId).toBe('m1');
    expect(mv.ministryAccessLevel).toBe('volunteer');
    expect(mv.status).toBe('active');
    expect(isInstant({ value: mv.joinedAt })).toBe(true);
  });

  it('handles mutations correctly', () => {
    const mv = new MinistryMembership({
      props: {
        churchId: 'c1',
        volunteerId: 'v1',
        ministryId: 'm1',
      },
    });

    mv.promote('leader');
    expect(mv.ministryAccessLevel).toBe('leader');
  });
});
