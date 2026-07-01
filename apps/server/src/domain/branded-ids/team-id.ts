import type { BrandedId } from '@church/core';

export type TeamId = BrandedId<'TeamId'>;
export namespace TeamId {
  export function from(raw: string): TeamId {
    return raw as TeamId;
  }
}
