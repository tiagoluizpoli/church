import { addChurchMember } from '@church/db';
import {
  addCalendarDays,
  type CalendarDay,
  type Instant,
  parseTimeOfDay,
  type TimeOfDay,
  toInstant,
} from '@church/time';
import { hashPassword } from 'better-auth/crypto';
import type { ChurchAccessLevel } from '../../../src/domain/authority/types';
import { SEED_PERSONA_PASSWORD } from '../../blueprints/credentials';
import {
  buildProvisionedChurch,
  redeemChurchInvitation,
} from '../../builders/church';
import { buildAuthenticatableUser } from '../../builders/identity';
import { buildMinistry, buildRole, buildTeam } from '../../builders/ministry';
import {
  buildMinistryMembership,
  buildVolunteer,
  type MinistryAccessLevel,
  type TeamAccessLevel,
} from '../../builders/volunteer';
import type { SeedWriter } from '../../recipe';
import {
  E2E_JOURNEY_TIMEZONE,
  type E2eJourneyRootKinds,
  type JourneySeedIdOf,
} from '../journey-keys';

/**
 * The shared starting graph of the #329 scheduling journeys: one provisioned
 * Church whose ChurchAdmin persona redeemed the provisioning invitation, plus
 * authenticatable personas, Ministries with Roles and Teams, and a pool of
 * Volunteers qualified for given Roles. Not a registered recipe: each
 * journey recipe composes it from its own plan, so every journey still owns
 * its whole graph.
 *
 * A plan names everything by key; the result is keyed the same way. The
 * kinds this module derives ids from (`church`, `persona-user:<key>`, ...)
 * are reserved: a recipe composing it uses other kinds for its own rows.
 */

/** Key → display name. */
export type RosteringNames = Readonly<Record<string, string>>;

export interface RosteringMinistryPlan {
  name: string;
  /** Role key → Role name. */
  roles: RosteringNames;
  /** Team key → Team name. */
  teams: RosteringNames;
}

export interface RosteringTeamMembershipPlan {
  /** A Team key of the membership's Ministry. */
  team: string;
  accessLevel: TeamAccessLevel;
}

export interface RosteringMinistryMembershipPlan {
  /** A Ministry key of the plan. */
  ministry: string;
  accessLevel: MinistryAccessLevel;
  /** Role keys of that Ministry the Volunteer is qualified for. Membership
   * alone qualifies for nothing; `[]` makes an unqualified member. */
  roles: readonly string[];
  teams: readonly RosteringTeamMembershipPlan[];
}

export interface RosteringVolunteerPlan {
  name: string;
  memberships: readonly RosteringMinistryMembershipPlan[];
}

export interface RosteringPersonaPlan extends RosteringVolunteerPlan {
  /** `admin` is the ChurchAdmin: exactly one persona, who redeems the
   * Church Invitation provisioning minted. Every other persona is a
   * `member`. */
  churchAccessLevel: ChurchAccessLevel;
}

export interface RosteringChurchPlan {
  ministries: Readonly<Record<string, RosteringMinistryPlan>>;
  /** Users a journey signs in as; each also has a Volunteer profile. */
  personas: Readonly<Record<string, RosteringPersonaPlan>>;
  /** Volunteers a journey rosters but never signs in as. */
  pool: Readonly<Record<string, RosteringVolunteerPlan>>;
}

export interface RosteringChurchSummary {
  id: string;
  slug: string;
  name: string;
}

export interface RosteringNamedRow {
  id: string;
  name: string;
}

export type KeyedBy<TRecord, TValue> = {
  [TKey in keyof TRecord]: TValue;
};

export interface RosteringMinistry<TMinistry extends RosteringMinistryPlan> {
  id: string;
  name: string;
  roles: KeyedBy<TMinistry['roles'], RosteringNamedRow>;
  teams: KeyedBy<TMinistry['teams'], RosteringNamedRow>;
}

export type RosteringMinistries<TPlan extends RosteringChurchPlan> = {
  [TKey in keyof TPlan['ministries']]: RosteringMinistry<
    TPlan['ministries'][TKey]
  >;
};

export interface RosteringPoolVolunteer {
  userId: string;
  name: string;
  volunteerId: string;
}

