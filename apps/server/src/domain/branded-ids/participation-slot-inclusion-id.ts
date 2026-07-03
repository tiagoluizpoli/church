import type { BrandedId } from '@church/core';

export type ParticipationSlotInclusionId =
  BrandedId<'ParticipationSlotInclusionId'>;
export namespace ParticipationSlotInclusionId {
  export function from(raw: string): ParticipationSlotInclusionId {
    return raw as ParticipationSlotInclusionId;
  }
}
