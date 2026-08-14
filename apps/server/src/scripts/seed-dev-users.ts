import {
  account,
  addChurchMember,
  type ChurchRecord,
  createDb,
  findChurchBySlug,
  ministry,
  ministryInvitation,
  ministryVolunteer,
  ministryVolunteerRole,
  ministryVolunteerTeam,
  role,
  team,
  user,
  volunteer,
} from '@church/db';
import { hashPassword } from 'better-auth/crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { provisionSeedChurch } from './provision-seed-church';

const db = createDb();

const DEV_PASSWORD = 'dev-password-123';

const DEV_CHURCH = {
  slug: 'local-dev-church',
  name: 'Local Dev Church',
  timezone: 'America/Sao_Paulo',
} as const;

/**
 * A second, otherwise-empty Church so tenant isolation is exercisable
 * locally without a second full domain fixture (issue #62). Its own
 * ChurchAdmin bootstrap invitation is left pending/unredeemed on purpose —
 * one more lifecycle example alongside `MINISTRY_INVITATION_FIXTURES` below.
 */
const DEV_CHURCH_B = {
  slug: 'local-dev-church-b',
  name: 'Local Dev Church B',
  timezone: 'America/Los_Angeles',
} as const;

const DEV_CHURCH_B_ADMIN_EMAIL = 'admin-b@local-dev.test';

const DEV_MINISTRY = {
  name: 'Local Ops',
  enforcementType: 'soft' as const,
} as const;

const DEV_TEAM = {
  name: 'Local Team',
} as const;

const DEV_ROLES = ['Coordinator', 'Support'] as const;

interface SeededDevUser {
  email: string;
  name: string;
  role: string;
}

/**
 * Qualifications are spread deliberately rather than granted to everyone: the
 * builder's candidate filtering is only observable when the qualified set is a
 * strict subset of the roster. Local Volunteer is qualified for nothing, which
 * is the only way to reach the empty-candidate and hard-block states by hand.
 */
const DEV_USERS = [
  {
    email: 'admin@local-dev.test',
    name: 'Local Admin',
    ministryAccessLevel: 'leader' as const,
    teamAccessLevel: 'member' as const,
    isChurchAdmin: true,
    qualifiedRoleNames: ['Coordinator', 'Support'],
  },
  {
    email: 'leader@local-dev.test',
    name: 'Local Leader',
    ministryAccessLevel: 'leader' as const,
    teamAccessLevel: 'member' as const,
    isChurchAdmin: false,
    qualifiedRoleNames: ['Coordinator'],
  },
  {
    email: 'teamleader@local-dev.test',
    name: 'Local Team Leader',
    ministryAccessLevel: 'volunteer' as const,
    teamAccessLevel: 'leader' as const,
    isChurchAdmin: false,
    qualifiedRoleNames: ['Support'],
  },
  {
    email: 'volunteer@local-dev.test',
    name: 'Local Volunteer',
    ministryAccessLevel: 'volunteer' as const,
    teamAccessLevel: 'member' as const,
    isChurchAdmin: false,
    qualifiedRoleNames: [],
  },
] as const;

async function ensureDevChurch(): Promise<ChurchRecord> {
  const existingChurch = await findChurchBySlug({ db, slug: DEV_CHURCH.slug });
  if (existingChurch) return existingChurch;

  const adminDevUser = DEV_USERS.find((devUser) => devUser.isChurchAdmin);
  if (!adminDevUser) {
    throw new Error('No church-admin dev user configured to invite.');
  }

  return await provisionSeedChurch({
    db,
    churchName: DEV_CHURCH.name,
    churchSlug: DEV_CHURCH.slug,
    adminEmail: adminDevUser.email,
  });
}

interface EnsureMinistryInput {
  churchId: string;
}

