import { describe, expect, it } from 'vitest';
import { RoleId } from '../../../src/domain/branded-ids';
import { MinistryInvitation } from '../../../src/domain/entities/ministry-invitation';

describe('MinistryInvitation Entity', () => {
  it('reports kind "ministry-only" when addressed by inviteeUserId', () => {
    const invitation = new MinistryInvitation({
      churchId: 'c1',
      ministryId: 'm1',
      inviteeUserId: 'u1',
      ministryAccessLevel: 'volunteer',
      status: 'pending',
      inviterId: 'inviter1',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      roleIds: [],
    });

    expect(invitation.kind).toBe('ministry-only');
    expect(invitation.inviteeUserId).toBe('u1');
    expect(invitation.churchInvitationId).toBeUndefined();
  });

  it('reports kind "chained" when addressed by churchInvitationId', () => {
    const invitation = new MinistryInvitation({
      churchId: 'c1',
      ministryId: 'm1',
      churchInvitationId: 'ci1',
      ministryAccessLevel: 'leader',
      status: 'pending',
      inviterId: 'inviter1',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      roleIds: [RoleId.from('r1'), RoleId.from('r2')],
    });

    expect(invitation.kind).toBe('chained');
    expect(invitation.inviteeUserId).toBeUndefined();
    expect(invitation.churchInvitationId).toBe('ci1');
    expect(invitation.roleIds).toEqual([RoleId.from('r1'), RoleId.from('r2')]);
  });

  it('exposes every prop through its getters', () => {
    const expiresAt = new Date('2030-06-01T00:00:00Z');
    const invitation = new MinistryInvitation({
      churchId: 'c1',
      ministryId: 'm1',
      inviteeUserId: 'u1',
      ministryAccessLevel: 'volunteer',
      status: 'accepted',
      inviterId: 'inviter1',
      expiresAt,
      roleIds: [RoleId.from('r1')],
    });

    expect(invitation.churchId).toBe('c1');
    expect(invitation.ministryId).toBe('m1');
    expect(invitation.ministryAccessLevel).toBe('volunteer');
    expect(invitation.status).toBe('accepted');
    expect(invitation.inviterId).toBe('inviter1');
    expect(invitation.expiresAt).toBe(expiresAt);
  });
});
