import { describe, expect, it } from 'vitest';
import { Team } from '../../../src/domain/entities/team';

describe('Team Entity', () => {
  it('constructs with props', () => {
    const team = new Team({ churchId: 'c1', ministryId: 'm1', name: 'Vocals' });

    expect(team.churchId).toBe('c1');
    expect(team.ministryId).toBe('m1');
    expect(team.name).toBe('Vocals');
  });
});