async function ensureMinistry({ churchId }: EnsureMinistryInput) {
  const existingMinistry = await db.query.ministry.findFirst({
    where: and(
      eq(ministry.churchId, churchId),
      eq(ministry.name, DEV_MINISTRY.name),
    ),
  });

  if (existingMinistry) {
    return existingMinistry;
  }

  const [createdMinistry] = await db
    .insert(ministry)
    .values({
      churchId,
      ...DEV_MINISTRY,
    })
    .returning();

  if (!createdMinistry) {
    throw new Error('Failed to create local dev ministry.');
  }

  return createdMinistry;
}

interface EnsureTeamInput {
  churchId: string;
  ministryId: string;
}

async function ensureTeam({ churchId, ministryId }: EnsureTeamInput) {
  const existingTeam = await db.query.team.findFirst({
    where: and(eq(team.churchId, churchId), eq(team.name, DEV_TEAM.name)),
  });

  if (existingTeam) {
    return existingTeam;
  }

  const [createdTeam] = await db
    .insert(team)
    .values({
      churchId,
      ministryId,
      name: DEV_TEAM.name,
    })
    .returning();

  if (!createdTeam) {
    throw new Error('Failed to create local dev team.');
  }

  return createdTeam;
}

interface EnsureRolesInput {
  churchId: string;
  ministryId: string;
}

async function ensureRoles({ churchId, ministryId }: EnsureRolesInput) {
  const existingRoles = await db.query.role.findMany({
    where: eq(role.ministryId, ministryId),
  });
  const existingNames = new Set(existingRoles.map((r) => r.name));

  const missingNames = DEV_ROLES.filter((name) => !existingNames.has(name));
  if (missingNames.length === 0) {
    return existingRoles;
  }

  const createdRoles = await db
    .insert(role)
    .values(
      missingNames.map((name) => ({
        churchId,
        ministryId,
        name,
      })),
    )
    .returning();

  return [...existingRoles, ...createdRoles];
}

async function ensureDevChurchB(): Promise<ChurchRecord> {
  const existingChurch = await findChurchBySlug({
    db,
    slug: DEV_CHURCH_B.slug,
  });
  if (existingChurch) return existingChurch;

  return await provisionSeedChurch({
    db,
    churchName: DEV_CHURCH_B.name,
    churchSlug: DEV_CHURCH_B.slug,
    adminEmail: DEV_CHURCH_B_ADMIN_EMAIL,
  });
}

interface MinistryInvitationFixture {
  id: string;
  email: string;
  name: string;
  status: 'pending' | 'accepted' | 'rejected' | 'canceled';
  /** Only the past-expiry `pending` row sets this before today; the rest expire 14 days out. */
  expiresInDays: number;
}

/**
 * One row per lifecycle status the Ministry Invitation domain defines, plus
 * a past-expiry `pending` row — there is no `expired` status, so that state
 * is only reachable this way (issue #62). Fixed ids so re-running the seed
 * converges instead of duplicating.
 */
const MINISTRY_INVITATION_FIXTURES: MinistryInvitationFixture[] = [
  {
    id: 'd0000001-0000-4000-8000-000000000001',
    email: 'invite-pending@local-dev.test',
    name: 'Local Invite Pending',
    status: 'pending',
    expiresInDays: 14,
  },
  {
    id: 'd0000001-0000-4000-8000-000000000002',
    email: 'invite-expired@local-dev.test',
    name: 'Local Invite Expired',
    status: 'pending',
    expiresInDays: -1,
  },
  {
    id: 'd0000001-0000-4000-8000-000000000003',
    email: 'invite-accepted@local-dev.test',
    name: 'Local Invite Accepted',
    status: 'accepted',
    expiresInDays: 14,
  },
  {
    id: 'd0000001-0000-4000-8000-000000000004',
    email: 'invite-rejected@local-dev.test',
    name: 'Local Invite Rejected',
    status: 'rejected',
    expiresInDays: 14,
  },
  {
    id: 'd0000001-0000-4000-8000-000000000005',
    email: 'invite-canceled@local-dev.test',
    name: 'Local Invite Canceled',
    status: 'canceled',
    expiresInDays: 14,
  },
];

