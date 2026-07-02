import type { BrandedId } from '@church/core';

export type VolunteerNotificationId = BrandedId<'VolunteerNotificationId'>;
export namespace VolunteerNotificationId {
  export function from(raw: string): VolunteerNotificationId {
    return raw as VolunteerNotificationId;
  }
}
