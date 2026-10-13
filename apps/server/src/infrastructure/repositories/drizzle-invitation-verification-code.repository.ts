import type { AppConfig } from '@church/app-config';
import { invitationVerificationCode } from '@church/db';
import { addMilliseconds, fromDate, toDate } from '@church/time';
import { and, eq, gt, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type {
  ClaimVerificationCodeDeliveryInput,
  ConsumeVerificationCodeIfValidInput,
  FindVerificationCodeInput,
  InvitationVerificationCodeRepository,
  RecordFailedVerificationAttemptIfAllowedInput,
  ReleaseVerificationCodeDeliveryClaimInput,
} from '../../domain/contracts/infrastructure/invitation-verification-code.repository';
import type { VerificationCodeState } from '../../domain/entities/invitation-verification-code';
import type { AnyDrizzleDb } from './types';

interface DrizzleInvitationVerificationCodeRepositoryInput {
  db: AnyDrizzleDb;
  config: AppConfig;
}

export class DrizzleInvitationVerificationCodeRepository
  implements InvitationVerificationCodeRepository
{
  constructor({
    db,
    config,
  }: DrizzleInvitationVerificationCodeRepositoryInput) {
    this.db = db;
    this.config = config;
  }

  private readonly db: AnyDrizzleDb;
  private readonly config: AppConfig;

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
    const { resendCooldownMs } = this.config.verificationCode;
    const resendEligibleAtInstant = addMilliseconds({
      instant: fromDate({ date: sentAt }),
      milliseconds: -resendCooldownMs,
    });
    const resendEligibleAt = toDate({ instant: resendEligibleAtInstant });
    const [row] = await this.db
      .insert(invitationVerificationCode)
      .values({
        ministryInvitationId,
        codeHash,
        expiresAt,
        lastSentAt: sentAt,
        failedAttempts: 0,
        consumedAt: null,
        redemptionIdempotencyKey: null,
      })
      .onConflictDoUpdate({
        target: invitationVerificationCode.ministryInvitationId,
        set: {
          codeHash,
          expiresAt,
          lastSentAt: sentAt,
          failedAttempts: 0,
          consumedAt: null,
          redemptionIdempotencyKey: null,
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
    redemptionIdempotencyKey,
  }: ConsumeVerificationCodeIfValidInput): Promise<boolean> {
    const { maxAttempts } = this.config.verificationCode;
    const [row] = await this.db
      .update(invitationVerificationCode)
      .set({ consumedAt, redemptionIdempotencyKey })
      .where(
        and(
          eq(
            invitationVerificationCode.ministryInvitationId,
            ministryInvitationId,
          ),
          eq(invitationVerificationCode.codeHash, candidateHash),
          isNull(invitationVerificationCode.consumedAt),
          gt(invitationVerificationCode.expiresAt, now),
          lt(invitationVerificationCode.failedAttempts, maxAttempts),
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
    const { maxAttempts } = this.config.verificationCode;
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
          lt(invitationVerificationCode.failedAttempts, maxAttempts),
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
    expiresAt: fromDate({ date: row.expiresAt }),
    failedAttempts: row.failedAttempts,
    consumedAt: row.consumedAt ? fromDate({ date: row.consumedAt }) : null,
    redemptionIdempotencyKey: row.redemptionIdempotencyKey,
    lastSentAt: fromDate({ date: row.lastSentAt }),
  };
}