interface EnsureMinistryInvitationLifecycleFixturesInput {
  churchId: string;
  ministryId: string;
  inviterId: string;
}

/**
 * Seeds one Ministry Invitation per lifecycle status directly — fixture
 * setup may write known state directly (spec 024 §3.2); production minting
 * never does. Each invitee is a real Church Member so the row satisfies the
 * schema's addressee shape, but deliberately not a Ministry Member, so the
 * invitation stays meaningful to redeem by hand locally.
 */
async function ensureMinistryInvitationLifecycleFixtures({
  churchId,
  ministryId,
  inviterId,
}: EnsureMinistryInvitationLifecycleFixturesInput): Promise<void> {
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const fixture of MINISTRY_INVITATION_FIXTURES) {
    const invitee = await ensureAuthUser({
      email: fixture.email,
      name: fixture.name,
      passwordHash,
    });
    await addChurchMember({ db, churchId, userId: invitee.id });

    await db
      .insert(ministryInvitation)
      .values({
        id: fixture.id,
        churchId,
        ministryId,
        inviteeUserId: invitee.id,
        ministryAccessLevel: 'volunteer',
        status: fixture.status,
        inviterId,
        expiresAt: new Date(now + fixture.expiresInDays * dayMs),
        acceptedAt: fixture.status === 'accepted' ? new Date() : null,
        canceledAt: fixture.status === 'canceled' ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [ministryInvitation.id],
        set: {
          status: fixture.status,
          expiresAt: new Date(now + fixture.expiresInDays * dayMs),
          acceptedAt: fixture.status === 'accepted' ? new Date() : null,
          canceledAt: fixture.status === 'canceled' ? new Date() : null,
        },
      });
  }
}

interface EnsureAuthUserInput {
  email: string;
  name: string;
  passwordHash: string;
}

async function ensureAuthUser({
  email,
  name,
  passwordHash,
}: EnsureAuthUserInput) {
  const normalizedEmail = email.toLowerCase();
  const existingUser = await db.query.user.findFirst({
    where: eq(user.email, normalizedEmail),
  });

  let ensuredUser = existingUser;

  if (!ensuredUser) {
    const [createdUser] = await db
      .insert(user)
      .values({
        id: crypto.randomUUID(),
        email: normalizedEmail,
        name,
        emailVerified: true,
      })
      .returning();

    if (!createdUser) {
      throw new Error(`Failed to create auth user for ${normalizedEmail}.`);
    }

    ensuredUser = createdUser;
  } else if (ensuredUser.name !== name || !ensuredUser.emailVerified) {
    const [updatedUser] = await db
      .update(user)
      .set({
        name,
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(user.id, ensuredUser.id))
      .returning();

    if (!updatedUser) {
      throw new Error(`Failed to update auth user for ${normalizedEmail}.`);
    }

    ensuredUser = updatedUser;
  }

  const credentialAccount = await db.query.account.findFirst({
    where: and(
      eq(account.userId, ensuredUser.id),
      eq(account.providerId, 'credential'),
    ),
  });

  if (!credentialAccount) {
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: ensuredUser.id,
      providerId: 'credential',
      userId: ensuredUser.id,
      password: passwordHash,
    });
  } else {
    await db
      .update(account)
      .set({
        accountId: ensuredUser.id,
        password: passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(account.id, credentialAccount.id));
  }

  return ensuredUser;
}

interface EnsureVolunteerInput {
  userId: string;
  churchId: string;
}

