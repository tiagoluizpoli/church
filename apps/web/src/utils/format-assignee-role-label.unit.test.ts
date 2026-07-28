import { describe, expect, it } from 'vitest';
import {
  type AssigneeMembership,
  formatAssigneeRoleLabel,
} from './format-assignee-role-label';

function membership(
  overrides: Partial<AssigneeMembership>,
): AssigneeMembership {
  return {
    ministryAccessLevel: 'volunteer',
    leadTeamIds: [],
    ...overrides,
  };
}

describe('formatAssigneeRoleLabel', () => {
  it('maps a ministry "leader" to the "Leader" display label regardless of team context', () => {
    expect(
      formatAssigneeRoleLabel({
        membership: membership({ ministryAccessLevel: 'leader' }),
      }),
    ).toBe('Leader');
  });

  it('maps a plain "volunteer" with no team leadership to no badge', () => {
    expect(
      formatAssigneeRoleLabel({ membership: membership({}) }),
    ).toBeUndefined();
  });

  it('returns undefined when membership is undefined', () => {
    expect(formatAssigneeRoleLabel({ membership: undefined })).toBeUndefined();
  });

  it('is context-sensitive: the same TeamLeader reads as "Team Leader" in their own team and as a plain member elsewhere', () => {
    const teamLeaderOfA = membership({
      ministryAccessLevel: 'volunteer',
      leadTeamIds: ['team-a'],
    });

    expect(
      formatAssigneeRoleLabel({
        membership: teamLeaderOfA,
        contextTeamId: 'team-a',
      }),
    ).toBe('Team Leader');

    expect(
      formatAssigneeRoleLabel({
        membership: teamLeaderOfA,
        contextTeamId: 'team-b',
      }),
    ).toBeUndefined();
  });

  it('does not badge a TeamLeader when no team context is known at all', () => {
    expect(
      formatAssigneeRoleLabel({
        membership: membership({ leadTeamIds: ['team-a'] }),
        contextTeamId: undefined,
      }),
    ).toBeUndefined();
  });

  it('a volunteer leading multiple teams badges in each of their own team contexts', () => {
    const multiTeamLeader = membership({ leadTeamIds: ['team-a', 'team-b'] });

    expect(
      formatAssigneeRoleLabel({
        membership: multiTeamLeader,
        contextTeamId: 'team-a',
      }),
    ).toBe('Team Leader');
    expect(
      formatAssigneeRoleLabel({
        membership: multiTeamLeader,
        contextTeamId: 'team-b',
      }),
    ).toBe('Team Leader');
    expect(
      formatAssigneeRoleLabel({
        membership: multiTeamLeader,
        contextTeamId: 'team-c',
      }),
    ).toBeUndefined();
  });
});
