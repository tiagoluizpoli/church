import 'reflect-metadata';
import {
  assignment,
  assignmentAudit,
  availabilityCheck,
  event,
  identityAudit,
  ministryInvitation,
  ministryInvitationRole,
  ministryParticipation,
  ministryVolunteer,
  ministryVolunteerRole,
  ministryVolunteerTeam,
  outboxMessage,
  planningCycle,
  shift,
  timeSlot,
  volunteer,
  volunteerTransfer,
} from '@church/db';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  UserId,
  VolunteerId,
} from '../../src/domain/branded-ids';
import { DrizzleUnitOfWork } from '../../src/infrastructure/repositories';
import { DrizzleVolunteerTransferRepository } from '../../src/infrastructure/repositories/drizzle-volunteer-transfer.repository';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '../../src/test-support/identity-fixtures';
import { testDb, truncateAll } from '../integration/repositories/setup';

const COMMIT = new Date('2026-09-15T12:00:00.000Z');
const CORRELATION_ID = 'transfer-corr-0001';

const repository = new DrizzleVolunteerTransferRepository({ db: testDb });
const unitOfWork = new DrizzleUnitOfWork({ db: testDb });

interface ScheduleAssignmentIds {
  untouchedBefore: string;
  cancelledAfter: string;
  startedRunning: string;
  alreadyDeclined: string;
}

let fixture: TwoChurchIdentityFixture;
let invitationId: string;
let assignmentIds: ScheduleAssignmentIds;

interface SeedScheduleResult {
  assignmentIds: ScheduleAssignmentIds;
  availabilityCheckId: string;
}

/**
 * Church B schedule for `dualMemberAB`: four assignments across four time
 * slots, spanning the commit instant to the second.
 */
async function seedChurchBSchedule(): Promise<SeedScheduleResult> {
  const [cycle] = await testDb
    .insert(planningCycle)
    .values({
      churchId: fixture.churchB.id,
      name: 'Transfer Cycle',
      startDate: new Date('2026-09-01T00:00:00Z'),
      endDate: new Date('2026-10-01T00:00:00Z'),
    })
    .returning({ id: planningCycle.id });
  const [runningEvent] = await testDb
    .insert(event)
    .values({
      churchId: fixture.churchB.id,
      planningCycleId: cycle?.id ?? '',
      title: 'Transfer Sunday',
      // Event runs from before to well after the commit instant.
      startDate: new Date('2026-09-15T09:00:00Z'),
      endDate: new Date('2026-09-15T18:00:00Z'),
    })
    .returning({ id: event.id });
  const [participation] = await testDb
    .insert(ministryParticipation)
    .values({
      churchId: fixture.churchB.id,
      ministryId: fixture.ministryInB,
      eventId: runningEvent?.id ?? '',
    })
    .returning({ id: ministryParticipation.id });

  const slotSpecs = [
    { key: 'untouchedBefore', start: new Date(COMMIT.getTime() - 1000) },
    { key: 'cancelledAfter', start: new Date(COMMIT.getTime() + 1000) },
    {
      key: 'startedRunning',
      start: new Date('2026-09-15T11:00:00Z'),
    },
    { key: 'alreadyDeclined', start: new Date(COMMIT.getTime() + 3_600_000) },
  ] as const;

  const ids: Partial<ScheduleAssignmentIds> = {};
  for (const spec of slotSpecs) {
    const [slot] = await testDb
      .insert(timeSlot)
      .values({
        churchId: fixture.churchB.id,
        eventId: runningEvent?.id ?? '',
        startTime: spec.start,
        endTime: new Date(spec.start.getTime() + 3_600_000),
      })
      .returning({ id: timeSlot.id });
    const [slotShift] = await testDb
      .insert(shift)
      .values({
        churchId: fixture.churchB.id,
        participationId: participation?.id ?? '',
        timeSlotId: slot?.id ?? '',
        startTime: spec.start,
        endTime: new Date(spec.start.getTime() + 3_600_000),
      })
      .returning({ id: shift.id });
    const [row] = await testDb
      .insert(assignment)
      .values({
        churchId: fixture.churchB.id,
        participationId: participation?.id ?? '',
        shiftId: slotShift?.id ?? '',
        volunteerId: fixture.dualMemberABVolunteerInB,
        roleId: fixture.roleInMinistryInB,
        status: spec.key === 'alreadyDeclined' ? 'declined' : 'confirmed',
      })
      .returning({ id: assignment.id });
    ids[spec.key] = row?.id ?? '';
  }
  const assignmentIds = ids as ScheduleAssignmentIds;

  const [check] = await testDb
    .insert(availabilityCheck)
    .values({
      churchId: fixture.churchB.id,
      planningCycleId: cycle?.id ?? '',
      ministryVolunteerId: fixture.dualMemberABMembershipInB,
    })
    .returning({ id: availabilityCheck.id });

  return { assignmentIds, availabilityCheckId: check?.id ?? '' };
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
  await testDb.insert(ministryInvitationRole).values({
    churchId: fixture.churchA.id,
    ministryInvitationId: invitation?.id ?? '',
    roleId: fixture.roleInMinistryOneA,
  });
  return invitation?.id ?? '';
}

