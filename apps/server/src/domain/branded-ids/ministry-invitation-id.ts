import type { BrandedId } from '@church/core';

export type MinistryInvitationId = BrandedId<'MinistryInvitationId'>;
export namespace MinistryInvitationId {
  export function from(raw: string): MinistryInvitationId {
    return raw as MinistryInvitationId;
  }
}
