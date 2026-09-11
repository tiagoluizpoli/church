import {
  assignment,
  assignmentAudit,
  event,
  identityAudit,
  ministry,
  ministryInvitation,
  ministryInvitationRole,
  ministryParticipation,
  ministryVolunteer,
  outboxMessage,
  role,
  shift,
  timeSlot,
  user,
  volunteer,
  volunteerTransfer,
} from '@church/db';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import type {
  VolunteerId,
  VolunteerTransferId,
} from '../../domain/branded-ids';
import type {
  ExecuteVolunteerTransferInput,
  ExecuteVolunteerTransferOutcome,
  GetTransferDigestDetailsInput,
  GetTransferImpactInput,
  TransferDigestDetails,
  TransferImpact,
  VolunteerTransferRepository,
  VolunteerTransferResult,
} from '../../domain/contracts/infrastructure/volunteer-transfer.repository';
import { getClient, withChurchIsolation } from './helpers';
import {
  grantMinistryVolunteerRoles,
  insertMinistryVolunteerMembership,
} from './ministry-grant';
import type { AnyDrizzleDb } from './types';

const ACTIVE_ASSIGNMENT_STATUSES = ['draft', 'pending', 'confirmed'] as const;

interface DrizzleVolunteerTransferRepositoryInput {
  db: AnyDrizzleDb;
}

/**
 * Every step of spec §8.5, inside the caller's transaction. The old
 * `volunteer` row is retired (never moved), the destination is born fresh, and
 * only assignments whose **time slot** starts strictly after the commit are
 * cancelled — a slot already under way is protected even inside a still-running
 * event. The `volunteer_transfer` row is the idempotency key: a replay returns
 * the original result and writes nothing (the outbox enqueue is skipped on
 * replay too, for the same reason). One `outbox_message` row is written per
 * affected Ministry (§8.8, issue #60): `transfer.ministry-digest` when at
 * least one active leader remains, `transfer.leaderless-ministry` — addressed
 * to ChurchAdmins instead — when none does.
 */
