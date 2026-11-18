import type { BrandedId } from '@church/core';

export type ParticipationEventTimeBlockInclusionId =
  BrandedId<'ParticipationEventTimeBlockInclusionId'>;
export namespace ParticipationEventTimeBlockInclusionId {
  export function from(raw: string): ParticipationEventTimeBlockInclusionId {
    return raw as ParticipationEventTimeBlockInclusionId;
  }
}
