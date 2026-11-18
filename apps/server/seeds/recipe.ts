import type { TenancyWriter } from '@church/db';

/** Every builder writes through the recipe's transaction, never the pooled db. */
export type SeedWriter = TenancyWriter;

/** The identifiers a recipe reports for each Church it seeded. */
export interface SeededChurchSummary {
  id: string;
  slug: string;
}

export interface SeedRecipeLoadInput {
  db: SeedWriter;
}

/**
 * A purpose-specific composition of the shared builders (ADR 0006). `load`
 * returns the graph's identifiers so consumers read them from the result
 * instead of repeating the blueprint's literals.
 */
export interface SeedRecipe<TResult> {
  name: string;
  load(input: SeedRecipeLoadInput): Promise<TResult>;
}

export interface RunSeedRecipeInput<TResult> {
  db: SeedWriter;
  recipe: SeedRecipe<TResult>;
}

/**
 * Loads a recipe in one transaction: a failure anywhere in the graph rolls
 * back every row it wrote, so no caller ever observes a partial graph.
 */
export async function runSeedRecipe<TResult>({
  db,
  recipe,
}: RunSeedRecipeInput<TResult>): Promise<TResult> {
  return await db.transaction(async (tx) => recipe.load({ db: tx }));
}
