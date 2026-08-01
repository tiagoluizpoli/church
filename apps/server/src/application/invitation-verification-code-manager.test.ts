import { describe, expect, it } from 'vitest';
import {
  hashVerificationCode,
  InvitationVerificationCodeManager,
} from '../../src/application/invitation-verification-code-manager';
import { MinistryInvitationId } from '../../src/domain/branded-ids';
import type { EmailSender } from '../../src/domain/contracts/infrastructure/email-sender';
import type { InvitationVerificationCodeRepository } from '../../src/domain/contracts/infrastructure/invitation-verification-code.repository';
import type { VerificationCodeState } from '../../src/domain/entities/invitation-verification-code';
import { VerificationCodeError } from '../../src/domain/errors/verification-code-error';

interface TestHarness {
  manager: InvitationVerificationCodeManager;
  sent: unknown[];
  state: VerificationCodeState | null;
}

interface CreateHarnessInput {
  send?: () => Promise<void>;
}

function createHarness({ send }: CreateHarnessInput = {}): TestHarness {
  let state: VerificationCodeState | null = null;
  const sent: unknown[] = [];
  const repository: InvitationVerificationCodeRepository = {
    async find() {
      return state;
    },
    async claimDelivery({ codeHash, expiresAt, sentAt }) {
      if (state && sentAt.getTime() - state.lastSentAt.getTime() < 60_000) {
        return false;
      }
      state = {
        codeHash,
        expiresAt,
        lastSentAt: sentAt,
        failedAttempts: 0,
        consumedAt: null,
      };
      return true;
    },
    async releaseDeliveryClaim({ codeHash, sentAt }) {
      if (
        state?.codeHash === codeHash &&
        state.lastSentAt.getTime() === sentAt.getTime()
      ) {
        state = null;
      }
    },
    async consumeIfValid({ candidateHash, consumedAt, now }) {
      if (
        state?.codeHash === candidateHash &&
        !state.consumedAt &&
        state.expiresAt > now &&
        state.failedAttempts < 5
      ) {
        state.consumedAt = consumedAt;
        return true;
      }
      return false;
    },
    async recordFailedAttemptIfAllowed({ candidateHash, now }) {
      const currentState = state;
      if (
        currentState !== null &&
        currentState.codeHash !== candidateHash &&
        !currentState.consumedAt &&
        currentState.expiresAt > now &&
        currentState.failedAttempts < 5
      ) {
        currentState.failedAttempts += 1;
        return true;
      }
      return false;
    },
  };
  const emailSender: EmailSender = {
    async send({ payload }) {
      await send?.();
      sent.push(payload);
      return {};
    },
  };
  return {
    manager: new InvitationVerificationCodeManager({
      repository,
      emailSender,
      generateCode: () => '123456',
      verificationCodeSecret: 'test-secret',
    }),
    sent,
    get state() {
      return state;
    },
  };
}

describe('InvitationVerificationCodeManager', () => {
  it('uses the secret-keyed digest rather than an unkeyed code digest', () => {
    expect(
      hashVerificationCode({ code: '123456', secret: 'first-secret' }),
    ).not.toBe(
      hashVerificationCode({ code: '123456', secret: 'second-secret' }),
    );
  });

  it('hashes a code with its secret, sends it synchronously, and consumes it only once', async () => {
    const harness = createHarness();
    const invitationId = MinistryInvitationId.from(
      '00000000-0000-4000-8000-000000000001',
    );
    const now = new Date('2026-01-01T00:00:00.000Z');
    await harness.manager.issue({
      ministryInvitationId: invitationId,
      recipientEmail: 'invitee@example.test',
      churchName: 'Church',
      now,
    });
    expect(harness.state?.codeHash).not.toBe('123456');
    expect(harness.sent).toHaveLength(1);
    await harness.manager.verify({
      ministryInvitationId: invitationId,
      code: '123456',
      now,
    });
    await expect(
      harness.manager.verify({
        ministryInvitationId: invitationId,
        code: '123456',
        now,
      }),
    ).rejects.toMatchObject({ code: 'VERIFICATION_CODE_CONSUMED' });
  });

  it('allows five failed attempts and blocks the sixth', async () => {
    const harness = createHarness();
    const invitationId = MinistryInvitationId.from(
      '00000000-0000-4000-8000-000000000002',
    );
    const now = new Date('2026-01-01T00:00:00.000Z');
    await harness.manager.issue({
      ministryInvitationId: invitationId,
      recipientEmail: 'invitee@example.test',
      churchName: 'Church',
      now,
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        harness.manager.verify({
          ministryInvitationId: invitationId,
          code: '000000',
          now,
        }),
      ).rejects.toBeInstanceOf(VerificationCodeError);
    }
    await expect(
      harness.manager.verify({
        ministryInvitationId: invitationId,
        code: '123456',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'VERIFICATION_CODE_ATTEMPT_LIMIT_REACHED',
    });
  });

  it('replaces the code and resets its attempt budget only after the sixty-second cooldown', async () => {
    const harness = createHarness();
    const invitationId = MinistryInvitationId.from(
      '00000000-0000-4000-8000-000000000003',
    );
    const now = new Date('2026-01-01T00:00:00.000Z');
    await harness.manager.issue({
      ministryInvitationId: invitationId,
      recipientEmail: 'invitee@example.test',
      churchName: 'Church',
      now,
    });
    await expect(
      harness.manager.issue({
        ministryInvitationId: invitationId,
        recipientEmail: 'invitee@example.test',
        churchName: 'Church',
        now: new Date(now.getTime() + 59_000),
      }),
    ).rejects.toMatchObject({
      code: 'VERIFICATION_CODE_RESEND_COOLDOWN_ACTIVE',
    });
    await harness.manager.issue({
      ministryInvitationId: invitationId,
      recipientEmail: 'invitee@example.test',
      churchName: 'Church',
      now: new Date(now.getTime() + 60_000),
    });
    expect(harness.state?.failedAttempts).toBe(0);
    expect(harness.sent).toHaveLength(2);
  });

  it('releases its delivery claim when synchronous dispatch fails so a retry is safe', async () => {
    const harness = createHarness({
      send: async () => {
        throw new Error('delivery unavailable');
      },
    });
    const invitationId = MinistryInvitationId.from(
      '00000000-0000-4000-8000-000000000004',
    );
    const now = new Date('2026-01-01T00:00:00.000Z');

    await expect(
      harness.manager.issue({
        ministryInvitationId: invitationId,
        recipientEmail: 'invitee@example.test',
        churchName: 'Church',
        now,
      }),
    ).rejects.toThrow('delivery unavailable');

    expect(harness.state).toBeNull();
  });
});
