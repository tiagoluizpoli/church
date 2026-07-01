import { NotFoundError } from '@church/core';
import { role } from '@church/db';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import type { RoleRepository } from '../../application/contracts/role.repository';
import type { TransactionContext } from '../../application/contracts/transaction-context';
import type { ChurchId } from '../../domain/entities/church';
import type { MinistryId } from '../../domain/entities/ministry';
import type { Role, RoleId } from '../../domain/entities/role';
import { mapRole } from '../mappers/role.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
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

  async listGlobalAndMinistryRoleIds(
    churchId: ChurchId,
    ministryIds: MinistryId[],
    tx?: TransactionContext,
  ): Promise<RoleId[]> {
    const conditions =
      ministryIds.length > 0
        ? or(eq(role.isGlobal, true), inArray(role.ministryId, ministryIds))
        : eq(role.isGlobal, true);

    const rows = await getClient(this.db, tx)
      .select({ id: role.id })
      .from(role)
      .where(and(withChurchIsolation(role, churchId), conditions));
    return rows.map((r) => r.id as RoleId);
  }
}
