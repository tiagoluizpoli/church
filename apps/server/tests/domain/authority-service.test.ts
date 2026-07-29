import { describe, expect, it } from 'vitest';
import { AuthorityService } from '../../src/domain/authority/authority-service';
import type {
  AuthorityActor,
  AuthorityDecision,
  AuthorityRequest,
  AuthorityResource,
  ChurchMembershipFact,
  MinistryMembershipFact,
  TeamMembershipFact,
} from '../../src/domain/authority/types';
import type {
  ChurchId,
  MinistryId,
  TeamId,
  UserId,
  VolunteerId,
} from '../../src/domain/branded-ids';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const churchId = 'chu_home' as ChurchId;
const otherChurchId = 'chu_other' as ChurchId;
const ministryId = 'min_worship' as MinistryId;
const otherMinistryId = 'min_kids' as MinistryId;
const teamId = 'team_acoustic' as TeamId;
const otherTeamId = 'team_media' as TeamId;
const userId = 'usr_1' as UserId;
const volunteerId = 'vol_1' as VolunteerId;
const otherVolunteerId = 'vol_2' as VolunteerId;

interface BuildChurchMembershipInput {
  accessLevel: ChurchMembershipFact['accessLevel'];
  membershipChurchId?: ChurchId;
}

function churchMembership({
  accessLevel,
  membershipChurchId = churchId,
}: BuildChurchMembershipInput): ChurchMembershipFact {
  return { churchId: membershipChurchId, accessLevel };
}

function ministryMembership(
  overrides: Partial<MinistryMembershipFact> = {},
): MinistryMembershipFact {
  return {
    churchId,
    ministryId,
    accessLevel: 'volunteer',
    qualifiedRoleIds: [],
    ...overrides,
  };
}

function teamMembership(
  overrides: Partial<TeamMembershipFact> = {},
): TeamMembershipFact {
  return {
    churchId,
    ministryId,
    teamId,
    accessLevel: 'member',
    ...overrides,
  };
}

function actor(overrides: Partial<AuthorityActor> = {}): AuthorityActor {
  return {
    userId,
    volunteerId,
    activeChurchId: churchId,
    churchMembership: churchMembership({ accessLevel: 'member' }),
    ministryMemberships: [],
    teamMemberships: [],
    ...overrides,
  };
}

function request(overrides: Partial<AuthorityRequest> = {}): AuthorityRequest {
  return {
    actor: actor(),
    action: 'manage',
    resource: { type: 'church', churchId },
    ...overrides,
  };
}

function allowed(decision: AuthorityDecision): boolean {
  return decision.allowed;
}

function denyReason(decision: AuthorityDecision): string | undefined {
  return decision.allowed ? undefined : decision.reason;
}

// ---------------------------------------------------------------------------
// Global scope-data integrity — missing / stale / cross-Church / conflicting
// ---------------------------------------------------------------------------

