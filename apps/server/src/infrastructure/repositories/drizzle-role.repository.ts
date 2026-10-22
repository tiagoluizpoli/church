import { NotFoundError } from '@church/core';
import { role } from '@church/db';
import { and, asc, eq } from 'drizzle-orm';
import type {
  GetRoleByIdInput,
  ListRolesByMinistryInput,
  RoleRepository,
} from '../../domain/contracts/infrastructure/role.repository';
import type { Role } from '../../domain/entities/role';
import { mapRole } from '../mappers/role.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleRoleRepositoryInput {
  db: AnyDrizzleDb;
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
}
