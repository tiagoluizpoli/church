import { organization, user } from '@church/db';
import { inArray } from 'drizzle-orm';
import type { SeedRecipe, SeedWriter } from '../recipe';
import type {
  E2eJourneyGraphRoots,
  E2eJourneyRecipeName,
} from './journey-keys';

/**
 * A journey-owned E2E graph (#327): its own Church and personas, derived
 * from one journey key, so concurrent Playwright tests never share a mutable
 * row. `roots` (from `resolveJourneyRoots`) is known before `load` runs,
 * which is what lets a reload replace whatever a failed or retried attempt
 * left behind. `load` must write nothing that does not hang from the roots;
 * the recipe contract suite checks it for every registered recipe.
 */
export interface E2eJourneyRecipe<TResult> extends SeedRecipe<TResult> {
  name: E2eJourneyRecipeName;
  roots: E2eJourneyGraphRoots;
}

interface PurgeJourneyGraphInput {
  db: SeedWriter;
  roots: E2eJourneyGraphRoots;
}

async function purgeJourneyGraph({
  db,
  roots,
}: PurgeJourneyGraphInput): Promise<void> {
  if (roots.churchIds.length > 0) {
    await db
      .delete(organization)
      .where(inArray(organization.id, [...roots.churchIds]));
  }
  if (roots.userIds.length > 0) {
    await db.delete(user).where(inArray(user.id, [...roots.userIds]));
  }
}

export interface RunE2eJourneyRecipeInput<TResult> {
  db: SeedWriter;
  recipe: E2eJourneyRecipe<TResult>;
}

/**
 * (Re)creates a journey graph in one transaction: deletes the graph its
 * roots name, then loads it fresh. A first load, a retry after a failed
 * attempt, and a reload over a graph the journey mutated all end in the
 * recipe's starting state; a failure rolls back both steps, so the previous
 * graph survives intact.
 *
 * Callers resolve `db` to the E2E target before calling (the loader uses
 * `getE2eDatabaseUrl`, which refuses every other target).
 */
export async function runE2eJourneyRecipe<TResult>({
  db,
  recipe,
}: RunE2eJourneyRecipeInput<TResult>): Promise<TResult> {
  return await db.transaction(async (tx) => {
    await purgeJourneyGraph({ db: tx, roots: recipe.roots });
    return await recipe.load({ db: tx });
  });
}
