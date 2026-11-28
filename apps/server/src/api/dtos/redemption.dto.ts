import { fromDate, instantSchema } from '@church/time';
import { z } from 'zod';
import { CHURCH_ACCESS_LEVEL_OPTIONS } from '../../domain/authority/types';
import type {
  AuthenticatedInvitationStatus,
  ChurchInvitationReviewStatus,
  PublicRedemptionPreview,
} from '../../domain/contracts/application/redemption-manager';
import type { TransferPreview } from '../../domain/contracts/application/volunteer-transfer-manager';
import type { RedemptionBundleMinistry } from '../../domain/entities/redemption-bundle';
import { idSchema } from './id.dto';

const ministryAccessLevelValues = ['volunteer', 'leader'] as const;
const terminalFailureReasons = [
  'INVITATION_UNAVAILABLE',
  'VERIFICATION_FAILED',
  'IDENTITY_FAILED',
] as const;

export const redemptionParamsSchema = z.object({
  invitationId: idSchema,
});

export const redeemNewUserBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  password: z.string().min(8),
  code: z.string().regex(/^\d{6}$/),
  idempotencyKey: idSchema,
});

export const unavailableRedemptionResponseSchema = z.object({
  error: z.literal('INVITATION_UNAVAILABLE'),
  message: z.string(),
});

export const rateLimitedResponseSchema = z.object({
  error: z.literal('RATE_LIMITED'),
  message: z.string(),
});

/** The Ministry half a paired Church Invitation also grants. */
export const redemptionPreviewMinistrySchema = z.object({
  invitationId: idSchema,
  name: z.string(),
  ministryAccessLevel: z.enum(ministryAccessLevelValues),
  roleNames: z.array(z.string()),
});

/** A plain Church Invitation (such as the first-admin one) has no `ministry`. */
export const redemptionPreviewResponseSchema = z.object({
  email: z.string().email(),
  churchName: z.string(),
  churchAccessLevel: z.enum(CHURCH_ACCESS_LEVEL_OPTIONS),
  expiresAt: instantSchema,
  /** The newest pending half, kept for older clients; `ministries` is the full list. */
  ministry: redemptionPreviewMinistrySchema.optional(),
  /** Every still-pending, unexpired Ministry half that accepting grants. */
  ministries: z.array(redemptionPreviewMinistrySchema),
});

export const verificationCodeRequestedResponseSchema = z.object({
  status: z.literal('sent'),
});

/** Non-production-only: hands back the code the capture-mode sender recorded, so an E2E run can complete a flow it would otherwise never observe a hashed-at-rest code for. */
export const debugVerificationCodeResponseSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

/** Non-production-only: the joining link the capture-mode sender recorded for an address. */
export const debugInvitationLinkQuerystringSchema = z.object({
  email: z.string().email(),
});

export const debugInvitationLinkResponseSchema = z.object({
  redemptionUrl: z.string().url(),
});

/**
 * Spec §7.5's cross-Church split: Church Membership succeeded, the Ministry
 * half was refused by name, and both Churches are named so the result screen
 * can offer a Volunteer Transfer against the still-`pending` invitation.
 */
export const churchOnlyOutcomeSchema = z.object({
  kind: z.literal('church-only'),
  sourceChurchName: z.string(),
  destinationChurchId: z.string(),
  destinationChurchName: z.string(),
  ministryInvitationId: idSchema,
  ministryName: z.string(),
});

/**
 * New-person joins roll back fully, so identity failure is retryable there.
 * A plain join admits no Volunteer, so its success carries a null id.
 */
export const redemptionOutcomeResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('full-success'),
    volunteerId: z.string().nullable(),
  }),
  churchOnlyOutcomeSchema,
  z.object({
    kind: z.literal('retryable-failure'),
    reason: z.enum(['IDENTITY_FAILED', 'MINISTRY_ACCEPTANCE_FAILED']),
  }),
  z.object({
    kind: z.literal('terminal-failure'),
    reason: z.enum([
      'INVITATION_UNAVAILABLE',
      'VERIFICATION_FAILED',
      'EMAIL_ALREADY_REGISTERED',
    ]),
  }),
]);

export const unauthorizedResponseSchema = z.object({
  error: z.literal('UNAUTHORIZED'),
  message: z.string(),
});

