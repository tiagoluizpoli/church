import {
  account,
  invitation,
  member,
  ministryVolunteer,
  ministryVolunteerTeam,
  organization,
  user,
} from '@church/db';
import {
  type CalendarDay,
  parseCalendarDay,
  parseTimeOfDay,
} from '@church/time';
import { verifyPassword } from 'better-auth/crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_PLATFORM_OPERATOR_ID } from '../../seeds/blueprints/credentials';
import { deriveSeedId } from '../../seeds/builders/derived-id';
import {
  E2E_JOURNEY_RECIPE_NAMES,
  type JourneySeedIdOf,
  journeyIdentity,
  journeySeedId,
  journeyTag,
  resolveJourneyRoots,
} from '../../seeds/e2e/journey-keys';
import {
  anchoredInstant,
  buildRosteringChurch,
  type RosteringChurch,
  type RosteringChurchPlan,
  rosteringChurchRootKinds,
} from '../../seeds/e2e/recipes/rostering-church';
import { ensurePlatformOperator } from '../../src/scripts/ensure-platform-operator';
import { testDb, truncateAll } from '../integration/repositories/setup';
import { countAllRows, snapshotAllRows } from './journey-graph-snapshot';
import { qualifiedRoleIds } from './qualified-role-ids';

const PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: { usher: 'Usher', greeter: 'Greeter' },
      teams: { alpha: 'Equipe Alpha' },
    },
    care: {
      name: 'Cuidado',
      roles: { careHost: 'Care Host' },
      teams: { care: 'Equipe Cuidado' },
    },
  },
  personas: {
    leader: {
      name: 'Lia Prado',
      churchAccessLevel: 'admin',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'leader',
          roles: ['usher', 'greeter'],
          teams: [],
        },
      ],
    },
    teamLeader: {
      name: 'Tomas Reis',
      churchAccessLevel: 'member',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'volunteer',
          roles: ['usher'],
          teams: [{ team: 'alpha', accessLevel: 'leader' }],
        },
      ],
    },
    volunteer: {
      name: 'Vera Lima',
      churchAccessLevel: 'member',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'volunteer',
          roles: ['greeter'],
          teams: [],
        },
        {
          ministry: 'care',
          accessLevel: 'volunteer',
          roles: ['careHost'],
          teams: [{ team: 'care', accessLevel: 'member' }],
        },
      ],
    },
  },
  pool: {
    grace: {
      name: 'Grace Hopper',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'volunteer',
          roles: ['usher', 'greeter'],
          teams: [{ team: 'alpha', accessLevel: 'member' }],
        },
      ],
    },
    ursula: {
      name: 'Ursula Unqualified',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'volunteer',
          roles: [],
          teams: [{ team: 'alpha', accessLevel: 'member' }],
        },
      ],
    },
  },
} as const satisfies RosteringChurchPlan;

interface JourneyKeyInput {
  journeyKey: string;
}

function idOfKey({ journeyKey }: JourneyKeyInput): JourneySeedIdOf {
  return ({ kind }) =>
    deriveSeedId({ kind: `rostering-test:${kind}`, parentIds: [journeyKey] });
}

interface BuildInput<TPlan extends RosteringChurchPlan>
  extends JourneyKeyInput {
  plan: TPlan;
}

async function build<const TPlan extends RosteringChurchPlan>({
  journeyKey,
  plan,
}: BuildInput<TPlan>): Promise<RosteringChurch<TPlan>> {
  return await buildRosteringChurch({
    db: testDb,
    idOf: idOfKey({ journeyKey }),
    tag: `t${journeyKey}`,
    plan,
  });
}

/** What `runE2eJourneyRecipe` purges: the roots the plan's kinds name. */
async function purgeRoots({ journeyKey }: JourneyKeyInput): Promise<void> {
  const idOf = idOfKey({ journeyKey });
  const kinds = rosteringChurchRootKinds({ plan: PLAN });
  await testDb.delete(organization).where(
    inArray(
      organization.id,
      kinds.churchKinds.map((kind) => idOf({ kind })),
    ),
  );
  await testDb.delete(user).where(
    inArray(
      user.id,
      kinds.userKinds.map((kind) => idOf({ kind })),
    ),
  );
}

