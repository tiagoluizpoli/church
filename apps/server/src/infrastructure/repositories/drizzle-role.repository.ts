import { NotFoundError } from '@church/core';
import {
  cycle,
  event,
  ministry,
  ministryParticipation,
  role,
  shift,
  shiftRequirement,
  usualSetup,
} from '@church/db';
import { toDate } from '@church/time';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type {
  ArchiveRoleRecordInput,
  CreateRoleRecordInput,
  GetRoleByIdInput,
  ListRoleArchiveBlockersInput,
  ListRolesByMinistryInput,
  LockActiveRoleForArchiveInput,
  LockActiveRolesForUseInput,
  RenameRoleRecordInput,
  RoleRepository,
} from '../../domain/contracts/infrastructure/role.repository';
import type { Role } from '../../domain/entities/role';
import type { ArchiveBlocker } from '../../domain/errors/archive-blocked';
import { RoleNameInUseError } from '../../domain/errors/role-name-in-use';
import { mapRole } from '../mappers/role.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';
import { isUniqueViolation } from './unique-violation';

const ACTIVE_NAME_CONSTRAINT = 'role_ministry_active_name_idx';

interface RefuseNameInUseInput<T> {
  write: Promise<T>;
}

/** The active-name index refusal, including races, as the domain conflict. */
async function refuseNameInUse<T>({
  write,
}: RefuseNameInUseInput<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (isUniqueViolation({ error, constraint: ACTIVE_NAME_CONSTRAINT })) {
      throw new RoleNameInUseError();
    }
    throw error;
  }
}

interface DrizzleRoleRepositoryInput {
  db: AnyDrizzleDb;
}

interface ActiveInMinistryInput {
  churchId: string;
  ministryId: string;
}

function activeInMinistry({ churchId, ministryId }: ActiveInMinistryInput) {
  return and(
    withChurchIsolation({ table: role, churchId }),
    eq(role.ministryId, ministryId),
    isNull(role.archivedAt),
  );
}

