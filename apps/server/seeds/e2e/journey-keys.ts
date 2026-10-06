import { createHash } from 'node:crypto';
import type { CalendarDay } from '@church/time';
import { deriveSeedId } from '../builders/derived-id';

/**
 * The pure half of the journey-recipe model (#327): names, keys and ids,
 * with no database import, so the loader can parse its arguments and refuse
 * a wrong target before anything that could connect is loaded.
 */

/** Every journey recipe the E2E loader can run. The web fixtures pass these
 * names to the loader; register each in `journey-recipes.ts`. */
export const E2E_JOURNEY_RECIPE_NAMES = {
  volunteerAssignments: 'volunteer-assignments',
} as const;

export type E2eJourneyRecipeName =
  (typeof E2E_JOURNEY_RECIPE_NAMES)[keyof typeof E2E_JOURNEY_RECIPE_NAMES];

/** The Church Timezone every journey Church is provisioned in, and the
 * zone its anchor day is read in. */
export const E2E_JOURNEY_TIMEZONE = 'America/Sao_Paulo';

/** What every journey recipe factory takes. */
export interface CreateJourneyRecipeInput {
  /** Tells one test's graph from every other's, e.g. a Playwright test id
   * plus its repeat index. A retry reuses it, which recreates the graph. */
  journeyKey: string;
  /** The Church-local day every relative date of the graph hangs from. */
  anchor: CalendarDay;
}

export interface JourneyIdentityInput {
  recipeName: E2eJourneyRecipeName;
  journeyKey: string;
}

export interface JourneySeedIdInput extends JourneyIdentityInput {
  /** The row's role in the graph, e.g. `church` or `volunteer-user`. */
  kind: string;
}

/** A stable id for one row of a journey graph: the same recipe, key and kind
 * always yield the same id, and no two keys share one. */
export function journeySeedId({
  recipeName,
  journeyKey,
  kind,
}: JourneySeedIdInput): string {
  return deriveSeedId({
    kind: `e2e-journey:${kind}`,
    parentIds: [recipeName, journeyKey],
  });
}

const JOURNEY_TAG_LENGTH = 12;

/**
 * A short, slug- and email-safe stand-in for the journey key, for names that
 * must be unique per graph (a Church slug, a persona's email). The key is
 * never embedded verbatim: callers choose it freely.
 */
export function journeyTag({
  recipeName,
  journeyKey,
}: JourneyIdentityInput): string {
  return createHash('sha256')
    .update([recipeName, journeyKey].join('\u0000'))
    .digest('hex')
    .slice(0, JOURNEY_TAG_LENGTH);
}

/**
 * The kinds of the rows a journey graph hangs from: its Churches and its
 * personas' Users. Every tenant row the recipe writes carries one of those
 * Churches (each `church_id` cascades from its Church's organization), and
 * every global row is one of those Users or cascades from one.
 *
 * Not part of any graph: the local Platform Operator every Church is
 * provisioned by. It is a shared prerequisite (E2E global setup creates it
 * before any worker starts), and purging never touches it.
 */
export interface E2eJourneyRootKinds {
  churchKinds: readonly string[];
  userKinds: readonly string[];
}

/** The concrete ids a journey graph hangs from. */
export interface E2eJourneyGraphRoots {
  churchIds: readonly string[];
  userIds: readonly string[];
}

export interface ResolveJourneyRootsInput extends JourneyIdentityInput {
  rootKinds: E2eJourneyRootKinds;
}

/**
 * Resolves root kinds through `journeySeedId`, so a root is always an id of
 * this journey's own graph: a recipe cannot name a shared persona or another
 * journey's Church as something to purge.
 */
export function resolveJourneyRoots({
  recipeName,
  journeyKey,
  rootKinds,
}: ResolveJourneyRootsInput): E2eJourneyGraphRoots {
  return {
    churchIds: rootKinds.churchKinds.map((kind) =>
      journeySeedId({ recipeName, journeyKey, kind }),
    ),
    userIds: rootKinds.userKinds.map((kind) =>
      journeySeedId({ recipeName, journeyKey, kind }),
    ),
  };
}
