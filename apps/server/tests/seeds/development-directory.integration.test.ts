import {
  account,
  church,
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
import { parseCalendarDay } from '@church/time';
import { verifyPassword } from 'better-auth/crypto';
import { and, count, countDistinct, eq, isNull, ne, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  SEED_PERSONA_PASSWORD,
  SEED_PLATFORM_OPERATOR_ID,
} from '../../seeds/blueprints/credentials';
import { verifyDevelopmentGraph } from '../../seeds/development/verify';
import { runSeedRecipe, type SeedWriter } from '../../seeds/recipe';
import {
  createDevelopmentRecipe,
  type DevelopmentRecipeResult,
} from '../../seeds/recipes/development';
import { createFastify } from '../../src/main/fastify/setup';
import { testDb, truncateAll } from '../integration/repositories/setup';

const ANCHOR = parseCalendarDay({ value: '2026-03-15' });

class RollbackSentinel extends Error {}

interface SeedTransactionInput {
  tx: SeedWriter;
}

interface WithRolledBackInput {
  run: (input: SeedTransactionInput) => Promise<void>;
}

/** Runs `run` against the seeded graph, then discards whatever it changed. */
async function withRolledBack({ run }: WithRolledBackInput): Promise<void> {
  await expect(
    testDb.transaction(async (tx) => {
      await run({ tx });
      throw new RollbackSentinel();
    }),
  ).rejects.toBeInstanceOf(RollbackSentinel);
}

interface MinistryMembershipCount {
  ministry: string;
  memberships: number;
}

interface ChurchIdInput {
  churchId: string;
}

async function activeMembershipCounts({
  churchId,
}: ChurchIdInput): Promise<MinistryMembershipCount[]> {
  return await testDb
    .select({ ministry: ministry.name, memberships: count() })
    .from(ministryVolunteer)
    .innerJoin(ministry, eq(ministry.id, ministryVolunteer.ministryId))
    .where(
      and(
        eq(ministryVolunteer.churchId, churchId),
        eq(ministryVolunteer.status, 'active'),
        isNull(ministryVolunteer.leftAt),
      ),
    )
    .groupBy(ministry.name)
    .orderBy(ministry.name);
}

interface LeaderCountInput extends ChurchIdInput {
  ministryName: string;
}

async function ministryLeaderCount({
  churchId,
  ministryName,
}: LeaderCountInput): Promise<number> {
  const [row] = await testDb
    .select({ value: count() })
    .from(ministryVolunteer)
    .innerJoin(ministry, eq(ministry.id, ministryVolunteer.ministryId))
    .where(
      and(
        eq(ministry.churchId, churchId),
        eq(ministry.name, ministryName),
        eq(ministryVolunteer.ministryAccessLevel, 'leader'),
        eq(ministryVolunteer.status, 'active'),
      ),
    );
  return row?.value ?? 0;
}

interface TeamLeaderCountInput extends LeaderCountInput {
  teamName: string;
}

async function teamLeaderCount({
  churchId,
  ministryName,
  teamName,
}: TeamLeaderCountInput): Promise<number> {
  const [row] = await testDb
    .select({ value: count() })
    .from(ministryVolunteerTeam)
    .innerJoin(team, eq(team.id, ministryVolunteerTeam.teamId))
    .innerJoin(ministry, eq(ministry.id, team.ministryId))
    .where(
      and(
        eq(ministry.churchId, churchId),
        eq(ministry.name, ministryName),
        eq(team.name, teamName),
        eq(ministryVolunteerTeam.accessLevel, 'leader'),
      ),
    );
  return row?.value ?? 0;
}

/** A `type`, not an interface: `execute` rows must be index-signature records. */
type CountRow = {
  value: string;
};

interface QueryCountInput {
  query: ReturnType<typeof sql>;
}

async function queryCount({ query }: QueryCountInput): Promise<number> {
  const result = await testDb.execute<CountRow>(query);
  return Number(result.rows[0]?.value ?? 0);
}

/*
 * These queries deliberately restate what `verifyDevelopmentGraph` checks,
 * with the spec's literal numbers: the test is an independent oracle, so one
 * wrong query cannot pass both the verifier and its contract.
 */
describe('development seed recipe', () => {
  let seeded: DevelopmentRecipeResult;

  beforeAll(async () => {
    await truncateAll();
    seeded = await runSeedRecipe({
      db: testDb,
      recipe: createDevelopmentRecipe({ anchor: ANCHOR }),
    });
  }, 120_000);

  it('provisions the primary Church in America/Sao_Paulo and a second Church', async () => {
    const churches = await testDb
      .select({ id: organization.id, timezone: church.timezone })
      .from(organization)
      .innerJoin(church, eq(church.id, organization.id));

    expect(churches).toHaveLength(2);
    expect(churches).toEqual(
      expect.arrayContaining([
        { id: seeded.church.id, timezone: 'America/Sao_Paulo' },
        { id: seeded.secondChurch.id, timezone: expect.any(String) },
      ]),
    );
    expect(seeded.anchor).toBe(ANCHOR);
  });

  it('seats 305 Ministry Memberships in the primary Church', async () => {
    expect(
      await activeMembershipCounts({ churchId: seeded.church.id }),
    ).toEqual([
      { ministry: 'Estacionamento', memberships: 40 },
      { ministry: 'Intercessão', memberships: 100 },
      { ministry: 'Kids', memberships: 150 },
      { ministry: 'Projeção', memberships: 15 },
    ]);
  });

  it("declares each primary Ministry's Roles and Teams", async () => {
    const roles = await testDb
      .select({ ministry: ministry.name, role: role.name })
      .from(role)
      .innerJoin(ministry, eq(ministry.id, role.ministryId))
      .where(eq(role.churchId, seeded.church.id))
      .orderBy(ministry.name, role.name);
    expect(roles).toEqual([
      { ministry: 'Estacionamento', role: 'Orientador de Estacionamento' },
      { ministry: 'Intercessão', role: 'Intercessor' },
      { ministry: 'Kids', role: 'Auxiliar' },
      { ministry: 'Kids', role: 'Líder' },
      { ministry: 'Projeção', role: 'Operador de Projeção' },
    ]);

    const teams = await testDb
      .select({ ministry: ministry.name, team: team.name })
      .from(team)
      .innerJoin(ministry, eq(ministry.id, team.ministryId))
      .where(eq(team.churchId, seeded.church.id))
      .orderBy(ministry.name, team.name);
    expect(teams).toEqual([
      { ministry: 'Kids', team: 'Kids' },
      { ministry: 'Kids', team: 'Maternal' },
    ]);
  });

  it('gives Kids two Ministry leaders, TeamLeaders for Kids and Maternal, and every other Ministry a leader', async () => {
    const churchId = seeded.church.id;
    expect(await ministryLeaderCount({ churchId, ministryName: 'Kids' })).toBe(
      2,
    );
    for (const ministryName of ['Projeção', 'Intercessão', 'Estacionamento']) {
      expect(await ministryLeaderCount({ churchId, ministryName })).toBe(1);
    }
    for (const teamName of ['Kids', 'Maternal']) {
      expect(
        await teamLeaderCount({ churchId, ministryName: 'Kids', teamName }),
      ).toBeGreaterThan(0);
    }
  });

  it("qualifies every Ministry Membership only for its own Ministry's Roles and Teams", async () => {
    expect(
      await queryCount({
        query: sql`select count(*) as value from ${ministryVolunteer} mv
          where not exists (select 1 from ${ministryVolunteerRole} q where q.ministry_volunteer_id = mv.id)`,
      }),
    ).toBe(0);
    expect(
      await queryCount({
        query: sql`select count(*) as value from ${ministryVolunteerRole} q
          join ${ministryVolunteer} mv on mv.id = q.ministry_volunteer_id
          join ${role} r on r.id = q.role_id
          where r.ministry_id <> mv.ministry_id`,
      }),
    ).toBe(0);
    expect(
      await queryCount({
        query: sql`select count(*) as value from ${ministryVolunteerTeam} tm
          join ${ministryVolunteer} mv on mv.id = tm.ministry_volunteer_id
          join ${team} t on t.id = tm.team_id
          where t.ministry_id <> mv.ministry_id`,
      }),
    ).toBe(0);

    const [kidsLiderPool] = await testDb
      .select({ value: count() })
      .from(ministryVolunteerRole)
      .innerJoin(role, eq(role.id, ministryVolunteerRole.roleId))
      .where(and(eq(role.churchId, seeded.church.id), eq(role.name, 'Líder')));
    expect(kidsLiderPool?.value).toBeGreaterThan(2);
  });

  it('deliberately places 20 to 30 Volunteers in more than one Ministry', async () => {
    const crossMinistry = await queryCount({
      query: sql`select count(*) as value from (
          select volunteer_id from ${ministryVolunteer}
          where status = 'active' and left_at is null
          group by volunteer_id having count(*) > 1
        ) as cross_ministry`,
    });

    expect(crossMinistry).toBeGreaterThanOrEqual(20);
    expect(crossMinistry).toBeLessThanOrEqual(30);
  });

  it('backs every Volunteer and ChurchAdmin with a verified .test User and one credential account', async () => {
    const [volunteers] = await testDb
      .select({ value: countDistinct(volunteer.userId) })
      .from(volunteer);
    expect(volunteers?.value).toBeGreaterThanOrEqual(280);

    const unauthenticatable = await queryCount({
      query: sql`select count(*) as value from ${user} u
        where u.id <> ${SEED_PLATFORM_OPERATOR_ID}
          and (not u.email_verified
            or u.email not like '%.test'
            or (select count(*) from ${account} a
                where a.user_id = u.id and a.provider_id = 'credential'
                  and a.account_id = u.id and a.password is not null) <> 1)`,
    });
    expect(unauthenticatable).toBe(0);

    const hashes = await testDb
      .selectDistinct({ password: account.password })
      .from(account)
      .where(eq(account.providerId, 'credential'));
    for (const { password } of hashes) {
      expect(
        await verifyPassword({
          hash: password ?? '',
          password: SEED_PERSONA_PASSWORD,
        }),
      ).toBe(true);
    }
  });

  it('gives the second Church an authenticatable ChurchAdmin and multi-Church Users who volunteer in only one Church', async () => {
    const [secondAdmin] = await testDb
      .select({ value: count() })
      .from(member)
      .where(
        and(
          eq(member.organizationId, seeded.secondChurch.id),
          eq(member.role, 'admin'),
        ),
      );
    expect(secondAdmin?.value).toBe(1);

    const multiChurchUsers = await testDb
      .select({ userId: member.userId })
      .from(member)
      .groupBy(member.userId)
      .having(sql`count(distinct ${member.organizationId}) > 1`);
    expect(multiChurchUsers).toHaveLength(4);

    const doubleVolunteers = await testDb
      .select({ userId: volunteer.userId })
      .from(volunteer)
      .where(and(isNull(volunteer.leftAt), eq(volunteer.status, 'active')))
      .groupBy(volunteer.userId)
      .having(sql`count(*) > 1`);
    expect(doubleVolunteers).toEqual([]);

    expect(
      await activeMembershipCounts({ churchId: seeded.secondChurch.id }),
    ).toEqual([{ ministry: 'Kids', memberships: 4 }]);
  });

  it('keeps every Church-scoped row inside its own Church', async () => {
    expect(
      await queryCount({
        query: sql`select count(*) as value from ${ministryVolunteer} mv
          join ${volunteer} v on v.id = mv.volunteer_id
          join ${ministry} m on m.id = mv.ministry_id
          where mv.church_id <> v.church_id or mv.church_id <> m.church_id`,
      }),
    ).toBe(0);
    expect(
      await queryCount({
        query: sql`select count(*) as value from ${volunteer} v
          where not exists (select 1 from ${member} cm
            where cm.organization_id = v.church_id and cm.user_id = v.user_id)`,
      }),
    ).toBe(0);
    const [crossChurchRoles] = await testDb
      .select({ value: count() })
      .from(role)
      .innerJoin(ministry, eq(ministry.id, role.ministryId))
      .where(ne(role.churchId, ministry.churchId));
    expect(crossChurchRoles?.value).toBe(0);
  });

  it('names the key sign-in personas it seeded', async () => {
    expect(seeded.keyPersonas.length).toBeGreaterThanOrEqual(5);
    for (const persona of seeded.keyPersonas) {
      const [row] = await testDb
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, persona.email));
      expect(row, persona.email).toBeDefined();
    }
  });

  it('signs every key persona in through Better Auth with the shared password', async () => {
    const app = await createFastify();
    try {
      await app.ready();
      for (const persona of seeded.keyPersonas) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/sign-in/email',
          payload: { email: persona.email, password: SEED_PERSONA_PASSWORD },
        });
        expect(response.statusCode, persona.email).toBe(200);
      }

      const [firstPersona] = seeded.keyPersonas;
      const wrongPassword = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        payload: { email: firstPersona?.email, password: 'not-the-password' },
      });
      expect(wrongPassword.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('passes its own verification', async () => {
    await expect(
      verifyDevelopmentGraph({ db: testDb, seeded }),
    ).resolves.toBeUndefined();
  });

  it.each([
    {
      label: 'a Kids Ministry leader is demoted',
      problem: 'Kids',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`update ${ministryVolunteer} set ministry_access_level = 'volunteer'
          where id = (select mv.id from ${ministryVolunteer} mv join ${ministry} m on m.id = mv.ministry_id
            where m.name = 'Kids' and mv.ministry_access_level = 'leader' limit 1)`);
      },
    },
    {
      label: 'a Volunteer loses their credential account',
      problem: 'credential',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`delete from ${account}
          where user_id = (select user_id from ${volunteer} limit 1)`);
      },
    },
    {
      label: 'a Ministry Membership is missing',
      problem: 'Intercessão',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`delete from ${ministryVolunteer}
          where id = (select mv.id from ${ministryVolunteer} mv join ${ministry} m on m.id = mv.ministry_id
            where m.name = 'Intercessão' and mv.ministry_access_level = 'volunteer' limit 1)`);
      },
    },
    {
      label: 'a Ministry Membership leaks into the other Church',
      problem: 'Church',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`update ${ministryVolunteer} set church_id = ${seeded.secondChurch.id}
          where id = (select id from ${ministryVolunteer} where church_id = ${seeded.church.id} limit 1)`);
      },
    },
    {
      label: 'a Volunteer loses a Role qualification',
      problem: 'Role qualifications',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`delete from ${ministryVolunteerRole}
          where id = (select id from ${ministryVolunteerRole} limit 1)`);
      },
    },
    {
      label: 'a Team membership leaks into the other Church',
      problem: 'Church',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`update ${ministryVolunteerTeam} set church_id = ${seeded.secondChurch.id}
          where id = (select id from ${ministryVolunteerTeam} where church_id = ${seeded.church.id} limit 1)`);
      },
    },
  ])('refuses the graph when $label', async ({
    problem,
    break: breakGraph,
  }) => {
    await withRolledBack({
      run: async ({ tx }) => {
        await breakGraph({ tx });
        await expect(
          verifyDevelopmentGraph({ db: tx, seeded }),
        ).rejects.toThrow(problem);
      },
    });
  });
});
