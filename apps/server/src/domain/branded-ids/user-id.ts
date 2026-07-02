import type { BrandedId } from '@church/core';

export type UserId = BrandedId<'UserId'>;
export namespace UserId {
  export function from(raw: string): UserId {
    return raw as UserId;
  }
}
