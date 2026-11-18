import type { BrandedId } from '@church/core';

export type AvailabilityCheckId = BrandedId<'AvailabilityCheckId'>;
export namespace AvailabilityCheckId {
  export function from(raw: string): AvailabilityCheckId {
    return raw as AvailabilityCheckId;
  }
}
