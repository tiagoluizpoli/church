import { NotFoundError } from '@church/core';
import {
  assignment,
  assignmentAudit,
  church,
  event,
  eventTimeBlock,
  identityAudit,
  member,
  ministry,
  ministryInvitation,
  ministryInvitationRole,
  ministryMembership,
  ministryParticipation,
  organization,
  role,
  sector,
  shift,
  shiftRequirement,
  user,
  volunteer,
  volunteerTransfer,
} from '@church/db';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  type ChurchId,
  MinistryId,
  UserId,
  type VolunteerId,
  type VolunteerTransferId,
} from '../../domain/branded-ids';
import type {
  ExecuteVolunteerTransferInput,
  ExecuteVolunteerTransferOutcome,
  GetTransferDigestDetailsInput,
  GetTransferImpactInput,
  TransferDigest,
  TransferDigestDetails,
  TransferImpact,
  VolunteerTransferRepository,
  VolunteerTransferResult,
} from '../../domain/contracts/infrastructure/volunteer-transfer.repository';
import { getClient, withChurchIsolation } from './helpers';
import {
  grantMinistryMembershipRoles,
  insertMinistryMembership,
} from './ministry-grant';
import type { AnyDrizzleDb } from './types';

const ACTIVE_ASSIGNMENT_STATUSES = ['draft', 'pending', 'confirmed'] as const;

interface DrizzleVolunteerTransferRepositoryInput {
  db: AnyDrizzleDb;
}

