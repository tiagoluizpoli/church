import type { BrandedId } from '@church/core';

export type ShiftRequirementId = BrandedId<'ShiftRequirementId'>;
export namespace ShiftRequirementId {
  export function from(raw: string): ShiftRequirementId {
    return raw as ShiftRequirementId;
  }
}
