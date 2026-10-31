import { appConfig } from '@church/app-config';
import {
  ministry,
  ministryInvitation,
  ministryMembership,
  outboxMessage,
} from '@church/db';
import {
  addMilliseconds,
  fromDate,
  type Instant,
  parseCalendarDay,
  resetClock,
  setTestClock,
} from '@church/time';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb, truncateAll } from './repositories/setup';
import { DbOutboxDrainer } from '@/application/db-outbox-drainer';
import {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  UserId,
} from '@/domain/branded-ids';
import type { DeliverEmailInput } from '@/domain/contracts/infrastructure/email-sender';
import { EmailSendError } from '@/domain/errors/email-send-error';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories';
import { DrizzleVolunteerTransferRepository } from '@/infrastructure/repositories/drizzle-volunteer-transfer.repository';
import { CaptureEmailSender } from '@/infrastructure/services/capture-email-sender';
import {
  buildAssignedShift,
  buildCycle,
  buildEvent,
  buildMinistryParticipation,
} from '@/seeds/builders/scheduling';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '@/tests/test-support/identity-fixtures';
import { createMinistryInvitationTestHarness } from '@/tests/test-support/ministry-invitation-test-harness';

const {
  outboxRepository,
  ministryInvitationRepository,
  churchRepository,
  ministryRepository,
  roleRepository,
  volunteerRepository,
  volunteerTransferRepository,
  unitOfWork,
  manager,
} = createMinistryInvitationTestHarness({ db: testDb });

let fixture: TwoChurchIdentityFixture;

beforeEach(async () => {
  await truncateAll();
  fixture = await seedTwoChurchIdentityFixture({ db: testDb });
});

interface BuildDrainerInput {
  emailSender: CaptureEmailSender;
}

function buildDrainer({ emailSender }: BuildDrainerInput): DbOutboxDrainer {
  return new DbOutboxDrainer({
    outboxRepository,
    invitationRepository: ministryInvitationRepository,
    churchRepository,
    ministryRepository,
    roleRepository,
    volunteerRepository,
    volunteerTransferRepository,
    emailSender,
    unitOfWork,
    config: appConfig,
  });
}

describe('DbOutboxDrainer (integration)', () => {
  it('sends a real minted invitation end to end and marks it sent', async () => {
    await manager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.adminA),
      email: `${fixture.memberNoVolunteerA}@fixture.test`,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });

    const emailSender = new CaptureEmailSender();
    const result = await buildDrainer({ emailSender }).drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]).toMatchObject({
      kind: 'invitation.ministry',
      to: `${fixture.memberNoVolunteerA}@fixture.test`,
      churchName: fixture.churchA.name,
    });
  });

  it('two concurrent drains of the same message never send twice', async () => {
    await manager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.adminA),
      email: `${fixture.memberNoVolunteerA}@fixture.test`,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });

    const emailSenderA = new CaptureEmailSender();
    const emailSenderB = new CaptureEmailSender();

    const [resultA, resultB] = await Promise.all([
      buildDrainer({ emailSender: emailSenderA }).drainOnce({ limit: 1 }),
      buildDrainer({ emailSender: emailSenderB }).drainOnce({ limit: 1 }),
    ]);

    const totalClaimed = resultA.claimed + resultB.claimed;
    const totalSent = resultA.sent + resultB.sent;
    const totalCaptured = emailSenderA.sent.length + emailSenderB.sent.length;

    expect(totalClaimed).toBe(1);
    expect(totalSent).toBe(1);
    expect(totalCaptured).toBe(1);
  });
});

type FailureMode = 'before-provider' | 'after-provider';

interface QueueFailureInput {
  mode: FailureMode;
  retryable: boolean;
}

/**
 * The capture adapter with injected failures. `after-provider` records the
 * email and then throws — the ambiguous case where the provider accepted the
 * request but the response was lost.
 */
class FlakyEmailSender extends CaptureEmailSender {
  private readonly failures: QueueFailureInput[] = [];
  readonly attemptedKeys: (string | undefined)[] = [];

  queueFailure(failure: QueueFailureInput): void {
    this.failures.push(failure);
  }

  override async deliver(input: DeliverEmailInput) {
    this.attemptedKeys.push(input.idempotencyKey);
    const failure = this.failures.shift();
    if (failure?.mode === 'after-provider') await super.deliver(input);
    if (failure) {
      throw new EmailSendError({
        message: `injected ${failure.mode} failure`,
        retryable: failure.retryable,
      });
    }
    return super.deliver(input);
  }
}

