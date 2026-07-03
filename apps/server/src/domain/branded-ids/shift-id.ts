import type { BrandedId } from '@church/core';

export type ShiftId = BrandedId<'ShiftId'>;
export namespace ShiftId {
  export function from(raw: string): ShiftId {
    return raw as ShiftId;
  }
}
