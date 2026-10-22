import { NotFoundError } from '@church/core';
import { ministry } from '@church/db';
import { nowAsDate } from '@church/time';
import { and, asc, eq } from 'drizzle-orm';
import type {
  GetMinistryByIdInput,
  GetMinistrySettingsInput,
  ListMinistriesByChurchInput,
  MinistryRepository,
  UpdateMinistryDefaultDirectionInput,
} from '../../domain/contracts/infrastructure/ministry.repository';
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

  async getById({ churchId, id, tx }: GetMinistryByIdInput): Promise<Ministry> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`Ministry not found: ${id}`);
    }
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .select()
      .from(ministry)
      .where(eq(ministry.id, id))
      .limit(1);
    if (!row || row.churchId !== churchId)
      throw new NotFoundError(`Ministry not found: ${id}`);
    return mapMinistry(row);
  }

  async listByChurch({
    churchId,
    tx,
  }: ListMinistriesByChurchInput): Promise<Ministry[]> {
    const rows = await getClient({ db: this.db, tx })
      .select()
      .from(ministry)
      .where(withChurchIsolation({ table: ministry, churchId }))
      .orderBy(asc(ministry.name));
    return rows.filter((r) => r.deletedAt == null).map(mapMinistry);
  }

  async getSettings({
    churchId,
    ministryId,
    tx,
  }: GetMinistrySettingsInput): Promise<MinistrySettings> {
    const m = await this.getById({ churchId, id: ministryId, tx });
    return { defaultDirection: m.defaultDirection };
  }

  async updateDefaultDirection(
    input: UpdateMinistryDefaultDirectionInput,
  ): Promise<Ministry> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .update(ministry)
      .set({
        defaultDirection: input.defaultDirection,
        updatedAt: nowAsDate(),
      })
      .where(
        and(
          eq(ministry.id, input.ministryId),
          withChurchIsolation({ table: ministry, churchId: input.churchId }),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError(`Ministry not found: ${input.ministryId}`);
    }

    return mapMinistry(row);
  }
}
