import {
  account,
  assignment,
  availabilityCheck,
  church,
  event,
  eventTemplate,
  member,
  ministry,
  ministryParticipation,
  ministryServingProfile,
  ministryVolunteer,
  ministryVolunteerRole,
  ministryVolunteerTeam,
  organization,
  participationSlotInclusion,
  planningCycle,
  role,
  shift,
  slotRequirement,
  team,
  timeBlock,
  timeSlot,
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
/** One per (published participation, Volunteer rostered when it was published). */
const SCHEDULE_PUBLISHED = 362;
/** rafael.moura and joao.pereira never opened theirs. */
const UNREAD_PUBLISHED = 5;

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

/** `type`s, not interfaces: `execute` rows must be index-signature records. */
type StaffingRow = {
  ministry: string;
  role: string;
  starts: string;
  required: number;
  assigned: number;
};

type TrailRow = {
  email: string;
  ministry: string;
  starts: string;
  status?: string;
  reason?: string | null;
};

type CreatedAuditRow = {
  audits: number;
  assignments: number;
  matching: number;
};

type NotificationCountRow = {
  type: string;
  total: number;
  unread: number;
};

type NotificationRow = {
  email: string;
  type: string;
  title: string;
  body: string;
  shaped: boolean;
  inCycle: boolean;
  noAssignment?: boolean;
  namesNewAssignment?: boolean;
  at: string;
  read: string | null;
};

type AuditRow = {
  actor: string;
  subject: string;
  action: string;
  reason: string | null;
  at: string;
};

interface TrailPersonInput {
  email: string;
  ministryName: string;
  starts: string;
}

interface MarkInput {
  ministryName: string;
  starts: string;
}

interface SundayInput {
  day: string;
}

interface WednesdayInput extends SundayInput {
  /** The UTC day the 22:00 end falls on. */
  next: string;
}

interface ServedBlocksInput {
  ministryName: string;
  headcounts: string[];
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

  it('declares the recurring gatherings as EventTemplates of the primary Church only', async () => {
    const blocks = await testDb
      .select({
        churchId: eventTemplate.churchId,
        template: eventTemplate.name,
        weekday: eventTemplate.weekday,
        startTime: timeBlock.startTime,
        endTime: timeBlock.endTime,
      })
      .from(timeBlock)
      .innerJoin(eventTemplate, eq(eventTemplate.id, timeBlock.templateId))
      .orderBy(eventTemplate.weekday, timeBlock.order);

    const sunday = {
      churchId: seeded.church.id,
      template: 'Culto de Domingo',
      weekday: 0,
    };
    expect(blocks).toEqual([
      { ...sunday, startTime: '08:00:00', endTime: '09:30:00' },
      { ...sunday, startTime: '10:30:00', endTime: '12:30:00' },
      { ...sunday, startTime: '18:30:00', endTime: '20:30:00' },
      {
        churchId: seeded.church.id,
        template: 'Culto de Quarta',
        weekday: 3,
        startTime: '20:00:00',
        endTime: '22:00:00',
      },
    ]);
  });

  it('declares every Ministry serving rule per TimeBlock, Kids not on Sunday at 08:00', async () => {
    const names = new Map<string, string>();
    for (const row of [
      ...(await testDb.select({ id: role.id, name: role.name }).from(role)),
      ...(await testDb.select({ id: team.id, name: team.name }).from(team)),
    ]) {
      names.set(row.id, row.name);
    }

    const profiles = await testDb
      .select({
        ministry: ministry.name,
        weekday: eventTemplate.weekday,
        startTime: timeBlock.startTime,
        serves: ministryServingProfile.serves,
        shiftSplit: ministryServingProfile.shiftSplit,
        headcounts: ministryServingProfile.headcounts,
      })
      .from(ministryServingProfile)
      .innerJoin(ministry, eq(ministry.id, ministryServingProfile.ministryId))
      .innerJoin(
        timeBlock,
        eq(timeBlock.id, ministryServingProfile.sourceTemplateBlockId),
      )
      .innerJoin(eventTemplate, eq(eventTemplate.id, timeBlock.templateId))
      .where(eq(ministryServingProfile.churchId, seeded.church.id))
      .orderBy(ministry.name, eventTemplate.weekday, timeBlock.order);

    const readable = profiles.map((profile) => ({
      ministry: profile.ministry,
      block: `${profile.weekday} ${profile.startTime.slice(0, 5)}`,
      serves: profile.serves,
      shiftSplit: profile.shiftSplit,
      headcounts: profile.headcounts.map((headcount) =>
        [
          headcount.count,
          names.get(headcount.roleId),
          headcount.teamId ? names.get(headcount.teamId) : undefined,
        ]
          .filter((part) => part !== undefined)
          .join(' '),
      ),
    }));
    const oneShift = { kind: 'equal', count: 1 };
    const kids = [
      '1 Líder Kids',
      '7 Auxiliar Kids',
      '1 Líder Maternal',
      '3 Auxiliar Maternal',
    ];
    const blocks = ['0 08:00', '0 10:30', '0 18:30', '3 20:00'];
    const everyBlock = ({ ministryName, headcounts }: ServedBlocksInput) =>
      blocks.map((block) => ({
        ministry: ministryName,
        block,
        serves: true,
        shiftSplit: oneShift,
        headcounts,
      }));

    expect(readable).toEqual([
      ...everyBlock({
        ministryName: 'Estacionamento',
        headcounts: ['4 Orientador de Estacionamento'],
      }),
      ...everyBlock({
        ministryName: 'Intercessão',
        headcounts: ['8 Intercessor'],
      }),
      {
        ministry: 'Kids',
        block: '0 08:00',
        serves: false,
        shiftSplit: oneShift,
        headcounts: [],
      },
      ...everyBlock({ ministryName: 'Kids', headcounts: kids }).slice(1),
      {
        ministry: 'Projeção',
        block: '0 08:00',
        serves: true,
        shiftSplit: oneShift,
        headcounts: ['1 Operador de Projeção'],
      },
      ...everyBlock({
        ministryName: 'Projeção',
        headcounts: ['2 Operador de Projeção'],
      }).slice(1),
    ]);
  });

  it('materializes only the previous complete month as one locked PlanningCycle', async () => {
    const cycles = await testDb
      .select({
        churchId: planningCycle.churchId,
        startDate: planningCycle.startDate,
        endDate: planningCycle.endDate,
        state: planningCycle.state,
      })
      .from(planningCycle);

    expect(
      cycles.map((cycle) => ({
        ...cycle,
        startDate: cycle.startDate.toISOString().slice(0, 10),
        endDate: cycle.endDate.toISOString().slice(0, 10),
      })),
    ).toEqual([
      {
        churchId: seeded.church.id,
        startDate: '2026-02-01',
        endDate: '2026-03-01',
        state: 'locked',
      },
    ]);
  });

  it("materializes February's Sundays and Wednesdays and one manual Encontro Teens, all past", async () => {
    const events = await testDb
      .select({
        title: event.title,
        start: event.start,
        end: event.end,
        status: event.status,
        fromTemplate: sql<boolean>`${event.sourceTemplateId} is not null`,
      })
      .from(event)
      .orderBy(event.start);

    const sunday = ({ day }: SundayInput) => ({
      title: 'Culto de Domingo',
      start: `2026-02-${day}T11:00:00.000Z`,
      end: `2026-02-${day}T23:30:00.000Z`,
      status: 'past',
      fromTemplate: true,
    });
    const wednesday = ({ day, next }: WednesdayInput) => ({
      title: 'Culto de Quarta',
      start: `2026-02-${day}T23:00:00.000Z`,
      end: `2026-02-${next}T01:00:00.000Z`,
      status: 'past',
      fromTemplate: true,
    });
    expect(
      events.map((row) => ({
        ...row,
        start: row.start.toISOString(),
        end: row.end.toISOString(),
      })),
    ).toEqual([
      sunday({ day: '01' }),
      wednesday({ day: '04', next: '05' }),
      sunday({ day: '08' }),
      wednesday({ day: '11', next: '12' }),
      sunday({ day: '15' }),
      wednesday({ day: '18', next: '19' }),
      sunday({ day: '22' }),
      wednesday({ day: '25', next: '26' }),
      {
        title: 'Encontro Teens',
        start: '2026-02-28T22:00:00.000Z',
        end: '2026-03-01T00:00:00.000Z',
        status: 'past',
        fromTemplate: false,
      },
    ]);

    const [slots] = await testDb
      .select({
        total: count(),
        fromBlocks: sql<number>`count(${timeSlot.sourceTemplateBlockId})::int`,
      })
      .from(timeSlot);
    expect(slots).toEqual({ total: 17, fromBlocks: 16 });
  });

  it('publishes one MinistryParticipation per serving Ministry and Event, Kids not on Sunday at 08:00', async () => {
    const participations = await testDb
      .select({
        ministry: ministry.name,
        state: ministryParticipation.state,
        participations: countDistinct(ministryParticipation.id),
        inclusions: count(participationSlotInclusion.id),
      })
      .from(ministryParticipation)
      .innerJoin(ministry, eq(ministry.id, ministryParticipation.ministryId))
      .leftJoin(
        participationSlotInclusion,
        eq(
          participationSlotInclusion.participationId,
          ministryParticipation.id,
        ),
      )
      .groupBy(ministry.name, ministryParticipation.state)
      .orderBy(ministry.name);
    expect(participations).toEqual([
      {
        ministry: 'Estacionamento',
        state: 'published',
        participations: 8,
        inclusions: 16,
      },
      {
        ministry: 'Intercessão',
        state: 'published',
        participations: 8,
        inclusions: 16,
      },
      {
        ministry: 'Kids',
        state: 'published',
        participations: 8,
        inclusions: 12,
      },
      {
        ministry: 'Projeção',
        state: 'published',
        participations: 9,
        inclusions: 17,
      },
    ]);

    const kidsAtEight = await queryCount({
      query: sql`select count(*) as value from ${participationSlotInclusion} i
        join ${ministryParticipation} p on p.id = i.participation_id
        join ${ministry} m on m.id = p.ministry_id
        join ${timeSlot} s on s.id = i.time_slot_id
        where m.name = 'Kids'
          and to_char(s.start_time at time zone 'America/Sao_Paulo', 'HH24:MI') = '08:00'`,
    });
    expect(kidsAtEight).toBe(0);

    const [shifts] = await testDb
      .select({
        total: count(),
        wholeSlot: sql<number>`count(*) filter (where ${shift.startTime} = ${timeSlot.startTime} and ${shift.endTime} = ${timeSlot.endTime})::int`,
      })
      .from(shift)
      .innerJoin(timeSlot, eq(timeSlot.id, shift.timeSlotId));
    expect(shifts).toEqual({ total: 61, wholeSlot: 61 });
  });

  it('requires each Ministry headcount per Shift, Projeção as one noted requirement of two', async () => {
    const requirements = await testDb
      .select({
        ministry: ministry.name,
        role: role.name,
        team: team.name,
        requiredCount: slotRequirement.requiredCount,
        notes: slotRequirement.notes,
        shifts: count(),
      })
      .from(slotRequirement)
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, slotRequirement.participationId),
      )
      .innerJoin(ministry, eq(ministry.id, ministryParticipation.ministryId))
      .innerJoin(role, eq(role.id, slotRequirement.roleId))
      .leftJoin(team, eq(team.id, slotRequirement.teamId))
      .groupBy(
        ministry.name,
        role.name,
        team.name,
        slotRequirement.requiredCount,
        slotRequirement.notes,
      )
      .orderBy(
        ministry.name,
        team.name,
        role.name,
        slotRequirement.requiredCount,
      );

    expect(requirements).toEqual([
      {
        ministry: 'Estacionamento',
        role: 'Orientador de Estacionamento',
        team: null,
        requiredCount: 4,
        notes: null,
        shifts: 16,
      },
      {
        ministry: 'Intercessão',
        role: 'Intercessor',
        team: null,
        requiredCount: 8,
        notes: null,
        shifts: 16,
      },
      {
        ministry: 'Kids',
        role: 'Auxiliar',
        team: 'Kids',
        requiredCount: 7,
        notes: null,
        shifts: 12,
      },
      {
        ministry: 'Kids',
        role: 'Líder',
        team: 'Kids',
        requiredCount: 1,
        notes: null,
        shifts: 12,
      },
      {
        ministry: 'Kids',
        role: 'Auxiliar',
        team: 'Maternal',
        requiredCount: 3,
        notes: null,
        shifts: 12,
      },
      {
        ministry: 'Kids',
        role: 'Líder',
        team: 'Maternal',
        requiredCount: 1,
        notes: null,
        shifts: 12,
      },
      {
        ministry: 'Projeção',
        role: 'Operador de Projeção',
        team: null,
        requiredCount: 1,
        notes: null,
        shifts: 5,
      },
      {
        ministry: 'Projeção',
        role: 'Operador de Projeção',
        team: null,
        requiredCount: 2,
        notes: '1 Templo, 1 Kids',
        shifts: 12,
      },
    ]);
  });

  it('staffs every published requirement in full except the one declared shortfall', async () => {
    const [totals] = await testDb
      .select({
        required: sql<number>`sum(${slotRequirement.requiredCount})::int`,
      })
      .from(slotRequirement);
    expect(totals?.required).toBe(365);

    const statuses = await testDb
      .select({ status: assignment.status, value: count() })
      .from(assignment)
      .groupBy(assignment.status)
      .orderBy(assignment.status);
    expect(statuses).toEqual([
      { status: 'confirmed', value: 364 },
      { status: 'declined', value: 1 },
    ]);

    // Assignments name a Role, not a Team (#319), so staffing is counted per
    // Shift and Role across that Role's requirements.
    const result = await testDb.execute<StaffingRow>(sql`
      select m.name as ministry, r.name as role,
        to_char(sh.start_time at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as starts,
        sum(sr.required_count)::int as required,
        (select count(*) from ${assignment} a
          where a.shift_id = sr.shift_id and a.role_id = sr.role_id
            and a.status in ('draft', 'pending', 'confirmed'))::int as assigned
      from ${slotRequirement} sr
      join ${shift} sh on sh.id = sr.shift_id
      join ${ministryParticipation} p on p.id = sr.participation_id
      join ${ministry} m on m.id = p.ministry_id
      join ${role} r on r.id = sr.role_id
      group by m.name, r.name, sh.start_time, sr.shift_id, sr.role_id`);
    expect(result.rows.filter((row) => row.assigned !== row.required)).toEqual([
      {
        ministry: 'Estacionamento',
        role: 'Orientador de Estacionamento',
        starts: '2026-02-25 20:00',
        required: 4,
        assigned: 3,
      },
    ]);
  });

  it('never assigns an unqualified, double-booked or unavailable Volunteer', async () => {
    expect(
      await queryCount({
        query: sql`select count(*) as value from ${assignment} a
          join ${ministryParticipation} p on p.id = a.participation_id
          where a.status in ('draft', 'pending', 'confirmed')
            and not exists (select 1 from ${ministryVolunteer} mv
              join ${ministryVolunteerRole} q on q.ministry_volunteer_id = mv.id
              where mv.volunteer_id = a.volunteer_id and mv.ministry_id = p.ministry_id
                and mv.status = 'active' and q.role_id = a.role_id)`,
      }),
    ).toBe(0);
    expect(
      await queryCount({
        query: sql`select count(*) as value from ${assignment} a
          join ${shift} s on s.id = a.shift_id
          join ${assignment} b on b.volunteer_id = a.volunteer_id and b.id < a.id
          join ${shift} t on t.id = b.shift_id
          where a.status in ('draft', 'pending', 'confirmed')
            and b.status in ('draft', 'pending', 'confirmed')
            and s.start_time < t.end_time and t.start_time < s.end_time`,
      }),
    ).toBe(0);
    expect(
      await queryCount({
        query: sql`select count(*) as value from ${assignment} a
          join ${ministryVolunteer} mv on mv.volunteer_id = a.volunteer_id
          join ${availabilityCheck} c on c.ministry_volunteer_id = mv.id
          join availability u on u.availability_check_id = c.id
          where a.status in ('draft', 'pending', 'confirmed')
            and u.shift_id = a.shift_id`,
      }),
    ).toBe(0);
  });

  it('keeps a trail of unavailability, a decline, a resolved overlap, replacements and cross-Ministry service', async () => {
    const [checks] = await testDb
      .select({
        total: count(),
        confirmed: sql<number>`count(*) filter (where ${availabilityCheck.state} = 'confirmed')::int`,
      })
      .from(availabilityCheck);
    expect(checks).toEqual({ total: 305, confirmed: 305 });

    const marks = await testDb.execute<TrailRow>(sql`
      select u.email, m.name as ministry,
        to_char(s.start_time at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as starts
      from availability a
      join ${shift} s on s.id = a.shift_id
      join ${ministryParticipation} p on p.id = s.participation_id
      join ${ministry} m on m.id = p.ministry_id
      join ${availabilityCheck} c on c.id = a.availability_check_id
      join ${ministryVolunteer} mv on mv.id = c.ministry_volunteer_id
      join ${volunteer} v on v.id = mv.volunteer_id
      join ${user} u on u.id = v.user_id
      where u.email in ('rafael.moura@igreja-semente.test', 'bruno.dias@igreja-semente.test')
        and s.start_time < '2026-02-09T00:00:00Z'
      order by starts, email, ministry`);
    // Bruno serves Projeção and Maternal: at every gathering both serve he is
    // unavailable on one side, the side he does not serve on, and otherwise
    // his second Ministry on odd weeks and his first on even ones.
    const bruno = ({ ministryName, starts }: MarkInput) => ({
      email: 'bruno.dias@igreja-semente.test',
      ministry: ministryName,
      starts,
    });
    expect(marks.rows).toEqual([
      bruno({ ministryName: 'Kids', starts: '2026-02-01 10:30' }),
      bruno({ ministryName: 'Projeção', starts: '2026-02-01 18:30' }),
      bruno({ ministryName: 'Kids', starts: '2026-02-04 20:00' }),
      bruno({ ministryName: 'Projeção', starts: '2026-02-08 10:30' }),
      {
        email: 'rafael.moura@igreja-semente.test',
        ministry: 'Kids',
        starts: '2026-02-08 10:30',
      },
      bruno({ ministryName: 'Projeção', starts: '2026-02-08 18:30' }),
      {
        email: 'rafael.moura@igreja-semente.test',
        ministry: 'Kids',
        starts: '2026-02-08 18:30',
      },
    ]);

    // Rafael's two whole-day marks plus one side of every overlapping pair of
    // the 25 cross-Ministry Volunteers' Shifts: with Kids off Sunday 08:00
    // and Intercessão and Estacionamento off Saturday, 12 pairs for each
    // pairing with Kids and 16 for every other, 324 in all.
    expect(
      await queryCount({
        query: sql`select count(*) as value from availability`,
      }),
    ).toBe(326);
    // confirmAvailabilityCheck refuses (flag off) while two unmarked Shifts
    // of different Ministries a Volunteer answers for intersect.
    expect(
      await queryCount({
        query: sql`with unmarked as (
            select mv.volunteer_id, mv.ministry_id, s.start_time, s.end_time
            from ${availabilityCheck} c
            join ${ministryVolunteer} mv on mv.id = c.ministry_volunteer_id
            join ${ministryParticipation} p on p.ministry_id = mv.ministry_id
            join ${event} e on e.id = p.event_id and e.planning_cycle_id = c.planning_cycle_id
            join ${shift} s on s.participation_id = p.id
            where not exists (select 1 from availability u
              where u.availability_check_id = c.id and u.shift_id = s.id))
          select count(*) as value from unmarked a join unmarked b
            on a.volunteer_id = b.volunteer_id and a.ministry_id < b.ministry_id
            and a.start_time < b.end_time and b.start_time < a.end_time`,
      }),
    ).toBe(0);

    const trail = await testDb.execute<TrailRow>(sql`
      select u.email, m.name as ministry,
        to_char(s.start_time at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as starts,
        a.status, a.reason
      from ${assignment} a
      join ${shift} s on s.id = a.shift_id
      join ${ministryParticipation} p on p.id = a.participation_id
      join ${ministry} m on m.id = p.ministry_id
      join ${volunteer} v on v.id = a.volunteer_id
      join ${user} u on u.id = v.user_id
      where (split_part(u.email, '@', 1),
          to_char(s.start_time at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI'))
        in (values ('bruno.dias', '2026-02-01 10:30'), ('bruno.dias', '2026-02-01 18:30'),
          ('rafael.moura', '2026-02-08 10:30'), ('rafael.moura', '2026-02-08 18:30'),
          ('joao.pereira', '2026-02-11 20:00'), ('daniel.moreira', '2026-02-11 20:00'),
          ('isabela.medeiros', '2026-02-18 20:00'), ('vanessa.campos', '2026-02-18 20:00'))
      order by starts, ministry, email`);
    const row = ({ email, ministryName, starts }: TrailPersonInput) => ({
      email: `${email}@igreja-semente.test`,
      ministry: ministryName,
      starts,
    });
    expect(trail.rows).toEqual([
      {
        ...row({
          email: 'bruno.dias',
          ministryName: 'Projeção',
          starts: '2026-02-01 10:30',
        }),
        status: 'confirmed',
        reason: null,
      },
      {
        ...row({
          email: 'bruno.dias',
          ministryName: 'Kids',
          starts: '2026-02-01 18:30',
        }),
        status: 'confirmed',
        reason: null,
      },
      {
        ...row({
          email: 'joao.pereira',
          ministryName: 'Intercessão',
          starts: '2026-02-11 20:00',
        }),
        status: 'confirmed',
        reason: null,
      },
      // The leader reassigned João's Projeção post to Daniel: the product
      // deletes the old row and keeps the reason on the new one.
      {
        ...row({
          email: 'daniel.moreira',
          ministryName: 'Projeção',
          starts: '2026-02-11 20:00',
        }),
        status: 'confirmed',
        reason: 'Já escalado na Intercessão neste culto',
      },
      {
        ...row({
          email: 'isabela.medeiros',
          ministryName: 'Intercessão',
          starts: '2026-02-18 20:00',
        }),
        status: 'declined',
        reason: 'Viagem a trabalho',
      },
      {
        ...row({
          email: 'vanessa.campos',
          ministryName: 'Intercessão',
          starts: '2026-02-18 20:00',
        }),
        status: 'confirmed',
        reason: null,
      },
    ]);

    // Every Assignment carries the `created` audit createAssignment writes,
    // by the leader who assigned it, when it was assigned.
    const [created] = await testDb
      .execute<CreatedAuditRow>(sql`
      select count(*)::int as audits,
        (select count(*)::int from ${assignment}) as assignments,
        count(*) filter (where au.actor_id = a.assigned_by
          and au.timestamp = a.assigned_at)::int as matching
      from assignment_audit au
      join ${assignment} a on a.id = au.assignment_id
      where au.action = 'created'`)
      .then((result) => result.rows);
    expect(created).toEqual({ audits: 365, assignments: 365, matching: 365 });

    const audits = await testDb.execute<AuditRow>(sql`
      select actor.email as actor, subject.email as subject, au.action, au.reason,
        to_char(au.timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as at
      from assignment_audit au
      join ${user} actor on actor.id = au.actor_id
      join ${assignment} a on a.id = au.assignment_id
      join ${volunteer} v on v.id = a.volunteer_id
      join ${user} subject on subject.id = v.user_id
      where au.timestamp <> '2026-01-27T13:00:00Z'
      order by au.timestamp, au.action`);
    expect(audits.rows).toEqual([
      {
        actor: 'ana.almeida@igreja-semente.test',
        subject: 'daniel.moreira@igreja-semente.test',
        action: 'created',
        reason: 'Já escalado na Intercessão neste culto',
        at: '2026-02-09T13:00Z',
      },
      {
        actor: 'ana.almeida@igreja-semente.test',
        subject: 'daniel.moreira@igreja-semente.test',
        action: 'updated',
        reason: 'Já escalado na Intercessão neste culto',
        at: '2026-02-09T13:00Z',
      },
      {
        actor: 'henrique.freitas@igreja-semente.test',
        subject: 'vanessa.campos@igreja-semente.test',
        action: 'created',
        reason: null,
        at: '2026-02-16T13:00Z',
      },
    ]);

    const crossMinistryServers = await queryCount({
      query: sql`select count(*) as value from (
          select a.volunteer_id from ${assignment} a
          join ${ministryParticipation} p on p.id = a.participation_id
          where a.status = 'confirmed'
          group by a.volunteer_id having count(distinct p.ministry_id) > 1
        ) as cross_ministry`,
    });
    expect(crossMinistryServers).toBeGreaterThanOrEqual(2);
  });

  it('leaves the notifications publishing and the reassignment wrote', async () => {
    const byType = await testDb.execute<NotificationCountRow>(sql`
      select type, count(*)::int as total,
        count(*) filter (where read_at is null)::int as unread
      from volunteer_notification group by type order by type`);
    expect(byType.rows).toEqual([
      {
        type: 'schedule_published',
        total: SCHEDULE_PUBLISHED,
        unread: UNREAD_PUBLISHED,
      },
      { type: 'assignment_added', total: 1, unread: 0 },
      { type: 'assignment_removed', total: 1, unread: 1 },
    ]);

    // One per Volunteer and published participation they were rostered on
    // when it was published; replacements came after and got none.
    expect(
      await queryCount({
        query: sql`select count(*) as value from (
            select distinct a.participation_id, a.volunteer_id from ${assignment} a
            where a.assigned_at = '2026-01-27T13:00:00Z'
          ) as rostered
          where not exists (select 1 from volunteer_notification n
            join ${ministryParticipation} p on p.event_id = n.event_id and p.ministry_id = n.ministry_id
            where p.id = rostered.participation_id and n.volunteer_id = rostered.volunteer_id
              and n.type = 'schedule_published')`,
      }),
    ).toBe(0);

    const published = await testDb.execute<NotificationRow>(sql`
      select u.email, n.type, n.title, n.body, n.payload = jsonb_build_object(
          'eventId', n.event_id::text, 'ministryId', n.ministry_id::text, 'section', 'assignments') as shaped,
        n.planning_cycle_id is not null as "inCycle", n.assignment_id is null as "noAssignment",
        to_char(n.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as at,
        to_char(n.read_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as read
      from volunteer_notification n
      join ${volunteer} v on v.id = n.volunteer_id
      join ${user} u on u.id = v.user_id
      join ${event} e on e.id = n.event_id
      join ${ministry} m on m.id = n.ministry_id
      where n.type = 'schedule_published' and m.name = 'Intercessão'
        and e.start = '2026-02-18T23:00:00Z'
        and u.email in ('isabela.medeiros@igreja-semente.test', 'vanessa.campos@igreja-semente.test')`);
    expect(published.rows).toEqual([
      {
        email: 'isabela.medeiros@igreja-semente.test',
        type: 'schedule_published',
        title: 'Schedule published',
        body: 'Culto de Quarta is now published for your ministry.',
        shaped: true,
        inCycle: true,
        noAssignment: true,
        at: '2026-01-28T21:00Z',
        read: '2026-01-29T11:00Z',
      },
    ]);

    const reassigned = await testDb.execute<NotificationRow>(sql`
      select u.email, n.type, n.title, n.body, n.payload = jsonb_build_object(
          'assignmentId', n.assignment_id::text, 'eventId', n.event_id::text,
          'ministryId', n.ministry_id::text) as shaped,
        n.planning_cycle_id is not null as "inCycle",
        a.volunteer_id = (select id from ${volunteer} where user_id =
          (select id from ${user} where email = 'daniel.moreira@igreja-semente.test')) as "namesNewAssignment",
        to_char(n.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as at,
        to_char(n.read_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as read
      from volunteer_notification n
      join ${volunteer} v on v.id = n.volunteer_id
      join ${user} u on u.id = v.user_id
      join ${assignment} a on a.id = n.assignment_id
      where n.type <> 'schedule_published'
      order by n.type`);
    expect(reassigned.rows).toEqual([
      {
        email: 'daniel.moreira@igreja-semente.test',
        type: 'assignment_added',
        title: 'New assignment',
        body: 'You were assigned to Culto de Quarta.',
        shaped: true,
        inCycle: true,
        namesNewAssignment: true,
        at: '2026-02-09T13:00Z',
        read: '2026-02-10T11:00Z',
      },
      {
        email: 'joao.pereira@igreja-semente.test',
        type: 'assignment_removed',
        title: 'Assignment changed',
        body: 'Culto de Quarta has been reassigned.',
        shaped: true,
        inCycle: true,
        namesNewAssignment: true,
        at: '2026-02-09T13:00Z',
        read: null,
      },
    ]);
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
            where m.name = 'Kids' and mv.ministry_access_level = 'leader' order by mv.id limit 1)`);
      },
    },
    {
      label: 'a Volunteer loses their credential account',
      problem: 'credential',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`delete from ${account}
          where user_id = (select user_id from ${volunteer} order by id limit 1)`);
      },
    },
    {
      label: 'a Ministry Membership is missing',
      problem: 'Intercessão',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`delete from ${ministryVolunteer}
          where id = (select mv.id from ${ministryVolunteer} mv join ${ministry} m on m.id = mv.ministry_id
            where m.name = 'Intercessão' and mv.ministry_access_level = 'volunteer' order by mv.id limit 1)`);
      },
    },
    {
      label: 'a Ministry Membership leaks into the other Church',
      problem: 'Church',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`update ${ministryVolunteer} set church_id = ${seeded.secondChurch.id}
          where id = (select id from ${ministryVolunteer} where church_id = ${seeded.church.id} order by id limit 1)`);
      },
    },
    {
      label: 'a Volunteer loses a Role qualification',
      problem: 'Role qualifications',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`delete from ${ministryVolunteerRole}
          where id = (select id from ${ministryVolunteerRole} order by id limit 1)`);
      },
    },
    {
      label: 'a Team membership leaks into the other Church',
      problem: 'Church',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`update ${ministryVolunteerTeam} set church_id = ${seeded.secondChurch.id}
          where id = (select id from ${ministryVolunteerTeam} where church_id = ${seeded.church.id} order by id limit 1)`);
      },
    },
    {
      label: 'an EventTemplate loses a TimeBlock',
      problem: 'EventTemplate',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(
          sql`delete from ${timeBlock} where start_time = '18:30'`,
        );
      },
    },
    {
      label: 'Kids serves Sunday at 08:00',
      problem: 'MinistryServingProfile',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(
          sql`update ${ministryServingProfile} set serves = true where serves = false`,
        );
      },
    },
    {
      label: 'the historical PlanningCycle is unlocked',
      problem: 'PlanningCycle',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`update ${planningCycle} set state = 'draft'`);
      },
    },
    {
      label: "a PlanningCycle covers the anchor's month",
      problem: 'PlanningCycle',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`insert into ${planningCycle} (church_id, name, start_date, end_date)
          values (${seeded.church.id}, 'Março 2026', '2026-03-01', '2026-04-01')`);
      },
    },
    {
      label: 'an Event is not past',
      problem: 'Event',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`update ${event} set status = 'scheduled'
          where id = (select id from ${event} order by id limit 1)`);
      },
    },
    {
      label: 'a MinistryParticipation is left unpublished',
      problem: 'MinistryParticipation',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`update ${ministryParticipation} set state = 'rostering'
          where id = (select id from ${ministryParticipation} order by id limit 1)`);
      },
    },
    {
      label: 'Projeção loses its placement notes',
      problem: 'SlotRequirement',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`update ${slotRequirement} set notes = null
          where id = (select id from ${slotRequirement} where notes is not null order by id limit 1)`);
      },
    },
    {
      label: 'a confirmed Assignment is removed',
      problem: 'staffed',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`delete from ${assignment}
          where id = (select a.id from ${assignment} a where a.status = 'confirmed'
            and a.assigned_at = '2026-01-27T13:00:00Z' order by a.id limit 1)`);
      },
    },
    {
      label: 'a Volunteer is double-booked',
      problem: 'overlap',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`update ${assignment} target set volunteer_id = other.volunteer_id
          from ${assignment} other, ${shift} target_shift, ${shift} other_shift
          where target.id = (select a.id from ${assignment} a join ${shift} s on s.id = a.shift_id
              join ${shift} o on o.time_slot_id = s.time_slot_id and o.id <> s.id
              join ${assignment} b on b.shift_id = o.id and b.status = 'confirmed'
              where a.status = 'confirmed' order by a.id limit 1)
            and target_shift.id = target.shift_id
            and other_shift.time_slot_id = target_shift.time_slot_id
            and other_shift.id <> target_shift.id
            and other.shift_id = other_shift.id and other.status = 'confirmed'
            and other.id = (select b.id from ${assignment} b where b.shift_id = other_shift.id
              and b.status = 'confirmed' order by b.id limit 1)`);
      },
    },
    {
      label: 'a Volunteer serves a Shift they marked unavailable',
      problem: 'unavailable',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`insert into availability (church_id, availability_check_id, shift_id)
          select c.church_id, c.id, a.shift_id
          from ${assignment} a
          join ${ministryVolunteer} mv on mv.volunteer_id = a.volunteer_id
          join ${availabilityCheck} c on c.ministry_volunteer_id = mv.id
          where a.status = 'confirmed'
          order by a.id, c.id
          limit 1`);
      },
    },
    {
      label: 'an Assignment loses its created audit',
      problem: 'audit',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`delete from assignment_audit
          where id = (select id from assignment_audit where action = 'created' order by id limit 1)`);
      },
    },
    {
      label: 'a rostered Volunteer misses the publish notification',
      problem: 'notification',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`delete from volunteer_notification
          where id = (select id from volunteer_notification where type = 'schedule_published' order by id limit 1)`);
      },
    },
    {
      label:
        'a cross-Ministry Volunteer confirmed availability with an unmarked overlap',
      problem: 'confirm',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(sql`delete from availability
          where id = (select u.id from availability u
            join ${availabilityCheck} c on c.id = u.availability_check_id
            join ${ministryVolunteer} mv on mv.id = c.ministry_volunteer_id
            join ${volunteer} v on v.id = mv.volunteer_id
            join ${user} usr on usr.id = v.user_id
            where usr.email = 'bruno.dias@igreja-semente.test' order by u.id limit 1)`);
      },
    },
    {
      label: 'the decline is lost from the trail',
      problem: 'trail',
      break: async ({ tx }: SeedTransactionInput) => {
        await tx.execute(
          sql`update ${assignment} set status = 'cancelled' where status = 'declined'`,
        );
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