function runTransfer() {
  return unitOfWork.run((tx) =>
    repository.executeTransfer({
      userId: UserId.from(fixture.dualMemberAB),
      ministryInvitationId: MinistryInvitationId.from(invitationId),
      sourceChurchId: ChurchId.from(fixture.churchB.id),
      destinationChurchId: ChurchId.from(fixture.churchA.id),
      confirmedAt: COMMIT,
      correlationId: CORRELATION_ID,
      tx,
    }),
  );
}

let availabilityCheckId: string;

beforeEach(async () => {
  await truncateAll();
  fixture = await seedTwoChurchIdentityFixture({ db: testDb });
  const schedule = await seedChurchBSchedule();
  assignmentIds = schedule.assignmentIds;
  availabilityCheckId = schedule.availabilityCheckId;
  invitationId = await seedPendingInvitationInChurchA();
});

describe('DrizzleVolunteerTransferRepository.executeTransfer', () => {
  it('cancels assignments iff their time slot starts strictly after the commit — asserted to the second', async () => {
    const outcome = await runTransfer();
    expect(outcome.kind).toBe('transferred');

    const statusOf = async (id: string) => {
      const [row] = await testDb
        .select({ status: assignment.status, reason: assignment.reason })
        .from(assignment)
        .where(eq(assignment.id, id));
      return row;
    };

    expect((await statusOf(assignmentIds.untouchedBefore))?.status).toBe(
      'confirmed',
    );
    expect((await statusOf(assignmentIds.startedRunning))?.status).toBe(
      'confirmed',
    );
    expect((await statusOf(assignmentIds.alreadyDeclined))?.status).toBe(
      'declined',
    );
    const cancelled = await statusOf(assignmentIds.cancelledAfter);
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.reason).toContain(CORRELATION_ID);

    if (outcome.kind !== 'transferred') throw new Error('unreachable');
    expect(outcome.result.withdrawnAssignmentCount).toBe(1);
  });

  it('writes one assignment_audit row per cancellation carrying the transfer correlation id', async () => {
    await runTransfer();

    const audits = await testDb
      .select()
      .from(assignmentAudit)
      .where(eq(assignmentAudit.assignmentId, assignmentIds.cancelledAfter));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'status_change',
      actorId: fixture.dualMemberAB,
      correlationId: CORRELATION_ID,
    });
    const untouchedAudits = await testDb
      .select()
      .from(assignmentAudit)
      .where(eq(assignmentAudit.assignmentId, assignmentIds.untouchedBefore));
    expect(untouchedAudits).toHaveLength(0);
  });

  it('retires the old profile and births a fresh destination profile', async () => {
    const outcome = await runTransfer();
    if (outcome.kind !== 'transferred') throw new Error('unreachable');

    const [oldProfile] = await testDb
      .select()
      .from(volunteer)
      .where(eq(volunteer.id, fixture.dualMemberABVolunteerInB));
    expect(oldProfile?.leftAt).toEqual(COMMIT);
    expect(oldProfile?.successorVolunteerId).toBe(
      outcome.result.destinationVolunteerId,
    );
    expect(oldProfile?.churchId).toBe(fixture.churchB.id);

    const [newProfile] = await testDb
      .select()
      .from(volunteer)
      .where(eq(volunteer.id, outcome.result.destinationVolunteerId));
    expect(newProfile).toMatchObject({
      churchId: fixture.churchA.id,
      status: 'active',
      notes: null,
      leftAt: null,
    });
  });

  it('flips former Ministry Memberships inactive with left_at while keeping Role, Team and Availability rows', async () => {
    const outcome = await runTransfer();
    if (outcome.kind !== 'transferred') throw new Error('unreachable');
    expect(outcome.result.endedMembershipCount).toBe(1);

    const [membership] = await testDb
      .select()
      .from(ministryVolunteer)
      .where(eq(ministryVolunteer.id, fixture.dualMemberABMembershipInB));
    expect(membership).toMatchObject({ status: 'inactive', leftAt: COMMIT });

    const roleRows = await testDb
      .select()
      .from(ministryVolunteerRole)
      .where(
        eq(
          ministryVolunteerRole.ministryVolunteerId,
          fixture.dualMemberABMembershipInB,
        ),
      );
    expect(roleRows).toHaveLength(1);
    const teamRows = await testDb
      .select()
      .from(ministryVolunteerTeam)
      .where(
        eq(
          ministryVolunteerTeam.ministryVolunteerId,
          fixture.dualMemberABMembershipInB,
        ),
      );
    expect(teamRows).toHaveLength(1);
    const [check] = await testDb
      .select()
      .from(availabilityCheck)
      .where(eq(availabilityCheck.id, availabilityCheckId));
    expect(check).toBeDefined();
  });

  it('accepts the Ministry Invitation and writes the transfer + identity audit rows', async () => {
    const outcome = await runTransfer();
    if (outcome.kind !== 'transferred') throw new Error('unreachable');

    const [invitation] = await testDb
      .select({ status: ministryInvitation.status })
      .from(ministryInvitation)
      .where(eq(ministryInvitation.id, invitationId));
    expect(invitation?.status).toBe('accepted');

    const transfers = await testDb
      .select()
      .from(volunteerTransfer)
      .where(eq(volunteerTransfer.userId, fixture.dualMemberAB));
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({
      sourceChurchId: fixture.churchB.id,
      destinationChurchId: fixture.churchA.id,
      withdrawnAssignmentCount: 1,
      endedMembershipCount: 1,
      correlationId: CORRELATION_ID,
    });

    const audits = await testDb
      .select()
      .from(identityAudit)
      .where(
        and(
          eq(identityAudit.actorId, fixture.dualMemberAB),
          eq(identityAudit.action, 'volunteer_transfer'),
        ),
      );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.correlationId).toBe(CORRELATION_ID);
  });

  it('is idempotent — a replay returns the original result and writes nothing new', async () => {
    const first = await runTransfer();
    if (first.kind !== 'transferred') throw new Error('unreachable');

    const second = await runTransfer();
    expect(second.kind).toBe('already-transferred');
    if (second.kind !== 'already-transferred') throw new Error('unreachable');
    expect(second.result.destinationVolunteerId).toBe(
      first.result.destinationVolunteerId,
    );

    const transfers = await testDb
      .select()
      .from(volunteerTransfer)
      .where(eq(volunteerTransfer.userId, fixture.dualMemberAB));
    expect(transfers).toHaveLength(1);
    const profiles = await testDb
      .select()
      .from(volunteer)
      .where(eq(volunteer.userId, fixture.dualMemberAB));
    expect(profiles).toHaveLength(2);
  });

  it('is idempotent under real concurrency — a racing confirm gets the original outcome, not a false terminal failure', async () => {
    // Both calls target the same (userId, ministryInvitationId): the loser
    // blocks on the FOR UPDATE volunteer-row lock, wakes once the winner
    // commits, finds `leftAt` already set, and must re-check for the
    // committed volunteer_transfer row rather than reporting failure.
    const [first, second] = await Promise.all([runTransfer(), runTransfer()]);

    const kinds = [first.kind, second.kind].sort();
    expect(kinds).toEqual(['already-transferred', 'transferred']);
    const winner = first.kind === 'transferred' ? first : second;
    const loser = first.kind === 'transferred' ? second : first;
    if (winner.kind !== 'transferred' || loser.kind !== 'already-transferred') {
      throw new Error('unreachable');
    }
    expect(loser.result.destinationVolunteerId).toBe(
      winner.result.destinationVolunteerId,
    );

    const transfers = await testDb
      .select()
      .from(volunteerTransfer)
      .where(eq(volunteerTransfer.userId, fixture.dualMemberAB));
    expect(transfers).toHaveLength(1);
    const profiles = await testDb
      .select()
      .from(volunteer)
      .where(eq(volunteer.userId, fixture.dualMemberAB));
    expect(profiles).toHaveLength(2);
  });

  it('is a terminal failure that changes nothing when the invitation is no longer pending', async () => {
    await testDb
      .update(ministryInvitation)
      .set({ status: 'canceled' })
      .where(eq(ministryInvitation.id, invitationId));

    const outcome = await runTransfer();
    expect(outcome).toEqual({
      kind: 'terminal-failure',
      reason: 'INVITATION_UNAVAILABLE',
    });

    const [oldProfile] = await testDb
      .select({ leftAt: volunteer.leftAt })
      .from(volunteer)
      .where(eq(volunteer.id, fixture.dualMemberABVolunteerInB));
    expect(oldProfile?.leftAt).toBeNull();
    const transfers = await testDb.select().from(volunteerTransfer);
    expect(transfers).toHaveLength(0);
  });
});

