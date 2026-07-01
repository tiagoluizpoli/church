import type { BrandedId } from '@church/core';

export type TimeSlotId = BrandedId<'TimeSlotId'>;
export namespace TimeSlotId {
  export function from(raw: string): TimeSlotId {
    return raw as TimeSlotId;
  }
}
