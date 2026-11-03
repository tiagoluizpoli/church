import {
  assignment,
  availabilityCheck,
  member as churchMember,
  cycle,
  event,
  identityAudit,
  ministry,
  ministryMembership,
  ministryMembershipRole,
  ministryParticipation,
  role,
  sector,
  shift,
  shiftRequirement,
  volunteer,
} from '@church/db';
import { fromDate, toDate } from '@church/time';
import { and, asc, eq, gt, inArray, isNull, ne } from 'drizzle-orm';
import {
  MinistryId,
  RoleId,
  UserId,
  VolunteerId,
} from '../../domain/branded-ids';
import type {
  EndMembershipInput,
  ListMembershipRolesInput,
  ListUpcomingMembershipAssignmentsInput,
  LockMembershipTargetInput,
  MembershipTarget,
  MinistryMembershipRepository,
  SaveMembershipAccessInput,
  SaveMembershipRolesInput,
} from '../../domain/contracts/infrastructure/ministry-membership.repository';
import type { PersonDetailRole } from '../../domain/entities/people-list-item';
import type { UpcomingMembershipAssignment } from '../../domain/upcoming-membership-assignments';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleMinistryMembershipRepositoryInput {
  db: AnyDrizzleDb;
}

const ACTIVE_ASSIGNMENT_STATUSES = ['draft', 'pending', 'confirmed'] as const;

/** The ids every Ministry Membership audit starts with. */
function membershipFacts({ target }: Pick<SaveMembershipRolesInput, 'target'>) {
  return {
    churchMembershipId: target.memberId,
    ministryMembershipId: target.membershipId,
    ministryId: target.ministryId,
  };
}

/** The complete Role set before and after, ids sorted. */
function roleFacts({
  target,
  addedRoleIds,
  removedRoleIds,
}: SaveMembershipRolesInput) {
  const removed = new Set(removedRoleIds);
  return {
    beforeRoleIds: [...target.roleIds].sort(),
    afterRoleIds: [
      ...target.roleIds.filter((id) => !removed.has(id)),
      ...addedRoleIds,
    ].sort(),
  };
}