describe('DrizzleVolunteerTransferRepository.executeTransfer — notifications (issue #60)', () => {
  it('enqueues an ordinary Ministry digest — never an escalation — when a non-leader departs, even from a Ministry that already has no leader', async () => {
    // The fixture's `dualMemberAB` is a plain volunteer in `ministryInB`,
    // which happens to have no leader at all — but that pre-existing,
    // unrelated state must never turn a routine departure into a ChurchAdmin
    // escalation (spec: "Routine departures never reach ChurchAdmins").
    const outcome = await runTransfer();
    expect(outcome.kind).toBe('transferred');

    const messages = await testDb.select().from(outboxMessage);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      churchId: fixture.churchB.id,
      kind: 'transfer.ministry-digest',
      correlationId: CORRELATION_ID,
      status: 'pending',
    });
    expect(messages[0]?.payload).toMatchObject({
      ministryId: fixture.ministryInB,
      volunteerId: fixture.dualMemberABVolunteerInB,
    });
  });

  it('enqueues a leaderless-ministry escalation only when the departing Volunteer was themselves the last active leader', async () => {
    // Elevate the departing member to leader — and leave them the *only*
    // one — so the departure genuinely leaves the Ministry leaderless.
    await testDb
      .update(ministryVolunteer)
      .set({ ministryAccessLevel: 'leader' })
      .where(eq(ministryVolunteer.id, fixture.dualMemberABMembershipInB));

    const outcome = await runTransfer();
    expect(outcome.kind).toBe('transferred');

    const messages = await testDb.select().from(outboxMessage);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      kind: 'transfer.leaderless-ministry',
      correlationId: CORRELATION_ID,
    });
  });

  it('enqueues an ordinary digest, not an escalation, when the departing leader leaves a co-leader behind', async () => {
    await testDb
      .update(ministryVolunteer)
      .set({ ministryAccessLevel: 'leader' })
      .where(eq(ministryVolunteer.id, fixture.dualMemberABMembershipInB));
    const [coLeaderVolunteer] = await testDb
      .insert(volunteer)
      .values({ churchId: fixture.churchB.id, userId: fixture.adminB })
      .returning({ id: volunteer.id });
    await testDb.insert(ministryVolunteer).values({
      churchId: fixture.churchB.id,
      volunteerId: coLeaderVolunteer?.id ?? '',
      ministryId: fixture.ministryInB,
      ministryAccessLevel: 'leader',
    });

    const outcome = await runTransfer();
    expect(outcome.kind).toBe('transferred');

    const messages = await testDb.select().from(outboxMessage);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: 'transfer.ministry-digest' });
  });

  it('enqueues a ministry-digest addressed to the Ministry when an active leader remains', async () => {
    // A second, unrelated Volunteer holds active leadership in `ministryInB`,
    // so the departure is routine and never escalates.
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

    const outcome = await runTransfer();
    expect(outcome.kind).toBe('transferred');

    const messages = await testDb.select().from(outboxMessage);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      kind: 'transfer.ministry-digest',
      correlationId: CORRELATION_ID,
    });
  });

  it('is idempotent — a replay enqueues nothing new', async () => {
    await runTransfer();
    const second = await runTransfer();
    expect(second.kind).toBe('already-transferred');

    const messages = await testDb.select().from(outboxMessage);
    expect(messages).toHaveLength(1);
  });

  it('writes one digest per Ministry, not one per withdrawn assignment — twelve vacated shifts must not mean twelve emails', async () => {
    // Two more future, confirmed assignments in the same Ministry — on top of
    // the one `seedChurchBSchedule` already seeded (`cancelledAfter`), for
    // three withdrawn assignments total in this one Ministry.
    const [cycle] = await testDb
      .insert(planningCycle)
      .values({
        churchId: fixture.churchB.id,
        name: 'Second Cycle',
        // Non-overlapping with `seedChurchBSchedule`'s cycle — Planning Cycle
        // date ranges for a Church must not overlap.
        startDate: new Date('2027-01-01T00:00:00Z'),
        endDate: new Date('2027-02-01T00:00:00Z'),
      })
      .returning({ id: planningCycle.id });
    const [extraEvent] = await testDb
      .insert(event)
      .values({
        churchId: fixture.churchB.id,
        planningCycleId: cycle?.id ?? '',
        title: 'Extra Assignments Event',
        startDate: new Date(COMMIT.getTime() - 1000),
        endDate: new Date(COMMIT.getTime() + 24 * 3_600_000),
      })
      .returning({ id: event.id });
    const [extraParticipation] = await testDb
      .insert(ministryParticipation)
      .values({
        churchId: fixture.churchB.id,
        ministryId: fixture.ministryInB,
        eventId: extraEvent?.id ?? '',
      })
      .returning({ id: ministryParticipation.id });
    for (const offsetMs of [2_000, 3_000]) {
      const start = new Date(COMMIT.getTime() + offsetMs);
      const [slot] = await testDb
        .insert(timeSlot)
        .values({
          churchId: fixture.churchB.id,
          eventId: extraEvent?.id ?? '',
          startTime: start,
          endTime: new Date(start.getTime() + 3_600_000),
        })
        .returning({ id: timeSlot.id });
      const [slotShift] = await testDb
        .insert(shift)
        .values({
          churchId: fixture.churchB.id,
          participationId: extraParticipation?.id ?? '',
          timeSlotId: slot?.id ?? '',
          startTime: start,
          endTime: new Date(start.getTime() + 3_600_000),
        })
        .returning({ id: shift.id });
      await testDb.insert(assignment).values({
        churchId: fixture.churchB.id,
        participationId: extraParticipation?.id ?? '',
        shiftId: slotShift?.id ?? '',
        volunteerId: fixture.dualMemberABVolunteerInB,
        roleId: fixture.roleInMinistryInB,
        status: 'confirmed',
      });
    }

    const outcome = await runTransfer();
    if (outcome.kind !== 'transferred') throw new Error('unreachable');
    expect(outcome.result.withdrawnAssignmentCount).toBe(3);

    const messages = await testDb.select().from(outboxMessage);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.payload).toMatchObject({
      ministryId: fixture.ministryInB,
    });
  });
});

describe('DrizzleVolunteerTransferRepository.getDigestDetails', () => {
  it('resolves the Ministry name, the retired Volunteer’s display name, and the withdrawn assignment for this Ministry only', async () => {
    await runTransfer();

    const details = await repository.getDigestDetails({
      churchId: ChurchId.from(fixture.churchB.id),
      ministryId: MinistryId.from(fixture.ministryInB),
      volunteerId: VolunteerId.from(fixture.dualMemberABVolunteerInB),
      correlationId: CORRELATION_ID,
    });

    expect(details.ministryName).toContain('Hospitality');
    expect(details.volunteerName).toBe('Fixture Dual Member AB');
    expect(details.withdrawnAssignments).toHaveLength(1);
    expect(details.withdrawnAssignments[0]).toMatchObject({
      eventName: 'Transfer Sunday',
      roleName: expect.stringContaining('Greeter'),
    });
  });
});
