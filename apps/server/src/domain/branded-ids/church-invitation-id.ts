import type { BrandedId } from '@church/core';

export type ChurchInvitationId = BrandedId<'ChurchInvitationId'>;
export namespace ChurchInvitationId {
  export function from(raw: string): ChurchInvitationId {
    return raw as ChurchInvitationId;
  }
}