describe('AuthorityService — scope-data integrity', () => {
  it('denies with NO_CHURCH_MEMBERSHIP when the actor has no Church Membership', () => {
    const decision = AuthorityService.authorize(
      request({ actor: actor({ churchMembership: null }) }),
    );
    expect(allowed(decision)).toBe(false);
    expect(denyReason(decision)).toBe('NO_CHURCH_MEMBERSHIP');
  });

  it('denies with STALE_CHURCH_MEMBERSHIP when the Church Membership belongs to a different Church than the Active Church', () => {
    const decision = AuthorityService.authorize(
      request({
        actor: actor({
          churchMembership: churchMembership({
            accessLevel: 'admin',
            membershipChurchId: otherChurchId,
          }),
        }),
      }),
    );
    expect(allowed(decision)).toBe(false);
    expect(denyReason(decision)).toBe('STALE_CHURCH_MEMBERSHIP');
  });

  it('denies with CROSS_CHURCH_RESOURCE when the resource belongs to a different Church than the Active Church', () => {
    const decision = AuthorityService.authorize(
      request({ resource: { type: 'church', churchId: otherChurchId } }),
    );
    expect(allowed(decision)).toBe(false);
    expect(denyReason(decision)).toBe('CROSS_CHURCH_RESOURCE');
  });

  it('denies with CONFLICTING_SCOPE when a Ministry Membership fact carries a different churchId than the Active Church', () => {
    const decision = AuthorityService.authorize(
      request({
        actor: actor({
          ministryMemberships: [
            ministryMembership({
              churchId: otherChurchId,
              accessLevel: 'leader',
            }),
          ],
        }),
        resource: { type: 'ministry', churchId, ministryId },
      }),
    );
    expect(allowed(decision)).toBe(false);
    expect(denyReason(decision)).toBe('CONFLICTING_SCOPE');
  });

  it('denies with CONFLICTING_SCOPE when a Team Membership fact carries a different churchId than the Active Church', () => {
    const decision = AuthorityService.authorize(
      request({
        actor: actor({
          teamMemberships: [
            teamMembership({ churchId: otherChurchId, accessLevel: 'leader' }),
          ],
        }),
        resource: { type: 'team', churchId, ministryId, teamId },
      }),
    );
    expect(allowed(decision)).toBe(false);
    expect(denyReason(decision)).toBe('CONFLICTING_SCOPE');
  });

  it('denies with CONFLICTING_SCOPE when a Team Membership fact carries a different ministryId than the team resource', () => {
    const decision = AuthorityService.authorize(
      request({
        actor: actor({
          teamMemberships: [
            teamMembership({
              ministryId: otherMinistryId,
              accessLevel: 'leader',
            }),
          ],
        }),
        resource: { type: 'team', churchId, ministryId, teamId },
      }),
    );
    expect(allowed(decision)).toBe(false);
    expect(denyReason(decision)).toBe('CONFLICTING_SCOPE');
  });

  it('denies with CONFLICTING_SCOPE when a resource claims the actor owns it but no matching Ministry Membership fact exists', () => {
    const decision = AuthorityService.authorize(
      request({
        actor: actor({ ministryMemberships: [] }),
        action: 'participate',
        resource: {
          type: 'ministry',
          churchId,
          ministryId,
          ownerVolunteerId: volunteerId,
        },
      }),
    );
    expect(allowed(decision)).toBe(false);
    expect(denyReason(decision)).toBe('CONFLICTING_SCOPE');
  });

  it('denies with CONFLICTING_SCOPE when a resource claims the actor owns it but no matching Team Membership fact exists', () => {
    const decision = AuthorityService.authorize(
      request({
        actor: actor({ teamMemberships: [] }),
        action: 'participate',
        resource: {
          type: 'team',
          churchId,
          ministryId,
          teamId,
          ownerVolunteerId: volunteerId,
        },
      }),
    );
    expect(allowed(decision)).toBe(false);
    expect(denyReason(decision)).toBe('CONFLICTING_SCOPE');
  });
});

// ---------------------------------------------------------------------------
// Church resource — Church Membership admin override
// ---------------------------------------------------------------------------

