import type { CalendarDay } from '@church/time';
import type { SeedRecipe } from '../recipe';
import {
  type MinimalChurchRecipeResult,
  minimalChurchRecipe,
} from './minimal-church';

export interface CreateDevelopmentRecipeInput {
  /** The day date-sensitive data is derived from; fixed for reproduction. */
  anchor: CalendarDay;
}

export interface DevelopmentRecipeResult extends MinimalChurchRecipeResult {
  anchor: CalendarDay;
}

/**
 * The scenario `db:reseed:dev` loads. Until the realistic directory lands it
 * is the minimal Church graph; the anchor is carried now so date-sensitive
 * data can derive from it without changing the command.
 */
export function createDevelopmentRecipe({
  anchor,
}: CreateDevelopmentRecipeInput): SeedRecipe<DevelopmentRecipeResult> {
  return {
    name: 'development',
    async load(input) {
      const minimalChurch = await minimalChurchRecipe.load(input);
      return { ...minimalChurch, anchor };
    },
  };
}
