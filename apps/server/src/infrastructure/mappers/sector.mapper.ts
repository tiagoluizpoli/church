import type { ChurchId, MinistryId } from '../../domain/branded-ids';
import { Sector } from '../../domain/entities/sector';
import type { SectorRow } from './sector.mapper.types';

export function mapSector(row: SectorRow): Sector {
  return new Sector({
    props: {
      churchId: row.churchId as ChurchId,
      ministryId: row.ministryId as MinistryId,
      name: row.name,
      archivedAt: row.archivedAt ?? undefined,
    },
    id: row.id,
    createdAt: row.createdAt,
  });
}