/** Post-authentication lifecycle for an existing Church Member's Ministry Invitation (spec §7.3). */
/** One Ministry grant of the signed-in review. */
export const reviewedMinistrySchema = z.object({
  invitationId: z.string(),
  ministryName: z.string(),
  ministryAccessLevel: z.enum(ministryAccessLevelValues),
  roleNames: z.array(z.string()),
  inviterName: z.string(),
  expiresAt: instantSchema,
});

export const authenticatedInvitationStatusResponseSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.literal('redeemable'),
      invitationKind: z.enum(['ministry-only', 'chained']),
      email: z.string().email(),
      churchName: z.string(),
      ministryName: z.string(),
      ministryAccessLevel: z.enum(ministryAccessLevelValues),
      roleNames: z.array(z.string()),
      expiresAt: instantSchema,
      /** The Church Access Level this acceptance grants; null when the Church Membership already exists. */
      churchAccessLevel: z.enum(CHURCH_ACCESS_LEVEL_OPTIONS).nullable(),
      /** Every Ministry this one acceptance joins, oldest first. */
      ministries: z.array(reviewedMinistrySchema),
      /** Echo it on accept: a changed offer is refused without any grant. */
      reviewToken: z.string(),
    }),
    z.object({ kind: z.literal('already-accepted'), churchId: z.string() }),
    z.object({
      kind: z.literal('identity-mismatch'),
      maskedEmail: z.string(),
    }),
    z.object({ kind: z.literal('unavailable') }),
  ],
);

export const acceptExistingMemberBodySchema = z.object({
  idempotencyKey: idSchema,
  /** The `reviewToken` of the reviewed status; a changed offer is refused. */
  reviewToken: z.string().min(1),
});

export const existingMemberOutcomeResponseSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('full-success'), volunteerId: z.string() }),
    z.object({ kind: z.literal('offer-changed') }),
    churchOnlyOutcomeSchema,
    z.object({ kind: z.literal('already-accepted'), churchId: z.string() }),
    z.object({ kind: z.literal('identity-mismatch') }),
    z.object({
      kind: z.literal('retryable-failure'),
      reason: z.literal('MINISTRY_ACCEPTANCE_FAILED'),
    }),
    z.object({
      kind: z.literal('terminal-failure'),
      reason: z.enum(terminalFailureReasons),
    }),
  ],
);

/** The signed-in review of a Church Invitation; `paired` defers to the Ministry review. */
export const churchInvitationReviewStatusResponseSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.literal('redeemable'),
      churchName: z.string(),
      email: z.string().email(),
      churchAccessLevel: z.enum(CHURCH_ACCESS_LEVEL_OPTIONS),
      expiresAt: instantSchema,
      /** Echo it on accept: a changed offer is refused without any grant. */
      reviewToken: z.string(),
    }),
    z.object({
      kind: z.literal('paired'),
      /** The oldest pending Ministry half, whose review covers the whole offer. */
      ministryInvitationId: idSchema,
    }),
    z.object({ kind: z.literal('already-accepted'), churchId: z.string() }),
    z.object({
      kind: z.literal('identity-mismatch'),
      maskedEmail: z.string(),
    }),
    z.object({ kind: z.literal('unavailable') }),
  ],
);

export const churchInvitationAcceptOutcomeResponseSchema = z.discriminatedUnion(
  'kind',
  [
    /** The Church Membership was granted; `churchId` is now the Active Church. */
    z.object({ kind: z.literal('full-success'), churchId: z.string() }),
    z.object({ kind: z.literal('offer-changed') }),
    z.object({ kind: z.literal('already-accepted'), churchId: z.string() }),
    z.object({
      kind: z.literal('identity-mismatch'),
      maskedEmail: z.string(),
    }),
    z.object({
      kind: z.literal('retryable-failure'),
      reason: z.literal('IDENTITY_FAILED'),
    }),
    z.object({
      kind: z.literal('terminal-failure'),
      reason: z.enum(['INVITATION_UNAVAILABLE', 'IDENTITY_FAILED']),
    }),
  ],
);

export const declineOutcomeResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('declined') }),
  z.object({ kind: z.literal('identity-mismatch') }),
  z.object({
    kind: z.literal('terminal-failure'),
    /** Superset of the two reasons decline can actually return — kept in sync with the other outcome schemas' list rather than a second hand-typed one. */
    reason: z.enum(terminalFailureReasons),
  }),
]);

