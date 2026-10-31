import { NotFoundError } from '@church/core';
import {
  ministry,
  ministryMembership,
  ministryMembershipRole,
  user,
  volunteer,
} from '@church/db';
import { nowAsDate } from '@church/time';
import { and, eq, inArray } from 'drizzle-orm';
import type { MinistryId, UserId, VolunteerId } from '../../domain/branded-ids';
import type {
  FindVolunteerByUserIdGloballyInput,
  FindVolunteerByUserIdInput,
  GetVolunteerByIdInput,
  HasLeadershipInMinistryInput,
  HasMembershipInMinistryInput,
  HasRoleQualificationInput,
  ListActiveLeaderEmailsInput,
  ListLedMinistriesInput,
  ListMemberMinistryIdsInput,
  ListMinistryMembershipsInput,
  ListQualifiedVolunteersForRoleInput,
  ListVolunteersByIdsInput,
  ListVolunteersByMinistryInput,
  MinistryMembership,
  UpdateVolunteerStatusInput,
  VolunteerLeadership,
  VolunteerRepository,
} from '../../domain/contracts/infrastructure/volunteer.repository';
import type { MinistryAccessLevel } from '../../domain/entities/ministry-membership';
import type { Volunteer } from '../../domain/entities/volunteer';
import { mapVolunteer } from '../mappers/volunteer.mapper';
import {
  getClient,
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

  async getById({
    churchId,
    id,
    tx,
  }: GetVolunteerByIdInput): Promise<Volunteer> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`Volunteer not found: ${id}`);
    }
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .select()
      .from(volunteer)
      .where(
        and(
          eq(volunteer.id, id),
          withChurchIsolation({ table: volunteer, churchId }),
        ),
      );
    if (!row) throw new NotFoundError(`Volunteer not found: ${id}`);
    return mapVolunteer({ row });
  }

  async findByUserId({
    churchId,
    userId,
    tx,
  }: FindVolunteerByUserIdInput): Promise<Volunteer | null> {
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .select()
      .from(volunteer)
      .where(
        and(
          eq(volunteer.userId, userId),
          withChurchIsolation({ table: volunteer, churchId }),
          withActiveVolunteer(volunteer),
        ),
      );
    return row ? mapVolunteer({ row }) : null;
  }

  async listByMinistry({
    churchId,
    ministryId,
    tx,
  }: ListVolunteersByMinistryInput): Promise<Volunteer[]> {
    const db = getClient({ db: this.db, tx });
    const rows = await db
      .select({ volunteer, userName: user.name })
      .from(volunteer)
      .innerJoin(
        ministryMembership,
        and(
          eq(ministryMembership.volunteerId, volunteer.id),
          eq(ministryMembership.ministryId, ministryId),
          eq(ministryMembership.status, 'active'),
        ),
      )
      .innerJoin(user, eq(user.id, volunteer.userId))
      .where(withChurchIsolation({ table: volunteer, churchId }));
    return rows.map((r) =>
      mapVolunteer({ row: r.volunteer, name: r.userName }),
    );
  }

  async hasMembershipInMinistry({
    churchId,
    volunteerId,
    ministryId,
    tx,
  }: HasMembershipInMinistryInput): Promise<boolean> {
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .select({ id: ministryMembership.id })
      .from(ministryMembership)
      .where(
        and(
          eq(ministryMembership.volunteerId, volunteerId),
          eq(ministryMembership.ministryId, ministryId),
          eq(ministryMembership.churchId, churchId),
          eq(ministryMembership.status, 'active'),
        ),
      )
      .for('share');
    return row != null;
  }

  /**
   * True when the volunteer holds an explicit qualification for the role in at
   * least one of their active memberships. Ministry membership alone is not
   * qualification.
   */
  async hasRoleQualification({
    churchId,
    volunteerId,
    ministryId,
    roleId,
    tx,
  }: HasRoleQualificationInput): Promise<boolean> {
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .select({ id: ministryMembershipRole.id })
      .from(ministryMembershipRole)
      .innerJoin(
        ministryMembership,
        and(
          eq(
            ministryMembership.id,
            ministryMembershipRole.ministryMembershipId,
          ),
          eq(ministryMembership.volunteerId, volunteerId),
          eq(ministryMembership.ministryId, ministryId),
          eq(ministryMembership.status, 'active'),
        ),
      )
      .where(
        and(
          eq(ministryMembershipRole.roleId, roleId),
          withChurchIsolation({ table: ministryMembershipRole, churchId }),
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
  async listQualifiedForRole({
    churchId,
    ministryId,
    roleId,
    tx,
  }: ListQualifiedVolunteersForRoleInput): Promise<Volunteer[]> {
    const db = getClient({ db: this.db, tx });
    const rows = await db
      .select({ volunteer, userName: user.name })
      .from(volunteer)
      .innerJoin(
        ministryMembership,
        and(
          eq(ministryMembership.volunteerId, volunteer.id),
          eq(ministryMembership.ministryId, ministryId),
          eq(ministryMembership.status, 'active'),
        ),
      )
      .innerJoin(
        ministryMembershipRole,
        and(
          eq(
            ministryMembershipRole.ministryMembershipId,
            ministryMembership.id,
          ),
          eq(ministryMembershipRole.roleId, roleId),
        ),
      )
      .innerJoin(user, eq(user.id, volunteer.userId))
      .where(withChurchIsolation({ table: volunteer, churchId }));
    return rows.map((r) =>
      mapVolunteer({ row: r.volunteer, name: r.userName }),
    );
  }

  async updateStatus({
    churchId,
    volunteerId,
    status,
    tx,
  }: UpdateVolunteerStatusInput): Promise<void> {
    const db = getClient({ db: this.db, tx });
    await db
      .update(volunteer)
      .set({ status, updatedAt: nowAsDate() })
      .where(
        and(
          eq(volunteer.id, volunteerId),
          withChurchIsolation({ table: volunteer, churchId }),
        ),
      );
  }

  async findByUserIdGlobally({
    userId,
    tx,
  }: FindVolunteerByUserIdGloballyInput): Promise<Volunteer | null> {
    const db = getClient({ db: this.db, tx });
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
    return row
      ? mapVolunteer({ row: row.volunteer, name: row.userName })
      : null;
  }

  async hasLeadershipInMinistry({
    churchId,
    volunteerId,
    ministryId,
    tx,
  }: HasLeadershipInMinistryInput): Promise<boolean> {
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .select({ id: ministryMembership.id })
      .from(ministryMembership)
      .where(
        and(
          eq(ministryMembership.volunteerId, volunteerId),
          eq(ministryMembership.ministryId, ministryId),
          eq(ministryMembership.churchId, churchId),
          eq(ministryMembership.status, 'active'),
          eq(ministryMembership.ministryAccessLevel, 'leader'),
        ),
      )
      .limit(1);
    return row != null;
  }

  async listLedMinistries({
    churchId,
    volunteerId,
    tx,
  }: ListLedMinistriesInput): Promise<VolunteerLeadership[]> {
    const db = getClient({ db: this.db, tx });
    const rows = await db
      .select({
        ministryId: ministryMembership.ministryId,
        ministryName: ministry.name,
      })
      .from(ministryMembership)
      .innerJoin(ministry, eq(ministry.id, ministryMembership.ministryId))
      .where(
        and(
          eq(ministryMembership.volunteerId, volunteerId),
          eq(ministryMembership.churchId, churchId),
          eq(ministryMembership.status, 'active'),
          eq(ministryMembership.ministryAccessLevel, 'leader'),
        ),
      );
    return rows.map((r) => ({
      ministryId: r.ministryId as MinistryId,
      ministryName: r.ministryName,
    }));
  }

  async listByIds({
    churchId,
    ids,
    tx,
  }: ListVolunteersByIdsInput): Promise<Volunteer[]> {
    if (ids.length === 0) return [];
    const db = getClient({ db: this.db, tx });
    const rows = await db
      .select({ volunteer, userName: user.name })
      .from(volunteer)
      .innerJoin(user, eq(user.id, volunteer.userId))
      .where(
        and(
          withChurchIsolation({ table: volunteer, churchId }),
          inArray(volunteer.id, ids),
        ),
      );
    return rows.map((r) =>
      mapVolunteer({ row: r.volunteer, name: r.userName }),
    );
  }

  async listMemberMinistryIds({
    churchId,
    volunteerId,
    tx,
  }: ListMemberMinistryIdsInput): Promise<MinistryId[]> {
    const db = getClient({ db: this.db, tx });
    const rows = await db
      .select({ ministryId: ministryMembership.ministryId })
      .from(ministryMembership)
      .where(
        and(
          eq(ministryMembership.volunteerId, volunteerId),
          eq(ministryMembership.churchId, churchId),
          eq(ministryMembership.status, 'active'),
        ),
      );
    return rows.map((r) => r.ministryId as MinistryId);
  }

  async listMinistryMemberships({
    churchId,
    ministryId,
    tx,
  }: ListMinistryMembershipsInput): Promise<MinistryMembership[]> {
    const db = getClient({ db: this.db, tx });
    const membershipScope = and(
      eq(ministryMembership.ministryId, ministryId),
      eq(ministryMembership.churchId, churchId),
      eq(ministryMembership.status, 'active'),
    );

    const [rows, roleRows] = await Promise.all([
      db
        .select({
          id: ministryMembership.id,
          volunteerId: ministryMembership.volunteerId,
          ministryAccessLevel: ministryMembership.ministryAccessLevel,
        })
        .from(ministryMembership)
        .where(membershipScope),
      db
        .select({
          membershipId: ministryMembershipRole.ministryMembershipId,
          roleId: ministryMembershipRole.roleId,
        })
        .from(ministryMembershipRole)
        .innerJoin(
          ministryMembership,
          eq(
            ministryMembership.id,
            ministryMembershipRole.ministryMembershipId,
          ),
        )
        .where(membershipScope),
    ]);

    const roleIdsByMembership = groupByMembership({
      rows: roleRows,
      select: (r) => r.roleId,
    });

    return rows.map((r) => ({
      volunteerId: r.volunteerId as VolunteerId,
      qualifiedRoleIds: roleIdsByMembership.get(r.id) ?? [],
      ministryAccessLevel: r.ministryAccessLevel as MinistryAccessLevel,
    }));
  }

  async listActiveLeaderUserIds({
    churchId,
    ministryId,
    tx,
  }: ListActiveLeaderEmailsInput): Promise<UserId[]> {
    const db = getClient({ db: this.db, tx });
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
    return rows.map((r) => r.userId as UserId);
  }

  async listActiveLeaderEmails({
    churchId,
    ministryId,
    tx,
  }: ListActiveLeaderEmailsInput): Promise<string[]> {
    const db = getClient({ db: this.db, tx });
    const rows = await db
      .select({ email: user.email })
      .from(ministryMembership)
      .innerJoin(volunteer, eq(volunteer.id, ministryMembership.volunteerId))
      .innerJoin(user, eq(user.id, volunteer.userId))
      .where(
        and(
          eq(ministryMembership.ministryId, ministryId),
          eq(ministryMembership.churchId, churchId),
          eq(ministryMembership.status, 'active'),
          eq(ministryMembership.ministryAccessLevel, 'leader'),
        ),
      );
    return rows.map((r) => r.email);
  }
}

interface MembershipScopedRow {
  membershipId: string;
}

interface GroupByMembershipInput<TRow extends MembershipScopedRow, TValue> {
  rows: TRow[];
  select: (row: TRow) => TValue;
}

/** Collect junction-table rows into a `membershipId -> values` lookup. */
function groupByMembership<TRow extends MembershipScopedRow, TValue>({
  rows,
  select,
}: GroupByMembershipInput<TRow, TValue>): Map<string, TValue[]> {
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
