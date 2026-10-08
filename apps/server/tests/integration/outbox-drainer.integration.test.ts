import 'reflect-metadata';
import {
  ministryInvitation,
  ministryVolunteer,
  outboxMessage,
} from '@church/db';
import { fromDate, parseCalendarDay } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildAssignedShift,
  buildEvent,
  buildMinistryParticipation,
  buildPlanningCycle,
} from '../../seeds/builders/scheduling';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '../../seeds/builders/volunteer';
import { DbOutboxDrainer } from '../../src/application/db-outbox-drainer';
import {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  UserId,
} from '../../src/domain/branded-ids';
import { DrizzleUnitOfWork } from '../../src/infrastructure/repositories';
import { DrizzleVolunteerTransferRepository } from '../../src/infrastructure/repositories/drizzle-volunteer-transfer.repository';
import { CaptureEmailSender } from '../../src/infrastructure/services/capture-email-sender';
import { createMinistryInvitationTestHarness } from '../../src/test-support/ministry-invitation-test-harness';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '../test-support/identity-fixtures';
import { testDb, truncateAll } from './repositories/setup';

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

describe('DbOutboxDrainer — Volunteer Transfer notifications (issue #60, integration)', () => {
  // Deliberately in the past relative to the drainer's real-clock claim
  // filter (`scheduledFor <= now()`) — the transfer's own business rules
  // (invitation expiry, slot-start cutoff) only compare against this
  // fixture's own timestamps, never the real wall clock.
  const COMMIT = new Date('2024-01-15T12:00:00.000Z');
  const CORRELATION_ID = 'drain-transfer-corr-0001';

  const transferRepository = new DrizzleVolunteerTransferRepository({
    db: testDb,
  });
  const transferUnitOfWork = new DrizzleUnitOfWork({ db: testDb });

  async function seedWithdrawnAssignment(): Promise<void> {
    const churchId = fixture.churchB.id;
    const cycle = await buildPlanningCycle({
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
      planningCycleId: cycle.id,
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
      state: 'tailoring',
      timeSlotIds: [],
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
      .update(ministryVolunteer)
      .set({ ministryAccessLevel: 'leader' })
      .where(eq(ministryVolunteer.id, fixture.dualMemberABMembershipInB));

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
