import type { BrandedId } from '@church/core';

export type TimeBlockId = BrandedId<'TimeBlockId'>;
export namespace TimeBlockId {
  export function from(raw: string): TimeBlockId {
    return raw as TimeBlockId;
  }
}
