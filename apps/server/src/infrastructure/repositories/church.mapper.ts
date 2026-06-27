import type { ChurchId, ChurchSlug } from '../../domain/entities/church';
import { Church } from '../../domain/entities/church';

export function mapChurch(row: {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  settings: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Church {
  return new Church(
    { name: row.name, slug: row.slug as ChurchSlug, timezone: row.timezone },
    row.id as ChurchId,
    row.createdAt,
    row.updatedAt,
  );
}
