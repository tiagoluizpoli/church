import { NotFoundError } from '@church/core';
import { sector } from '@church/db';
import { and, asc, eq } from 'drizzle-orm';
import type {
  GetSectorInput,
  ListSectorsByMinistryInput,
  SectorRepository,
} from '../../domain/contracts/infrastructure/sector.repository';
import type { Sector } from '../../domain/entities/sector';
import { mapSector } from '../mappers/sector.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleSectorRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleSectorRepository implements SectorRepository {
  constructor({ db }: DrizzleSectorRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async listByMinistry(input: ListSectorsByMinistryInput): Promise<Sector[]> {
    const rows = await getClient({ db: this.db, tx: input.tx })
      .select()
      .from(sector)
      .where(
        and(
          withChurchIsolation({ table: sector, churchId: input.churchId }),
          eq(sector.ministryId, input.ministryId),
        ),
      )
      .orderBy(asc(sector.name));
    return rows.map(mapSector);
  }

  async getById(input: GetSectorInput): Promise<Sector> {
    if (!isValidUuid(input.sectorId)) {
      throw new NotFoundError(`Sector not found: ${input.sectorId}`);
    }
    const [row] = await getClient({ db: this.db, tx: input.tx })
      .select()
      .from(sector)
      .where(
        and(
          eq(sector.id, input.sectorId),
          withChurchIsolation({ table: sector, churchId: input.churchId }),
        ),
      );
    if (!row) throw new NotFoundError(`Sector not found: ${input.sectorId}`);
    return mapSector(row);
  }
}
