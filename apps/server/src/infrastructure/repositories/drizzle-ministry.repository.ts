import { NotFoundError } from '@church/core';
import { ministry } from '@church/db';
import { and, asc, eq } from 'drizzle-orm';
import type { ChurchId, MinistryId } from '../../domain/branded-ids';
import type {
  MinistryRepository,
  UpdateMinistryDefaultDirectionInput,
} from '../../domain/contracts/infrastructure/ministry.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type {
  Ministry,
  MinistrySettings,
} from '../../domain/entities/ministry';
import { mapMinistry } from '../mappers/ministry.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleMinistryRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleMinistryRepository implements MinistryRepository {
  constructor({ db }: DrizzleMinistryRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

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
    return {
      enforcementType: m.enforcementType,
      defaultDirection: m.defaultDirection,
    };
  }

  async updateDefaultDirection(
    input: UpdateMinistryDefaultDirectionInput,
  ): Promise<Ministry> {
    const db = getClient(this.db, input.tx);
    const [row] = await db
      .update(ministry)
      .set({
        defaultDirection: input.defaultDirection,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ministry.id, input.ministryId),
          withChurchIsolation(ministry, input.churchId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError(`Ministry not found: ${input.ministryId}`);
    }

    return mapMinistry(row);
  }
}
