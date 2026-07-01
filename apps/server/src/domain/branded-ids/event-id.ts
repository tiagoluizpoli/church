import type { BrandedId } from '@church/core';

export type EventId = BrandedId<'EventId'>;
export namespace EventId {
  export function from(raw: string): EventId {
    return raw as EventId;
  }
}