export interface RosteringPersona extends RosteringPoolVolunteer {
  email: string;
  password: string;
}

export interface RosteringChurch<TPlan extends RosteringChurchPlan> {
  church: RosteringChurchSummary;
  ministries: RosteringMinistries<TPlan>;
  personas: KeyedBy<TPlan['personas'], RosteringPersona>;
  pool: KeyedBy<TPlan['pool'], RosteringPoolVolunteer>;
}

const CHURCH_KIND = 'church';
const PLAN_KEY_PATTERN = /^[A-Za-z0-9-]+$/;

interface PlanKeyInput {
  key: string;
}

function personaUserKind({ key }: PlanKeyInput): string {
  return `persona-user:${key}`;
}

function poolUserKind({ key }: PlanKeyInput): string {
  return `pool-user:${key}`;
}

/** The part of a persona's email before `@<tag>.e2e.test`. */
function personaEmailLocalPart({ key }: PlanKeyInput): string {
  return key.toLowerCase();
}

function poolEmailLocalPart({ key }: PlanKeyInput): string {
  return `pool-${key}`.toLowerCase();
}

export interface RosteringChurchPlanInput {
  plan: RosteringChurchPlan;
}

/** The root kinds of a rostering Church: its Church and every User. */
export function rosteringChurchRootKinds({
  plan,
}: RosteringChurchPlanInput): E2eJourneyRootKinds {
  return {
    churchKinds: [CHURCH_KIND],
    userKinds: [
      ...Object.keys(plan.personas).map((key) => personaUserKind({ key })),
      ...Object.keys(plan.pool).map((key) => poolUserKind({ key })),
    ],
  };
}

/**
 * Validates the plan — slug-safe keys, one email per User, exactly one
 * ChurchAdmin — and returns that ChurchAdmin persona's key.
 */
function resolveAdminKey({ plan }: RosteringChurchPlanInput): string {
  const keys = [
    ...Object.keys(plan.ministries),
    ...Object.keys(plan.personas),
    ...Object.keys(plan.pool),
  ];
  for (const key of keys) {
    if (!PLAN_KEY_PATTERN.test(key)) {
      throw new Error(`Rostering plan key "${key}" is not slug-safe.`);
    }
  }
  const localParts = [
    ...Object.keys(plan.personas).map((key) => personaEmailLocalPart({ key })),
    ...Object.keys(plan.pool).map((key) => poolEmailLocalPart({ key })),
  ];
  const duplicate = localParts.find(
    (localPart, index) => localParts.indexOf(localPart) !== index,
  );
  if (duplicate !== undefined) {
    throw new Error(
      `Two rostering plan Users would share the email "${duplicate}@…"; keys must differ beyond letter case.`,
    );
  }
  const adminKeys = Object.entries(plan.personas)
    .filter(([, persona]) => persona.churchAccessLevel === 'admin')
    .map(([key]) => key);
  const [adminKey] = adminKeys;
  if (adminKey === undefined || adminKeys.length !== 1) {
    throw new Error(
      `A rostering Church needs exactly one ChurchAdmin persona; the plan has ${adminKeys.length}.`,
    );
  }
  return adminKey;
}

interface RequirePlanEntryInput<TValue> {
  entries: Readonly<Record<string, TValue>>;
  key: string;
  owner: string;
}

function requirePlanEntry<TValue>({
  entries,
  key,
  owner,
}: RequirePlanEntryInput<TValue>): TValue {
  const entry = entries[key];
  if (entry === undefined) {
    throw new Error(`Unknown key "${key}" in ${owner}.`);
  }
  return entry;
}

interface BuiltMinistry {
  id: string;
  name: string;
  roles: Record<string, RosteringNamedRow>;
  teams: Record<string, RosteringNamedRow>;
}

interface BuildPlanMinistryInput {
  db: SeedWriter;
  idOf: JourneySeedIdOf;
  churchId: string;
  key: string;
  plan: RosteringMinistryPlan;
}

