import {
  assignment,
  assignmentAudit,
  event,
  identityAudit,
  ministry,
  ministryInvitation,
  ministryInvitationRole,
  ministryVolunteer,
  ministryVolunteerRole,
  role,
  shift,
  timeSlot,
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
  GetTransferImpactInput,
  TransferImpact,
  VolunteerTransferRepository,
  VolunteerTransferResult,
} from '../../domain/contracts/infrastructure/volunteer-transfer.repository';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

const ACTIVE_ASSIGNMENT_STATUSES = ['draft', 'pending', 'confirmed'] as const;

interface DrizzleVolunteerTransferRepositoryInput {
  db: AnyDrizzleDb;
}

/**
 * Steps 1–8 and 10–11 of spec §8.5, inside the caller's transaction. The old
 * `volunteer` row is retired (never moved), the destination is born fresh, and
 * only assignments whose **time slot** starts strictly after the commit are
 * cancelled — a slot already under way is protected even inside a still-running
 * event. The `volunteer_transfer` row is the idempotency key: a replay returns
 * the original result and writes nothing. The outbox enqueue (§8.5 step 9) is
 * issue #60 and is deliberately absent here.
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
    const [existing] = await db
      .select()
      .from(volunteerTransfer)
      .where(
        and(
          eq(volunteerTransfer.userId, userId),
          eq(volunteerTransfer.ministryInvitationId, ministryInvitationId),
        ),
      );
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
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    }
    const sourceMemberships = await db
      .select({ id: ministryVolunteer.id })
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

    // 4. Retire the old profile (successor pointer set in step 8).
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
      .select({ id: assignment.id })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(timeSlot, eq(timeSlot.id, shift.timeSlotId))
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

    // 7. Birth the destination profile — fresh, nothing carried over.
    const [newProfile] = await db
      .insert(volunteer)
      .values({ churchId: destinationChurchId, userId, status: 'active' })
      .returning({ id: volunteer.id });
    if (!newProfile) throw new Error('Destination Volunteer insert failed');
    const [newMembership] = await db
      .insert(ministryVolunteer)
      .values({
        churchId: destinationChurchId,
        ministryId: invitationRow.ministryId,
        volunteerId: newProfile.id,
        ministryAccessLevel: invitationRow.ministryAccessLevel,
      })
      .returning({ id: ministryVolunteer.id });
    if (!newMembership) {
      throw new Error('Destination Ministry Membership insert failed');
    }
    const invitedRoles = await db
      .select({ roleId: ministryInvitationRole.roleId })
      .from(ministryInvitationRole)
      .where(
        and(
          withChurchIsolation(ministryInvitationRole, destinationChurchId),
          eq(ministryInvitationRole.ministryInvitationId, ministryInvitationId),
        ),
      );
    if (invitedRoles.length > 0) {
      await db
        .insert(ministryVolunteerRole)
        .values(
          invitedRoles.map(({ roleId }) => ({
            churchId: destinationChurchId,
            ministryVolunteerId: newMembership.id,
            roleId,
          })),
        )
        .onConflictDoNothing();
    }

    // 8. Make the retirement chain walkable without an audit query.
    await db
      .update(volunteer)
      .set({ successorVolunteerId: newProfile.id })
      .where(eq(volunteer.id, activeProfile.id));

    // 9. Accept the Ministry Invitation (guarded on `pending`).
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

    // 10. The audit + idempotency row.
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

    // 11. The identity audit act.
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
}

interface VolunteerTransferRow {
  id: string;
  sourceVolunteerId: string;
  destinationVolunteerId: string;
  withdrawnAssignmentCount: number;
  endedMembershipCount: number;
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