async function ensureVolunteer({ userId, churchId }: EnsureVolunteerInput) {
  const existingVolunteer = await db.query.volunteer.findFirst({
    where: and(eq(volunteer.userId, userId), isNull(volunteer.leftAt)),
  });

  if (existingVolunteer && existingVolunteer.churchId !== churchId) {
    throw new Error(
      `User ${userId} already belongs to another church. Clear that user before reseeding local dev users.`,
    );
  }

  if (existingVolunteer) {
    if (existingVolunteer.status !== 'active') {
      const [updatedVolunteer] = await db
        .update(volunteer)
        .set({
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(volunteer.id, existingVolunteer.id))
        .returning();

      if (!updatedVolunteer) {
        throw new Error(
          `Failed to reactivate volunteer ${existingVolunteer.id}.`,
        );
      }

      return updatedVolunteer;
    }

    return existingVolunteer;
  }

  const [createdVolunteer] = await db
    .insert(volunteer)
    .values({
      userId,
      churchId,
      status: 'active',
    })
    .returning();

  if (!createdVolunteer) {
    throw new Error(`Failed to create volunteer for user ${userId}.`);
  }

  return createdVolunteer;
}

interface EnsureMembershipTeam {
  id: string;
  accessLevel: 'leader' | 'member';
}

interface EnsureMembershipInput {
  churchId: string;
  volunteerId: string;
  ministryId: string;
  teams: EnsureMembershipTeam[];
  roleIds: string[];
  ministryAccessLevel: 'leader' | 'volunteer';
}

async function ensureMembership(input: EnsureMembershipInput) {
  const existingMembership = await db.query.ministryVolunteer.findFirst({
    where: and(
      eq(ministryVolunteer.churchId, input.churchId),
      eq(ministryVolunteer.volunteerId, input.volunteerId),
      eq(ministryVolunteer.ministryId, input.ministryId),
    ),
  });

  const membershipId = existingMembership
    ? existingMembership.id
    : await insertMembership(input);

  if (existingMembership) {
    await db
      .update(ministryVolunteer)
      .set({
        ministryAccessLevel: input.ministryAccessLevel,
        status: 'active',
      })
      .where(eq(ministryVolunteer.id, membershipId));
  }

  await ensureMembershipTeams({
    churchId: input.churchId,
    membershipId,
    teams: input.teams,
  });

  await ensureMembershipRoles({
    churchId: input.churchId,
    membershipId,
    roleIds: input.roleIds,
  });
}

async function insertMembership(input: EnsureMembershipInput) {
  const [inserted] = await db
    .insert(ministryVolunteer)
    .values({
      churchId: input.churchId,
      volunteerId: input.volunteerId,
      ministryId: input.ministryId,
      ministryAccessLevel: input.ministryAccessLevel,
      status: 'active',
    })
    .returning();
  if (!inserted) {
    throw new Error('Failed to create ministry membership');
  }
  return inserted.id;
}

interface EnsureMembershipTeamsInput {
  churchId: string;
  membershipId: string;
  teams: EnsureMembershipTeam[];
}

/** Replaces the membership's team rows so re-running the seed stays idempotent. */
async function ensureMembershipTeams(input: EnsureMembershipTeamsInput) {
  await db
    .delete(ministryVolunteerTeam)
    .where(eq(ministryVolunteerTeam.ministryVolunteerId, input.membershipId));

  if (input.teams.length === 0) return;

  await db.insert(ministryVolunteerTeam).values(
    input.teams.map((teamMembership) => ({
      churchId: input.churchId,
      ministryVolunteerId: input.membershipId,
      teamId: teamMembership.id,
      accessLevel: teamMembership.accessLevel,
    })),
  );
}

interface EnsureMembershipRolesInput {
  churchId: string;
  membershipId: string;
  roleIds: string[];
}

/** Same delete-then-insert shape as the team rows, for the same reason. */
async function ensureMembershipRoles(input: EnsureMembershipRolesInput) {
  await db
    .delete(ministryVolunteerRole)
    .where(eq(ministryVolunteerRole.ministryVolunteerId, input.membershipId));

  if (input.roleIds.length === 0) return;

  await db.insert(ministryVolunteerRole).values(
    input.roleIds.map((roleId) => ({
      churchId: input.churchId,
      ministryVolunteerId: input.membershipId,
      roleId,
    })),
  );
}

export async function seedDevUsers() {
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const localChurch = await ensureDevChurch();
  const localMinistry = await ensureMinistry({ churchId: localChurch.id });
  const localTeam = await ensureTeam({
    churchId: localChurch.id,
    ministryId: localMinistry.id,
  });
  const localRoles = await ensureRoles({
    churchId: localChurch.id,
    ministryId: localMinistry.id,
  });
  const results: SeededDevUser[] = [];
  let churchAdminUserId: string | undefined;

  for (const devUser of DEV_USERS) {
    const authUser = await ensureAuthUser({
      email: devUser.email,
      name: devUser.name,
      passwordHash,
    });
    if (devUser.isChurchAdmin) churchAdminUserId = authUser.id;
    const localVolunteer = await ensureVolunteer({
      userId: authUser.id,
      churchId: localChurch.id,
    });

    // Church Membership is the access grant; volunteering is additive to it.
    await addChurchMember({
      db,
      churchId: localChurch.id,
      userId: authUser.id,
      accessLevel: devUser.isChurchAdmin ? 'admin' : 'member',
    });

    await ensureMembership({
      churchId: localChurch.id,
      volunteerId: localVolunteer.id,
      ministryId: localMinistry.id,
      teams:
        devUser.ministryAccessLevel === 'leader'
          ? []
          : [{ id: localTeam.id, accessLevel: devUser.teamAccessLevel }],
      roleIds: localRoles
        .filter((r) =>
          (devUser.qualifiedRoleNames as readonly string[]).includes(r.name),
        )
        .map((r) => r.id),
      ministryAccessLevel: devUser.ministryAccessLevel,
    });

    const roleLabel =
      devUser.ministryAccessLevel === 'volunteer' &&
      devUser.teamAccessLevel === 'leader'
        ? 'team_leader'
        : devUser.ministryAccessLevel;
    results.push({
      email: devUser.email,
      name: devUser.name,
      role: devUser.isChurchAdmin ? `church_admin+${roleLabel}` : roleLabel,
    });
  }

  if (!churchAdminUserId) {
    throw new Error(
      'No church-admin dev user was seeded to own the invitation fixtures.',
    );
  }
  await ensureMinistryInvitationLifecycleFixtures({
    churchId: localChurch.id,
    ministryId: localMinistry.id,
    inviterId: churchAdminUserId,
  });

  const churchB = await ensureDevChurchB();

  return {
    church: DEV_CHURCH,
    churchB,
    ministry: DEV_MINISTRY.name,
    team: DEV_TEAM.name,
    roles: localRoles.map((r) => r.name),
    password: DEV_PASSWORD,
    users: results,
    invitationFixtures: MINISTRY_INVITATION_FIXTURES.map((f) => ({
      email: f.email,
      status: f.status,
    })),
  };
}

if (import.meta.main) {
  seedDevUsers()
    .then((result) => {
      console.log('✅ Local dev users ready.');
      console.log(`Church: ${result.church.name} (${result.church.slug})`);
      console.log(`Ministry: ${result.ministry}`);
      console.log(`Team: ${result.team}`);
      console.log(`Roles: ${result.roles.join(', ')}`);
      console.log(`Password: ${result.password}`);
      console.log(`ChurchB: ${result.churchB.name} (${result.churchB.slug})`);
      console.log(
        `Invitation fixtures: ${result.invitationFixtures.map((f) => `${f.status}:${f.email}`).join(', ')}`,
      );
      for (const seededUser of result.users) {
        console.log(
          `- ${seededUser.role}: ${seededUser.email} (${seededUser.name})`,
        );
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to seed local dev users:', error);
      process.exit(1);
    });
}
