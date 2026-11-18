import type { BrandedId } from '@church/core';

export type ChurchId = BrandedId<'ChurchId'>;
export namespace ChurchId {
  export function from(raw: string): ChurchId {
    return raw as ChurchId;
  }
}
