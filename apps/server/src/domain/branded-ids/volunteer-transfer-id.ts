import type { BrandedId } from '@church/core';

export type VolunteerTransferId = BrandedId<'VolunteerTransferId'>;
export namespace VolunteerTransferId {
  export function from(raw: string): VolunteerTransferId {
    return raw as VolunteerTransferId;
  }
}