describe('rostering Church base for E2E journey recipes', () => {
  beforeEach(async () => {
    await truncateAll();
    await ensurePlatformOperator({
      db: testDb,
      id: SEED_PLATFORM_OPERATOR_ID,
    });
  });

  it('makes the admin persona the ChurchAdmin through the provisioning invitation', async () => {
    const graph = await build({ journeyKey: 'alpha', plan: PLAN });

    const invitations = await testDb
      .select({ email: invitation.email, status: invitation.status })
      .from(invitation)
      .where(eq(invitation.organizationId, graph.church.id));
    expect(invitations).toEqual([
      { email: graph.personas.leader.email, status: 'accepted' },
    ]);

    const roles = await testDb
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .where(eq(member.organizationId, graph.church.id));
    expect(roles).toEqual(
      expect.arrayContaining([
        { userId: graph.personas.leader.userId, role: 'admin' },
        { userId: graph.personas.teamLeader.userId, role: 'member' },
        { userId: graph.personas.volunteer.userId, role: 'member' },
        { userId: graph.pool.grace.userId, role: 'member' },
      ]),
    );
    expect(roles).toHaveLength(5);
    expect(graph.church.slug).toBe('e2e-talpha');
  });

  it('gives every persona a password that signs in', async () => {
    const graph = await build({ journeyKey: 'alpha', plan: PLAN });

    for (const persona of Object.values(graph.personas)) {
      const [credential] = await testDb
        .select({ password: account.password })
        .from(account)
        .where(
          and(
            eq(account.userId, persona.userId),
            eq(account.providerId, 'credential'),
          ),
        );
      expect(
        await verifyPassword({
          hash: credential?.password ?? '',
          password: persona.password,
        }),
      ).toBe(true);
    }
    expect(graph.personas.teamLeader.email).toBe('teamleader@talpha.e2e.test');
  });

  it('qualifies each Volunteer for exactly its planned Roles and Teams', async () => {
    const graph = await build({ journeyKey: 'alpha', plan: PLAN });
    const { worship, care } = graph.ministries;

    expect(
      await qualifiedRoleIds({
        volunteerId: graph.personas.leader.volunteerId,
      }),
    ).toEqual([worship.roles.usher.id, worship.roles.greeter.id].sort());
    expect(
      await qualifiedRoleIds({
        volunteerId: graph.personas.volunteer.volunteerId,
      }),
    ).toEqual([worship.roles.greeter.id, care.roles.careHost.id].sort());
    expect(
      await qualifiedRoleIds({ volunteerId: graph.pool.ursula.volunteerId }),
    ).toEqual([]);

    const [leaderMembership] = await testDb
      .select({ accessLevel: ministryVolunteer.ministryAccessLevel })
      .from(ministryVolunteer)
      .where(
        eq(ministryVolunteer.volunteerId, graph.personas.leader.volunteerId),
      );
    expect(leaderMembership?.accessLevel).toBe('leader');

    const alphaTeam = await testDb
      .select({
        volunteerId: ministryVolunteer.volunteerId,
        accessLevel: ministryVolunteerTeam.accessLevel,
      })
      .from(ministryVolunteerTeam)
      .innerJoin(
        ministryVolunteer,
        eq(ministryVolunteer.id, ministryVolunteerTeam.ministryVolunteerId),
      )
      .where(eq(ministryVolunteerTeam.teamId, worship.teams.alpha.id));
    expect(alphaTeam).toEqual(
      expect.arrayContaining([
        {
          volunteerId: graph.personas.teamLeader.volunteerId,
          accessLevel: 'leader',
        },
        { volunteerId: graph.pool.grace.volunteerId, accessLevel: 'member' },
        { volunteerId: graph.pool.ursula.volunteerId, accessLevel: 'member' },
      ]),
    );
    expect(alphaTeam).toHaveLength(3);
  });

  it('declares root kinds that purge the whole graph', async () => {
    const baseline = await countAllRows();
    await build({ journeyKey: 'alpha', plan: PLAN });
    expect(await countAllRows()).not.toEqual(baseline);

    await purgeRoots({ journeyKey: 'alpha' });

    expect(await countAllRows()).toEqual(baseline);
  });

  it('rebuilds an identical graph after a purge, and keys never collide', async () => {
    await build({ journeyKey: 'beta', plan: PLAN });
    const first = await build({ journeyKey: 'alpha', plan: PLAN });
    const snapshot = await snapshotAllRows();

    await purgeRoots({ journeyKey: 'alpha' });
    const second = await build({ journeyKey: 'alpha', plan: PLAN });

    expect(second).toEqual(first);
    expect(await snapshotAllRows()).toEqual(snapshot);
  });

  it('refuses a plan without exactly one ChurchAdmin persona', async () => {
    await expect(
      build({
        journeyKey: 'alpha',
        plan: {
          ...PLAN,
          personas: {
            ...PLAN.personas,
            volunteer: {
              ...PLAN.personas.volunteer,
              churchAccessLevel: 'admin',
            },
          },
        },
      }),
    ).rejects.toThrow('exactly one ChurchAdmin persona');
  });

  it('refuses a membership naming a Role its Ministry lacks', async () => {
    await expect(
      build({
        journeyKey: 'alpha',
        plan: {
          ...PLAN,
          pool: {
            stray: {
              name: 'Stray',
              memberships: [
                {
                  ministry: 'care',
                  accessLevel: 'volunteer',
                  roles: ['usher'],
                  teams: [],
                },
              ],
            },
          },
        },
      }),
    ).rejects.toThrow('Unknown key "usher"');
  });
  it('refuses two Users whose emails would collide', async () => {
    await expect(
      build({
        journeyKey: 'alpha',
        plan: {
          ...PLAN,
          personas: {
            ...PLAN.personas,
            Volunteer: { ...PLAN.personas.volunteer, name: 'Vera Twin' },
          },
        },
      }),
    ).rejects.toThrow('share the email "volunteer@');
    await expect(
      build({
        journeyKey: 'beta',
        plan: {
          ...PLAN,
          personas: {
            ...PLAN.personas,
            'pool-grace': { ...PLAN.personas.volunteer, name: 'Grace Twin' },
          },
        },
      }),
    ).rejects.toThrow('share the email "pool-grace@');
  });
});

