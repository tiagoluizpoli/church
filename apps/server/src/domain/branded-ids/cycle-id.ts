import type { BrandedId } from '@church/core';

export type CycleId = BrandedId<'CycleId'>;
export namespace CycleId {
  export function from(raw: string): CycleId {
    return raw as CycleId;
  }
}
