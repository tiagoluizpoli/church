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
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { SEED_PLATFORM_OPERATOR_ID } from '../blueprints/credentials';
import { DEVELOPMENT_BLUEPRINT } from '../blueprints/development';
import type {
  ChurchDirectoryBlueprint,
  MinistryBlueprint,
} from '../blueprints/directory/types';
import type { SeededChurchSummary, SeedWriter } from '../recipe';
import type { DevelopmentRecipeResult } from '../recipes/development';

export interface VerifyDevelopmentGraphInput {
  db: SeedWriter;
  seeded: DevelopmentRecipeResult;
}

interface ChurchCheckInput {
  db: SeedWriter;
  seededChurch: SeededChurchSummary;
  blueprint: ChurchDirectoryBlueprint;
}

interface CountedName {
  name: string;
  value: number;
}

interface CountedNamesInput {
  rows: readonly CountedName[];
}

function byName({ rows }: CountedNamesInput): Map<string, number> {
  return new Map(rows.map((row) => [row.name, row.value]));
}

interface MinistryExpectation {
  memberships: number;
  leaders: number;
  /** Role qualification rows: each seat's Roles, once per person in it. */
  qualifications: number;
  teamLeaders: Map<string, number>;
}

interface ExpectMinistryInput {
  blueprint: ChurchDirectoryBlueprint;
  ministryBlueprint: MinistryBlueprint;
}

/** What the blueprint says one Ministry must hold once loaded. */
function expectMinistry({
  blueprint,
  ministryBlueprint,
}: ExpectMinistryInput): MinistryExpectation {
  const expectation: MinistryExpectation = {
    memberships: 0,
    leaders: 0,
    qualifications: 0,
    teamLeaders: new Map(ministryBlueprint.teams.map((name) => [name, 0])),
  };
  const seats = [
    ...ministryBlueprint.roster.map((group) => ({
      seat: group.seat,
      size: group.people.length,
    })),
    ...blueprint.crossMinistry
      .filter((group) => group.ministry.name === ministryBlueprint.name)
      .map((group) => ({ seat: group.seat, size: group.emails.length })),
  ];
  for (const { seat, size } of seats) {
    expectation.memberships += size;
    if (seat.ministryLeader) expectation.leaders += size;
    expectation.qualifications += seat.roles.length * size;
    for (const teamSeat of seat.teams ?? []) {
      if (!teamSeat.teamLeader) continue;
      expectation.teamLeaders.set(
        teamSeat.team,
        (expectation.teamLeaders.get(teamSeat.team) ?? 0) + size,
      );
    }
  }
  return expectation;
}

interface SortedNamesInput {
  db: SeedWriter;
  ministryId: string;
  table: typeof role | typeof team;
}

async function sortedNames({
  db,
  ministryId,
  table,
}: SortedNamesInput): Promise<string> {
  const rows = await db
    .select({ name: table.name })
    .from(table)
    .where(eq(table.ministryId, ministryId));
  return rows
    .map((row) => row.name)
    .sort()
    .join(', ');
}

interface MinistryCheckInput {
  db: SeedWriter;
  blueprint: ChurchDirectoryBlueprint;
  ministryBlueprint: MinistryBlueprint;
  ministryId: string;
  /** How problems name this Ministry, e.g. `Kids in igreja-semente`. */
  label: string;
}

/** One Ministry's Memberships, leaders, Role qualifications, Roles, Teams and TeamLeaders. */
async function ministryProblems({
  db,
  blueprint,
  ministryBlueprint,
  ministryId,
  label,
}: MinistryCheckInput): Promise<string[]> {
  const problems: string[] = [];
  const expected = expectMinistry({ blueprint, ministryBlueprint });

  const [memberships] = await db
    .select({
      total: count(),
      leaders: sql<number>`count(*) filter (where ${ministryVolunteer.ministryAccessLevel} = 'leader')::int`,
    })
    .from(ministryVolunteer)
    .where(
      and(
        eq(ministryVolunteer.ministryId, ministryId),
        eq(ministryVolunteer.status, 'active'),
        isNull(ministryVolunteer.leftAt),
      ),
    );
  if (memberships?.total !== expected.memberships) {
    problems.push(
      `${label} has ${memberships?.total ?? 0} Ministry Memberships, expected ${expected.memberships}`,
    );
  }
  if (memberships?.leaders !== expected.leaders) {
    problems.push(
      `${label} has ${memberships?.leaders ?? 0} Ministry leaders, expected ${expected.leaders}`,
    );
  }

  const [qualifications] = await db
    .select({ value: count() })
    .from(ministryVolunteerRole)
    .innerJoin(
      ministryVolunteer,
      eq(ministryVolunteer.id, ministryVolunteerRole.ministryVolunteerId),
    )
    .innerJoin(role, eq(role.id, ministryVolunteerRole.roleId))
    .where(
      and(
        eq(ministryVolunteer.ministryId, ministryId),
        eq(role.ministryId, ministryId),
      ),
    );
  if (qualifications?.value !== expected.qualifications) {
    problems.push(
      `${label} has ${qualifications?.value ?? 0} Role qualifications, expected ${expected.qualifications}`,
    );
  }

  const roles = await sortedNames({ db, ministryId, table: role });
  if (roles !== [...ministryBlueprint.roles].sort().join(', ')) {
    problems.push(`${label} has Roles [${roles}]`);
  }
  const teams = await sortedNames({ db, ministryId, table: team });
  if (teams !== [...ministryBlueprint.teams].sort().join(', ')) {
    problems.push(`${label} has Teams [${teams}]`);
  }

  const teamLeaders = byName({
    rows: await db
      .select({ name: team.name, value: count() })
      .from(ministryVolunteerTeam)
      .innerJoin(team, eq(team.id, ministryVolunteerTeam.teamId))
      .where(
        and(
          eq(team.ministryId, ministryId),
          eq(ministryVolunteerTeam.accessLevel, 'leader'),
        ),
      )
      .groupBy(team.name),
  });
  for (const [teamName, leaders] of expected.teamLeaders) {
    if ((teamLeaders.get(teamName) ?? 0) !== leaders) {
      problems.push(
        `Team ${teamName} of ${label} has ${teamLeaders.get(teamName) ?? 0} TeamLeaders, expected ${leaders}`,
      );
    }
  }

  return problems;
}