async function buildPlanMinistry({
  db,
  idOf,
  churchId,
  key,
  plan,
}: BuildPlanMinistryInput): Promise<BuiltMinistry> {
  const ministry = await buildMinistry({
    db,
    churchId,
    id: idOf({ kind: `ministry:${key}` }),
    name: plan.name,
  });
  const roles: Record<string, RosteringNamedRow> = {};
  for (const [roleKey, name] of Object.entries(plan.roles)) {
    const role = await buildRole({
      db,
      churchId,
      ministryId: ministry.id,
      id: idOf({ kind: `role:${key}:${roleKey}` }),
      name,
    });
    roles[roleKey] = { id: role.id, name: role.name };
  }
  const teams: Record<string, RosteringNamedRow> = {};
  for (const [teamKey, name] of Object.entries(plan.teams)) {
    const team = await buildTeam({
      db,
      churchId,
      ministryId: ministry.id,
      id: idOf({ kind: `team:${key}:${teamKey}` }),
      name,
    });
    teams[teamKey] = { id: team.id, name: team.name };
  }
  return { id: ministry.id, name: ministry.name, roles, teams };
}

interface BuildPlanMembershipsInput {
  db: SeedWriter;
  idOf: JourneySeedIdOf;
  churchId: string;
  ministries: Readonly<Record<string, BuiltMinistry>>;
  /** The Volunteer's user kind, which keys its membership ids. */
  userKind: string;
  volunteerId: string;
  memberships: readonly RosteringMinistryMembershipPlan[];
}

async function buildPlanMemberships({
  db,
  idOf,
  churchId,
  ministries,
  userKind,
  volunteerId,
  memberships,
}: BuildPlanMembershipsInput): Promise<void> {
  for (const membership of memberships) {
    const owner = `${userKind}'s memberships`;
    const ministry = requirePlanEntry({
      entries: ministries,
      key: membership.ministry,
      owner,
    });
    const roleIds = membership.roles.map(
      (key) => requirePlanEntry({ entries: ministry.roles, key, owner }).id,
    );
    const teams = membership.teams.map(({ team, accessLevel }) => ({
      teamId: requirePlanEntry({ entries: ministry.teams, key: team, owner })
        .id,
      accessLevel,
    }));
    await buildMinistryMembership({
      db,
      churchId,
      volunteerId,
      ministryId: ministry.id,
      id: idOf({
        kind: `ministry-membership:${userKind}:${membership.ministry}`,
      }),
      ministryAccessLevel: membership.accessLevel,
      roleIds,
      teams,
    });
  }
}

interface EmailLocalPartInput {
  localPart: string;
}

interface BuildPlanVolunteerInput {
  /** The email's local part, unique per plan (`resolveAdminKey` checks). */
  emailLocalPart: string;
  userKind: string;
  volunteerPlan: RosteringVolunteerPlan;
  churchAccessLevel: ChurchAccessLevel;
}

export interface BuildRosteringChurchInput<TPlan extends RosteringChurchPlan> {
  db: SeedWriter;
  /** The recipe's id function; every id of the graph derives from it. */
  idOf: JourneySeedIdOf;
  /** The recipe's `journeyTag`, which keeps the slug and emails unique. */
  tag: string;
  plan: TPlan;
}

/**
 * Builds the plan's graph: Church Provisioning for real, the ChurchAdmin
 * persona redeeming its invitation, then Ministries, personas and the pool.
 * Every persona signs in with `SEED_PERSONA_PASSWORD`.
 */
export async function buildRosteringChurch<
  const TPlan extends RosteringChurchPlan,
