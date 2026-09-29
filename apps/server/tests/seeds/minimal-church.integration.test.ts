import {
  account,
  church,
  invitation,
  member,
  ministry,
  ministryVolunteer,
  ministryVolunteerRole,
  ministryVolunteerTeam,
  organization,
  role,
  team,
  user,
  volunteer,
} from '@church/db';
import { verifyPassword } from 'better-auth/crypto';
import { and, count, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { runSeedRecipe } from '../../seeds/recipe';
import {
  type MinimalChurchRecipeResult,
  minimalChurchRecipe,
} from '../../seeds/recipes/minimal-church';
import { testDb, truncateAll } from '../integration/repositories/setup';

interface ExpectAuthenticatableInput {
  userId: string;
  email: string;
  password: string;
}

/** Sign-in needs a verified User and a credential account whose hash matches the password. */
async function expectAuthenticatable({
  userId,
  email,
  password,
}: ExpectAuthenticatableInput): Promise<void> {
  const [userRow] = await testDb.select().from(user).where(eq(user.id, userId));
  expect(userRow).toMatchObject({ email, emailVerified: true });

  const credentialAccounts = await testDb
    .select()
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, 'credential')),
    );
  expect(credentialAccounts).toHaveLength(1);
  const [credential] = credentialAccounts;
  expect(credential?.accountId).toBe(userId);
  expect(
    await verifyPassword({ hash: credential?.password ?? '', password }),
  ).toBe(true);
}

interface CountRowsInput {
  table:
    | typeof organization
    | typeof user
    | typeof account
    | typeof volunteer
    | typeof ministry
    | typeof ministryVolunteer;
}

async function countRows({ table }: CountRowsInput): Promise<number> {
  const [row] = await testDb.select({ value: count() }).from(table);
  return row?.value ?? 0;
}

describe('minimal Church seed recipe', () => {
  let seeded: MinimalChurchRecipeResult;

  beforeEach(async () => {
    await truncateAll();
    seeded = await runSeedRecipe({ db: testDb, recipe: minimalChurchRecipe });
  });

  it('provisions the Church through Church Provisioning in the Church Timezone', async () => {
    const [churchRow] = await testDb
      .select({
        slug: organization.slug,
        name: organization.name,
        timezone: church.timezone,
      })
      .from(organization)
      .innerJoin(church, eq(church.id, organization.id))
      .where(eq(organization.id, seeded.church.id));

    expect(churchRow).toEqual({
      slug: 'igreja-semente',
      name: 'Igreja Semente',
      timezone: 'America/Sao_Paulo',
    });

    const invitations = await testDb
      .select()
      .from(invitation)
      .where(eq(invitation.organizationId, seeded.church.id));
    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({
      email: seeded.personas.churchAdmin.email,
      role: 'admin',
      status: 'accepted',
    });
  });

  it('gives the ChurchAdmin and the Volunteer authenticatable accounts', async () => {
    await expectAuthenticatable(seeded.personas.churchAdmin);
    await expectAuthenticatable(seeded.personas.volunteer);
  });

  it('grants each persona exactly one Church Membership at its Access Level', async () => {
    const memberships = await testDb
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .where(eq(member.organizationId, seeded.church.id));

    expect(memberships).toHaveLength(2);
    expect(memberships).toEqual(
      expect.arrayContaining([
        { userId: seeded.personas.churchAdmin.userId, role: 'admin' },
        { userId: seeded.personas.volunteer.userId, role: 'member' },
      ]),
    );
  });

  it('seats the Volunteer in the Ministry, its Team, and a Role qualification', async () => {
    const [volunteerRow] = await testDb
      .select()
      .from(volunteer)
      .where(eq(volunteer.id, seeded.personas.volunteer.volunteerId));
    expect(volunteerRow).toMatchObject({
      userId: seeded.personas.volunteer.userId,
      churchId: seeded.church.id,
      status: 'active',
      leftAt: null,
    });

    const [ministryRow] = await testDb
      .select()
      .from(ministry)
      .where(eq(ministry.id, seeded.ministry.id));
    expect(ministryRow).toMatchObject({
      churchId: seeded.church.id,
      name: 'Kids',
    });

    const [roleRow] = await testDb
      .select()
      .from(role)
      .where(eq(role.id, seeded.ministry.roleId));
    expect(roleRow).toMatchObject({
      churchId: seeded.church.id,
      ministryId: seeded.ministry.id,
      name: 'Auxiliar',
    });

    const [teamRow] = await testDb
      .select()
      .from(team)
      .where(eq(team.id, seeded.ministry.teamId));
    expect(teamRow).toMatchObject({
      churchId: seeded.church.id,
      ministryId: seeded.ministry.id,
      name: 'Maternal',
    });

    const memberships = await testDb
      .select()
      .from(ministryVolunteer)
      .where(
        eq(
          ministryVolunteer.volunteerId,
          seeded.personas.volunteer.volunteerId,
        ),
      );
    expect(memberships).toHaveLength(1);
    const [membership] = memberships;
    expect(membership).toMatchObject({
      id: seeded.personas.volunteer.ministryMembershipId,
      churchId: seeded.church.id,
      ministryId: seeded.ministry.id,
      ministryAccessLevel: 'volunteer',
      status: 'active',
    });

    const qualifications = await testDb
      .select({
        churchId: ministryVolunteerRole.churchId,
        roleId: ministryVolunteerRole.roleId,
      })
      .from(ministryVolunteerRole)
      .where(
        eq(
          ministryVolunteerRole.ministryVolunteerId,
          seeded.personas.volunteer.ministryMembershipId,
        ),
      );
    expect(qualifications).toEqual([
      { churchId: seeded.church.id, roleId: seeded.ministry.roleId },
    ]);

    const teamMemberships = await testDb
      .select({
        churchId: ministryVolunteerTeam.churchId,
        teamId: ministryVolunteerTeam.teamId,
        accessLevel: ministryVolunteerTeam.accessLevel,
      })
      .from(ministryVolunteerTeam)
      .where(
        eq(
          ministryVolunteerTeam.ministryVolunteerId,
          seeded.personas.volunteer.ministryMembershipId,
        ),
      );
    expect(teamMemberships).toEqual([
      {
        churchId: seeded.church.id,
        teamId: seeded.ministry.teamId,
        accessLevel: 'member',
      },
    ]);
  });

  it('returns the same identifiers every time the graph is rebuilt', async () => {
    await truncateAll();
    const rebuilt = await runSeedRecipe({
      db: testDb,
      recipe: minimalChurchRecipe,
    });

    expect(rebuilt).toEqual(seeded);
  });

  it('rolls back the whole graph when a recipe fails part-way', async () => {
    await truncateAll();

    await expect(
      runSeedRecipe({
        db: testDb,
        recipe: {
          name: 'fails-after-minimal-church',
          async load(input) {
            await minimalChurchRecipe.load(input);
            throw new Error('recipe failed after writing its graph');
          },
        },
      }),
    ).rejects.toThrow('recipe failed after writing its graph');

    for (const table of [
      organization,
      user,
      account,
      volunteer,
      ministry,
      ministryVolunteer,
    ]) {
      expect(await countRows({ table })).toBe(0);
    }
  });
});
