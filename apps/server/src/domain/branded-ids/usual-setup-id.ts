import type { BrandedId } from '@church/core';

export type UsualSetupId = BrandedId<'UsualSetupId'>;
export namespace UsualSetupId {
  export function from(raw: string): UsualSetupId {
    return raw as UsualSetupId;
  }
}