>({
  db,
  idOf,
  tag,
  plan,
}: BuildRosteringChurchInput<TPlan>): Promise<RosteringChurch<TPlan>> {
  const adminKey = resolveAdminKey({ plan });
  const emailOf = ({ localPart }: EmailLocalPartInput): string =>
    `${localPart}@${tag}.e2e.test`;

  const { church, adminInvitationId } = await buildProvisionedChurch({
    db,
    id: idOf({ kind: CHURCH_KIND }),
    name: `Igreja E2E ${tag}`,
    slug: `e2e-${tag}`,
    timezone: E2E_JOURNEY_TIMEZONE,
    adminEmail: emailOf({
      localPart: personaEmailLocalPart({ key: adminKey }),
    }),
    adminInvitationId: idOf({ kind: 'admin-invitation' }),
  });

  const ministries: Record<string, BuiltMinistry> = {};
  for (const [key, ministryPlan] of Object.entries(plan.ministries)) {
    ministries[key] = await buildPlanMinistry({
      db,
      idOf,
      churchId: church.id,
      key,
      plan: ministryPlan,
    });
  }

  // Hashed once: hashing is deliberately slow.
  const passwordHash = await hashPassword(SEED_PERSONA_PASSWORD);

  async function buildPlanVolunteer({
    emailLocalPart,
    userKind,
    volunteerPlan,
    churchAccessLevel,
  }: BuildPlanVolunteerInput): Promise<RosteringPersona> {
    const user = await buildAuthenticatableUser({
      db,
      id: idOf({ kind: userKind }),
      name: volunteerPlan.name,
      email: emailOf({ localPart: emailLocalPart }),
      passwordHash,
    });
    const churchMembershipId = idOf({ kind: `church-membership:${userKind}` });
    if (churchAccessLevel === 'admin') {
      await redeemChurchInvitation({
        db,
        invitationId: adminInvitationId,
        userId: user.id,
        churchMembershipId,
      });
    } else {
      // Direct state by purpose (ADR 0006): a Volunteer's real origin is a
      // redeemed Ministry Invitation; the journey starts after that happened.
      await addChurchMember({
        db,
        churchId: church.id,
        userId: user.id,
        accessLevel: 'member',
        id: churchMembershipId,
      });
    }
    const volunteer = await buildVolunteer({
      db,
      churchId: church.id,
      userId: user.id,
      id: idOf({ kind: `volunteer:${userKind}` }),
    });
    await buildPlanMemberships({
      db,
      idOf,
      churchId: church.id,
      ministries,
      userKind,
      volunteerId: volunteer.id,
      memberships: volunteerPlan.memberships,
    });
    return {
      userId: user.id,
      email: user.email,
      password: SEED_PERSONA_PASSWORD,
      name: user.name,
      volunteerId: volunteer.id,
    };
  }

  const personas: Record<string, RosteringPersona> = {};
  for (const [key, personaPlan] of Object.entries(plan.personas)) {
    personas[key] = await buildPlanVolunteer({
      emailLocalPart: personaEmailLocalPart({ key }),
      userKind: personaUserKind({ key }),
      volunteerPlan: personaPlan,
      churchAccessLevel: personaPlan.churchAccessLevel,
    });
  }

  const pool: Record<string, RosteringPoolVolunteer> = {};
  for (const [key, volunteerPlan] of Object.entries(plan.pool)) {
    const { userId, name, volunteerId } = await buildPlanVolunteer({
      emailLocalPart: poolEmailLocalPart({ key }),
      userKind: poolUserKind({ key }),
      volunteerPlan,
      churchAccessLevel: 'member',
    });
    pool[key] = { userId, name, volunteerId };
  }

  return {
    church: { id: church.id, slug: church.slug, name: church.name },
    // Built by iterating the plan's own keys, so each record is complete.
    ministries: ministries as RosteringMinistries<TPlan>,
    personas: personas as KeyedBy<TPlan['personas'], RosteringPersona>,
    pool: pool as KeyedBy<TPlan['pool'], RosteringPoolVolunteer>,
  };
}

/** The wall clock most journey events start and end at. */
export const EVENT_START_TIME: TimeOfDay = parseTimeOfDay({ value: '09:00' });
export const EVENT_END_TIME: TimeOfDay = parseTimeOfDay({ value: '11:00' });

export interface AnchoredInstantInput {
  anchor: CalendarDay;
  /** Days after the anchor (negative for before). */
  dayOffset: number;
  /** Church-local wall clock. */
  time: TimeOfDay;
}

/** A Church-local wall-clock time on the anchor-relative day, as an Instant. */
export function anchoredInstant({
  anchor,
  dayOffset,
  time,
}: AnchoredInstantInput): Instant {
  return toInstant({
    day: addCalendarDays({ day: anchor, days: dayOffset }),
    time,
    timeZone: E2E_JOURNEY_TIMEZONE,
  });
}
