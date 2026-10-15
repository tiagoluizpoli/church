import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  request as playwrightRequest,
  type TestInfo,
} from '@playwright/test';
import { z } from 'zod';
import { requiredE2eUrl } from '@/tests/fixtures/e2e-urls';
import {
  resolveActiveChurch,
  signInPersona,
} from '@/tests/fixtures/persona-session';

/**
 * The web half of the Assign Church base
 * (apps/server/seeds/e2e/recipes/assign-church.ts): schemas for the
 * pieces every #329 scheduling recipe returns, and sign-in helpers for
 * journeys that act as several of its personas. Each journey's own schema
 * extends `ASSIGN_JOURNEY_BASE_SCHEMA` with its personas, Ministries and
 * pool, keyed as its server plan keys them.
 */

export const ASSIGN_CHURCH_SCHEMA = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
});

export const ASSIGN_NAMED_ROW_SCHEMA = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const ASSIGN_POOL_VOLUNTEER_SCHEMA = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  volunteerId: z.string().min(1),
});

export const ASSIGN_PERSONA_SCHEMA = ASSIGN_POOL_VOLUNTEER_SCHEMA.extend({
  email: z.string().min(1),
  password: z.string().min(1),
});

export type AssignPersona = z.infer<typeof ASSIGN_PERSONA_SCHEMA>;

/**
 * A User of one Assign Church who also joined another of the same graph
 * (server `addAssignChurchMembership`): a Church Membership only, never a
 * second Volunteer profile. A journey with several Churches validates each
 * Church's part with the same schemas as a single-Church journey.
 */
export const ASSIGN_CHURCH_MEMBERSHIP_SCHEMA = z.object({
  id: z.string().min(1),
  churchId: z.string().min(1),
  userId: z.string().min(1),
  // Mirrors the server's `CHURCH_ACCESS_LEVEL_OPTIONS`; web cannot import
  // server code.
  accessLevel: z.enum(['member', 'admin']),
});

/** `anchor` is the Church-local day the recipe's dates hang from. */
export const ASSIGN_JOURNEY_BASE_SCHEMA = z.object({
  anchor: z.string().min(1),
  church: ASSIGN_CHURCH_SCHEMA,
});

/** A Cycle a journey created: its id and name. */
export const ASSIGN_CYCLE_SCHEMA = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const CALENDAR_DAY_SCHEMA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The days a journey's own Cycle spans (server
 * `cycleWindow`). */
export const CYCLE_WINDOW_SCHEMA = z.object({
  startDate: CALENDAR_DAY_SCHEMA,
  endDate: CALENDAR_DAY_SCHEMA,
});

type KeyedShape<TKey extends string, TValue extends z.ZodType> = Record<
  TKey,
  TValue
>;

interface KeyedObjectSchemaInput<
  TKey extends string,
  TValue extends z.ZodType,
> {
  keys: readonly TKey[];
  value: TValue;
}

/** An object with exactly these keys, each holding `value`. */
function keyedObjectSchema<
  const TKey extends string,
  TValue extends z.ZodType,
>({
  keys,
  value,
}: KeyedObjectSchemaInput<TKey, TValue>): z.ZodObject<
  KeyedShape<TKey, TValue>
> {
  const shape = Object.fromEntries(
    keys.map((key) => [key, value]),
  ) as KeyedShape<TKey, TValue>;
  return z.object(shape);
}

interface NamedRowsSchemaInput<TKey extends string> {
  keys: readonly TKey[];
}

function namedRowsSchema<const TKey extends string>({
  keys,
}: NamedRowsSchemaInput<TKey>) {
  return keyedObjectSchema({ keys, value: ASSIGN_NAMED_ROW_SCHEMA });
}

export interface AssignMinistrySchemaInput<
  TRoleKey extends string,
  TTeamKey extends string,
> {
  roles: readonly TRoleKey[];
  teams: readonly TTeamKey[];
}

/** A Ministry with the Role and Team keys its server plan gives it. */
export function assignMinistrySchema<
  const TRoleKey extends string,
  const TTeamKey extends string,
>({ roles, teams }: AssignMinistrySchemaInput<TRoleKey, TTeamKey>) {
  return ASSIGN_NAMED_ROW_SCHEMA.extend({
    roles: namedRowsSchema({ keys: roles }),
    teams: namedRowsSchema({ keys: teams }),
  });
}

export const ASSIGN_REQUIREMENT_SCHEMA = z.object({
  id: z.string().min(1),
  roleId: z.string().min(1),
  peopleNeeded: z.number().int().positive(),
  teamId: z.string().min(1).nullable(),
});

export interface AssignEventSchemaInput<TRequirementKey extends string> {
  requirements: readonly TRequirementKey[];
}

/**
 * One Event a Ministry schedules (server `buildAssignEvent`), with the
 * requirement keys its recipe gave it.
 */
