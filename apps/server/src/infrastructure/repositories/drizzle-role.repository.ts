import { NotFoundError } from '@church/core';
import { role } from '@church/db';
import { and, asc, eq } from 'drizzle-orm';
import type { ChurchId, MinistryId, RoleId } from '../../domain/branded-ids';
import type { RoleRepository } from '../../domain/contracts/infrastructure/role.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
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

  async getById(
    churchId: ChurchId,
    id: RoleId,
    tx?: TransactionContext,
  ): Promise<Role> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`Role not found: ${id}`);
    }
    const db = getClient(this.db, tx);
    const [row] = await db
      .select()
      .from(role)
      .where(and(eq(role.id, id), withChurchIsolation(role, churchId)));
    if (!row) throw new NotFoundError(`Role not found: ${id}`);
    return mapRole(row);
  }

  async listByMinistry(
    churchId: ChurchId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<Role[]> {
    const rows = await getClient(this.db, tx)
      .select()
      .from(role)
      .where(
        and(
          withChurchIsolation(role, churchId),
          eq(role.ministryId, ministryId),
        ),
      )
      .orderBy(asc(role.name));
    return rows.map(mapRole);
  }
}