/** The public Church decline can only succeed; unavailable is a 404. */
export const publicDeclineResponseSchema = z.object({
  kind: z.literal('declined'),
});

/* ── Volunteer Transfer (spec §8) ─────────────────────────────────────── */

/** Layer 2 review data — the actual affected rows (spec §8.7). */
export const transferPreviewResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('reviewable'),
    sourceChurchName: z.string(),
    destinationChurchName: z.string(),
    endedMemberships: z.array(z.object({ ministryName: z.string() })),
    withdrawnAssignments: z.array(
      z.object({
        eventName: z.string(),
        eventTimeBlockStart: instantSchema,
        roleName: z.string(),
      }),
    ),
  }),
  z.object({ kind: z.literal('unavailable') }),
  z.object({ kind: z.literal('identity-mismatch') }),
  z.object({ kind: z.literal('no-transfer-needed') }),
]);

export const confirmTransferBodySchema = z.object({
  destinationChurchName: z.string().min(1),
  password: z.string().min(8),
  idempotencyKey: idSchema,
});

const transferTerminalReasons = [
  'INVITATION_UNAVAILABLE',
  'NO_TRANSFER_NEEDED',
] as const;

export const confirmTransferOutcomeResponseSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.literal('transferred'),
      destinationVolunteerId: z.string(),
    }),
    z.object({
      kind: z.literal('already-transferred'),
      destinationVolunteerId: z.string(),
    }),
    z.object({ kind: z.literal('password-mismatch') }),
    z.object({ kind: z.literal('name-mismatch') }),
    z.object({ kind: z.literal('identity-mismatch') }),
    z.object({
      kind: z.literal('terminal-failure'),
      reason: z.enum(transferTerminalReasons),
    }),
  ],
);

/** One Ministry grant of the signed-in review; internal ids stay server-side. */
function toReviewedMinistry(half: RedemptionBundleMinistry) {
  return {
    invitationId: half.ministryInvitationId,
    ministryName: half.ministryName,
    ministryAccessLevel: half.ministryAccessLevel,
    roleNames: half.roleNames,
    inviterName: half.inviterName,
    expiresAt: fromDate({ date: half.expiresAt }),
  };
}

export const redemptionMapper = {
  /** The public Church Invitation preview: the Ministry block only for a paired invitation. */
  publicPreviewToResponse(preview: PublicRedemptionPreview) {
    // The public preview names the newest pending half; redemption grants them all.
    const ministries = preview.ministries.map((half) => ({
      invitationId: half.ministryInvitationId,
      name: half.ministryName,
      ministryAccessLevel: half.ministryAccessLevel,
      roleNames: half.roleNames,
    }));
    return {
      email: preview.email,
      churchName: preview.churchName,
      churchAccessLevel: preview.churchAccessLevel,
      expiresAt: fromDate({ date: preview.expiresAt }),
      ...(ministries[0] ? { ministry: ministries[0] } : {}),
      ministries,
    };
  },

  churchReviewStatusToResponse(status: ChurchInvitationReviewStatus) {
    if (status.kind !== 'redeemable') return status;
    return { ...status, expiresAt: fromDate({ date: status.expiresAt }) };
  },

  /** The existing-member review exposes a restricted field set (spec §7.1). */
  ministryInvitationStatusToResponse(status: AuthenticatedInvitationStatus) {
    if (status.kind !== 'redeemable') return status;
    return {
      kind: status.kind,
      invitationKind: status.invitationKind,
      email: status.email,
      churchName: status.churchName,
      ministryName: status.ministryName,
      ministryAccessLevel: status.ministryAccessLevel,
      roleNames: status.roleNames,
      expiresAt: fromDate({ date: status.expiresAt }),
      churchAccessLevel: status.churchAccessLevel,
      ministries: status.ministries.map(toReviewedMinistry),
      reviewToken: status.reviewToken,
    };
  },

  transferPreviewToResponse(preview: TransferPreview) {
    if (preview.kind !== 'reviewable') return preview;
    return {
      kind: preview.kind,
      sourceChurchName: preview.sourceChurchName,
      destinationChurchName: preview.destinationChurchName,
      endedMemberships: preview.endedMemberships,
      withdrawnAssignments: preview.withdrawnAssignments.map((assignment) => ({
        eventName: assignment.eventName,
        eventTimeBlockStart: fromDate({ date: assignment.eventTimeBlockStart }),
        roleName: assignment.roleName,
      })),
    };
  },
};
