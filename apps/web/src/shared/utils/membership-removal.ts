import { z } from 'zod';

/** Extends a route's own search schema with the former-Church-name param a removal redirect carries. */
export const removedFromSearchSchema = z.object({
  removedFrom: z.string().optional(),
});

export interface MembershipRemovedMessageInput {
  churchName: string;
}

/** Names the former Church, never who removed the caller — spec.md §1.5. */
export function membershipRemovedMessage({
  churchName,
}: MembershipRemovedMessageInput): string {
  return `You no longer have access to ${churchName}. Your Church Membership was removed.`;
}