export class DrizzleMinistryMembershipRepository
  implements MinistryMembershipRepository
{
  private readonly db: AnyDrizzleDb;

  constructor({ db }: DrizzleMinistryMembershipRepositoryInput) {
    this.db = db;
  }

  async lockTarget({
    churchId,
    memberId,
    membershipId,
    tx,
  }: LockMembershipTargetInput): Promise<MembershipTarget | undefined> {
    if (!isValidUuid(membershipId)) return undefined;
    const db = getClient({ db: this.db, tx });
    const [subject] = await db
      .select({ userId: churchMember.userId })
      .from(churchMember)
      .where(
        and(
          eq(churchMember.id, memberId),
          eq(churchMember.organizationId, churchId),
        ),
      );
    if (!subject) return undefined;
    // NO KEY UPDATE conflicts with Volunteer Transfer's and Assignment
    // qualification reads' locks, never with the KEY SHARE of FK inserts.
    const [profile] = await db
      .select({ id: volunteer.id })
      .from(volunteer)
      .where(
        and(
          eq(volunteer.userId, subject.userId),
          withChurchIsolation({ table: volunteer, churchId }),
          isNull(volunteer.leftAt),
        ),
      )
      .for('no key update');
    if (!profile) return undefined;
    const [membership] = await db
      .select({
        ministryId: ministryMembership.ministryId,
        ministryAccessLevel: ministryMembership.ministryAccessLevel,
        status: ministryMembership.status,
      })
      .from(ministryMembership)
      .innerJoin(ministry, eq(ministry.id, ministryMembership.ministryId))
      .where(
        and(
          eq(ministryMembership.id, membershipId),
          eq(ministryMembership.volunteerId, profile.id),
          withChurchIsolation({ table: ministryMembership, churchId }),
          isNull(ministry.deletedAt),
        ),
      )
      .for('no key update', { of: ministryMembership });
    if (!membership) return undefined;
    const roleRows = await db
      .select({ roleId: ministryMembershipRole.roleId })
      .from(ministryMembershipRole)
      .where(
        and(
          eq(ministryMembershipRole.ministryMembershipId, membershipId),
          withChurchIsolation({ table: ministryMembershipRole, churchId }),
        ),
      );
    return {
      memberId,
      membershipId,
      subjectUserId: UserId.from(subject.userId),
      volunteerId: VolunteerId.from(profile.id),
      ministryId: MinistryId.from(membership.ministryId),
      ministryAccessLevel: membership.ministryAccessLevel,
      status: membership.status,
      roleIds: roleRows.map((row) => RoleId.from(row.roleId)),
    };
  }

  async listUpcomingMembershipAssignments({
    churchId,
    volunteerId,
    ministryId,
    scope,
    at,
    tx,
  }: ListUpcomingMembershipAssignmentsInput): Promise<
    UpcomingMembershipAssignment[]
  > {
    if (scope.kind === 'roles' && scope.roleIds.length === 0) return [];
    const rows = await getClient({ db: this.db, tx })
      .selectDistinctOn([shift.startTime, assignment.id], {
        assignmentId: assignment.id,
        eventId: event.id,
        eventTitle: event.title,
        eventTimeBlockId: shift.eventTimeBlockId,
        shiftId: shift.id,
        shiftStart: shift.startTime,
        shiftEnd: shift.endTime,
        roleId: role.id,
        roleName: role.name,
        sectorId: sector.id,
        sectorName: sector.name,
        ministryId: ministryParticipation.ministryId,
        cycleId: event.cycleId,
      })
      .from(assignment)
      .innerJoin(
        shiftRequirement,
        eq(shiftRequirement.id, assignment.shiftRequirementId),
      )
      .innerJoin(role, eq(role.id, shiftRequirement.roleId))
      .innerJoin(sector, eq(sector.id, shiftRequirement.sectorId))
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, shiftRequirement.participationId),
      )
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .where(
        and(
          withChurchIsolation({ table: assignment, churchId }),
          eq(assignment.volunteerId, volunteerId),
          eq(ministryParticipation.ministryId, ministryId),
          inArray(assignment.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
          ne(event.status, 'cancelled'),
          // The Event end, not the Shift's: a running Event protects its ended Shifts.
          gt(event.end, toDate({ instant: at })),
          scope.kind === 'roles'
            ? inArray(shiftRequirement.roleId, scope.roleIds)
            : undefined,
        ),
      )
      .orderBy(asc(shift.startTime), asc(assignment.id));
    return rows.map((row) => ({
      ...row,
      shiftStart: fromDate({ date: row.shiftStart }),
      shiftEnd: fromDate({ date: row.shiftEnd }),
    }));
  }

  async saveRoles(input: SaveMembershipRolesInput): Promise<void> {
    const { churchId, actorId, target, correlationId, changedAt, tx } = input;
    await this.applyRoleDifference(input);
    await getClient({ db: this.db, tx })
      .insert(identityAudit)
      .values({
        churchId,
        actorId,
        subjectId: target.subjectUserId,
        action: 'ministry_roles_changed',
        details: { ...membershipFacts(input), ...roleFacts(input) },
        correlationId,
        timestamp: changedAt,
      });
  }

  async saveAccess(input: SaveMembershipAccessInput): Promise<void> {
    const {
      churchId,
      actorId,
      target,
      accessLevel,
      rolesChanged,
      correlationId,
      changedAt,
      tx,
    } = input;
    const db = getClient({ db: this.db, tx });
    await this.applyRoleDifference(input);
    await db
      .update(ministryMembership)
      .set({ ministryAccessLevel: accessLevel })
      .where(
        and(
          eq(ministryMembership.id, target.membershipId),
          withChurchIsolation({ table: ministryMembership, churchId }),
        ),
      );
    await db.insert(identityAudit).values({
      churchId,
      actorId,
      subjectId: target.subjectUserId,
      action: 'ministry_access_changed',
      details: {
        ...membershipFacts(input),
        beforeAccessLevel: target.ministryAccessLevel,
        afterAccessLevel: accessLevel,
        ...(rolesChanged ? roleFacts(input) : {}),
      },
      correlationId,
      timestamp: changedAt,
    });
  }

  private async applyRoleDifference({
    churchId,
    target,
    addedRoleIds,
    removedRoleIds,
    tx,
  }: SaveMembershipRolesInput): Promise<void> {
    const db = getClient({ db: this.db, tx });
    if (removedRoleIds.length > 0) {
      await db
        .delete(ministryMembershipRole)
        .where(
          and(
            eq(
              ministryMembershipRole.ministryMembershipId,
              target.membershipId,
            ),
            inArray(ministryMembershipRole.roleId, removedRoleIds),
            withChurchIsolation({ table: ministryMembershipRole, churchId }),
          ),
        );
    }
    if (addedRoleIds.length > 0) {
      await db.insert(ministryMembershipRole).values(
        addedRoleIds.map((roleId) => ({
          churchId,
          ministryMembershipId: target.membershipId,
          roleId,
        })),
      );
    }
  }

  async endMembership({
    churchId,
    actorId,
    target,
    correlationId,
    changedAt,
    tx,
  }: EndMembershipInput): Promise<void> {
    const db = getClient({ db: this.db, tx });
    await db
      .update(ministryMembership)
      .set({ status: 'inactive', leftAt: changedAt })
      .where(
        and(
          eq(ministryMembership.id, target.membershipId),
          withChurchIsolation({ table: ministryMembership, churchId }),
        ),
      );
    // A confirmed check is withdrawn too: its answers could still be edited.
    const withdrawn = await db
      .update(availabilityCheck)
      .set({ withdrawnAt: changedAt })
      .where(
        and(
          eq(availabilityCheck.ministryMembershipId, target.membershipId),
          withChurchIsolation({ table: availabilityCheck, churchId }),
          isNull(availabilityCheck.withdrawnAt),
          inArray(
            availabilityCheck.cycleId,
            db
              .select({ id: cycle.id })
              .from(cycle)
              .where(
                and(
                  withChurchIsolation({ table: cycle, churchId }),
                  ne(cycle.state, 'past'),
                ),
              ),
          ),
        ),
      )
      .returning({ id: availabilityCheck.id });
    const withdrawnCheckIds = withdrawn.map((row) => row.id).sort();
    await db.insert(identityAudit).values({
      churchId,
      actorId,
      subjectId: target.subjectUserId,
      action: 'ministry_membership_ended',
      details: {
        ...membershipFacts({ target }),
        retainedRoleIds: [...target.roleIds].sort(),
        withdrawnAvailabilityCheckIds: withdrawnCheckIds,
        beforeStatus: 'active',
        afterStatus: 'inactive',
      },
      correlationId,
      timestamp: changedAt,
    });
  }

  async listRoles({
    churchId,
    membershipId,
    tx,
  }: ListMembershipRolesInput): Promise<PersonDetailRole[]> {
    const rows = await getClient({ db: this.db, tx })
      .select({ id: role.id, name: role.name, archivedAt: role.archivedAt })
      .from(ministryMembershipRole)
      .innerJoin(role, eq(role.id, ministryMembershipRole.roleId))
      .where(
        and(
          eq(ministryMembershipRole.ministryMembershipId, membershipId),
          withChurchIsolation({ table: ministryMembershipRole, churchId }),
        ),
      )
      .orderBy(asc(role.name), asc(role.id));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      archived: !!row.archivedAt,
    }));
  }
}
