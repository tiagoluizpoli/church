import { describe, expect, it } from 'vitest';
import { Volunteer } from '../../../src/domain/entities/volunteer';

describe('Volunteer Entity', () => {
  it('constructs with minimum props', () => {
    const volunteer = new Volunteer({ churchId: 'c1', userId: 'u1' });

    expect(volunteer.churchId).toBe('c1');
    expect(volunteer.userId).toBe('u1');
    expect(volunteer.status).toBe('active');
    expect(volunteer.notes).toBeUndefined();
  });

  it('handles mutations correctly', () => {
    const volunteer = new Volunteer({ churchId: 'c1', userId: 'u1' });

    expect(volunteer.status).toBe('active');

    volunteer.deactivate();
    expect(volunteer.status).toBe('inactive');

    volunteer.putOnHold();
    expect(volunteer.status).toBe('on_hold');

    volunteer.activate();
    expect(volunteer.status).toBe('active');
  });
});
