import { m } from '@church/i18n/messages';
import { z } from 'zod';

/** Extends a route's own search schema with the former-Church-name param a removal redirect carries. */
export const removedFromSearchSchema = z.object({
  removedFrom: z.string().optional(),
});

export interface MembershipRemovedMessageInput {
  churchName: string;
}

export function membershipRemovedMessage({
  churchName,
}: MembershipRemovedMessageInput): string {
  return m.no_access_removed_from({ churchName });
}
