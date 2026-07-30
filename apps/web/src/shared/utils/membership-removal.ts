import { z } from 'zod';

/** Extends a route's own search schema with the former-Church-name param a removal redirect carries. */
export const removedFromSearchSchema = z.object({
  removedFrom: z.string().optional(),
});

/**
 * Split so JSX call sites can bold the Church name in place
 * (`{MEMBERSHIP_REMOVED_PREFIX}<strong>{churchName}</strong>{MEMBERSHIP_REMOVED_SUFFIX}`)
 * while plain-text call sites (toasts) use `membershipRemovedMessage` below —
 * one shared wording, never who removed the caller — spec.md §1.5.
 */
export const MEMBERSHIP_REMOVED_PREFIX = 'You no longer have access to ';
export const MEMBERSHIP_REMOVED_SUFFIX =
  '. Your Church Membership was removed.';

export interface MembershipRemovedMessageInput {
  churchName: string;
}

export function membershipRemovedMessage({
  churchName,
}: MembershipRemovedMessageInput): string {
  return `${MEMBERSHIP_REMOVED_PREFIX}${churchName}${MEMBERSHIP_REMOVED_SUFFIX}`;
}