describe('journeyIdentity', () => {
  const recipeName = E2E_JOURNEY_RECIPE_NAMES.volunteerAssignments;

  it('binds the recipe name and journey key into ids, tag and roots', () => {
    const identity = journeyIdentity({
      recipeName,
      journeyKey: 'alpha',
    });
    const rootKinds = { churchKinds: ['church'], userKinds: ['user'] };

    expect(identity.idOf({ kind: 'church' })).toBe(
      journeySeedId({ recipeName, journeyKey: 'alpha', kind: 'church' }),
    );
    expect(identity.tag).toBe(journeyTag({ recipeName, journeyKey: 'alpha' }));
    expect(identity.rootsOf({ rootKinds })).toEqual(
      resolveJourneyRoots({ recipeName, journeyKey: 'alpha', rootKinds }),
    );
  });

  it('refuses an empty journey key', () => {
    expect(() => journeyIdentity({ recipeName, journeyKey: '' })).toThrow(
      'non-empty journey key',
    );
  });
});

describe('anchoredInstant', () => {
  const anchor: CalendarDay = parseCalendarDay({ value: '2026-03-15' });

  it('reads the wall clock in the journey Church Timezone', () => {
    // America/Sao_Paulo is UTC-3 all year (no DST).
    expect(
      anchoredInstant({
        anchor,
        dayOffset: 7,
        time: parseTimeOfDay({ value: '09:00' }),
      }),
    ).toBe('2026-03-22T12:00:00.000Z');
    expect(
      anchoredInstant({
        anchor,
        dayOffset: -1,
        time: parseTimeOfDay({ value: '23:30' }),
      }),
    ).toBe('2026-03-15T02:30:00.000Z');
  });
});
