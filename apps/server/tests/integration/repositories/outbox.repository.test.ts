import 'reflect-metadata';
import { outboxMessage } from '@church/db';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChurchId,
  MinistryId,
  type MinistryInvitationId,
  UserId,
} from '../../../src/domain/branded-ids';
import { DrizzleTransactionContext } from '../../../src/infrastructure/repositories';
import { asTxContext } from '../../../src/infrastructure/repositories/drizzle-transaction-context';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '../../../src/test-support/identity-fixtures';
import { createMinistryInvitationTestHarness } from '../../../src/test-support/ministry-invitation-test-harness';
import { testDb, truncateAll } from './setup';

const { outboxRepository, unitOfWork, manager } =
  createMinistryInvitationTestHarness({ db: testDb });

let fixture: TwoChurchIdentityFixture;

beforeEach(async () => {
  await truncateAll();
  fixture = await seedTwoChurchIdentityFixture({ db: testDb });
});

async function mintOne() {
  return manager.mint({
    churchId: ChurchId.from(fixture.churchA.id),
    ministryId: MinistryId.from(fixture.ministryOneA),
    inviterId: UserId.from(fixture.adminA),
    email: `${fixture.memberNoVolunteerA}@fixture.test`,
    ministryAccessLevel: 'volunteer',
    roleIds: [],
  });
}

describe('DrizzleOutboxRepository', () => {
  it('claims a due pending row enqueued by minting', async () => {
    const invitation = await mintOne();

    const claimed = await unitOfWork.run((tx) =>
      outboxRepository.claimPending({ limit: 10, now: new Date(), tx }),
    );

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.status).toBe('processing');
    expect(claimed[0]?.kind).toBe('invitation.ministry');
    expect(claimed[0]?.payload).toMatchObject({
      ministryInvitationId: invitation.id,
    });
  });

  it('no longer claims a row once marked sent', async () => {
    await mintOne();
    const [claimed] = await unitOfWork.run((tx) =>
      outboxRepository.claimPending({ limit: 10, now: new Date(), tx }),
    );
    if (!claimed) throw new Error('Expected a claimed row');

    await unitOfWork.run((tx) =>
      outboxRepository.markSent({
        id: claimed.id,
        providerMessageId: 'provider-123',
        sentAt: new Date(),
        tx,
      }),
    );

    const claimedAgain = await unitOfWork.run((tx) =>
      outboxRepository.claimPending({ limit: 10, now: new Date(), tx }),
    );
    expect(claimedAgain).toHaveLength(0);
  });

  it('a retryable failure stays pending but is not due until its bumped schedule', async () => {
    await mintOne();
    const [claimed] = await unitOfWork.run((tx) =>
      outboxRepository.claimPending({ limit: 10, now: new Date(), tx }),
    );
    if (!claimed) throw new Error('Expected a claimed row');

    const retryAt = new Date(Date.now() + 60_000);
    await unitOfWork.run((tx) =>
      outboxRepository.markFailed({
        id: claimed.id,
        lastError: 'timeout',
        attempts: claimed.attempts + 1,
        status: 'pending',
        scheduledFor: retryAt,
        tx,
      }),
    );

    const tooEarly = await unitOfWork.run((tx) =>
      outboxRepository.claimPending({ limit: 10, now: new Date(), tx }),
    );
    expect(tooEarly).toHaveLength(0);

    const onSchedule = await unitOfWork.run((tx) =>
      outboxRepository.claimPending({
        limit: 10,
        now: new Date(retryAt.getTime() + 1),
        tx,
      }),
    );
    expect(onSchedule).toHaveLength(1);
    expect(onSchedule[0]?.attempts).toBe(claimed.attempts + 1);
    expect(onSchedule[0]?.lastError).toBe('timeout');
  });

  it('a terminal failure is never claimed again', async () => {
    await mintOne();
    const [claimed] = await unitOfWork.run((tx) =>
      outboxRepository.claimPending({ limit: 10, now: new Date(), tx }),
    );
    if (!claimed) throw new Error('Expected a claimed row');

    await unitOfWork.run((tx) =>
      outboxRepository.markFailed({
        id: claimed.id,
        lastError: 'invalid recipient',
        attempts: claimed.attempts + 1,
        status: 'failed',
        tx,
      }),
    );

    const claimedAgain = await unitOfWork.run((tx) =>
      outboxRepository.claimPending({
        limit: 10,
        now: new Date(Date.now() + 60 * 60_000),
        tx,
      }),
    );
    expect(claimedAgain).toHaveLength(0);
  });

  it('two concurrent claims never return the same row (FOR UPDATE SKIP LOCKED)', async () => {
    await mintOne();
    const now = new Date();

    const claimOnce = () =>
      testDb.transaction(async (tx) =>
        outboxRepository.claimPending({
          limit: 1,
          now,
          tx: asTxContext(new DrizzleTransactionContext({ tx })),
        }),
      );

    const [first, second] = await Promise.all([claimOnce(), claimOnce()]);
    const totalClaimed = first.length + second.length;

    expect(totalClaimed).toBe(1);
  });
});

