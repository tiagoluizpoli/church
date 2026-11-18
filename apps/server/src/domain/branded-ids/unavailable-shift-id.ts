import type { BrandedId } from '@church/core';

export type UnavailableShiftId = BrandedId<'UnavailableShiftId'>;
export namespace UnavailableShiftId {
  export function from(raw: string): UnavailableShiftId {
    return raw as UnavailableShiftId;
  }
}
