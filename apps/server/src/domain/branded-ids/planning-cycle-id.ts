import type { BrandedId } from '@church/core';

export type PlanningCycleId = BrandedId<'PlanningCycleId'>;
export namespace PlanningCycleId {
  export function from(raw: string): PlanningCycleId {
    return raw as PlanningCycleId;
  }
}