describe('DrizzleOutboxRepository.findLatestStatusForMinistryInvitation', () => {
  it('reads the pending status enqueued by minting', async () => {
    const invitation = await mintOne();

    const status = await outboxRepository.findLatestStatusForMinistryInvitation(
      {
        churchId: ChurchId.from(fixture.churchA.id),
        ministryInvitationId: invitation.id,
      },
    );

    expect(status).toBe('pending');
  });

  it('reflects sent once the claimed row is marked sent', async () => {
    const invitation = await mintOne();
    const [claimed] = await unitOfWork.run((tx) =>
      outboxRepository.claimPending({ limit: 10, now: new Date(), tx }),
    );
    if (!claimed) throw new Error('Expected a claimed row');

    await unitOfWork.run((tx) =>
      outboxRepository.markSent({
        id: claimed.id,
        providerMessageId: 'provider-123',
        sentAt: new Date(),
        tx,
      }),
    );

    const status = await outboxRepository.findLatestStatusForMinistryInvitation(
      {
        churchId: ChurchId.from(fixture.churchA.id),
        ministryInvitationId: invitation.id,
      },
    );

    expect(status).toBe('sent');
  });

  it('returns the most recently enqueued row after a resend', async () => {
    const invitation = await mintOne();
    const [claimed] = await unitOfWork.run((tx) =>
      outboxRepository.claimPending({ limit: 10, now: new Date(), tx }),
    );
    if (!claimed) throw new Error('Expected a claimed row');
    await unitOfWork.run((tx) =>
      outboxRepository.markSent({
        id: claimed.id,
        providerMessageId: 'provider-123',
        sentAt: new Date(),
        tx,
      }),
    );

    await manager.resend({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      ministryInvitationId: invitation.id,
      callerId: UserId.from(fixture.adminA),
    });

    const status = await outboxRepository.findLatestStatusForMinistryInvitation(
      {
        churchId: ChurchId.from(fixture.churchA.id),
        ministryInvitationId: invitation.id,
      },
    );

    expect(status).toBe('pending');
  });

  it('ignores redemption confirmation messages when reading invitation delivery status', async () => {
    const invitation = await mintOne();
    await testDb.insert(outboxMessage).values({
      churchId: fixture.churchA.id,
      kind: 'redemption.accepted',
      payload: {
        ministryInvitationId: invitation.id,
        volunteerId: crypto.randomUUID(),
      },
      status: 'sent',
      correlationId: crypto.randomUUID(),
      scheduledFor: new Date(),
      createdAt: new Date(Date.now() + 1_000),
    });

    const status = await outboxRepository.findLatestStatusForMinistryInvitation(
      {
        churchId: ChurchId.from(fixture.churchA.id),
        ministryInvitationId: invitation.id,
      },
    );

    expect(status).toBe('pending');
  });

  it('returns null when no outbox row exists for the invitation', async () => {
    const status = await outboxRepository.findLatestStatusForMinistryInvitation(
      {
        churchId: ChurchId.from(fixture.churchA.id),
        ministryInvitationId: 'non-existent-invitation' as MinistryInvitationId,
      },
    );

    expect(status).toBeNull();
  });

  it('is church-isolated: another Church cannot read this invitation delivery status', async () => {
    const invitation = await mintOne();

    const status = await outboxRepository.findLatestStatusForMinistryInvitation(
      {
        churchId: ChurchId.from(fixture.churchB.id),
        ministryInvitationId: invitation.id,
      },
    );

    expect(status).toBeNull();
  });
});
