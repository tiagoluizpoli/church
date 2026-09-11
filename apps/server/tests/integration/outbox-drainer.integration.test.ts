import 'reflect-metadata';
import {
  assignment,
  event,
  ministryInvitation,
  ministryParticipation,
  ministryVolunteer,
  outboxMessage,
  planningCycle,
  shift,
  timeSlot,
  volunteer,
} from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
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
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '../../src/test-support/identity-fixtures';
import { createMinistryInvitationTestHarness } from '../../src/test-support/ministry-invitation-test-harness';
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
    const [cycle] = await testDb
      .insert(planningCycle)
      .values({
        churchId: fixture.churchB.id,
        name: 'Transfer Cycle',
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-02-01T00:00:00Z'),
      })
      .returning({ id: planningCycle.id });
    const [transferEvent] = await testDb
      .insert(event)
      .values({
        churchId: fixture.churchB.id,
        planningCycleId: cycle?.id ?? '',
        title: 'Transfer Sunday',
        startDate: new Date(COMMIT.getTime() - 3_600_000),
        endDate: new Date(COMMIT.getTime() + 24 * 3_600_000),
      })
      .returning({ id: event.id });
    const [participation] = await testDb
      .insert(ministryParticipation)
      .values({
        churchId: fixture.churchB.id,
        ministryId: fixture.ministryInB,
        eventId: transferEvent?.id ?? '',
      })
      .returning({ id: ministryParticipation.id });
    const start = new Date(COMMIT.getTime() + 3_600_000);
    const [slot] = await testDb
      .insert(timeSlot)
      .values({
        churchId: fixture.churchB.id,
        eventId: transferEvent?.id ?? '',
        startTime: start,
        endTime: new Date(start.getTime() + 3_600_000),
      })
      .returning({ id: timeSlot.id });
    const [slotShift] = await testDb
      .insert(shift)
      .values({
        churchId: fixture.churchB.id,
        participationId: participation?.id ?? '',
        timeSlotId: slot?.id ?? '',
        startTime: start,
        endTime: new Date(start.getTime() + 3_600_000),
      })
      .returning({ id: shift.id });
    await testDb.insert(assignment).values({
      churchId: fixture.churchB.id,
      participationId: participation?.id ?? '',
      shiftId: slotShift?.id ?? '',
      volunteerId: fixture.dualMemberABVolunteerInB,
      roleId: fixture.roleInMinistryInB,
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
    const [leaderVolunteer] = await testDb
      .insert(volunteer)
      .values({ churchId: fixture.churchB.id, userId: fixture.adminB })
      .returning({ id: volunteer.id });
    await testDb.insert(ministryVolunteer).values({
      churchId: fixture.churchB.id,
      volunteerId: leaderVolunteer?.id ?? '',
      ministryId: fixture.ministryInB,
      ministryAccessLevel: 'leader',
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
