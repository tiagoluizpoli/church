import type { BrandedId } from '@church/core';

export type MinistryParticipationId = BrandedId<'MinistryParticipationId'>;
export namespace MinistryParticipationId {
  export function from(raw: string): MinistryParticipationId {
    return raw as MinistryParticipationId;
  }
}
