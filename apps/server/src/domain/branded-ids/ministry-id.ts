import type { BrandedId } from '@church/core';

export type MinistryId = BrandedId<'MinistryId'>;
export namespace MinistryId {
  export function from(raw: string): MinistryId {
    return raw as MinistryId;
  }
}
