import { NotFoundError } from '@church/core';
import { role } from '@church/db';
import { and, asc, eq } from 'drizzle-orm';
import type { ChurchId } from '../../domain/entities/church';
import type { MinistryId } from '../../domain/entities/ministry';
import type { Role, RoleId } from '../../domain/entities/role';
import type { RoleRepository } from '../../domain/repositories/role.repository';
import type { TransactionContext } from '../../domain/repositories/transaction-context';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import { mapRole } from './mappers';
import type { AnyDrizzleDb } from './types';

export class DrizzleRoleRepository implements RoleRepository {
  constructor(private readonly db: AnyDrizzleDb) {}

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
