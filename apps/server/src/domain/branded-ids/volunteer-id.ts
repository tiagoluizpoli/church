import type { BrandedId } from '@church/core';

export type VolunteerId = BrandedId<'VolunteerId'>;
export namespace VolunteerId {
  export function from(raw: string): VolunteerId {
    return raw as VolunteerId;
  }
}
