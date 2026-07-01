import type { BrandedId } from '@church/core';

export type AvailabilityId = BrandedId<'AvailabilityId'>;
export namespace AvailabilityId {
  export function from(raw: string): AvailabilityId {
    return raw as AvailabilityId;
  }
}
