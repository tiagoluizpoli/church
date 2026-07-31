import { NotFoundError } from '@church/core';
import {
  ministry,
  ministryVolunteer,
  ministryVolunteerRole,
  ministryVolunteerTeam,
  user,
  volunteer,
} from '@church/db';
import { and, eq, inArray } from 'drizzle-orm';
import type {
  ChurchId,
  MinistryId,
  RoleId,
  UserId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type {
  MinistryMembership,
  TeamAccessLevel,
  VolunteerLeadership,
  VolunteerRepository,
} from '../../domain/contracts/infrastructure/volunteer.repository';
import type { MinistryAccessLevel } from '../../domain/entities/ministry-volunteer';
import type {
  Volunteer,
  VolunteerStatus,
} from '../../domain/entities/volunteer';
import { mapVolunteer } from '../mappers/volunteer.mapper';
import {
  getClient,
  isChurchAdminMember,
  isValidUuid,
  withActiveVolunteer,
  withChurchIsolation,
} from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleVolunteerRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleVolunteerRepository implements VolunteerRepository {
  constructor({ db }: DrizzleVolunteerRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async isChurchAdmin(
    churchId: ChurchId,
    userId: UserId,
    tx?: TransactionContext,
  ): Promise<boolean> {
    return isChurchAdminMember(this.db, churchId, userId, tx);
  }

  async getById(
    churchId: ChurchId,
    id: VolunteerId,
    tx?: TransactionContext,
  ): Promise<Volunteer> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`Volunteer not found: ${id}`);
    }
    const db = getClient(this.db, tx);
    const [row] = await db
      .select()
      .from(volunteer)
      .where(
        and(eq(volunteer.id, id), withChurchIsolation(volunteer, churchId)),
      );
    if (!row) throw new NotFoundError(`Volunteer not found: ${id}`);
    return mapVolunteer(row);
  }

  async findByUserId(
    churchId: ChurchId,
    userId: UserId,
    tx?: TransactionContext,
  ): Promise<Volunteer | null> {
    const db = getClient(this.db, tx);
    const [row] = await db
      .select()
      .from(volunteer)
      .where(
        and(
          eq(volunteer.userId, userId),
          withChurchIsolation(volunteer, churchId),
          withActiveVolunteer(volunteer),
        ),
      );
    return row ? mapVolunteer(row) : null;
  }

  async listByMinistry(
    churchId: ChurchId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<Volunteer[]> {
    const db = getClient(this.db, tx);
    const rows = await db
      .select({ volunteer, userName: user.name })
      .from(volunteer)
      .innerJoin(
        ministryVolunteer,
        and(
          eq(ministryVolunteer.volunteerId, volunteer.id),
          eq(ministryVolunteer.ministryId, ministryId),
          eq(ministryVolunteer.status, 'active'),
        ),
      )
      .innerJoin(user, eq(user.id, volunteer.userId))
      .where(withChurchIsolation(volunteer, churchId));
    return rows.map((r) => mapVolunteer(r.volunteer, r.userName));
  }

  async hasMembershipInMinistry(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<boolean> {
    const db = getClient(this.db, tx);
    const [row] = await db
      .select({ id: ministryVolunteer.id })
      .from(ministryVolunteer)
      .where(
        and(
          eq(ministryVolunteer.volunteerId, volunteerId),
          eq(ministryVolunteer.ministryId, ministryId),
          eq(ministryVolunteer.churchId, churchId),
          eq(ministryVolunteer.status, 'active'),
        ),
      );
    return row != null;
  }

  /**
   * True when the volunteer holds an explicit qualification for the role in at
   * least one of their active memberships. Ministry membership alone is not
   * qualification.
   */
  async hasRoleQualification(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    ministryId: MinistryId,
    roleId: RoleId,
    tx?: TransactionContext,
  ): Promise<boolean> {
    const db = getClient(this.db, tx);
    const [row] = await db
      .select({ id: ministryVolunteerRole.id })
      .from(ministryVolunteerRole)
      .innerJoin(
        ministryVolunteer,
        and(
          eq(ministryVolunteer.id, ministryVolunteerRole.ministryVolunteerId),
          eq(ministryVolunteer.volunteerId, volunteerId),
          eq(ministryVolunteer.ministryId, ministryId),
          eq(ministryVolunteer.status, 'active'),
        ),
      )
      .where(
        and(
          eq(ministryVolunteerRole.roleId, roleId),
          withChurchIsolation(ministryVolunteerRole, churchId),
        ),
      )
      .limit(1);
    return row != null;
  }

  /**
   * Members of the ministry explicitly qualified for the role. Ministry
   * leaders are included: `ministryAccessLevel` governs who may edit a
   * cycle, not who may serve in it.
   */
  async listQualifiedForRole(
    churchId: ChurchId,
    ministryId: MinistryId,
    roleId: RoleId,
    tx?: TransactionContext,
  ): Promise<Volunteer[]> {
    const db = getClient(this.db, tx);
    const rows = await db
      .select({ volunteer, userName: user.name })
      .from(volunteer)
      .innerJoin(
        ministryVolunteer,
        and(
          eq(ministryVolunteer.volunteerId, volunteer.id),
          eq(ministryVolunteer.ministryId, ministryId),
          eq(ministryVolunteer.status, 'active'),
        ),
      )
      .innerJoin(
        ministryVolunteerRole,
        and(
          eq(ministryVolunteerRole.ministryVolunteerId, ministryVolunteer.id),
          eq(ministryVolunteerRole.roleId, roleId),
        ),
      )
      .innerJoin(user, eq(user.id, volunteer.userId))
      .where(withChurchIsolation(volunteer, churchId));
    return rows.map((r) => mapVolunteer(r.volunteer, r.userName));
  }

  async updateStatus(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    status: VolunteerStatus,
    tx?: TransactionContext,
  ): Promise<void> {
    const db = getClient(this.db, tx);
    await db
      .update(volunteer)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(volunteer.id, volunteerId),
          withChurchIsolation(volunteer, churchId),
        ),
      );
  }

  async findByUserIdGlobally(
    userId: UserId,
    tx?: TransactionContext,
  ): Promise<Volunteer | null> {
    const db = getClient(this.db, tx);
    const [row] = await db
      .select({ volunteer, userName: user.name })
      .from(volunteer)
      .innerJoin(user, eq(user.id, volunteer.userId))
      .where(
        and(
          eq(volunteer.userId, userId),
          eq(volunteer.status, 'active'),
          withActiveVolunteer(volunteer),
        ),
      )
      .limit(1);
    return row ? mapVolunteer(row.volunteer, row.userName) : null;
  }

  async hasLeadershipInMinistry(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<boolean> {
    const db = getClient(this.db, tx);
    const [row] = await db
      .select({ id: ministryVolunteer.id })
      .from(ministryVolunteer)
      .where(
        and(
          eq(ministryVolunteer.volunteerId, volunteerId),
          eq(ministryVolunteer.ministryId, ministryId),
          eq(ministryVolunteer.churchId, churchId),
          eq(ministryVolunteer.status, 'active'),
          eq(ministryVolunteer.ministryAccessLevel, 'leader'),
        ),
      )
      .limit(1);
    return row != null;
  }

  async listLedMinistries(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<VolunteerLeadership[]> {
    const db = getClient(this.db, tx);
    const rows = await db
      .select({
        ministryId: ministryVolunteer.ministryId,
        ministryName: ministry.name,
      })
      .from(ministryVolunteer)
      .innerJoin(ministry, eq(ministry.id, ministryVolunteer.ministryId))
      .where(
        and(
          eq(ministryVolunteer.volunteerId, volunteerId),
          eq(ministryVolunteer.churchId, churchId),
          eq(ministryVolunteer.status, 'active'),
          eq(ministryVolunteer.ministryAccessLevel, 'leader'),
        ),
      );
    return rows.map((r) => ({
      ministryId: r.ministryId as MinistryId,
      ministryName: r.ministryName,
    }));
  }

  async listByIds(
    churchId: ChurchId,
    ids: VolunteerId[],
    tx?: TransactionContext,
  ): Promise<Volunteer[]> {
    if (ids.length === 0) return [];
    const db = getClient(this.db, tx);
    const rows = await db
      .select({ volunteer, userName: user.name })
      .from(volunteer)
      .innerJoin(user, eq(user.id, volunteer.userId))
      .where(
        and(
          withChurchIsolation(volunteer, churchId),
          inArray(volunteer.id, ids),
        ),
      );
    return rows.map((r) => mapVolunteer(r.volunteer, r.userName));
  }

  async listMemberMinistryIds(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<MinistryId[]> {
    const db = getClient(this.db, tx);
    const rows = await db
      .select({ ministryId: ministryVolunteer.ministryId })
      .from(ministryVolunteer)
      .where(
        and(
          eq(ministryVolunteer.volunteerId, volunteerId),
          eq(ministryVolunteer.churchId, churchId),
          eq(ministryVolunteer.status, 'active'),
        ),
      );
    return rows.map((r) => r.ministryId as MinistryId);
  }

  async listMinistryMemberships(
    churchId: ChurchId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<MinistryMembership[]> {
    const db = getClient(this.db, tx);
    const membershipScope = and(
      eq(ministryVolunteer.ministryId, ministryId),
      eq(ministryVolunteer.churchId, churchId),
      eq(ministryVolunteer.status, 'active'),
    );

    const [rows, teamRows, roleRows] = await Promise.all([
      db
        .select({
          id: ministryVolunteer.id,
          volunteerId: ministryVolunteer.volunteerId,
          ministryAccessLevel: ministryVolunteer.ministryAccessLevel,
        })
        .from(ministryVolunteer)
        .where(membershipScope),
      db
        .select({
          membershipId: ministryVolunteerTeam.ministryVolunteerId,
          teamId: ministryVolunteerTeam.teamId,
          accessLevel: ministryVolunteerTeam.accessLevel,
        })
        .from(ministryVolunteerTeam)
        .innerJoin(
          ministryVolunteer,
          eq(ministryVolunteer.id, ministryVolunteerTeam.ministryVolunteerId),
        )
        .where(membershipScope),
      db
        .select({
          membershipId: ministryVolunteerRole.ministryVolunteerId,
          roleId: ministryVolunteerRole.roleId,
        })
        .from(ministryVolunteerRole)
        .innerJoin(
          ministryVolunteer,
          eq(ministryVolunteer.id, ministryVolunteerRole.ministryVolunteerId),
        )
        .where(membershipScope),
    ]);

    const teamMembershipsByMembership = groupByMembership(teamRows, (r) => ({
      teamId: r.teamId,
      accessLevel: r.accessLevel as TeamAccessLevel,
    }));
    const roleIdsByMembership = groupByMembership(roleRows, (r) => r.roleId);

    return rows.map((r) => ({
      volunteerId: r.volunteerId as VolunteerId,
      teamMemberships: teamMembershipsByMembership.get(r.id) ?? [],
      qualifiedRoleIds: roleIdsByMembership.get(r.id) ?? [],
      ministryAccessLevel: r.ministryAccessLevel as MinistryAccessLevel,
    }));
  }
}

interface MembershipScopedRow {
  membershipId: string;
}

/** Collect junction-table rows into a `membershipId -> values` lookup. */
function groupByMembership<TRow extends MembershipScopedRow, TValue>(
  rows: TRow[],
  select: (row: TRow) => TValue,
): Map<string, TValue[]> {
  const grouped = new Map<string, TValue[]>();
  for (const row of rows) {
    const existing = grouped.get(row.membershipId);
    if (existing) {
      existing.push(select(row));
      continue;
    }
    grouped.set(row.membershipId, [select(row)]);
  }
  return grouped;
}