/** The Church, its ChurchAdmin, and each of its Ministries. */
async function churchProblems({
  db,
  seededChurch,
  blueprint,
}: ChurchCheckInput): Promise<string[]> {
  const problems: string[] = [];
  const label = seededChurch.slug;

  const [churchRow] = await db
    .select({ timezone: church.timezone })
    .from(organization)
    .innerJoin(church, eq(church.id, organization.id))
    .where(eq(organization.id, seededChurch.id));
  if (churchRow?.timezone !== blueprint.church.timezone) {
    problems.push(
      `Church ${label} is missing or not in ${blueprint.church.timezone}`,
    );
  }

  const [admin] = await db
    .select({ value: count() })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, seededChurch.id),
        eq(member.role, 'admin'),
        eq(user.email, blueprint.churchAdmin.email),
      ),
    );
  if (admin?.value !== 1) {
    problems.push(
      `${blueprint.churchAdmin.email} is not ${label}'s ChurchAdmin`,
    );
  }

  const ministries = await db
    .select({ id: ministry.id, name: ministry.name })
    .from(ministry)
    .where(eq(ministry.churchId, seededChurch.id));
  const ministryIdByName = new Map(ministries.map((row) => [row.name, row.id]));

  for (const ministryBlueprint of blueprint.ministries) {
    const ministryLabel = `${ministryBlueprint.name} in ${label}`;
    const ministryId = ministryIdByName.get(ministryBlueprint.name);
    if (!ministryId) {
      problems.push(`${ministryLabel} is missing`);
      continue;
    }
    problems.push(
      ...(await ministryProblems({
        db,
        blueprint,
        ministryBlueprint,
        ministryId,
        label: ministryLabel,
      })),
    );
  }

  return problems;
}

/** A `type`, not an interface: `execute` rows must be index-signature records. */
type CountRow = {
  value: string;
};

interface DbInput {
  db: SeedWriter;
}

interface CountOfInput extends DbInput {
  query: ReturnType<typeof sql>;
}

async function countOf({ db, query }: CountOfInput): Promise<number> {
  const result = await db.execute<CountRow>(query);
  return Number(result.rows[0]?.value ?? 0);
}

/** How many distinct people the blueprint declares, across both Churches. */
function expectedPeople(): number {
  const emails = new Set<string>();
  for (const blueprint of DEVELOPMENT_BLUEPRINT.churches) {
    emails.add(blueprint.churchAdmin.email);
    for (const ministryBlueprint of blueprint.ministries) {
      for (const group of ministryBlueprint.roster) {
        for (const person of group.people) emails.add(person.email);
      }
    }
  }
  return emails.size;
}

function expectedCrossMinistryVolunteers(): number {
  return new Set(
    DEVELOPMENT_BLUEPRINT.churches.flatMap((blueprint) =>
      blueprint.crossMinistry.flatMap((group) => group.emails),
    ),
  ).size;
}

function expectedMultiChurchUsers(): number {
  return new Set(
    DEVELOPMENT_BLUEPRINT.multiChurchMemberships.flatMap(
      (group) => group.emails,
    ),
  ).size;
}

