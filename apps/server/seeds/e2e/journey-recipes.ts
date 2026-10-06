import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  type E2eJourneyRecipeName,
} from './journey-keys';
import type { E2eJourneyRecipe } from './journey-recipe';

export type E2eJourneyRecipeFactory = (
  input: CreateJourneyRecipeInput,
) => E2eJourneyRecipe<unknown>;

/**
 * Every journey recipe the E2E loader can run, by name. Each entry imports
 * its recipe on demand: a recipe pulls in `@church/db`, whose entry validates
 * the server environment and opens a pool, and the loader must refuse a
 * wrong target before that happens.
 */
export const E2E_JOURNEY_RECIPES: Record<
  E2eJourneyRecipeName,
  () => Promise<E2eJourneyRecipeFactory>
> = {
  [E2E_JOURNEY_RECIPE_NAMES.volunteerAssignments]: async () =>
    (await import('./recipes/volunteer-assignments'))
      .createVolunteerAssignmentsRecipe,
};
