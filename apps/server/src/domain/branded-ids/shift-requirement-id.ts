import type { BrandedId } from '@church/core';

export type ShiftRequirementId = BrandedId<'ShiftRequirementId'>;
interface ShiftRequirementIdInput {
  raw: string;
}

export namespace ShiftRequirementId {
  export function from({ raw }: ShiftRequirementIdInput): ShiftRequirementId {
    return raw as ShiftRequirementId;
  }
}
