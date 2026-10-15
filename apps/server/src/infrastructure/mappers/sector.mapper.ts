import type { sector } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type { ChurchId, MinistryId } from '../../domain/branded-ids';
import { Sector } from '../../domain/entities/sector';

type SectorRow = InferSelectModel<typeof sector>;

export function mapSector(row: SectorRow): Sector {
  return new Sector(
    {
      churchId: row.churchId as ChurchId,
      ministryId: row.ministryId as MinistryId,
      name: row.name,
    },
    row.id,
    row.createdAt,
  );
}
