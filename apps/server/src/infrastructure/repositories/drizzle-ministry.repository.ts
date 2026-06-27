import { NotFoundError } from '@church/core';
import { ministry } from '@church/db';
import { asc, eq } from 'drizzle-orm';
import type { ChurchId } from '../../domain/entities/church';
import type {
  Ministry,
  MinistryId,
  MinistrySettings,
} from '../../domain/entities/ministry';
import type { MinistryRepository } from '../../domain/repositories/ministry.repository';
import type { TransactionContext } from '../../domain/repositories/transaction-context';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import { mapMinistry } from './ministry.mapper';
import type { AnyDrizzleDb } from './types';

export class DrizzleMinistryRepository implements MinistryRepository {
  constructor(private readonly db: AnyDrizzleDb) {}

  async getById(
    churchId: ChurchId,
    id: MinistryId,
    tx?: TransactionContext,
  ): Promise<Ministry> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`Ministry not found: ${id}`);
    }
    const db = getClient(this.db, tx);
    const [row] = await db
      .select()
      .from(ministry)
      .where(eq(ministry.id, id))
      .limit(1);
    if (!row || row.churchId !== churchId)
      throw new NotFoundError(`Ministry not found: ${id}`);
    return mapMinistry(row);
  }

  async listByChurch(
    churchId: ChurchId,
    tx?: TransactionContext,
  ): Promise<Ministry[]> {
    const rows = await getClient(this.db, tx)
      .select()
      .from(ministry)
      .where(withChurchIsolation(ministry, churchId))
      .orderBy(asc(ministry.name));
    return rows.filter((r) => r.deletedAt == null).map(mapMinistry);
  }

  async getSettings(
    churchId: ChurchId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<MinistrySettings> {
    const m = await this.getById(churchId, ministryId, tx);
    return { enforcementType: m.enforcementType };
  }
}