export class DrizzleVolunteerTransferRepository
  implements VolunteerTransferRepository
{
  constructor({ db }: DrizzleVolunteerTransferRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async getTransferImpact({
    userId,
    sourceChurchId,
    now,
  }: GetTransferImpactInput): Promise<TransferImpact> {
    const db = getClient(this.db);
    const [activeProfile] = await db
      .select({ id: volunteer.id })
      .from(volunteer)
      .where(
        and(
          eq(volunteer.userId, userId),
          eq(volunteer.churchId, sourceChurchId),
          sql`${volunteer.leftAt} is null`,
        ),
      );
    if (!activeProfile) {
      return { endedMemberships: [], withdrawnAssignments: [] };
    }

    const endedMemberships = await db
      .select({ ministryName: ministry.name })
      .from(ministryVolunteer)
      .innerJoin(ministry, eq(ministry.id, ministryVolunteer.ministryId))
      .where(
        and(
          eq(ministryVolunteer.volunteerId, activeProfile.id),
          eq(ministryVolunteer.churchId, sourceChurchId),
          eq(ministryVolunteer.status, 'active'),
        ),
      )
      .orderBy(asc(ministry.name));

    const withdrawnAssignments = await db
      .select({
        eventName: event.title,
        timeSlotStart: timeSlot.startTime,
        roleName: role.name,
      })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(timeSlot, eq(timeSlot.id, shift.timeSlotId))
      .innerJoin(event, eq(event.id, timeSlot.eventId))
      .innerJoin(role, eq(role.id, assignment.roleId))
      .where(
        and(
          eq(assignment.volunteerId, activeProfile.id),
          inArray(assignment.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
          gt(timeSlot.startTime, now),
        ),
      )
      .orderBy(asc(timeSlot.startTime));

    return { endedMemberships, withdrawnAssignments };
  }

  async executeTransfer({
    userId,
    ministryInvitationId,
    sourceChurchId,
    destinationChurchId,
    confirmedAt,
    correlationId,
    tx,
  }: ExecuteVolunteerTransferInput): Promise<ExecuteVolunteerTransferOutcome> {
    const db = getClient(this.db, tx);

    // 1. Idempotent replay short-circuits before anything is read or locked —
    //    the unique (userId, ministryInvitationId) row is the key (§8.6).
    const existing = await findExistingTransfer({
      db,
      userId,
      ministryInvitationId,
    });
    if (existing) {
      return { kind: 'already-transferred', result: toResult(existing) };
    }

    // 2. Lock the active profile and the memberships about to end.
    const [activeProfile] = await db
      .select({ id: volunteer.id })
      .from(volunteer)
      .where(
        and(
          eq(volunteer.userId, userId),
          eq(volunteer.churchId, sourceChurchId),
          sql`${volunteer.leftAt} is null`,
        ),
      )
      .for('update');
    if (!activeProfile) {
      // A concurrent confirm for this same invitation may have retired this
      // profile and committed between our step-1 read and this lock: step 1
      // ran unlocked, so it cannot see a writer still in flight. Re-check
      // before reporting failure, so the loser of that race also gets the
      // idempotent replay outcome rather than a false terminal failure.
      const raced = await findExistingTransfer({
        db,
        userId,
        ministryInvitationId,
      });
      if (raced) {
        return { kind: 'already-transferred', result: toResult(raced) };
      }
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    }
    const sourceMemberships = await db
      .select({
        id: ministryVolunteer.id,
        ministryId: ministryVolunteer.ministryId,
        ministryAccessLevel: ministryVolunteer.ministryAccessLevel,
      })
      .from(ministryVolunteer)
      .where(
        and(
          eq(ministryVolunteer.volunteerId, activeProfile.id),
          eq(ministryVolunteer.churchId, sourceChurchId),
          eq(ministryVolunteer.status, 'active'),
        ),
      )
      .for('update');

    // 3. Re-validate the destination invitation is still redeemable.
    const [invitationRow] = await db
      .select({
        status: ministryInvitation.status,
        expiresAt: ministryInvitation.expiresAt,
        ministryId: ministryInvitation.ministryId,
        ministryAccessLevel: ministryInvitation.ministryAccessLevel,
      })
      .from(ministryInvitation)
      .where(
        and(
          withChurchIsolation(ministryInvitation, destinationChurchId),
          eq(ministryInvitation.id, ministryInvitationId),
        ),
      )
      .for('update');
    if (
      !invitationRow ||
      invitationRow.status !== 'pending' ||
      invitationRow.expiresAt <= confirmedAt
    ) {
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    }

    // 4. Retire the old profile (successor pointer set in step 9).
    await db
      .update(volunteer)
      .set({ leftAt: confirmedAt })
      .where(eq(volunteer.id, activeProfile.id));

    // 5. Former-Church Ministry Memberships go inactive; Role / Team
    //    qualification rows and Availability records are left untouched.
    const membershipIds = sourceMemberships.map(({ id }) => id);
    if (membershipIds.length > 0) {
      await db
        .update(ministryVolunteer)
        .set({ status: 'inactive', leftAt: confirmedAt })
        .where(inArray(ministryVolunteer.id, membershipIds));
    }

    // 6. Cancel assignments whose time slot starts strictly after the commit
    //    (§8.4: the cut is the slot start, not the shift or the event date).
    const reason = `Volunteer Transfer ${correlationId}`;
    const futureAssignments = await db
      .select({
        id: assignment.id,
        ministryId: ministryParticipation.ministryId,
      })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(timeSlot, eq(timeSlot.id, shift.timeSlotId))
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, shift.participationId),
      )
      .where(
        and(
          eq(assignment.volunteerId, activeProfile.id),
          inArray(assignment.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
          gt(timeSlot.startTime, confirmedAt),
        ),
      );
    const withdrawnAssignmentIds = futureAssignments.map(({ id }) => id);
    if (withdrawnAssignmentIds.length > 0) {
      await db
        .update(assignment)
        .set({ status: 'cancelled', reason })
        .where(inArray(assignment.id, withdrawnAssignmentIds));
      await db.insert(assignmentAudit).values(
        withdrawnAssignmentIds.map((assignmentId) => ({
          churchId: sourceChurchId,
          assignmentId,
          actorId: userId,
          action: 'status_change' as const,
          reason,
          correlationId,
          timestamp: confirmedAt,
        })),
      );
    }

    // 7. Enqueue one notification per affected Ministry (spec §8.8, issue
    //    #60) — affected meaning a Membership ended there or an Assignment
    //    was withdrawn there. Escalates to ChurchAdmins *only* when the
    //    departing Volunteer was themselves an active leader of that Ministry
    //    and no other active leader remains — not merely because the
    //    Ministry happens to have none (a pre-existing, unrelated state must
    //    never turn an ordinary member's departure into an escalation).
    const wasLeaderByMinistryId = new Map<string, boolean>(
      sourceMemberships.map(({ ministryId, ministryAccessLevel }) => [
        ministryId,
        ministryAccessLevel === 'leader',
      ]),
    );
    const affectedMinistryIds = new Set<string>([
      ...sourceMemberships.map(({ ministryId }) => ministryId),
      ...futureAssignments.map(({ ministryId }) => ministryId),
    ]);
    for (const affectedMinistryId of affectedMinistryIds) {
      let kind: 'transfer.ministry-digest' | 'transfer.leaderless-ministry' =
        'transfer.ministry-digest';
      if (wasLeaderByMinistryId.get(affectedMinistryId)) {
        const [remainingLeader] = await db
          .select({ id: ministryVolunteer.id })
          .from(ministryVolunteer)
          .where(
            and(
              eq(ministryVolunteer.ministryId, affectedMinistryId),
              eq(ministryVolunteer.churchId, sourceChurchId),
              eq(ministryVolunteer.status, 'active'),
              eq(ministryVolunteer.ministryAccessLevel, 'leader'),
            ),
          )
          .limit(1);
        if (!remainingLeader) kind = 'transfer.leaderless-ministry';
      }
      await db.insert(outboxMessage).values({
        churchId: sourceChurchId,
        kind,
        payload: {
          ministryId: affectedMinistryId,
          volunteerId: activeProfile.id,
        },
        correlationId,
        scheduledFor: confirmedAt,
      });
    }

    // 8. Birth the destination profile — fresh, nothing carried over.
    const [newProfile] = await db
      .insert(volunteer)
      .values({ churchId: destinationChurchId, userId, status: 'active' })
      .returning({ id: volunteer.id });
    if (!newProfile) throw new Error('Destination Volunteer insert failed');
    const newMembershipId = await insertMinistryVolunteerMembership({
      db,
      churchId: destinationChurchId,
      ministryId: invitationRow.ministryId,
      volunteerId: newProfile.id,
      ministryAccessLevel: invitationRow.ministryAccessLevel,
    });
    const invitedRoles = await db
      .select({ roleId: ministryInvitationRole.roleId })
      .from(ministryInvitationRole)
      .where(
        and(
          withChurchIsolation(ministryInvitationRole, destinationChurchId),
          eq(ministryInvitationRole.ministryInvitationId, ministryInvitationId),
        ),
      );
    await grantMinistryVolunteerRoles({
      db,
      churchId: destinationChurchId,
      ministryVolunteerId: newMembershipId,
      roleIds: invitedRoles.map(({ roleId }) => roleId),
    });

    // 9. Make the retirement chain walkable without an audit query.
    await db
      .update(volunteer)
      .set({ successorVolunteerId: newProfile.id })
      .where(eq(volunteer.id, activeProfile.id));

    // 10. Accept the Ministry Invitation (guarded on `pending`).
    const [accepted] = await db
      .update(ministryInvitation)
      .set({ status: 'accepted', acceptedAt: confirmedAt })
      .where(
        and(
          withChurchIsolation(ministryInvitation, destinationChurchId),
          eq(ministryInvitation.id, ministryInvitationId),
          eq(ministryInvitation.status, 'pending'),
        ),
      )
      .returning({ id: ministryInvitation.id });
    if (!accepted) {
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    }

    // 11. The audit + idempotency row.
    const [transferRow] = await db
      .insert(volunteerTransfer)
      .values({
        userId,
        sourceChurchId,
        destinationChurchId,
        sourceVolunteerId: activeProfile.id,
        destinationVolunteerId: newProfile.id,
        ministryInvitationId,
        withdrawnAssignmentCount: withdrawnAssignmentIds.length,
        endedMembershipCount: membershipIds.length,
        confirmedAt,
        correlationId,
      })
      .returning();
    if (!transferRow) throw new Error('volunteer_transfer insert failed');

    // 12. The identity audit act.
    await db.insert(identityAudit).values({
      churchId: destinationChurchId,
      ministryInvitationId,
      actorId: userId,
      action: 'volunteer_transfer',
      correlationId,
      timestamp: confirmedAt,
    });

    return { kind: 'transferred', result: toResult(transferRow) };
  }

  async getDigestDetails({
    churchId,
    ministryId,
    volunteerId,
    correlationId,
  }: GetTransferDigestDetailsInput): Promise<TransferDigestDetails> {
    const db = getClient(this.db);

    const [ministryRow] = await db
      .select({ name: ministry.name })
      .from(ministry)
      .where(
        and(
          eq(ministry.id, ministryId),
          withChurchIsolation(ministry, churchId),
        ),
      );
    if (!ministryRow) {
      throw new Error(`Ministry not found for transfer digest: ${ministryId}`);
    }

    // The retired source profile — never deleted, so still resolvable here.
    const [volunteerRow] = await db
      .select({ name: user.name })
      .from(volunteer)
      .innerJoin(user, eq(user.id, volunteer.userId))
      .where(
        and(
          eq(volunteer.id, volunteerId),
          withChurchIsolation(volunteer, churchId),
        ),
      );
    if (!volunteerRow) {
      throw new Error(
        `Volunteer not found for transfer digest: ${volunteerId}`,
      );
    }

    const withdrawnAssignments = await db
      .select({
        eventName: event.title,
        timeSlotStart: timeSlot.startTime,
        roleName: role.name,
      })
      .from(assignmentAudit)
      .innerJoin(assignment, eq(assignment.id, assignmentAudit.assignmentId))
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, shift.participationId),
      )
      .innerJoin(timeSlot, eq(timeSlot.id, shift.timeSlotId))
      .innerJoin(event, eq(event.id, timeSlot.eventId))
      .innerJoin(role, eq(role.id, assignment.roleId))
      .where(
        and(
          eq(assignmentAudit.correlationId, correlationId),
          eq(assignmentAudit.churchId, churchId),
          eq(ministryParticipation.ministryId, ministryId),
        ),
      )
      .orderBy(asc(timeSlot.startTime));

    return {
      ministryName: ministryRow.name,
      volunteerName: volunteerRow.name,
      withdrawnAssignments,
    };
  }
}

