import { NotFoundError } from '@church/core';
import { ministry, ministryVolunteer, role, user, volunteer } from '@church/db';
import { and, eq, inArray } from 'drizzle-orm';
import type { ChurchId } from '../../domain/entities/church';
import type { MinistryId } from '../../domain/entities/ministry';
import type { RoleId } from '../../domain/entities/role';
import type {
  UserId,
  Volunteer,
  VolunteerId,
  VolunteerStatus,
} from '../../domain/entities/volunteer';
import type { TransactionContext } from '../../domain/repositories/transaction-context';
import type {
  MinistryMembership,
  MinistrySystemRole,
  VolunteerLeadership,
  VolunteerRepository,
} from '../../domain/repositories/volunteer.repository';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import { mapVolunteer } from './mappers';
import type { AnyDrizzleDb } from './types';

export class DrizzleVolunteerRepository implements VolunteerRepository {
  constructor(private readonly db: AnyDrizzleDb) {}

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

  async hasRoleQualification(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    roleId: RoleId,
    tx?: TransactionContext,
  ): Promise<boolean> {
    // A volunteer qualifies for a role if they are an active member of the ministry that owns that role.
    const db = getClient(this.db, tx);
    const [row] = await db
      .select({ id: ministryVolunteer.id })
      .from(ministryVolunteer)
      .innerJoin(role, eq(role.ministryId, ministryVolunteer.ministryId))
      .where(
        and(
          eq(ministryVolunteer.volunteerId, volunteerId),
          eq(ministryVolunteer.churchId, churchId),
          eq(ministryVolunteer.status, 'active'),
          eq(role.id, roleId),
        ),
      );
    return row != null;
  }

  async listQualifiedForRole(
    churchId: ChurchId,
    ministryId: MinistryId,
    roleId: RoleId,
    tx?: TransactionContext,
  ): Promise<Volunteer[]> {
    const db = getClient(this.db, tx);
    const rows = await db
      .select({ volunteer })
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
        role,
        and(eq(role.id, roleId), eq(role.ministryId, ministryId)),
      )
      .where(withChurchIsolation(volunteer, churchId));
    return rows.map((r) => mapVolunteer(r.volunteer));
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
      .where(and(eq(volunteer.userId, userId), eq(volunteer.status, 'active')))
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
          eq(ministryVolunteer.systemRole, 'leader'),
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
          eq(ministryVolunteer.systemRole, 'leader'),
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
    const rows = await db
      .select({
        volunteerId: ministryVolunteer.volunteerId,
        teamId: ministryVolunteer.teamId,
        systemRole: ministryVolunteer.systemRole,
      })
      .from(ministryVolunteer)
      .where(
        and(
          eq(ministryVolunteer.ministryId, ministryId),
          eq(ministryVolunteer.churchId, churchId),
          eq(ministryVolunteer.status, 'active'),
        ),
      );
    return rows.map((r) => ({
      volunteerId: r.volunteerId as VolunteerId,
      teamId: r.teamId,
      systemRole: r.systemRole as MinistrySystemRole,
    }));
  }
}
