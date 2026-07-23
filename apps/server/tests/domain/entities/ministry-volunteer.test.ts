import { describe, expect, it } from 'vitest';
import { MinistryVolunteer } from '../../../src/domain/entities/ministry-volunteer';

describe('MinistryVolunteer Entity', () => {
  it('constructs with minimum props', () => {
    const mv = new MinistryVolunteer({
      churchId: 'c1',
      volunteerId: 'v1',
      ministryId: 'm1',
    });

    expect(mv.churchId).toBe('c1');
    expect(mv.volunteerId).toBe('v1');
    expect(mv.ministryId).toBe('m1');
    expect(mv.systemRole).toBe('volunteer');
    expect(mv.status).toBe('active');
    expect(mv.joinedAt).toBeInstanceOf(Date);
  });

  it('handles mutations correctly', () => {
    const mv = new MinistryVolunteer({
      churchId: 'c1',
      volunteerId: 'v1',
      ministryId: 'm1',
    });

    mv.promote('leader');
    expect(mv.systemRole).toBe('leader');
  });
});