describe('DbOutboxDrainer — invitation email retry safety (issue #619, integration)', () => {
  const firstAttempt = '2026-11-02T12:00:00.000Z' as Instant;
  const { emailIdempotencyRetentionMs, maxAttempts, backoffCapMinutes } =
    appConfig.outbox;

  beforeEach(() => {
    setTestClock({ instant: firstAttempt });
  });

  afterEach(() => {
    resetClock();
  });

  interface MintForInput {
    email: string;
  }

  async function mintFor({ email }: MintForInput): Promise<void> {
    await manager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.adminA),
      email,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });
  }

  const memberEmail = () => `${fixture.memberNoVolunteerA}@fixture.test`;

  interface AdvanceClockInput {
    ms: number;
  }

  function advanceClockFromFirstAttempt({ ms }: AdvanceClockInput): void {
    setTestClock({
      instant: addMilliseconds({ instant: firstAttempt, milliseconds: ms }),
    });
  }

  async function onlyRow() {
    const [row, ...rest] = await testDb.select().from(outboxMessage);
    if (!row || rest.length > 0) throw new Error('expected one outbox row');
    return row;
  }

  it('persists the exact prepared request, stable key and first-attempt Instant before the first attempt', async () => {
    await mintFor({ email: memberEmail() });
    const emailSender = new FlakyEmailSender();
    emailSender.queueFailure({ mode: 'before-provider', retryable: true });

    await buildDrainer({ emailSender }).drainOnce({ limit: 10 });

    const row = await onlyRow();
    expect(row).toMatchObject({
      status: 'pending',
      emailIdempotencyKey: `outbox-message/${row.id}`,
      emailFirstAttemptAt: new Date(firstAttempt),
      emailDeliveredAt: null,
    });
    expect(row.emailRequest).toMatchObject({
      locale: 'en',
      request: { to: memberEmail() },
    });
    expect(emailSender.attemptedKeys).toEqual([`outbox-message/${row.id}`]);
  });

  it('resends the stored content after a Ministry rename, under the same key', async () => {
    await mintFor({ email: memberEmail() });
    const emailSender = new FlakyEmailSender();
    emailSender.queueFailure({ mode: 'before-provider', retryable: true });
    const drainer = buildDrainer({ emailSender });
    await drainer.drainOnce({ limit: 10 });
    const [original] = await testDb
      .select({ name: ministry.name })
      .from(ministry)
      .where(eq(ministry.id, fixture.ministryOneA));
    await testDb
      .update(ministry)
      .set({ name: 'Renamed Ministry' })
      .where(eq(ministry.id, fixture.ministryOneA));
    advanceClockFromFirstAttempt({ ms: backoffCapMinutes * 60_000 });

    const result = await drainer.drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(emailSender.delivered).toHaveLength(1);
    expect(emailSender.sent[0]).toMatchObject({
      ministryName: original?.name,
    });
    expect(emailSender.delivered[0]?.request.html).not.toContain(
      'Renamed Ministry',
    );
    const [firstKey, secondKey] = emailSender.attemptedKeys;
    expect(secondKey).toBe(firstKey);
  });

  it('captures one email when an ambiguous attempt is replayed', async () => {
    await mintFor({ email: memberEmail() });
    const emailSender = new FlakyEmailSender();
    emailSender.queueFailure({ mode: 'after-provider', retryable: true });
    const drainer = buildDrainer({ emailSender });
    await drainer.drainOnce({ limit: 10 });
    advanceClockFromFirstAttempt({ ms: backoffCapMinutes * 60_000 });

    await drainer.drainOnce({ limit: 10 });

    expect(emailSender.attemptedKeys).toHaveLength(2);
    expect(emailSender.delivered).toHaveLength(1);
    expect(await onlyRow()).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('suppresses a replay of an email the provider already confirmed', async () => {
    await mintFor({ email: memberEmail() });
    await buildDrainer({ emailSender: new CaptureEmailSender() }).drainOnce({
      limit: 10,
    });
    const delivered = await onlyRow();
    expect(delivered.emailDeliveredAt).toEqual(new Date(firstAttempt));
    // Replay the same row, as a later channel's retry would.
    await testDb
      .update(outboxMessage)
      .set({ status: 'pending' })
      .where(eq(outboxMessage.id, delivered.id));

    // A fresh adapter cannot deduplicate on its own: only the receipt can.
    const replaySender = new CaptureEmailSender();
    const result = await buildDrainer({ emailSender: replaySender }).drainOnce({
      limit: 10,
    });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(replaySender.delivered).toHaveLength(0);
    expect(await onlyRow()).toMatchObject({ status: 'sent' });
  });

  it('fails terminally once retryable failures exhaust the configured attempts', async () => {
    await mintFor({ email: memberEmail() });
    const emailSender = new FlakyEmailSender();
    const drainer = buildDrainer({ emailSender });
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      emailSender.queueFailure({ mode: 'before-provider', retryable: true });
      advanceClockFromFirstAttempt({
        ms: (attempt - 1) * backoffCapMinutes * 60_000,
      });
      await drainer.drainOnce({ limit: 10 });
    }

    expect(await onlyRow()).toMatchObject({
      status: 'failed',
      attempts: maxAttempts,
    });
    expect(new Set(emailSender.attemptedKeys).size).toBe(1);
  });

  it('fails terminally on a non-retryable provider error, such as a payload mismatch', async () => {
    await mintFor({ email: memberEmail() });
    const emailSender = new FlakyEmailSender();
    emailSender.queueFailure({ mode: 'before-provider', retryable: false });

    await buildDrainer({ emailSender }).drainOnce({ limit: 10 });

    expect(await onlyRow()).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('retries an ambiguous attempt just inside the retention window', async () => {
    await mintFor({ email: memberEmail() });
    const emailSender = new FlakyEmailSender();
    emailSender.queueFailure({ mode: 'after-provider', retryable: true });
    const drainer = buildDrainer({ emailSender });
    await drainer.drainOnce({ limit: 10 });
    advanceClockFromFirstAttempt({ ms: emailIdempotencyRetentionMs - 1 });

    await drainer.drainOnce({ limit: 10 });

    expect(emailSender.attemptedKeys).toHaveLength(2);
    expect(await onlyRow()).toMatchObject({ status: 'sent' });
  });

  it('refuses an ambiguous attempt at the retention boundary, without a new key', async () => {
    await mintFor({ email: memberEmail() });
    const emailSender = new FlakyEmailSender();
    emailSender.queueFailure({ mode: 'after-provider', retryable: true });
    const drainer = buildDrainer({ emailSender });
    await drainer.drainOnce({ limit: 10 });
    advanceClockFromFirstAttempt({ ms: emailIdempotencyRetentionMs });

    const result = await drainer.drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(emailSender.attemptedKeys).toHaveLength(1);
    expect(emailSender.delivered).toHaveLength(1);
    expect(await onlyRow()).toMatchObject({
      status: 'failed',
      lastError: expect.stringContaining('retention'),
    });
  });

  it('keeps delivering the other claimed rows when one delivery fails', async () => {
    await mintFor({ email: memberEmail() });
    await mintFor({ email: 'outsider@example.com' });
    const emailSender = new FlakyEmailSender();
    emailSender.queueFailure({ mode: 'before-provider', retryable: false });

    const result = await buildDrainer({ emailSender }).drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1 });
    expect(emailSender.delivered).toHaveLength(1);
  });
});

