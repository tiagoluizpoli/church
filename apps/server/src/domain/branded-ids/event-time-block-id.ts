import type { BrandedId } from '@church/core';

export type EventTimeBlockId = BrandedId<'EventTimeBlockId'>;
export namespace EventTimeBlockId {
  export function from(raw: string): EventTimeBlockId {
    return raw as EventTimeBlockId;
  }
}
