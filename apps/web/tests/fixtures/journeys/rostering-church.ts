import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import { z } from 'zod';
import { requiredE2eUrl } from '../e2e-urls';
import { resolveActiveChurch, signInPersona } from '../persona-session';

/**
 * The web half of the rostering Church base
 * (apps/server/seeds/e2e/recipes/rostering-church.ts): schemas for the
 * pieces every #329 scheduling recipe returns, and sign-in helpers for
 * journeys that act as several of its personas. Each journey's own schema
 * extends `ROSTERING_JOURNEY_BASE_SCHEMA` with its personas, Ministries and
 * pool, keyed as its server plan keys them.
 */

export const ROSTERING_CHURCH_SCHEMA = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
});

export const ROSTERING_NAMED_ROW_SCHEMA = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const ROSTERING_POOL_VOLUNTEER_SCHEMA = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  volunteerId: z.string().min(1),
});

export const ROSTERING_PERSONA_SCHEMA = ROSTERING_POOL_VOLUNTEER_SCHEMA.extend({
  email: z.string().min(1),
  password: z.string().min(1),
});

export type RosteringPersona = z.infer<typeof ROSTERING_PERSONA_SCHEMA>;

/** `anchor` is the Church-local day the recipe's dates hang from. */
export const ROSTERING_JOURNEY_BASE_SCHEMA = z.object({
  anchor: z.string().min(1),
  church: ROSTERING_CHURCH_SCHEMA,
});

/** A Planning Cycle a journey created: its id and name. */
export const ROSTERING_CYCLE_SCHEMA = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const CALENDAR_DAY_SCHEMA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The days a journey's own Planning Cycle spans (server
 * `planningCycleWindow`). */
export const PLANNING_CYCLE_WINDOW_SCHEMA = z.object({
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
  return keyedObjectSchema({ keys, value: ROSTERING_NAMED_ROW_SCHEMA });
}

export interface RosteringMinistrySchemaInput<
  TRoleKey extends string,
  TTeamKey extends string,
> {
  roles: readonly TRoleKey[];
  teams: readonly TTeamKey[];
}

/** A Ministry with the Role and Team keys its server plan gives it. */
export function rosteringMinistrySchema<
  const TRoleKey extends string,
  const TTeamKey extends string,
>({ roles, teams }: RosteringMinistrySchemaInput<TRoleKey, TTeamKey>) {
  return ROSTERING_NAMED_ROW_SCHEMA.extend({
    roles: namedRowsSchema({ keys: roles }),
    teams: namedRowsSchema({ keys: teams }),
  });
}

export const ROSTERING_REQUIREMENT_SCHEMA = z.object({
  id: z.string().min(1),
  roleId: z.string().min(1),
  requiredCount: z.number().int().positive(),
  teamId: z.string().min(1).nullable(),
});

export interface RosteringEventSchemaInput<TRequirementKey extends string> {
  requirements: readonly TRequirementKey[];
}

/**
 * One Event a Ministry rosters (server `buildRosteringEvent`), with the
 * requirement keys its recipe gave it.
 */
export function rosteringEventSchema<const TRequirementKey extends string>({
  requirements,
}: RosteringEventSchemaInput<TRequirementKey>) {
  return z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    day: CALENDAR_DAY_SCHEMA,
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    participationId: z.string().min(1),
    timeSlotId: z.string().min(1),
    shiftId: z.string().min(1),
    requirements: keyedObjectSchema({
      keys: requirements,
      value: ROSTERING_REQUIREMENT_SCHEMA,
    }),
  });
}

export interface LoadRosteringJourneyInput {
  testInfo: Pick<TestInfo, 'testId' | 'repeatEachIndex'>;
}

export interface MinistryCyclePathInput {
  ministryId: string;
  cycleId: string;
}

export interface RosteringBuilderPathInput {
  ministryId: string;
  /** Omitted for the Ministry's roster link without a cycle. */
  cycleId?: string;
  /** Scopes the board to one Team (a TeamLeader's roster link). */
  teamId?: string;
}

/** The cycle builder (roster board) for one Ministry's cycle. */
export function rosteringBuilderPath({
  ministryId,
  cycleId,
  teamId,
}: RosteringBuilderPathInput): string {
  const path = [`/scheduling/rostering/${ministryId}`, cycleId]
    .filter((segment) => segment !== undefined)
    .join('/');
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
  return rosteringBuilderPath({
    ministryId: journey.ministries.worship.id,
    cycleId: journey.cycle.id,
    teamId,
  });
}

/** The tailoring page for one Ministry's cycle. */
export function rosteringTailoringPath({
  ministryId,
  cycleId,
}: MinistryCyclePathInput): string {
  return `/scheduling/tailoring/${ministryId}/${cycleId}`;
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
  persona: RosteringPersona;
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
  persona: RosteringPersona;
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
