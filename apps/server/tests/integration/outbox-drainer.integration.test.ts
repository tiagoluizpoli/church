import { type AppConfig, appConfig } from '@church/app-config';
import {
  church,
  member as churchMember,
  ministry,
  ministryInvitation,
  ministryMembership,
  notification,
  outboxMessage,
  role,
  shift,
  shiftRequirement,
  volunteer as volunteerTable,
} from '@church/db';
import { m } from '@church/i18n/messages';
import {
  addMilliseconds,
  fromDate,
  type Instant,
  parseCalendarDay,
  resetClock,
  setTestClock,
} from '@church/time';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb, truncateAll } from './repositories/setup';
import { DbOutboxDrainer } from '@/application/db-outbox-drainer';
import { DbVolunteerTransferManager } from '@/application/db-volunteer-transfer-manager';
import {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  UserId,
} from '@/domain/branded-ids';
import type { IChurchNotifications } from '@/domain/contracts/application/church-notifications';
import type { DeliverEmailInput } from '@/domain/contracts/infrastructure/email-sender';
import type {
  CreateNotificationInput,
  NotificationRepository,
} from '@/domain/contracts/infrastructure/notification.repository';
import type { RedemptionIdentityGateway } from '@/domain/contracts/infrastructure/redemption-identity-gateway';
import { EmailSendError } from '@/domain/errors/email-send-error';
import {
  DrizzleNotificationRepository,
  DrizzleSecurityLogRepository,
} from '@/infrastructure/repositories';
import { CaptureEmailSender } from '@/infrastructure/services/capture-email-sender';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildSector } from '@/seeds/builders/ministry';
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
  notifications,
  schedulingFacts,
  buildNotifier,
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
    volunteerTransferRepository,
    emailSender,
    notifier: buildNotifier({ emailSender }),
    schedulingFacts,
    unitOfWork,
    config: appConfig,
    webBaseUrl: 'https://app.test',
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

    const emailSender = new CaptureEmailSender('Church');
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

    const emailSenderA = new CaptureEmailSender('Church');
    const emailSenderB = new CaptureEmailSender('Church');

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
    const emailSender = new FlakyEmailSender('Church');
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
      locale: appConfig.defaultLocale,
      request: { to: memberEmail() },
    });
    expect(emailSender.attemptedKeys).toEqual([`outbox-message/${row.id}`]);
  });

  it('resends the stored content after a Ministry rename, under the same key', async () => {
    await mintFor({ email: memberEmail() });
    const emailSender = new FlakyEmailSender('Church');
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

  it('replays a saved html-only request exactly as stored, without adding text', async () => {
    await mintFor({ email: memberEmail() });
    const emailSender = new FlakyEmailSender('Church');
    emailSender.queueFailure({ mode: 'before-provider', retryable: true });
    const drainer = buildDrainer({ emailSender });
    await drainer.drainOnce({ limit: 10 });
    const prepared = await onlyRow();
    const historical = {
      payload: { kind: 'invitation.ministry', to: memberEmail() },
      locale: 'en',
      request: {
        from: 'Church <old@church.test>',
        to: memberEmail(),
        subject: 'Saved before plain text existed',
        html: '<p>Saved body</p>',
      },
    };
    await testDb
      .update(outboxMessage)
      .set({ emailRequest: historical })
      .where(eq(outboxMessage.id, prepared.id));
    advanceClockFromFirstAttempt({ ms: backoffCapMinutes * 60_000 });

    const result = await drainer.drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(emailSender.delivered).toEqual([historical]);
    expect(emailSender.attemptedKeys).toEqual([
      `outbox-message/${prepared.id}`,
      `outbox-message/${prepared.id}`,
    ]);
    expect(await onlyRow()).toMatchObject({
      emailFirstAttemptAt: new Date(firstAttempt),
      emailRequest: historical,
    });
  });

  it('captures one email when an ambiguous attempt is replayed', async () => {
    await mintFor({ email: memberEmail() });
    const emailSender = new FlakyEmailSender('Church');
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
    await buildDrainer({
      emailSender: new CaptureEmailSender('Church'),
    }).drainOnce({
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
    const replaySender = new CaptureEmailSender('Church');
    const result = await buildDrainer({ emailSender: replaySender }).drainOnce({
      limit: 10,
    });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(replaySender.delivered).toHaveLength(0);
    expect(await onlyRow()).toMatchObject({ status: 'sent' });
  });

  it('fails terminally once retryable failures exhaust the configured attempts', async () => {
    await mintFor({ email: memberEmail() });
    const emailSender = new FlakyEmailSender('Church');
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
    const emailSender = new FlakyEmailSender('Church');
    emailSender.queueFailure({ mode: 'before-provider', retryable: false });

    await buildDrainer({ emailSender }).drainOnce({ limit: 10 });

    expect(await onlyRow()).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('retries an ambiguous attempt just inside the retention window', async () => {
    await mintFor({ email: memberEmail() });
    const emailSender = new FlakyEmailSender('Church');
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
    const emailSender = new FlakyEmailSender('Church');
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
    const emailSender = new FlakyEmailSender('Church');
    emailSender.queueFailure({ mode: 'before-provider', retryable: false });

    const result = await buildDrainer({ emailSender }).drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1 });
    expect(emailSender.delivered).toHaveLength(1);
  });
});

describe('Volunteer Transfer digests through the Notifier (ticket #623, integration)', () => {
  // Deliberately in the past relative to the drainer's real-clock claim
  // filter (`scheduledFor <= now()`) — the transfer's own business rules
  // (invitation expiry, event time block-start cutoff) only compare against this
  // fixture's own timestamps, never the real wall clock.
  const COMMIT = new Date('2024-01-15T12:00:00.000Z');
  const CORRELATION_ID = 'drain-transfer-corr-0001';
  const ptBR = { locale: 'pt-BR' } as const;
  const securityLogRepository = new DrizzleSecurityLogRepository({
    db: testDb,
  });
  const identityGateway = {
    verifyPassword: async () => true,
  } as unknown as RedemptionIdentityGateway;

  function transferManager(
    transferNotifications: IChurchNotifications = notifications,
  ): DbVolunteerTransferManager {
    return new DbVolunteerTransferManager({
      churchRepository,
      identityGateway,
      invitationRepository: ministryInvitationRepository,
      notifications: transferNotifications,
      securityLogRepository,
      unitOfWork,
      volunteerRepository,
      volunteerTransferRepository,
    });
  }

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
    const booked = await buildAssignedShift({
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
    // The Shift is 13:15–13:45 UTC inside its 13:00–14:00 EventTimeBlock.
    await testDb
      .update(shift)
      .set({
        startTime: new Date('2024-01-15T13:15:00Z'),
        endTime: new Date('2024-01-15T13:45:00Z'),
      })
      .where(eq(shift.id, booked.shift.id));
    const lobby = await buildSector({
      db: testDb,
      churchId,
      ministryId: fixture.ministryInB,
      name: 'Lobby & <door>',
    });
    await testDb
      .update(shiftRequirement)
      .set({ sectorId: lobby.id })
      .where(eq(shiftRequirement.id, booked.assignment.shiftRequirementId));
    await testDb
      .update(church)
      .set({ timezone: 'America/Sao_Paulo' })
      .where(eq(church.id, churchId));
  }

  const roleInBName = async () => {
    const [row] = await testDb
      .select({ name: role.name })
      .from(role)
      .where(eq(role.id, fixture.roleInMinistryInB));
    return row?.name ?? '';
  };

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

  /** A Church B member who leads `ministryInB`. */
  async function addChurchBLeader(userId: string): Promise<void> {
    await buildUser({
      db: testDb,
      id: userId,
      name: userId,
      email: `${userId}@fixture.test`,
    });
    await buildChurchMembership({
      db: testDb,
      churchId: fixture.churchB.id,
      userId,
      accessLevel: 'member',
    });
    await leadMinistryInB(userId);
  }

  async function leadMinistryInB(userId: string): Promise<void> {
    const leaderVolunteer = await buildVolunteer({
      db: testDb,
      churchId: fixture.churchB.id,
      userId,
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
  }

  async function confirmTransfer(
    manager: DbVolunteerTransferManager = transferManager(),
  ) {
    await seedWithdrawnAssignment();
    const invitationId = await seedPendingInvitationInChurchA();
    return manager.confirmTransfer({
      ministryInvitationId: MinistryInvitationId.from(invitationId),
      userId: UserId.from(fixture.dualMemberAB),
      destinationChurchName: fixture.churchA.name,
      password: 'unused by the stub gateway',
      idempotencyKey: CORRELATION_ID,
      now: COMMIT,
    });
  }

  function drain(emailSender: CaptureEmailSender) {
    return buildDrainer({ emailSender }).drainOnce({ limit: 10 });
  }

  const outboxRows = () =>
    testDb
      .select()
      .from(outboxMessage)
      .where(eq(outboxMessage.kind, 'notification'));

  const ministryInBName = async () => {
    const [row] = await testDb
      .select({ name: ministry.name })
      .from(ministry)
      .where(eq(ministry.id, fixture.ministryInB));
    return row?.name ?? '';
  };

  it('sends each remaining leader one private, translated digest naming the Volunteer and withdrawn Assignment, never the destination Church', async () => {
    await leadMinistryInB(fixture.adminB);
    const secondLeader = 'fixture-second-leader-b';
    await addChurchBLeader(secondLeader);

    expect((await confirmTransfer()).kind).toBe('transferred');
    const rows = await outboxRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'transfer_ministry_digest',
          to: { userId: fixture.adminB, churchId: fixture.churchB.id },
          data: {
            ministryId: fixture.ministryInB,
            volunteerId: fixture.dualMemberABVolunteerInB,
            transferCorrelationId: CORRELATION_ID,
          },
        }),
        expect.objectContaining({
          to: { userId: secondLeader, churchId: fixture.churchB.id },
        }),
      ]),
    );

    const emailSender = new CaptureEmailSender('Church');
    expect(await drain(emailSender)).toEqual({
      claimed: 2,
      sent: 2,
      failed: 0,
    });

    const ministryName = await ministryInBName();
    expect(
      emailSender.delivered.map(({ request }) => request.to).sort(),
    ).toEqual([
      [`${fixture.adminB}@fixture.test`],
      [`${secondLeader}@fixture.test`],
    ]);
    // São Paulo is UTC−3: the actual Shift, not its EventTimeBlock.
    const shiftLine = `Seg. 15/01 · 10:15–10:45 · Transfer Sunday · ${await roleInBName()} · Lobby & <door>`;
    const greetings = emailSender.delivered.map(
      ({ request }) => (request.text ?? '').split('\n\n')[0],
    );
    expect(greetings.sort()).toEqual(
      [
        m.email_greeting_notification({ firstName: 'Fixture' }, ptBR),
        m.email_greeting_notification({ firstName: secondLeader }, ptBR),
      ].sort(),
    );
    for (const email of emailSender.delivered) {
      expect(email).toMatchObject({
        locale: 'pt-BR',
        payload: {
          kind: 'transfer.ministry-digest',
          churchName: fixture.churchB.name,
          churchTimezone: 'America/Sao_Paulo',
          volunteerName: 'Fixture Dual Member AB',
          ministryName,
          actionUrl: 'https://app.test/schedules',
        },
        request: {
          from: expect.stringContaining(`"${fixture.churchB.name}" <`),
          subject: m.email_transfer_digest_subject(
            { volunteerName: 'Fixture Dual Member AB', ministryName },
            ptBR,
          ),
        },
      });
      expect(email.request.text).toContain(`- ${shiftLine}`);
      expect(email.request.text).toContain(
        m.email_transfer_digest_timezone(
          { timeZone: 'America/Sao_Paulo' },
          ptBR,
        ),
      );
      expect(email.request.text).toContain(
        `${m.email_transfer_digest_action({}, ptBR)}: https://app.test/schedules`,
      );
      expect(email.request.text).toContain(
        m.email_footer_membership({ churchName: fixture.churchB.name }, ptBR),
      );
      expect(email.request.html).toContain('Lobby &amp; &lt;door&gt;');
      expect(email.request.text).not.toContain(
        m.email_transfer_leaderless_body({ ministryName }, ptBR),
      );
      // The digest never names the destination Church (spec §8.8).
      expect(JSON.stringify(email)).not.toContain(fixture.churchA.name);
    }
    // Email-only kind: the inbox skips it and stores nothing.
    expect(await testDb.select().from(notification)).toHaveLength(0);
    for (const row of await outboxRows()) {
      expect(row).toMatchObject({
        status: 'sent',
        channelOutcomes: { email: 'delivered', inbox: 'skipped' },
      });
    }
  });

  it("escalates to ChurchAdmins when the departing Volunteer was the Ministry's last active leader", async () => {
    await testDb
      .update(ministryMembership)
      .set({ ministryAccessLevel: 'leader' })
      .where(eq(ministryMembership.id, fixture.dualMemberABMembershipInB));

    await confirmTransfer();
    const emailSender = new CaptureEmailSender('Church');
    await drain(emailSender);

    const [row] = await outboxRows();
    expect(row?.payload).toMatchObject({
      kind: 'transfer_leaderless_ministry',
      to: { userId: fixture.adminB },
    });
    expect(emailSender.delivered).toHaveLength(1);
    expect(emailSender.delivered[0]).toMatchObject({
      payload: { kind: 'transfer.leaderless-ministry' },
      request: {
        to: [`${fixture.adminB}@fixture.test`],
        subject: m.email_transfer_digest_subject(
          {
            volunteerName: 'Fixture Dual Member AB',
            ministryName: await ministryInBName(),
          },
          ptBR,
        ),
      },
    });
    expect(emailSender.delivered[0]?.request.text).toContain(
      m.email_transfer_leaderless_body(
        { ministryName: await ministryInBName() },
        ptBR,
      ),
    );
    expect(await testDb.select().from(notification)).toHaveLength(0);
  });

  it('does not escalate a routine departure — a plain member leaving an already-leaderless Ministry notifies no one', async () => {
    await confirmTransfer();
    const emailSender = new CaptureEmailSender('Church');
    await drain(emailSender);

    expect(await outboxRows()).toHaveLength(0);
    expect(emailSender.delivered).toHaveLength(0);
  });

  it('skips a recipient whose Church Membership ended before delivery', async () => {
    await leadMinistryInB(fixture.adminB);
    await confirmTransfer();
    await testDb
      .delete(churchMember)
      .where(
        and(
          eq(churchMember.organizationId, fixture.churchB.id),
          eq(churchMember.userId, fixture.adminB),
        ),
      );

    const emailSender = new CaptureEmailSender('Church');
    await drain(emailSender);

    expect(emailSender.delivered).toHaveLength(0);
    const [row] = await outboxRows();
    expect(row).toMatchObject({
      status: 'sent',
      channelOutcomes: { email: 'skipped', inbox: 'skipped' },
    });
  });

  it('keeps the recipients fixed at the transfer: a leader added before delivery is not notified', async () => {
    await leadMinistryInB(fixture.adminB);
    await confirmTransfer();
    await addChurchBLeader('fixture-late-leader-b');

    const emailSender = new CaptureEmailSender('Church');
    await drain(emailSender);

    expect(emailSender.delivered.map(({ request }) => request.to)).toEqual([
      [`${fixture.adminB}@fixture.test`],
    ]);
  });

  it('says no Shifts were withdrawn when the departure vacated none', async () => {
    await leadMinistryInB(fixture.adminB);
    const invitationId = await seedPendingInvitationInChurchA();
    await transferManager().confirmTransfer({
      ministryInvitationId: MinistryInvitationId.from(invitationId),
      userId: UserId.from(fixture.dualMemberAB),
      destinationChurchName: fixture.churchA.name,
      password: 'unused by the stub gateway',
      idempotencyKey: CORRELATION_ID,
      now: COMMIT,
    });
    const emailSender = new CaptureEmailSender('Church');
    await drain(emailSender);

    expect(emailSender.delivered).toHaveLength(1);
    expect(emailSender.delivered[0]?.request.text).toContain(
      m.email_transfer_digest_no_assignments({}, ptBR),
    );
    expect(emailSender.delivered[0]?.request.text).not.toContain('\n- ');
  });

  it('resends the frozen digest after the Church and Shift change, under the same key', async () => {
    await leadMinistryInB(fixture.adminB);
    await confirmTransfer();
    const emailSender = new FlakyEmailSender('Church');
    emailSender.queueFailure({ mode: 'before-provider', retryable: true });
    const drainer = buildDrainer({ emailSender });
    await drainer.drainOnce({ limit: 10 });
    const [stored] = await outboxRows();
    await testDb
      .update(church)
      .set({ timezone: 'UTC' })
      .where(eq(church.id, fixture.churchB.id));
    await testDb
      .update(shift)
      .set({ startTime: new Date('2024-01-15T13:30:00Z') })
      .where(eq(shift.churchId, fixture.churchB.id));
    await testDb
      .update(outboxMessage)
      .set({ scheduledFor: new Date(0) })
      .where(eq(outboxMessage.id, stored?.id ?? ''));

    await drainer.drainOnce({ limit: 10 });

    expect(emailSender.delivered).toHaveLength(1);
    expect(emailSender.delivered[0]).toEqual(stored?.emailRequest);
    expect(emailSender.delivered[0]?.request.text).toContain('10:15–10:45');
    const [firstKey, secondKey] = emailSender.attemptedKeys;
    expect(secondKey).toBe(firstKey);
  });

  it('rolls the digests back with the transfer when the transaction fails', async () => {
    await leadMinistryInB(fixture.adminB);
    const failingNotifications: IChurchNotifications = {
      async enqueue(input) {
        await notifications.enqueue(input);
        throw new Error('fail after enqueue');
      },
    };

    await expect(
      confirmTransfer(transferManager(failingNotifications)),
    ).rejects.toThrow('fail after enqueue');

    expect(await testDb.select().from(outboxMessage)).toHaveLength(0);
    const [departing] = await testDb
      .select({ leftAt: volunteerTable.leftAt })
      .from(volunteerTable)
      .where(eq(volunteerTable.id, fixture.dualMemberABVolunteerInB));
    expect(departing?.leftAt).toBeNull();
  });
});