/** Sign-in structure, qualifications, cross-Ministry service, tenant isolation and active-Volunteer uniqueness. */
async function graphWideProblems({ db }: DbInput): Promise<string[]> {
  const problems: string[] = [];

  const people = await countOf({
    db,
    query: sql`select count(*) as value from ${user} where ${user.id} <> ${SEED_PLATFORM_OPERATOR_ID}`,
  });
  if (people !== expectedPeople()) {
    problems.push(`${people} seeded Users, expected ${expectedPeople()}`);
  }

  const unauthenticatable = await countOf({
    db,
    query: sql`select count(*) as value from ${user} u
      where u.id <> ${SEED_PLATFORM_OPERATOR_ID}
        and (not u.email_verified
          or (select count(*) from ${account} a
              where a.user_id = u.id and a.provider_id = 'credential'
                and a.password is not null) <> 1)`,
  });
  if (unauthenticatable > 0) {
    problems.push(
      `${unauthenticatable} Users lack a verified email and one credential account`,
    );
  }

  const crossMinistry = await countOf({
    db,
    query: sql`select count(*) as value from (
        select ${ministryVolunteer.volunteerId} from ${ministryVolunteer}
        where ${ministryVolunteer.status} = 'active' and ${ministryVolunteer.leftAt} is null
        group by ${ministryVolunteer.volunteerId} having count(*) > 1
      ) as cross_ministry`,
  });
  if (crossMinistry !== expectedCrossMinistryVolunteers()) {
    problems.push(
      `${crossMinistry} cross-Ministry Volunteers, expected ${expectedCrossMinistryVolunteers()}`,
    );
  }

  const outsideChurch = await countOf({
    db,
    query: sql`select (
        (select count(*) from ${ministryVolunteer} mv
          join ${volunteer} v on v.id = mv.volunteer_id
          join ${ministry} m on m.id = mv.ministry_id
          where mv.church_id <> v.church_id or mv.church_id <> m.church_id)
      + (select count(*) from ${role} r join ${ministry} m on m.id = r.ministry_id
          where r.church_id <> m.church_id)
      + (select count(*) from ${team} t join ${ministry} m on m.id = t.ministry_id
          where t.church_id <> m.church_id)
      + (select count(*) from ${ministryVolunteerRole} q
          join ${ministryVolunteer} mv on mv.id = q.ministry_volunteer_id
          join ${role} r on r.id = q.role_id
          where q.church_id <> mv.church_id or r.church_id <> mv.church_id)
      + (select count(*) from ${ministryVolunteerTeam} tm
          join ${ministryVolunteer} mv on mv.id = tm.ministry_volunteer_id
          join ${team} t on t.id = tm.team_id
          where tm.church_id <> mv.church_id or t.church_id <> mv.church_id)
      + (select count(*) from ${volunteer} v
          where not exists (select 1 from ${member} cm
            where cm.organization_id = v.church_id and cm.user_id = v.user_id))
      ) as value`,
  });
  if (outsideChurch > 0) {
    problems.push(`${outsideChurch} rows reach outside their own Church`);
  }

  const misqualified = await countOf({
    db,
    query: sql`select (
        (select count(*) from ${ministryVolunteer} mv
          where not exists (select 1 from ${ministryVolunteerRole} q
            where q.ministry_volunteer_id = mv.id))
      + (select count(*) from ${ministryVolunteerRole} q
          join ${ministryVolunteer} mv on mv.id = q.ministry_volunteer_id
          join ${role} r on r.id = q.role_id
          where r.ministry_id <> mv.ministry_id)
      ) as value`,
  });
  if (misqualified > 0) {
    problems.push(
      `${misqualified} Ministry Memberships lack Role qualifications or hold another Ministry's Role`,
    );
  }

  const doubleVolunteers = await countOf({
    db,
    query: sql`select count(*) as value from (
        select ${volunteer.userId} from ${volunteer}
        where ${volunteer.leftAt} is null and ${volunteer.status} = 'active'
        group by ${volunteer.userId} having count(*) > 1
      ) as double_volunteers`,
  });
  if (doubleVolunteers > 0) {
    problems.push(
      `${doubleVolunteers} Users are an active Volunteer more than once`,
    );
  }

  const multiChurch = await countOf({
    db,
    query: sql`select count(*) as value from (
        select ${member.userId} from ${member}
        group by ${member.userId} having count(distinct ${member.organizationId}) > 1
      ) as multi_church`,
  });
  if (multiChurch !== expectedMultiChurchUsers()) {
    problems.push(
      `${multiChurch} multi-Church Users, expected ${expectedMultiChurchUsers()}`,
    );
  }

  return problems;
}

/**
 * Reads the committed graph back against the blueprint and refuses it when a
 * critical invariant is missing, so the command never reports success for a
 * graph a developer cannot rely on.
 */
export async function verifyDevelopmentGraph({
  db,
  seeded,
}: VerifyDevelopmentGraphInput): Promise<void> {
  const problems = [
    ...(await churchProblems({
      db,
      seededChurch: seeded.church,
      blueprint: DEVELOPMENT_BLUEPRINT.primary,
    })),
    ...(await churchProblems({
      db,
      seededChurch: seeded.secondChurch,
      blueprint: DEVELOPMENT_BLUEPRINT.second,
    })),
    ...(await graphWideProblems({ db })),
  ];

  if (problems.length > 0) {
    throw new Error(`Seeded graph is incomplete: ${problems.join('; ')}.`);
  }
}
