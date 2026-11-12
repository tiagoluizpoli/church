import { createHash } from 'node:crypto';
import { fromDate } from '@church/time';
import type { RedemptionBundle } from '../entities/redemption-bundle';

export interface ReviewTokenForInput {
  bundle: RedemptionBundle;
}

/**
 * The review-consistency token (ADR 0011): a fingerprint of the grant facts a
 * recipient reviewed. Acceptance recomputes it under lock and grants nothing
 * when it differs, so any added, removed, expired or changed grant needs a
 * fresh review. Names are display only and stay out of it.
 */
export function reviewTokenFor({ bundle }: ReviewTokenForInput): string {
  const ministries = bundle.ministries
    .map((half) => [
      half.ministryInvitationId,
      half.ministryId,
      half.ministryAccessLevel,
      [...half.roleIds].sort(),
      String(fromDate({ date: half.expiresAt })),
    ])
    .sort(([left], [right]) => String(left).localeCompare(String(right)));
  const facts = JSON.stringify([bundle.churchAccessLevel, ministries]);
  return createHash('sha256').update(facts).digest('base64url');
}