/**
 * Every step of spec §8.5, inside the caller's transaction. The old
 * `volunteer` row is retired (never moved), the destination is born fresh, and
 * only assignments whose **event time block** starts strictly after the commit are
 * cancelled — an event time block already under way is protected even inside a still-running
 * event. The `volunteer_transfer` row is the idempotency key: a replay returns
 * the original result and writes nothing (and selects no digests, so nothing
 * is enqueued twice). One digest is selected per affected Ministry (§8.8,
 * issue #60); the caller enqueues them in this same transaction.
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
    const db = getClient({ db: this.db });
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
      .from(ministryMembership)
      .innerJoin(ministry, eq(ministry.id, ministryMembership.ministryId))
      .where(
        and(
          eq(ministryMembership.volunteerId, activeProfile.id),
          eq(ministryMembership.churchId, sourceChurchId),
          eq(ministryMembership.status, 'active'),
        ),
      )
      .orderBy(asc(ministry.name));

    const withdrawnAssignments = await db
      .select({
        eventName: event.title,
        eventTimeBlockStart: eventTimeBlock.startTime,
        roleName: role.name,
      })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .innerJoin(event, eq(event.id, eventTimeBlock.eventId))
      .innerJoin(role, eq(role.id, assignment.roleId))
      .where(
        and(
          eq(assignment.volunteerId, activeProfile.id),
          inArray(assignment.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
          gt(eventTimeBlock.startTime, now),
        ),
      )
      .orderBy(asc(eventTimeBlock.startTime));

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
    const db = getClient({ db: this.db, tx });

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
        id: ministryMembership.id,
        ministryId: ministryMembership.ministryId,
        ministryAccessLevel: ministryMembership.ministryAccessLevel,
      })
      .from(ministryMembership)
      .where(
        and(
          eq(ministryMembership.volunteerId, activeProfile.id),
          eq(ministryMembership.churchId, sourceChurchId),
          eq(ministryMembership.status, 'active'),
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
          withChurchIsolation({
            table: ministryInvitation,
            churchId: destinationChurchId,
          }),
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
    //    qualification rows and UnavailableShift records are left untouched.
    const membershipIds = sourceMemberships.map(({ id }) => id);
    if (membershipIds.length > 0) {
      await db
        .update(ministryMembership)
        .set({ status: 'inactive', leftAt: confirmedAt })
        .where(inArray(ministryMembership.id, membershipIds));
    }

    // 6. Cancel assignments whose event time block starts strictly after the commit
    //    (§8.4: the cut is the event time block start, not the shift or the event date).
    const reason = `Volunteer Transfer ${correlationId}`;
    const futureAssignments = await db
      .select({
        id: assignment.id,
        ministryId: ministryParticipation.ministryId,
      })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, shift.participationId),
      )
      .where(
        and(
          eq(assignment.volunteerId, activeProfile.id),
          inArray(assignment.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
          gt(eventTimeBlock.startTime, confirmedAt),
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

    // 7. Select one digest per affected Ministry (spec §8.8, issue #60) —
    //    affected meaning a Membership ended there or an Assignment was
    //    withdrawn there. Read after step 5, so the departing Volunteer is
    //    never among the remaining leaders. Escalates to ChurchAdmins *only*
    //    when the departing Volunteer was themselves an active leader of that
    //    Ministry and no other active leader remains — not merely because the
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
    const digests: TransferDigest[] = [];
    for (const affectedMinistryId of affectedMinistryIds) {
      const leaderUserIds = await listActiveLeaderUserIds({
        db,
        churchId: sourceChurchId,
        ministryId: affectedMinistryId,
      });
      const escalate =
        wasLeaderByMinistryId.get(affectedMinistryId) === true &&
        leaderUserIds.length === 0;
      digests.push({
        kind: escalate
          ? 'transfer_leaderless_ministry'
          : 'transfer_ministry_digest',
        ministryId: MinistryId.from(affectedMinistryId),
        recipientUserIds: escalate
          ? await listChurchAdminUserIds({ db, churchId: sourceChurchId })
          : leaderUserIds,
      });
    }

    // 8. Birth the destination profile — fresh, nothing carried over.
    const [newProfile] = await db
      .insert(volunteer)
      .values({ churchId: destinationChurchId, userId, status: 'active' })
      .returning({ id: volunteer.id });
    if (!newProfile) throw new Error('Destination Volunteer insert failed');
    const newMembershipId = await insertMinistryMembership({
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
          withChurchIsolation({
            table: ministryInvitationRole,
            churchId: destinationChurchId,
          }),
          eq(ministryInvitationRole.ministryInvitationId, ministryInvitationId),
        ),
      );
    await grantMinistryMembershipRoles({
      db,
      churchId: destinationChurchId,
      ministryMembershipId: newMembershipId,
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
          withChurchIsolation({
            table: ministryInvitation,
            churchId: destinationChurchId,
          }),
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

    return { kind: 'transferred', result: toResult(transferRow), digests };
  }

  async getDigestDetails({
    churchId,
    ministryId,
    volunteerId,
    correlationId,
    recipientUserId,
  }: GetTransferDigestDetailsInput): Promise<TransferDigestDetails> {
    const db = getClient({ db: this.db });

    const [ministryRow] = await db
      .select({ name: ministry.name })
      .from(ministry)
      .where(
        and(
          eq(ministry.id, ministryId),
          withChurchIsolation({ table: ministry, churchId }),
        ),
      );
    if (!ministryRow) {
      throw new NotFoundError(
        `Ministry not found for transfer digest: ${ministryId}`,
      );
    }

    // The retired source profile — never deleted, so still resolvable here.
    const [volunteerRow] = await db
      .select({ name: user.name })
      .from(volunteer)
      .innerJoin(user, eq(user.id, volunteer.userId))
      .where(
        and(
          eq(volunteer.id, volunteerId),
          withChurchIsolation({ table: volunteer, churchId }),
        ),
      );
    if (!volunteerRow) {
      throw new NotFoundError(
        `Volunteer not found for transfer digest: ${volunteerId}`,
      );
    }

    const [churchRow] = await db
      .select({ name: organization.name, timezone: church.timezone })
      .from(church)
      .innerJoin(organization, eq(organization.id, church.id))
      .where(eq(church.id, churchId));
    if (!churchRow) {
      throw new NotFoundError(
        `Church not found for transfer digest: ${churchId}`,
      );
    }

    // Membership is rechecked by the email sink; this only names the greeting.
    const [recipientRow] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, recipientUserId));
    if (!recipientRow) {
      throw new NotFoundError(
        `Recipient not found for transfer digest: ${recipientUserId}`,
      );
    }

    // The cancelled Assignment keeps its Shift and requirement, so the actual
    // Shift bounds and Sector stay readable after the transfer.
    const withdrawnAssignments = await db
      .select({
        startsAt: shift.startTime,
        endsAt: shift.endTime,
        eventTitle: event.title,
        roleName: role.name,
        sectorName: sector.name,
      })
      .from(assignmentAudit)
      .innerJoin(assignment, eq(assignment.id, assignmentAudit.assignmentId))
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, shift.participationId),
      )
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .innerJoin(event, eq(event.id, eventTimeBlock.eventId))
      .innerJoin(role, eq(role.id, assignment.roleId))
      .innerJoin(
        shiftRequirement,
        eq(shiftRequirement.id, assignment.shiftRequirementId),
      )
      .innerJoin(sector, eq(sector.id, shiftRequirement.sectorId))
      .where(
        and(
          eq(assignmentAudit.correlationId, correlationId),
          eq(assignmentAudit.churchId, churchId),
          eq(ministryParticipation.ministryId, ministryId),
        ),
      )
      .orderBy(asc(shift.startTime));

    return {
      churchName: churchRow.name,
      churchTimezone: churchRow.timezone,
      recipientName: recipientRow.name,
      ministryName: ministryRow.name,
      volunteerName: volunteerRow.name,
      withdrawnAssignments,
    };
  }
}

interface ListActiveLeaderUserIdsInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
  ministryId: string;
}

async function listActiveLeaderUserIds({
  db,
  churchId,
  ministryId,
}: ListActiveLeaderUserIdsInput): Promise<UserId[]> {
  const rows = await db
    .select({ userId: volunteer.userId })
    .from(ministryMembership)
    .innerJoin(volunteer, eq(volunteer.id, ministryMembership.volunteerId))
    .where(
      and(
        eq(ministryMembership.ministryId, ministryId),
        eq(ministryMembership.churchId, churchId),
        eq(ministryMembership.status, 'active'),
        eq(ministryMembership.ministryAccessLevel, 'leader'),
      ),
    );
  return rows.map(({ userId }) => UserId.from(userId));
}

interface ListChurchAdminUserIdsInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
}

async function listChurchAdminUserIds({
  db,
  churchId,
}: ListChurchAdminUserIdsInput): Promise<UserId[]> {
  const rows = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, churchId), eq(member.role, 'admin')));
  return rows.map(({ userId }) => UserId.from(userId));
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