describe('Ministry Invitation Notification through email and inbox (ticket #621, integration)', () => {
  const start = '2026-11-02T12:00:00.000Z' as Instant;
  const { backoffCapMinutes, maxAttempts } = appConfig.outbox;

  beforeEach(() => {
    setTestClock({ instant: start });
  });

  afterEach(() => {
    resetClock();
  });

  const churchId = () => ChurchId.from(fixture.churchA.id);
  const member = () => UserId.from(fixture.memberNoVolunteerA);

  async function inviteMember(): Promise<string> {
    const invitation = await manager.mint({
      churchId: churchId(),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.adminA),
      email: `${fixture.memberNoVolunteerA}@fixture.test`,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });
    return invitation.id;
  }

  interface DrainerForInput {
    emailSender: CaptureEmailSender;
    config?: AppConfig;
    inboxRepository?: NotificationRepository;
  }

  function drainerFor({
    emailSender,
    config = appConfig,
    inboxRepository,
  }: DrainerForInput): DbOutboxDrainer {
    return new DbOutboxDrainer({
      outboxRepository,
      invitationRepository: ministryInvitationRepository,
      churchRepository,
      ministryRepository,
      roleRepository,
      volunteerTransferRepository,
      emailSender,
      notifier: buildNotifier({ emailSender, config, inboxRepository }),
      schedulingFacts,
      unitOfWork,
      config,
      webBaseUrl: 'https://app.test',
    });
  }

  function advanceToRetry(): void {
    setTestClock({
      instant: addMilliseconds({
        instant: start,
        milliseconds: backoffCapMinutes * 60_000 * maxAttempts,
      }),
    });
  }

  const outboxRows = () => testDb.select().from(outboxMessage);
  const inboxRows = () =>
    testDb.select().from(notification).where(eq(notification.userId, member()));

  async function removeMembership(): Promise<void> {
    await testDb
      .delete(churchMember)
      .where(
        and(
          eq(churchMember.organizationId, fixture.churchA.id),
          eq(churchMember.userId, fixture.memberNoVolunteerA),
        ),
      );
  }

  /** Inbox repository whose next `create` calls throw. */
  class FlakyInboxRepository extends DrizzleNotificationRepository {
    failuresLeft = 0;

    override async create(input: CreateNotificationInput) {
      if (this.failuresLeft > 0) {
        this.failuresLeft -= 1;
        throw new Error('injected inbox failure');
      }
      return super.create(input);
    }
  }

  it('delivers one email and one inbox row from the committed mint, in the recipient locale', async () => {
    const ministryInvitationId = await inviteMember();
    const emailSender = new CaptureEmailSender('Church');

    const result = await drainerFor({ emailSender }).drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    const [ministryRow] = await testDb
      .select({ name: ministry.name })
      .from(ministry)
      .where(eq(ministry.id, fixture.ministryOneA));
    const ministryName = ministryRow?.name ?? '';
    expect(emailSender.delivered).toHaveLength(1);
    expect(emailSender.delivered[0]).toMatchObject({
      locale: 'pt-BR',
      request: {
        to: `${fixture.memberNoVolunteerA}@fixture.test`,
        subject: m.email_invitation_serve_title(
          { ministryName },
          { locale: 'pt-BR' },
        ),
      },
    });
    expect(emailSender.delivered[0]?.request.html).toContain(
      `/invitations/ministry/${ministryInvitationId}`,
    );
    const inbox = await inboxRows();
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      churchId: fixture.churchA.id,
      kind: 'ministry_invitation',
      data: {
        ministryInvitationId,
        ministryId: fixture.ministryOneA,
        ministryName,
      },
    });
    const [row] = await outboxRows();
    expect(row).toMatchObject({
      status: 'sent',
      channelOutcomes: { email: 'delivered', inbox: 'delivered' },
    });
    expect(inbox[0]?.sourceOutboxId).toBe(row?.id);
  });

  it('a resend is a new Notification: a second row, email and inbox entry', async () => {
    const ministryInvitationId = await inviteMember();
    const emailSender = new CaptureEmailSender('Church');
    const drainer = drainerFor({ emailSender });
    await drainer.drainOnce({ limit: 10 });
    advanceToRetry();

    await manager.resend({
      churchId: churchId(),
      ministryId: MinistryId.from(fixture.ministryOneA),
      ministryInvitationId: MinistryInvitationId.from(ministryInvitationId),
      callerId: UserId.from(fixture.adminA),
    });
    await drainer.drainOnce({ limit: 10 });

    expect(await outboxRows()).toHaveLength(2);
    expect(emailSender.delivered).toHaveLength(2);
    expect(await inboxRows()).toHaveLength(2);
  });

  it('a rolled-back change writes neither the invitation nor its Notification', async () => {
    await expect(
      unitOfWork.run(async (tx) => {
        const invitation = await ministryInvitationRepository.create({
          churchId: churchId(),
          ministryId: MinistryId.from(fixture.ministryOneA),
          ministryAccessLevel: 'volunteer',
          inviterId: UserId.from(fixture.adminA),
          inviteeUserId: member(),
          roleIds: [],
          expiresAt: new Date('2026-12-01T00:00:00Z'),
          tx,
        });
        await notifications.enqueue({
          tx,
          kind: 'ministry_invitation',
          to: [{ userId: member(), churchId: churchId() }],
          data: { ministryInvitationId: invitation.id },
        });
        throw new Error('deliberate rollback');
      }),
    ).rejects.toThrow('deliberate rollback');

    expect(await testDb.select().from(ministryInvitation)).toHaveLength(0);
    expect(await outboxRows()).toHaveLength(0);
    const emailSender = new CaptureEmailSender('Church');
    expect(await drainerFor({ emailSender }).drainOnce({ limit: 10 })).toEqual({
      claimed: 0,
      sent: 0,
      failed: 0,
    });
  });

  it('enqueues one row per recipient deduplicated by User within Church, and nothing for no recipients', async () => {
    const ministryInvitationId = await inviteMember();
    await testDb.delete(outboxMessage);
    const admin = UserId.from(fixture.adminA);

    await unitOfWork.run(async (tx) => {
      await notifications.enqueue({
        tx,
        kind: 'ministry_invitation',
        to: [
          { userId: member(), churchId: churchId() },
          { userId: admin, churchId: churchId() },
          { userId: member(), churchId: churchId() },
        ],
        data: { ministryInvitationId },
      });
      await notifications.enqueue({
        tx,
        kind: 'ministry_invitation',
        to: [],
        data: { ministryInvitationId },
      });
    });

    const rows = await outboxRows();
    expect(rows.map((row) => row.payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: { userId: member(), churchId: churchId() },
        }),
        expect.objectContaining({
          to: { userId: admin, churchId: churchId() },
        }),
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it('rejects data that does not match the kind before writing anything', async () => {
    await expect(
      unitOfWork.run((tx) =>
        notifications.enqueue({
          tx,
          kind: 'ministry_invitation',
          to: [{ userId: member(), churchId: churchId() }],
          data: { ministryInvitationId: 'not-a-uuid' },
        }),
      ),
    ).rejects.toThrow();
    expect(await outboxRows()).toHaveLength(0);
  });

  it('inbox fails, email succeeds: the retry writes the inbox row and never resends the email', async () => {
    await inviteMember();
    const emailSender = new CaptureEmailSender('Church');
    const inboxRepository = new FlakyInboxRepository({ db: testDb });
    inboxRepository.failuresLeft = 1;
    const drainer = drainerFor({ emailSender, inboxRepository });

    await drainer.drainOnce({ limit: 10 });
    expect(await outboxRows()).toMatchObject([
      { status: 'pending', channelOutcomes: { email: 'delivered' } },
    ]);
    expect(await inboxRows()).toHaveLength(0);

    advanceToRetry();
    const result = await drainer.drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(emailSender.delivered).toHaveLength(1);
    expect(await inboxRows()).toHaveLength(1);
  });

  it('email fails, inbox succeeds: the retry sends one email and keeps the one inbox row and its read state', async () => {
    await inviteMember();
    const emailSender = new FlakyEmailSender('Church');
    emailSender.queueFailure({ mode: 'after-provider', retryable: true });
    const drainer = drainerFor({ emailSender });

    await drainer.drainOnce({ limit: 10 });
    const [inboxRow] = await inboxRows();
    if (!inboxRow) throw new Error('expected an inbox row');
    await testDb
      .update(notification)
      .set({ readAt: new Date(start) })
      .where(eq(notification.id, inboxRow.id));
    // Replay the inbox sink too, as a lost settlement would.
    await testDb.update(outboxMessage).set({ channelOutcomes: {} });

    advanceToRetry();
    const result = await drainer.drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(emailSender.delivered).toHaveLength(1);
    expect(new Set(emailSender.attemptedKeys).size).toBe(1);
    expect(await inboxRows()).toEqual([
      expect.objectContaining({ id: inboxRow.id, readAt: new Date(start) }),
    ]);
  });

  it('a terminal email failure fails the row without undoing the inbox delivery', async () => {
    const ministryInvitationId = await inviteMember();
    const emailSender = new FlakyEmailSender('Church');
    emailSender.queueFailure({ mode: 'before-provider', retryable: false });

    const result = await drainerFor({ emailSender }).drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(await outboxRows()).toMatchObject([
      {
        status: 'failed',
        channelOutcomes: { email: 'failed', inbox: 'delivered' },
      },
    ]);
    expect(await inboxRows()).toHaveLength(1);
    expect(
      await manager.getDeliveryStatus({
        churchId: churchId(),
        ministryInvitationId: MinistryInvitationId.from(ministryInvitationId),
      }),
    ).toBe('failed');
  });

  it('a recipient who left the Church before the drain receives nothing on either channel', async () => {
    await inviteMember();
    await removeMembership();
    const emailSender = new CaptureEmailSender('Church');

    const result = await drainerFor({ emailSender }).drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(emailSender.delivered).toHaveLength(0);
    expect(await inboxRows()).toHaveLength(0);
    expect(await outboxRows()).toMatchObject([
      {
        status: 'sent',
        channelOutcomes: { email: 'skipped', inbox: 'skipped' },
      },
    ]);
  });

  it('a recipient who left before a retry gets no remaining delivery, even with a saved email', async () => {
    await inviteMember();
    const emailSender = new FlakyEmailSender('Church');
    emailSender.queueFailure({ mode: 'before-provider', retryable: true });
    const drainer = drainerFor({ emailSender });
    await drainer.drainOnce({ limit: 10 });
    expect((await outboxRows())[0]?.emailRequest).not.toBeNull();

    await removeMembership();
    advanceToRetry();
    await drainer.drainOnce({ limit: 10 });

    expect(emailSender.delivered).toHaveLength(0);
    expect(emailSender.attemptedKeys).toHaveLength(1);
    expect(await outboxRows()).toMatchObject([
      {
        status: 'sent',
        channelOutcomes: { email: 'skipped', inbox: 'delivered' },
      },
    ]);
  });

  it('a retired Volunteer profile does not deny Church Membership', async () => {
    const volunteer = await buildVolunteer({
      db: testDb,
      churchId: fixture.churchA.id,
      userId: fixture.memberNoVolunteerA,
    });
    await testDb
      .update(volunteerTable)
      .set({ leftAt: new Date(start) })
      .where(eq(volunteerTable.id, volunteer.id));
    await inviteMember();
    const emailSender = new CaptureEmailSender('Church');

    await drainerFor({ emailSender }).drainOnce({ limit: 10 });

    expect(emailSender.delivered).toHaveLength(1);
    expect(await inboxRows()).toHaveLength(1);
  });

  it.each([
    { channel: 'email', emails: 0, inboxes: 1 },
    { channel: 'inbox', emails: 1, inboxes: 0 },
  ] as const)('a disabled $channel switch skips only that channel, settled without backfill', async ({
    channel,
    emails,
    inboxes,
  }) => {
    await inviteMember();
    const config: AppConfig = {
      ...appConfig,
      notifications: {
        ...appConfig.notifications,
        [channel]: { enabled: false },
      },
    };
    const emailSender = new CaptureEmailSender('Church');

    await drainerFor({ emailSender, config }).drainOnce({ limit: 10 });
    // Re-enabling the channel later never backfills this row.
    await drainerFor({ emailSender }).drainOnce({ limit: 10 });

    expect(emailSender.delivered).toHaveLength(emails);
    expect(await inboxRows()).toHaveLength(inboxes);
    expect((await outboxRows())[0]).toMatchObject({
      status: 'sent',
      channelOutcomes: { [channel]: 'skipped' },
    });
  });

  it('two concurrent drains deliver one email and one inbox row', async () => {
    await inviteMember();
    const senderA = new CaptureEmailSender('Church');
    const senderB = new CaptureEmailSender('Church');

    await Promise.all([
      drainerFor({ emailSender: senderA }).drainOnce({ limit: 1 }),
      drainerFor({ emailSender: senderB }).drainOnce({ limit: 1 }),
    ]);

    expect(senderA.delivered.length + senderB.delivered.length).toBe(1);
    expect(await inboxRows()).toHaveLength(1);
  });

  it('keeps processing other rows after one row fails terminally', async () => {
    await inviteMember();
    await inviteMember();
    const emailSender = new FlakyEmailSender('Church');
    emailSender.queueFailure({ mode: 'before-provider', retryable: false });

    const result = await drainerFor({ emailSender }).drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1 });
    expect(emailSender.delivered).toHaveLength(1);
    expect(await inboxRows()).toHaveLength(2);
  });
});
