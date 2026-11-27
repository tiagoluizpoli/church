import { invitationVerificationCode } from '@church/db';
import { addMilliseconds, fromDate, toDate } from '@church/time';
import { and, eq, gt, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type {
  ClaimVerificationCodeDeliveryInput,
  ConsumeVerificationCodeIfValidInput,
  FindRedemptionOutcomeInput,
  FindVerificationCodeInput,
  InvitationVerificationCodeRepository,
  RecordFailedVerificationAttemptIfAllowedInput,
  RecordRedemptionOutcomeInput,
  ReleaseVerificationCodeDeliveryClaimInput,
} from '../../domain/contracts/infrastructure/invitation-verification-code.repository';
import type { VerificationCodeState } from '../../domain/entities/invitation-verification-code';
import {
  type StoredRedemption,
  storedRedemptionSchema,
} from '../../domain/stored-redemption';
import type { AnyDrizzleDb } from './drizzle-db.types';
import type {
  DrizzleInvitationVerificationCodeRepositoryInput,
  MapVerificationCodeInput,
} from './drizzle-invitation-verification-code.repository.types';
import { getClient } from './helpers';

export class DrizzleInvitationVerificationCodeRepository
  implements InvitationVerificationCodeRepository
{
  constructor({
    db,
    config,
  }: DrizzleInvitationVerificationCodeRepositoryInput) {
    this.db = db;
    const { verificationCode } = config;
    this.resendCooldownMs = verificationCode.resendCooldownMs;
    this.maxAttempts = verificationCode.maxAttempts;
  }

  private readonly db: AnyDrizzleDb;
  private readonly resendCooldownMs: number;
  private readonly maxAttempts: number;

  async find({
    churchInvitationId,
  }: FindVerificationCodeInput): Promise<VerificationCodeState | null> {
    const [row] = await this.db
      .select()
      .from(invitationVerificationCode)
      .where(
        eq(invitationVerificationCode.churchInvitationId, churchInvitationId),
      )
      .limit(1);
    return row ? mapVerificationCode({ row }) : null;
  }

  async claimDelivery({
    churchInvitationId,
    codeHash,
    expiresAt,
    sentAt,
  }: ClaimVerificationCodeDeliveryInput): Promise<boolean> {
    const resendEligibleAtInstant = addMilliseconds({
      instant: fromDate({ date: sentAt }),
      milliseconds: -this.resendCooldownMs,
    });
    const resendEligibleAt = toDate({ instant: resendEligibleAtInstant });
    const [row] = await this.db
      .insert(invitationVerificationCode)
      .values({
        churchInvitationId,
        codeHash,
        expiresAt,
        lastSentAt: sentAt,
        failedAttempts: 0,
        consumedAt: null,
        redemptionIdempotencyKey: null,
        redemptionOutcome: null,
      })
      .onConflictDoUpdate({
        target: invitationVerificationCode.churchInvitationId,
        set: {
          codeHash,
          expiresAt,
          lastSentAt: sentAt,
          // failedAttempts is kept: a resend never refills the attempt budget.
          consumedAt: null,
          redemptionIdempotencyKey: null,
          redemptionOutcome: null,
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
    churchInvitationId,
    codeHash,
    sentAt,
  }: ReleaseVerificationCodeDeliveryClaimInput): Promise<void> {
    await this.db
      .delete(invitationVerificationCode)
      .where(
        and(
          eq(invitationVerificationCode.churchInvitationId, churchInvitationId),
          eq(invitationVerificationCode.codeHash, codeHash),
          eq(invitationVerificationCode.lastSentAt, sentAt),
        ),
      );
  }

  async consumeIfValid({
    churchInvitationId,
    candidateHash,
    consumedAt,
    now,
    redemptionIdempotencyKey,
  }: ConsumeVerificationCodeIfValidInput): Promise<boolean> {
    const [row] = await this.db
      .update(invitationVerificationCode)
      .set({ consumedAt, redemptionIdempotencyKey })
      .where(
        and(
          eq(invitationVerificationCode.churchInvitationId, churchInvitationId),
          eq(invitationVerificationCode.codeHash, candidateHash),
          isNull(invitationVerificationCode.consumedAt),
          gt(invitationVerificationCode.expiresAt, now),
          lt(invitationVerificationCode.failedAttempts, this.maxAttempts),
        ),
      )
      .returning({ id: invitationVerificationCode.id });
    return row != null;
  }

  async recordRedemptionOutcome({
    churchInvitationId,
    redemptionIdempotencyKey,
    outcome,
    tx,
  }: RecordRedemptionOutcomeInput): Promise<void> {
    await getClient({ db: this.db, tx })
      .update(invitationVerificationCode)
      .set({ redemptionOutcome: outcome })
      .where(
        and(
          eq(invitationVerificationCode.churchInvitationId, churchInvitationId),
          eq(
            invitationVerificationCode.redemptionIdempotencyKey,
            redemptionIdempotencyKey,
          ),
        ),
      );
  }

  async findRedemptionOutcome({
    churchInvitationId,
    redemptionIdempotencyKey,
  }: FindRedemptionOutcomeInput): Promise<StoredRedemption | null> {
    const [row] = await this.db
      .select({ outcome: invitationVerificationCode.redemptionOutcome })
      .from(invitationVerificationCode)
      .where(
        and(
          eq(invitationVerificationCode.churchInvitationId, churchInvitationId),
          eq(
            invitationVerificationCode.redemptionIdempotencyKey,
            redemptionIdempotencyKey,
          ),
        ),
      )
      .limit(1);
    return row?.outcome ? storedRedemptionSchema.parse(row.outcome) : null;
  }

  async recordFailedAttemptIfAllowed({
    churchInvitationId,
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
          eq(invitationVerificationCode.churchInvitationId, churchInvitationId),
          ne(invitationVerificationCode.codeHash, candidateHash),
          isNull(invitationVerificationCode.consumedAt),
          gt(invitationVerificationCode.expiresAt, now),
          lt(invitationVerificationCode.failedAttempts, this.maxAttempts),
        ),
      )
      .returning({ id: invitationVerificationCode.id });
    return row != null;
  }
}

function mapVerificationCode({
  row,
}: MapVerificationCodeInput): VerificationCodeState {
  return {
    codeHash: row.codeHash,
    expiresAt: fromDate({ date: row.expiresAt }),
    failedAttempts: row.failedAttempts,
    consumedAt: row.consumedAt ? fromDate({ date: row.consumedAt }) : null,
    redemptionIdempotencyKey: row.redemptionIdempotencyKey,
    lastSentAt: fromDate({ date: row.lastSentAt }),
  };
}