interface VolunteerTransferRow {
  id: string;
  sourceVolunteerId: string;
  destinationVolunteerId: string;
  withdrawnAssignmentCount: number;
  endedMembershipCount: number;
}

interface FindExistingTransferInput {
  db: AnyDrizzleDb;
  userId: ExecuteVolunteerTransferInput['userId'];
  ministryInvitationId: ExecuteVolunteerTransferInput['ministryInvitationId'];
}

/** The `(userId, ministryInvitationId)` idempotency key lookup (spec §8.6). */
async function findExistingTransfer({
  db,
  userId,
  ministryInvitationId,
}: FindExistingTransferInput): Promise<VolunteerTransferRow | undefined> {
  const [existing] = await db
    .select()
    .from(volunteerTransfer)
    .where(
      and(
        eq(volunteerTransfer.userId, userId),
        eq(volunteerTransfer.ministryInvitationId, ministryInvitationId),
      ),
    );
  return existing;
}

function toResult(row: VolunteerTransferRow): VolunteerTransferResult {
  return {
    volunteerTransferId: row.id as VolunteerTransferId,
    sourceVolunteerId: row.sourceVolunteerId as VolunteerId,
    destinationVolunteerId: row.destinationVolunteerId as VolunteerId,
    withdrawnAssignmentCount: row.withdrawnAssignmentCount,
    endedMembershipCount: row.endedMembershipCount,
  };
}
