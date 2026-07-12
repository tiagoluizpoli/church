import {
  account,
  church,
  churchAdmin,
  createDb,
  ministry,
  ministryVolunteer,
  role,
  team,
  user,
  volunteer,
} from '@church/db';
import { hashPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';

const db = createDb();

const DEV_PASSWORD = 'dev-password-123';

const DEV_CHURCH = {
  slug: 'local-dev-church',
  name: 'Local Dev Church',
  timezone: 'America/Sao_Paulo',
} as const;

const DEV_MINISTRY = {
  name: 'Local Ops',
  enforcementType: 'soft' as const,
} as const;

const DEV_TEAM = {
  name: 'Local Team',
} as const;

const DEV_ROLES = ['Coordinator', 'Support'] as const;

const DEV_USERS = [
  {
    email: 'admin@local-dev.test',
    name: 'Local Admin',
    systemRole: 'leader' as const,
    isChurchAdmin: true,
  },
  {
    email: 'leader@local-dev.test',
    name: 'Local Leader',
    systemRole: 'leader' as const,
    isChurchAdmin: false,
  },
  {
    email: 'subleader@local-dev.test',
    name: 'Local Sub Leader',
    systemRole: 'sub_leader' as const,
    isChurchAdmin: false,
  },
  {
    email: 'volunteer@local-dev.test',
    name: 'Local Volunteer',
    systemRole: 'volunteer' as const,
    isChurchAdmin: false,
  },
] as const;

async function ensureChurch() {
  const existingChurch = await db.query.church.findFirst({
    where: eq(church.slug, DEV_CHURCH.slug),
  });

  if (existingChurch) {
    return existingChurch;
  }

  const [createdChurch] = await db
    .insert(church)
    .values(DEV_CHURCH)
    .returning();

  if (!createdChurch) {
    throw new Error('Failed to create local dev church.');
  }

  return createdChurch;
}

async function ensureMinistry(churchId: string) {
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

async function ensureTeam(churchId: string, ministryId: string) {
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

async function ensureRoles(churchId: string, ministryId: string) {
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
        isGlobal: false,
      })),
    )
    .returning();

  return [...existingRoles, ...createdRoles];
}

async function ensureAuthUser(
  email: string,
  name: string,
  passwordHash: string,
) {
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

async function ensureVolunteer(userId: string, churchId: string) {
  const existingVolunteer = await db.query.volunteer.findFirst({
    where: eq(volunteer.userId, userId),
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

async function ensureMembership(input: {
  churchId: string;
  volunteerId: string;
  ministryId: string;
  teamId: string | null;
  systemRole: 'leader' | 'sub_leader' | 'volunteer';
}) {
  const existingMembership = await db.query.ministryVolunteer.findFirst({
    where: and(
      eq(ministryVolunteer.churchId, input.churchId),
      eq(ministryVolunteer.volunteerId, input.volunteerId),
      eq(ministryVolunteer.ministryId, input.ministryId),
    ),
  });

  if (!existingMembership) {
    await db.insert(ministryVolunteer).values({
      churchId: input.churchId,
      volunteerId: input.volunteerId,
      ministryId: input.ministryId,
      teamId: input.teamId,
      systemRole: input.systemRole,
      status: 'active',
    });
    return;
  }

  await db
    .update(ministryVolunteer)
    .set({
      teamId: input.teamId,
      systemRole: input.systemRole,
      status: 'active',
    })
    .where(eq(ministryVolunteer.id, existingMembership.id));
}

async function ensureChurchAdmin(input: { churchId: string; userId: string }) {
  const existingChurchAdmin = await db.query.churchAdmin.findFirst({
    where: and(
      eq(churchAdmin.churchId, input.churchId),
      eq(churchAdmin.userId, input.userId),
    ),
  });

  if (existingChurchAdmin) {
    return;
  }

  await db.insert(churchAdmin).values({
    churchId: input.churchId,
    userId: input.userId,
  });
}

export async function seedDevUsers() {
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const localChurch = await ensureChurch();
  const localMinistry = await ensureMinistry(localChurch.id);
  const localTeam = await ensureTeam(localChurch.id, localMinistry.id);
  const localRoles = await ensureRoles(localChurch.id, localMinistry.id);
  const results: Array<{
    email: string;
    name: string;
    role: string;
  }> = [];

  for (const devUser of DEV_USERS) {
    const authUser = await ensureAuthUser(
      devUser.email,
      devUser.name,
      passwordHash,
    );
    const localVolunteer = await ensureVolunteer(authUser.id, localChurch.id);

    await ensureMembership({
      churchId: localChurch.id,
      volunteerId: localVolunteer.id,
      ministryId: localMinistry.id,
      teamId: devUser.systemRole === 'leader' ? null : localTeam.id,
      systemRole: devUser.systemRole,
    });

    if (devUser.isChurchAdmin) {
      await ensureChurchAdmin({
        churchId: localChurch.id,
        userId: authUser.id,
      });
    }

    results.push({
      email: devUser.email,
      name: devUser.name,
      role: devUser.isChurchAdmin
        ? `church_admin+${devUser.systemRole}`
        : devUser.systemRole,
    });
  }

  return {
    church: DEV_CHURCH,
    ministry: DEV_MINISTRY.name,
    team: DEV_TEAM.name,
    roles: localRoles.map((r) => r.name),
    password: DEV_PASSWORD,
    users: results,
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