export function assignEventSchema<const TRequirementKey extends string>({
  requirements,
}: AssignEventSchemaInput<TRequirementKey>) {
  return z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    day: CALENDAR_DAY_SCHEMA,
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    participationId: z.string().min(1),
    eventTimeBlockId: z.string().min(1),
    shiftId: z.string().min(1),
    requirements: keyedObjectSchema({
      keys: requirements,
      value: ASSIGN_REQUIREMENT_SCHEMA,
    }),
  });
}

export interface LoadAssignJourneyInput {
  testInfo: Pick<TestInfo, 'testId' | 'repeatEachIndex'>;
}

export interface SchedulePathInput {
  ministryId: string;
  cycleId: string;
}

export interface AssignBuilderPathInput {
  ministryId: string;
  /** Omitted for the Ministry's schedule link without a cycle. */
  cycleId?: string;
  /** Scopes the board to one Team (a TeamLeader's schedule link). */
  teamId?: string;
}

/** The cycle builder (schedule board) for one Ministry's cycle. */
export function assignBuilderPath({
  ministryId,
  cycleId,
  teamId,
}: AssignBuilderPathInput): string {
  const path =
    cycleId === undefined
      ? `/scheduling/teams/${ministryId}`
      : `/schedules/${ministryId}/${cycleId}/assign`;
  return teamId === undefined ? path : `${path}?teamId=${teamId}`;
}

interface JourneyRow {
  id: string;
}

interface WorshipMinistries {
  worship: JourneyRow;
}

/** The part of a journey the Worship cycle builder links need. */
export interface WorshipCycleJourney {
  ministries: WorshipMinistries;
  cycle: JourneyRow;
}

export interface WorshipCycleJourneyInput {
  journey: WorshipCycleJourney;
  teamId?: string;
}

/** The Worship Ministry's builder for the journey's own cycle. */
export function worshipBuilderPath({
  journey,
  teamId,
}: WorshipCycleJourneyInput): string {
  return assignBuilderPath({
    ministryId: journey.ministries.worship.id,
    cycleId: journey.cycle.id,
    teamId,
  });
}

/** The prepare page for one Ministry's cycle. */
export function assignPreparePath({
  ministryId,
  cycleId,
}: SchedulePathInput): string {
  return `/schedules/${ministryId}/${cycleId}`;
}

export interface RequirementCellInput {
  shiftId: string;
  roleId: string;
}

/** The cycle builder cell's test id for one shift×role requirement. */
export function requirementCellTestId({
  shiftId,
  roleId,
}: RequirementCellInput): string {
  return `cycle-requirement-${shiftId}-${roleId}`;
}

export interface DayFilterNameInput {
  /** Church-local day, `yyyy-MM-dd`. */
  day: string;
}

/**
 * The cycle builder's "Show only <day>" control for one date column. Its
 * label ends in the day as `dd/MM`; the weekday before it is not matched.
 */
export function dayFilterName({ day }: DayFilterNameInput): RegExp {
  const [, month, dayOfMonth] = day.split('-');
  return new RegExp(`^Show only .*, ${dayOfMonth}/${month}$`);
}

export interface SignInPersonaPageInput {
  page: Page;
  persona: AssignPersona;
}

/** Signs the persona into the test's own `page` context. */
export async function signInPersonaPage({
  page,
  persona,
}: SignInPersonaPageInput): Promise<void> {
  const request = page.context().request;
  await signInPersona({ request, credentials: persona });
  await resolveActiveChurch({ request, name: persona.name });
}

export interface NewPersonaContextInput {
  browser: Browser;
  persona: AssignPersona;
}

/**
 * A new browser context signed in as the persona, for a journey's second
 * actor. The caller closes it.
 */
export async function newPersonaContext({
  browser,
  persona,
}: NewPersonaContextInput): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: requiredE2eUrl({ variable: 'PW_WEB_URL' }),
  });
  try {
    await signInPersona({ request: context.request, credentials: persona });
    await resolveActiveChurch({
      request: context.request,
      name: persona.name,
    });
  } catch (error) {
    await context.close();
    throw error;
  }
  return context;
}

export interface NewPersonaRequestInput {
  persona: AssignPersona;
}

/**
 * An API context on the server, signed in as the persona with its Active
 * Church resolved, for a journey acting through the API as an actor other
 * than its page's. The caller disposes it.
 */
export async function newPersonaRequest({
  persona,
}: NewPersonaRequestInput): Promise<APIRequestContext> {
  const context = await playwrightRequest.newContext({
    baseURL: requiredE2eUrl({ variable: 'VITE_SERVER_URL' }),
  });
  try {
    await signInPersona({ request: context, credentials: persona });
    await resolveActiveChurch({ request: context, name: persona.name });
  } catch (error) {
    await context.dispose();
    throw error;
  }
  return context;
}

export interface ShortVolunteerNameInput {
  name: string;
}

/**
 * How the rail and dashboard abbreviate a Volunteer (`formatVolunteerName`,
 * FR-013): first name plus the last name's initial.
 */
export function shortVolunteerName({ name }: ShortVolunteerNameInput): string {
  const tokens = name.trim().split(/\s+/);
  const last = tokens[tokens.length - 1] ?? '';
  return `${tokens[0]} ${last.charAt(0).toUpperCase()}.`;
}
