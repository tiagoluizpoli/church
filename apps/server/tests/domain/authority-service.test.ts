import { describe, expect, it } from 'vitest';
import { AuthorityService } from '@/domain/authority/authority-service';
import type {
  AuthorityActor,
  AuthorityDecision,
  AuthorityRequest,
  AuthorityResource,
  ChurchMembershipFact,
  MinistryMembershipFact,
} from '@/domain/authority/types';
import type {
  ChurchId,
  MinistryId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const churchId = 'chu_home' as ChurchId;
const otherChurchId = 'chu_other' as ChurchId;
const ministryId = 'min_worship' as MinistryId;
const otherMinistryId = 'min_kids' as MinistryId;
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

function actor(overrides: Partial<AuthorityActor> = {}): AuthorityActor {
  return {
    userId,
    volunteerId,
    activeChurchId: churchId,
    churchMembership: churchMembership({ accessLevel: 'member' }),
    ministryMemberships: [],
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

  it('denies participation when the owned object has no active Ministry Membership', () => {
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
    expect(denyReason(decision)).toBe('INSUFFICIENT_ACCESS_LEVEL');
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

describe('AuthorityService — scope-aware decisions', () => {
  it('hides an owned object from a non-owner without turning missing capability into a conflict', () => {
    expect(
      AuthorityService.authorize(
        request({
          actor: actor({
            churchMembership: churchMembership({ accessLevel: 'admin' }),
          }),
          action: 'participate',
          resource: {
            type: 'ministry',
            churchId,
            ministryId,
            ownerVolunteerId: otherVolunteerId,
          },
          scope: 'object',
        }),
      ),
    ).toEqual({ allowed: false, reason: 'OUTSIDE_SCOPE' });
  });
  it('allows a serving collection for a leader without Roles but denies an orphan Volunteer profile', () => {
    expect(
      AuthorityService.authorize(
        request({
          actor: actor({
            ministryMemberships: [
              ministryMembership({ accessLevel: 'leader' }),
            ],
          }),
          action: 'participate',
        }),
      ),
    ).toEqual({ allowed: true });
    expect(
      AuthorityService.authorize(request({ action: 'participate' })),
    ).toEqual({ allowed: false, reason: 'INSUFFICIENT_ACCESS_LEVEL' });
  });
});
