import {
  assignment,
  assignmentAudit,
  availabilityCheck,
  identityAudit,
  ministryInvitation,
  ministryInvitationRole,
  ministryMembership,
  ministryMembershipRole,
  ministryMembershipTeam,
  outboxMessage,
  volunteer,
  volunteerTransfer,
} from '@church/db';
import { fromDate, parseCalendarDay, parseInstant } from '@church/time';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories';
import { DrizzleVolunteerTransferRepository } from '@/infrastructure/repositories/drizzle-volunteer-transfer.repository';
import {
  buildAssignedShift,
  buildCycle,
  buildEvent,
  buildMinistryParticipation,
} from '@/seeds/builders/scheduling';
import { buildAvailabilityCheck } from '@/seeds/builders/unavailable-shift';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '@/tests/test-support/identity-fixtures';

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
 * event time blocks, spanning the commit instant to the second.
 */
async function seedChurchBSchedule(): Promise<SeedScheduleResult> {
  const churchId = fixture.churchB.id;
  const cycle = await buildCycle({
    db: testDb,
    churchId,
    name: 'Transfer Cycle',
    startDate: parseCalendarDay({ value: '2026-09-01' }),
    endDate: parseCalendarDay({ value: '2026-10-01' }),
    state: 'draft',
  });
  const runningEvent = await buildEvent({
    db: testDb,
    churchId,
    cycleId: cycle.id,
    title: 'Transfer Sunday',
    // Event runs from before to well after the commit instant.
    start: parseInstant({ value: '2026-09-15T09:00:00Z' }),
    end: parseInstant({ value: '2026-09-15T18:00:00Z' }),
    status: 'draft',
  });
  const participation = await buildMinistryParticipation({
    db: testDb,
    churchId,
    ministryId: fixture.ministryInB,
    eventId: runningEvent.id,
    state: 'preparing',
    eventTimeBlockIds: [],
  });

  const eventTimeBlockSpecs = [
    { key: 'untouchedBefore', start: new Date(COMMIT.getTime() - 1000) },
    { key: 'cancelledAfter', start: new Date(COMMIT.getTime() + 1000) },
    {
      key: 'startedRunning',
      start: new Date('2026-09-15T11:00:00Z'),
    },
    { key: 'alreadyDeclined', start: new Date(COMMIT.getTime() + 3_600_000) },
  ] as const;

  const ids: Partial<ScheduleAssignmentIds> = {};
  for (const spec of eventTimeBlockSpecs) {
    const booked = await buildAssignedShift({
      db: testDb,
      churchId,
      eventId: runningEvent.id,
      participationId: participation.id,
      volunteerId: fixture.dualMemberABVolunteerInB,
      roleId: fixture.roleInMinistryInB,
      start: fromDate({ date: spec.start }),
      end: fromDate({ date: new Date(spec.start.getTime() + 3_600_000) }),
      status: spec.key === 'alreadyDeclined' ? 'declined' : 'confirmed',
    });
    ids[spec.key] = booked.assignment.id;
  }
  const assignmentIds = ids as ScheduleAssignmentIds;

  const check = await buildAvailabilityCheck({
    db: testDb,
    churchId,
    cycleId: cycle.id,
    ministryMembershipId: fixture.dualMemberABMembershipInB,
  });

  return { assignmentIds, availabilityCheckId: check.id };
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
  it('cancels assignments iff their event time block starts strictly after the commit — asserted to the second', async () => {
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

  it('flips former Ministry Memberships inactive with left_at while keeping Role, Team and UnavailableShift rows', async () => {
    const outcome = await runTransfer();
    if (outcome.kind !== 'transferred') throw new Error('unreachable');
    expect(outcome.result.endedMembershipCount).toBe(1);

    const [membership] = await testDb
      .select()
      .from(ministryMembership)
      .where(eq(ministryMembership.id, fixture.dualMemberABMembershipInB));
    expect(membership).toMatchObject({ status: 'inactive', leftAt: COMMIT });

    const roleRows = await testDb
      .select()
      .from(ministryMembershipRole)
      .where(
        eq(
          ministryMembershipRole.ministryMembershipId,
          fixture.dualMemberABMembershipInB,
        ),
      );
    expect(roleRows).toHaveLength(1);
    const teamRows = await testDb
      .select()
      .from(ministryMembershipTeam)
      .where(
        eq(
          ministryMembershipTeam.ministryMembershipId,
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

describe('DrizzleVolunteerTransferRepository.executeTransfer — digest recipients (issue #60)', () => {
  async function transferDigests() {
    const outcome = await runTransfer();
    if (outcome.kind !== 'transferred') throw new Error('unreachable');
    return outcome.digests;
  }

  async function addLeader(userId: string): Promise<void> {
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

  async function promoteDepartingVolunteerToLeader(): Promise<void> {
    await testDb
      .update(ministryMembership)
      .set({ ministryAccessLevel: 'leader' })
      .where(eq(ministryMembership.id, fixture.dualMemberABMembershipInB));
  }

  it('selects an ordinary digest with no recipients — never an escalation — when a non-leader departs a Ministry that already has no leader', async () => {
    // `ministryInB` has no leader at all; that pre-existing, unrelated state
    // must never turn a routine departure into a ChurchAdmin escalation.
    const digests = await transferDigests();

    expect(digests).toEqual([
      {
        kind: 'transfer_ministry_digest',
        ministryId: fixture.ministryInB,
        recipientUserIds: [],
      },
    ]);
  });

  it('escalates to every ChurchAdmin only when the departing Volunteer was the last active leader', async () => {
    await promoteDepartingVolunteerToLeader();

    const digests = await transferDigests();

    expect(digests).toEqual([
      {
        kind: 'transfer_leaderless_ministry',
        ministryId: fixture.ministryInB,
        recipientUserIds: [fixture.adminB],
      },
    ]);
  });

  it('selects the remaining co-leader, not an escalation, when a departing leader leaves one behind', async () => {
    await promoteDepartingVolunteerToLeader();
    await addLeader(fixture.adminB);

    const digests = await transferDigests();

    expect(digests).toEqual([
      {
        kind: 'transfer_ministry_digest',
        ministryId: fixture.ministryInB,
        recipientUserIds: [fixture.adminB],
      },
    ]);
  });

  it('selects every remaining active leader, after the departing membership ended', async () => {
    await addLeader(fixture.adminB);

    const digests = await transferDigests();

    expect(digests).toHaveLength(1);
    expect(digests[0]?.recipientUserIds).toEqual([fixture.adminB]);
    expect(digests[0]?.recipientUserIds).not.toContain(fixture.dualMemberAB);
  });

  it('writes no outbox row itself — the caller enqueues through the notification boundary', async () => {
    await addLeader(fixture.adminB);
    await runTransfer();

    expect(await testDb.select().from(outboxMessage)).toHaveLength(0);
  });

  it('is idempotent — a replay selects no digests', async () => {
    await runTransfer();
    const second = await runTransfer();

    expect(second.kind).toBe('already-transferred');
    expect(second).not.toHaveProperty('digests');
  });

  it('selects one digest per Ministry, not one per withdrawn assignment — twelve vacated shifts must not mean twelve emails', async () => {
    // Two more future, confirmed assignments in the same Ministry — on top of
    // the one `seedChurchBSchedule` already seeded (`cancelledAfter`), for
    // three withdrawn assignments total in this one Ministry.
    const churchId = fixture.churchB.id;
    const cycle = await buildCycle({
      db: testDb,
      churchId,
      name: 'Second Cycle',
      // Non-overlapping with `seedChurchBSchedule`'s cycle — Cycle
      // date ranges for a Church must not overlap.
      startDate: parseCalendarDay({ value: '2027-01-01' }),
      endDate: parseCalendarDay({ value: '2027-02-01' }),
      state: 'draft',
    });
    const extraEvent = await buildEvent({
      db: testDb,
      churchId,
      cycleId: cycle.id,
      title: 'Extra Assignments Event',
      start: fromDate({ date: new Date(COMMIT.getTime() - 1000) }),
      end: fromDate({ date: new Date(COMMIT.getTime() + 24 * 3_600_000) }),
      status: 'draft',
    });
    const extraParticipation = await buildMinistryParticipation({
      db: testDb,
      churchId,
      ministryId: fixture.ministryInB,
      eventId: extraEvent.id,
      state: 'preparing',
      eventTimeBlockIds: [],
    });
    for (const offsetMs of [2_000, 3_000]) {
      const start = new Date(COMMIT.getTime() + offsetMs);
      await buildAssignedShift({
        db: testDb,
        churchId,
        eventId: extraEvent.id,
        participationId: extraParticipation.id,
        volunteerId: fixture.dualMemberABVolunteerInB,
        roleId: fixture.roleInMinistryInB,
        start: fromDate({ date: start }),
        end: fromDate({ date: new Date(start.getTime() + 3_600_000) }),
        status: 'confirmed',
      });
    }

    const outcome = await runTransfer();
    if (outcome.kind !== 'transferred') throw new Error('unreachable');
    expect(outcome.result.withdrawnAssignmentCount).toBe(3);

    expect(outcome.digests).toHaveLength(1);
    expect(outcome.digests[0]?.ministryId).toBe(fixture.ministryInB);
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
