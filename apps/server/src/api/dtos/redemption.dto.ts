import { z } from 'zod';

const ministryAccessLevelValues = ['volunteer', 'leader'] as const;
const terminalFailureReasons = [
  'INVITATION_UNAVAILABLE',
  'VERIFICATION_FAILED',
  'IDENTITY_FAILED',
] as const;

export const redemptionParamsSchema = z.object({
  invitationId: z.string().uuid(),
});

export const redeemNewUserBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  password: z.string().min(8),
  code: z.string().regex(/^\d{6}$/),
  idempotencyKey: z.string().uuid(),
});

export const unavailableRedemptionResponseSchema = z.object({
  error: z.literal('INVITATION_UNAVAILABLE'),
});

export const rateLimitedResponseSchema = z.object({
  error: z.literal('RATE_LIMITED'),
});

export const redemptionPreviewResponseSchema = z.object({
  email: z.string().email(),
  churchName: z.string(),
  ministryName: z.string(),
  ministryAccessLevel: z.enum(ministryAccessLevelValues),
  roleNames: z.array(z.string()),
  expiresAt: z.string(),
});

export const verificationCodeRequestedResponseSchema = z.object({
  status: z.literal('sent'),
});

export const redemptionOutcomeResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('full-success'), volunteerId: z.string() }),
  z.object({ kind: z.literal('church-only') }),
  z.object({
    kind: z.literal('retryable-failure'),
    reason: z.literal('MINISTRY_ACCEPTANCE_FAILED'),
  }),
  z.object({
    kind: z.literal('terminal-failure'),
    reason: z.enum(terminalFailureReasons),
  }),
]);
