import type { BrandedId } from '@church/core';

export type MinistryServingProfileId = BrandedId<'MinistryServingProfileId'>;
export namespace MinistryServingProfileId {
  export function from(raw: string): MinistryServingProfileId {
    return raw as MinistryServingProfileId;
  }
}
