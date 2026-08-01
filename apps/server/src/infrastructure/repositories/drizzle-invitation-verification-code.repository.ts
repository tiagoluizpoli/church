import { invitationVerificationCode } from '@church/db';
import { and, eq, gt, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type {
  ClaimVerificationCodeDeliveryInput,
  ConsumeVerificationCodeIfValidInput,
  FindVerificationCodeInput,
  InvitationVerificationCodeRepository,
  RecordFailedVerificationAttemptIfAllowedInput,
  ReleaseVerificationCodeDeliveryClaimInput,
} from '../../domain/contracts/infrastructure/invitation-verification-code.repository';
import {
  VERIFICATION_CODE_MAX_ATTEMPTS,
  VERIFICATION_CODE_RESEND_COOLDOWN_MS,
  type VerificationCodeState,
} from '../../domain/entities/invitation-verification-code';
import type { AnyDrizzleDb } from './types';

interface DrizzleInvitationVerificationCodeRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleInvitationVerificationCodeRepository
  implements InvitationVerificationCodeRepository
{
  constructor({ db }: DrizzleInvitationVerificationCodeRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async find({
    ministryInvitationId,
  }: FindVerificationCodeInput): Promise<VerificationCodeState | null> {
    const [row] = await this.db
      .select()
      .from(invitationVerificationCode)
      .where(
        eq(
          invitationVerificationCode.ministryInvitationId,
          ministryInvitationId,
        ),
      )
      .limit(1);
    return row ? mapVerificationCode({ row }) : null;
  }

  async claimDelivery({
    ministryInvitationId,
    codeHash,
    expiresAt,
    sentAt,
  }: ClaimVerificationCodeDeliveryInput): Promise<boolean> {
    const resendEligibleAt = new Date(
      sentAt.getTime() - VERIFICATION_CODE_RESEND_COOLDOWN_MS,
    );
    const [row] = await this.db
      .insert(invitationVerificationCode)
      .values({
        ministryInvitationId,
        codeHash,
        expiresAt,
        lastSentAt: sentAt,
        failedAttempts: 0,
        consumedAt: null,
      })
      .onConflictDoUpdate({
        target: invitationVerificationCode.ministryInvitationId,
        set: {
          codeHash,
          expiresAt,
          lastSentAt: sentAt,
          failedAttempts: 0,
          consumedAt: null,
        },
        where: or(
          isNull(invitationVerificationCode.lastSentAt),
          lt(invitationVerificationCode.lastSentAt, resendEligibleAt),
          eq(invitationVerificationCode.lastSentAt, resendEligibleAt),
        ),
      })
      .returning({ id: invitationVerificationCode.id });
    return row != null;
  }

  async releaseDeliveryClaim({
    ministryInvitationId,
    codeHash,
    sentAt,
  }: ReleaseVerificationCodeDeliveryClaimInput): Promise<void> {
    await this.db
      .delete(invitationVerificationCode)
      .where(
        and(
          eq(
            invitationVerificationCode.ministryInvitationId,
            ministryInvitationId,
          ),
          eq(invitationVerificationCode.codeHash, codeHash),
          eq(invitationVerificationCode.lastSentAt, sentAt),
        ),
      );
  }

  async consumeIfValid({
    ministryInvitationId,
    candidateHash,
    consumedAt,
    now,
  }: ConsumeVerificationCodeIfValidInput): Promise<boolean> {
    const [row] = await this.db
      .update(invitationVerificationCode)
      .set({ consumedAt })
      .where(
        and(
          eq(
            invitationVerificationCode.ministryInvitationId,
            ministryInvitationId,
          ),
          eq(invitationVerificationCode.codeHash, candidateHash),
          isNull(invitationVerificationCode.consumedAt),
          gt(invitationVerificationCode.expiresAt, now),
          lt(
            invitationVerificationCode.failedAttempts,
            VERIFICATION_CODE_MAX_ATTEMPTS,
          ),
        ),
      )
      .returning({ id: invitationVerificationCode.id });
    return row != null;
  }

  async recordFailedAttemptIfAllowed({
    ministryInvitationId,
    candidateHash,
    now,
  }: RecordFailedVerificationAttemptIfAllowedInput): Promise<boolean> {
    const [row] = await this.db
      .update(invitationVerificationCode)
      .set({
        failedAttempts: sql`${invitationVerificationCode.failedAttempts} + 1`,
      })
      .where(
        and(
          eq(
            invitationVerificationCode.ministryInvitationId,
            ministryInvitationId,
          ),
          ne(invitationVerificationCode.codeHash, candidateHash),
          isNull(invitationVerificationCode.consumedAt),
          gt(invitationVerificationCode.expiresAt, now),
          lt(
            invitationVerificationCode.failedAttempts,
            VERIFICATION_CODE_MAX_ATTEMPTS,
          ),
        ),
      )
      .returning({ id: invitationVerificationCode.id });
    return row != null;
  }
}

type InvitationVerificationCodeRow =
  typeof invitationVerificationCode.$inferSelect;

interface MapVerificationCodeInput {
  row: InvitationVerificationCodeRow;
}

function mapVerificationCode({
  row,
}: MapVerificationCodeInput): VerificationCodeState {
  return {
    codeHash: row.codeHash,
    expiresAt: row.expiresAt,
    failedAttempts: row.failedAttempts,
    consumedAt: row.consumedAt,
    lastSentAt: row.lastSentAt,
  };
}
