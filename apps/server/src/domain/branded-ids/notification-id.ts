import type { BrandedId } from '@church/core';

export type NotificationId = BrandedId<'NotificationId'>;
export namespace NotificationId {
  export function from(raw: string): NotificationId {
    return raw as NotificationId;
  }
}