describe('DbOutboxDrainer — Volunteer Transfer notifications (issue #60, integration)', () => {
  // Deliberately in the past relative to the drainer's real-clock claim
  // filter (`scheduledFor <= now()`) — the transfer's own business rules
  // (invitation expiry, event time block-start cutoff) only compare against this
  // fixture's own timestamps, never the real wall clock.
  const COMMIT = new Date('2024-01-15T12:00:00.000Z');
  const CORRELATION_ID = 'drain-transfer-corr-0001';

  const transferRepository = new DrizzleVolunteerTransferRepository({
    db: testDb,
  });
  const transferUnitOfWork = new DrizzleUnitOfWork({ db: testDb });

  async function seedWithdrawnAssignment(): Promise<void> {
    const churchId = fixture.churchB.id;
    const cycle = await buildCycle({
      db: testDb,
      churchId,
      name: 'Transfer Cycle',
      startDate: parseCalendarDay({ value: '2024-01-01' }),
      endDate: parseCalendarDay({ value: '2024-02-01' }),
      state: 'draft',
    });
    const transferEvent = await buildEvent({
      db: testDb,
      churchId,
      cycleId: cycle.id,
      title: 'Transfer Sunday',
      start: fromDate({ date: new Date(COMMIT.getTime() - 3_600_000) }),
      end: fromDate({ date: new Date(COMMIT.getTime() + 24 * 3_600_000) }),
      status: 'draft',
    });
    const participation = await buildMinistryParticipation({
      db: testDb,
      churchId,
      ministryId: fixture.ministryInB,
      eventId: transferEvent.id,
      state: 'preparing',
      eventTimeBlockIds: [],
    });
    const start = fromDate({ date: new Date(COMMIT.getTime() + 3_600_000) });
    const end = fromDate({ date: new Date(COMMIT.getTime() + 2 * 3_600_000) });
    await buildAssignedShift({
      db: testDb,
      churchId,
      eventId: transferEvent.id,
      participationId: participation.id,
      volunteerId: fixture.dualMemberABVolunteerInB,
      roleId: fixture.roleInMinistryInB,
      start,
      end,
      status: 'confirmed',
    });
  }

  async function seedPendingInvitationInChurchA(): Promise<string> {
    const [invitation] = await testDb
      .insert(ministryInvitation)
      .values({
        churchId: fixture.churchA.id,
        ministryId: fixture.ministryOneA,
        inviteeUserId: fixture.dualMemberAB,
        ministryAccessLevel: 'volunteer',
        inviterId: fixture.adminA,
        expiresAt: new Date('2026-12-01T00:00:00Z'),
      })
      .returning({ id: ministryInvitation.id });
    return invitation?.id ?? '';
  }

  async function runTransferAndDrain(
    emailSender: CaptureEmailSender,
  ): Promise<void> {
    await seedWithdrawnAssignment();
    const invitationId = await seedPendingInvitationInChurchA();
    await transferUnitOfWork.run((tx) =>
      transferRepository.executeTransfer({
        userId: UserId.from(fixture.dualMemberAB),
        ministryInvitationId: MinistryInvitationId.from(invitationId),
        sourceChurchId: ChurchId.from(fixture.churchB.id),
        destinationChurchId: ChurchId.from(fixture.churchA.id),
        confirmedAt: COMMIT,
        correlationId: CORRELATION_ID,
        tx,
      }),
    );
    await buildDrainer({ emailSender }).drainOnce({ limit: 10 });
  }

  it('sends a Ministry digest naming the Volunteer and the withdrawn assignment, never the destination Church', async () => {
    const leaderVolunteer = await buildVolunteer({
      db: testDb,
      churchId: fixture.churchB.id,
      userId: fixture.adminB,
    });
    await buildMinistryMembership({
      db: testDb,
      churchId: fixture.churchB.id,
      volunteerId: leaderVolunteer.id,
      ministryId: fixture.ministryInB,
      ministryAccessLevel: 'leader',
      roleIds: [],
      teams: [],
    });

    const emailSender = new CaptureEmailSender();
    await runTransferAndDrain(emailSender);

    expect(emailSender.sent).toHaveLength(1);
    const [sent] = emailSender.sent;
    expect(sent).toMatchObject({
      kind: 'transfer.ministry-digest',
      to: [`${fixture.adminB}@fixture.test`],
      volunteerName: 'Fixture Dual Member AB',
    });
    if (sent?.kind !== 'transfer.ministry-digest') {
      throw new Error('unreachable');
    }
    expect(sent.ministryName).toContain('Hospitality');
    expect(sent.withdrawnAssignments).toHaveLength(1);
    expect(sent.withdrawnAssignments[0]).toMatchObject({
      eventName: 'Transfer Sunday',
    });
    // The digest never names the destination Church (spec §8.8).
    expect(JSON.stringify(sent)).not.toContain(fixture.churchA.name);
  });

  it("escalates to ChurchAdmins when the departing Volunteer was themselves the Ministry's last active leader", async () => {
    await testDb
      .update(ministryMembership)
      .set({ ministryAccessLevel: 'leader' })
      .where(eq(ministryMembership.id, fixture.dualMemberABMembershipInB));

    const emailSender = new CaptureEmailSender();
    await runTransferAndDrain(emailSender);

    expect(emailSender.sent).toHaveLength(1);
    const [sent] = emailSender.sent;
    expect(sent).toMatchObject({
      kind: 'transfer.leaderless-ministry',
      to: [`${fixture.adminB}@fixture.test`],
    });
  });

  it('does not escalate a routine departure — a plain member leaving an already-leaderless Ministry stays a digest', async () => {
    // `dualMemberAB` stays a plain volunteer; `ministryInB` has no leader at
    // all (pre-existing, unrelated to this transfer). The digest still has
    // no one to send to, so it fails to deliver — but it must never reach a
    // ChurchAdmin, matching "Routine departures never reach ChurchAdmins."
    const emailSender = new CaptureEmailSender();
    await runTransferAndDrain(emailSender);

    expect(emailSender.sent).toHaveLength(0);
    const messages = await testDb.select().from(outboxMessage);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: 'transfer.ministry-digest' });
  });
});