export class DrizzleRoleRepository implements RoleRepository {
  constructor({ db }: DrizzleRoleRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async getById({ churchId, id, tx }: GetRoleByIdInput): Promise<Role> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`Role not found: ${id}`);
    }
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .select()
      .from(role)
      .where(
        and(eq(role.id, id), withChurchIsolation({ table: role, churchId })),
      );
    if (!row) throw new NotFoundError(`Role not found: ${id}`);
    return mapRole(row);
  }

  async listByMinistry({
    churchId,
    ministryId,
    tx,
  }: ListRolesByMinistryInput): Promise<Role[]> {
    const rows = await getClient({ db: this.db, tx })
      .select()
      .from(role)
      .where(
        and(
          withChurchIsolation({ table: role, churchId }),
          eq(role.ministryId, ministryId),
        ),
      )
      .orderBy(asc(role.name));
    return rows.map(mapRole);
  }

  async listActiveByMinistry({
    churchId,
    ministryId,
    tx,
  }: ListRolesByMinistryInput): Promise<Role[]> {
    const rows = await getClient({ db: this.db, tx })
      .select()
      .from(role)
      .where(activeInMinistry({ churchId, ministryId }))
      .orderBy(asc(sql`lower(${role.name})`), asc(role.id));
    return rows.map(mapRole);
  }

  async create({
    churchId,
    ministryId,
    name,
    tx,
  }: CreateRoleRecordInput): Promise<Role> {
    const insert = getClient({ db: this.db, tx })
      .insert(role)
      .values({ churchId, ministryId, name })
      .returning();
    const [row] = await refuseNameInUse({ write: insert });
    if (!row) throw new Error('Role insert failed');
    return mapRole(row);
  }

  async rename({
    churchId,
    ministryId,
    roleId,
    name,
    tx,
  }: RenameRoleRecordInput): Promise<Role> {
    if (!isValidUuid(roleId)) {
      throw new NotFoundError(`Role not found: ${roleId}`);
    }
    const update = getClient({ db: this.db, tx })
      .update(role)
      .set({ name })
      .where(
        and(eq(role.id, roleId), activeInMinistry({ churchId, ministryId })),
      )
      .returning();
    const [row] = await refuseNameInUse({ write: update });
    if (!row) throw new NotFoundError(`Role not found: ${roleId}`);
    return mapRole(row);
  }

  async lockActiveForUse({
    churchId,
    ministryId,
    roleIds,
    tx,
  }: LockActiveRolesForUseInput): Promise<Role[]> {
    const ids = [...new Set(roleIds)].filter(isValidUuid);
    if (ids.length === 0) return [];
    const rows = await getClient({ db: this.db, tx })
      .select()
      .from(role)
      .where(
        and(inArray(role.id, ids), activeInMinistry({ churchId, ministryId })),
      )
      .orderBy(asc(role.id))
      .for('share');
    return rows.map(mapRole);
  }

  async lockActiveForArchive({
    churchId,
    ministryId,
    roleId,
    tx,
  }: LockActiveRoleForArchiveInput): Promise<Role> {
    if (!isValidUuid(roleId)) {
      throw new NotFoundError(`Role not found: ${roleId}`);
    }
    const [row] = await getClient({ db: this.db, tx })
      .select()
      .from(role)
      .where(
        and(eq(role.id, roleId), activeInMinistry({ churchId, ministryId })),
      )
      .for('update');
    if (!row) throw new NotFoundError(`Role not found: ${roleId}`);
    return mapRole(row);
  }

  async listArchiveBlockers({
    churchId,
    roleId,
    now,
    tx,
  }: ListRoleArchiveBlockersInput): Promise<ArchiveBlocker[]> {
    const db = getClient({ db: this.db, tx });
    const requirements = await db
      .selectDistinct({
        ministryId: ministry.id,
        ministryName: ministry.name,
        cycleId: cycle.id,
        cycleName: cycle.name,
        eventId: event.id,
        eventTimeBlockId: shift.eventTimeBlockId,
        eventStart: event.start,
      })
      .from(shiftRequirement)
      .innerJoin(shift, eq(shift.id, shiftRequirement.shiftId))
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, shiftRequirement.participationId),
      )
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .innerJoin(cycle, eq(cycle.id, event.cycleId))
      .innerJoin(ministry, eq(ministry.id, ministryParticipation.ministryId))
      .where(
        and(
          eq(shiftRequirement.churchId, churchId),
          eq(shiftRequirement.roleId, roleId),
          gt(event.end, toDate({ instant: now })),
        ),
      )
      .orderBy(asc(event.start), asc(event.id), asc(shift.eventTimeBlockId));
    const usualSetups = await db
      .select({
        ministryId: ministry.id,
        ministryName: ministry.name,
        templateTimeBlockId: usualSetup.sourceTemplateTimeBlockId,
      })
      .from(usualSetup)
      .innerJoin(ministry, eq(ministry.id, usualSetup.ministryId))
      .where(
        and(
          eq(usualSetup.churchId, churchId),
          sql`${usualSetup.headcounts} @> ${JSON.stringify([{ roleId }])}::jsonb`,
        ),
      )
      .orderBy(asc(usualSetup.sourceTemplateTimeBlockId));
    return [
      ...requirements.map(
        ({ eventStart: _eventStart, ...located }): ArchiveBlocker => ({
          kind: 'requirement',
          ...located,
        }),
      ),
      ...usualSetups.map(
        (located): ArchiveBlocker => ({ kind: 'usual_setup', ...located }),
      ),
    ];
  }

  async archive({
    churchId,
    roleId,
    archivedAt,
    tx,
  }: ArchiveRoleRecordInput): Promise<void> {
    await getClient({ db: this.db, tx })
      .update(role)
      .set({ archivedAt: toDate({ instant: archivedAt }) })
      .where(
        and(
          eq(role.id, roleId),
          withChurchIsolation({ table: role, churchId }),
        ),
      );
  }
}
