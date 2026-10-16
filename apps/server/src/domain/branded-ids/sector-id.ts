import type { BrandedId } from '@church/core';

export type SectorId = BrandedId<'SectorId'>;
export namespace SectorId {
  export function from(raw: string): SectorId {
    return raw as SectorId;
  }
}