describe('AuthorityService — church resource', () => {
  const resource: AuthorityResource = { type: 'church', churchId };

  it.each([
    {
      accessLevel: 'admin' as const,
      action: 'manage' as const,
      expectAllowed: true,
    },
    {
      accessLevel: 'member' as const,
      action: 'manage' as const,
      expectAllowed: false,
    },
    {
      accessLevel: 'admin' as const,
      action: 'participate' as const,
      expectAllowed: false,
    },
    {
      accessLevel: 'member' as const,
      action: 'participate' as const,
      expectAllowed: false,
    },
  ])('accessLevel=$accessLevel action=$action -> allowed=$expectAllowed', ({
    accessLevel,
    action,
    expectAllowed,
  }) => {
    const decision = AuthorityService.authorize(
      request({
        actor: actor({ churchMembership: churchMembership({ accessLevel }) }),
        action,
        resource,
      }),
    );
    expect(allowed(decision)).toBe(expectAllowed);
    if (!expectAllowed)
      expect(denyReason(decision)).toBe('INSUFFICIENT_ACCESS_LEVEL');
  });

  it('a Church Membership admin override grants management but no participatory capability, even over their own resource', () => {
    const manage = AuthorityService.authorize(
      request({
        actor: actor({
          churchMembership: churchMembership({ accessLevel: 'admin' }),
        }),
        action: 'manage',
        resource,
      }),
    );
    const participate = AuthorityService.authorize(
      request({
        actor: actor({
          churchMembership: churchMembership({ accessLevel: 'admin' }),
        }),
        action: 'participate',
        resource,
      }),
    );
    expect(allowed(manage)).toBe(true);
    expect(allowed(participate)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ministry resource
// ---------------------------------------------------------------------------

describe('AuthorityService — ministry resource', () => {
  const resource: AuthorityResource = {
    type: 'ministry',
    churchId,
    ministryId,
  };

  it.each([
    {
      name: 'church admin, no Ministry Membership, manage -> allowed (admin override)',
      churchAccessLevel: 'admin' as const,
      ministryMemberships: [] as MinistryMembershipFact[],
      action: 'manage' as const,
      expectAllowed: true,
      expectReason: undefined,
    },
    {
      name: 'ordinary member, Ministry Membership leader (this ministry), manage -> allowed',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [ministryMembership({ accessLevel: 'leader' })],
      action: 'manage' as const,
      expectAllowed: true,
      expectReason: undefined,
    },
    {
      name: 'ordinary member, Ministry Membership leader of a DIFFERENT ministry, manage -> denied',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [
        ministryMembership({
          ministryId: otherMinistryId,
          accessLevel: 'leader',
        }),
      ],
      action: 'manage' as const,
      expectAllowed: false,
      expectReason: 'INSUFFICIENT_ACCESS_LEVEL',
    },
    {
      name: 'ordinary member, Ministry Membership volunteer (this ministry), manage -> denied',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [ministryMembership({ accessLevel: 'volunteer' })],
      action: 'manage' as const,
      expectAllowed: false,
      expectReason: 'INSUFFICIENT_ACCESS_LEVEL',
    },
    {
      name: 'ordinary member, no Ministry Membership, manage -> denied',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [] as MinistryMembershipFact[],
      action: 'manage' as const,
      expectAllowed: false,
      expectReason: 'INSUFFICIENT_ACCESS_LEVEL',
    },
    {
      name: 'church admin, no Ministry Membership, participate -> denied (no participatory capability)',
      churchAccessLevel: 'admin' as const,
      ministryMemberships: [] as MinistryMembershipFact[],
      action: 'participate' as const,
      expectAllowed: false,
      expectReason: 'INSUFFICIENT_ACCESS_LEVEL',
    },
    {
      name: 'ordinary member, Ministry Membership volunteer, participate -> allowed',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [ministryMembership({ accessLevel: 'volunteer' })],
      action: 'participate' as const,
      expectAllowed: true,
      expectReason: undefined,
    },
    {
      name: 'ordinary member, Ministry Membership leader, participate -> allowed',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [ministryMembership({ accessLevel: 'leader' })],
      action: 'participate' as const,
      expectAllowed: true,
      expectReason: undefined,
    },
    {
      name: 'ordinary member, no Ministry Membership, participate -> denied',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [] as MinistryMembershipFact[],
      action: 'participate' as const,
      expectAllowed: false,
      expectReason: 'INSUFFICIENT_ACCESS_LEVEL',
    },
  ])('$name', ({
    churchAccessLevel,
    ministryMemberships,
    action,
    expectAllowed,
    expectReason,
  }) => {
    const decision = AuthorityService.authorize(
      request({
        actor: actor({
          churchMembership: churchMembership({
            accessLevel: churchAccessLevel,
          }),
          ministryMemberships,
        }),
        action,
        resource,
      }),
    );
    expect(allowed(decision)).toBe(expectAllowed);
    if (expectReason) expect(denyReason(decision)).toBe(expectReason);
  });

  describe('ownership', () => {
    it('owner participating in their own resource, with a matching Ministry Membership -> allowed', () => {
      const decision = AuthorityService.authorize(
        request({
          actor: actor({ ministryMemberships: [ministryMembership()] }),
          action: 'participate',
          resource: { ...resource, ownerVolunteerId: volunteerId },
        }),
      );
      expect(allowed(decision)).toBe(true);
    });

    it("non-owner attempting to participate in someone else's resource -> denied", () => {
      const decision = AuthorityService.authorize(
        request({
          actor: actor({ ministryMemberships: [ministryMembership()] }),
          action: 'participate',
          resource: { ...resource, ownerVolunteerId: otherVolunteerId },
        }),
      );
      expect(allowed(decision)).toBe(false);
      expect(denyReason(decision)).toBe('INSUFFICIENT_ACCESS_LEVEL');
    });

    it("ministry leader cannot participate in a colleague's owned resource merely by leading the ministry", () => {
      const decision = AuthorityService.authorize(
        request({
          actor: actor({
            ministryMemberships: [
              ministryMembership({ accessLevel: 'leader' }),
            ],
          }),
          action: 'participate',
          resource: { ...resource, ownerVolunteerId: otherVolunteerId },
        }),
      );
      expect(allowed(decision)).toBe(false);
      expect(denyReason(decision)).toBe('INSUFFICIENT_ACCESS_LEVEL');
    });
  });
});

// ---------------------------------------------------------------------------
// Team resource — Team Membership scoped to explicitly assigned Teams only
// ---------------------------------------------------------------------------

describe('AuthorityService — team resource', () => {
  const resource: AuthorityResource = {
    type: 'team',
    churchId,
    ministryId,
    teamId,
  };

  it.each([
    {
      name: 'church admin, no memberships, manage -> allowed (admin override)',
      churchAccessLevel: 'admin' as const,
      ministryMemberships: [] as MinistryMembershipFact[],
      teamMemberships: [] as TeamMembershipFact[],
      action: 'manage' as const,
      expectAllowed: true,
    },
    {
      name: 'ministry leader of the SAME ministry, without an explicit Team Membership, manage -> denied (Team access is a fully independent axis)',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [ministryMembership({ accessLevel: 'leader' })],
      teamMemberships: [] as TeamMembershipFact[],
      action: 'manage' as const,
      expectAllowed: false,
    },
    {
      name: 'TeamLeader (matching team, no Ministry Membership), manage -> allowed',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [] as MinistryMembershipFact[],
      teamMemberships: [teamMembership({ accessLevel: 'leader' })],
      action: 'manage' as const,
      expectAllowed: true,
    },
    {
      name: 'TeamLeader of a DIFFERENT team, manage -> denied',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [] as MinistryMembershipFact[],
      teamMemberships: [
        teamMembership({ teamId: otherTeamId, accessLevel: 'leader' }),
      ],
      action: 'manage' as const,
      expectAllowed: false,
    },
    {
      name: 'team member (not leader), manage -> denied',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [] as MinistryMembershipFact[],
      teamMemberships: [teamMembership({ accessLevel: 'member' })],
      action: 'manage' as const,
      expectAllowed: false,
    },
    {
      name: 'no memberships at all, manage -> denied',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [] as MinistryMembershipFact[],
      teamMemberships: [] as TeamMembershipFact[],
      action: 'manage' as const,
      expectAllowed: false,
    },
    {
      name: 'church admin, no Team Membership, participate -> denied (no participatory capability)',
      churchAccessLevel: 'admin' as const,
      ministryMemberships: [] as MinistryMembershipFact[],
      teamMemberships: [] as TeamMembershipFact[],
      action: 'participate' as const,
      expectAllowed: false,
    },
    {
      name: 'ministry leader WITHOUT explicit Team Membership, participate -> denied (scoped to explicitly assigned Teams only)',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [ministryMembership({ accessLevel: 'leader' })],
      teamMemberships: [] as TeamMembershipFact[],
      action: 'participate' as const,
      expectAllowed: false,
    },
    {
      name: 'team member, participate -> allowed',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [] as MinistryMembershipFact[],
      teamMemberships: [teamMembership({ accessLevel: 'member' })],
      action: 'participate' as const,
      expectAllowed: true,
    },
    {
      name: 'TeamLeader, participate -> allowed',
      churchAccessLevel: 'member' as const,
      ministryMemberships: [] as MinistryMembershipFact[],
      teamMemberships: [teamMembership({ accessLevel: 'leader' })],
      action: 'participate' as const,
      expectAllowed: true,
    },
  ])('$name', ({
    churchAccessLevel,
    ministryMemberships,
    teamMemberships,
    action,
    expectAllowed,
  }) => {
    const decision = AuthorityService.authorize(
      request({
        actor: actor({
          churchMembership: churchMembership({
            accessLevel: churchAccessLevel,
          }),
          ministryMemberships,
          teamMemberships,
        }),
        action,
        resource,
      }),
    );
    expect(allowed(decision)).toBe(expectAllowed);
    if (!expectAllowed) expect(denyReason(decision)).toBeDefined();
  });

  describe('ownership', () => {
    it('owner participating in their own resource, with a matching Team Membership -> allowed', () => {
      const decision = AuthorityService.authorize(
        request({
          actor: actor({ teamMemberships: [teamMembership()] }),
          action: 'participate',
          resource: { ...resource, ownerVolunteerId: volunteerId },
        }),
      );
      expect(allowed(decision)).toBe(true);
    });

    it("non-owner attempting to participate in a teammate's owned resource -> denied", () => {
      const decision = AuthorityService.authorize(
        request({
          actor: actor({ teamMemberships: [teamMembership()] }),
          action: 'participate',
          resource: { ...resource, ownerVolunteerId: otherVolunteerId },
        }),
      );
      expect(allowed(decision)).toBe(false);
      expect(denyReason(decision)).toBe('INSUFFICIENT_ACCESS_LEVEL');
    });
  });
});
