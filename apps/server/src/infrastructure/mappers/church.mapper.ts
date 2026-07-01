import type { church } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type { ChurchId, ChurchSlug } from '../../domain/entities/church';
import { Church } from '../../domain/entities/church';

type ChurchRow = InferSelectModel<typeof church>;

export function mapChurch(row: ChurchRow): Church {
  return new Church(
    { name: row.name, slug: row.slug as ChurchSlug, timezone: row.timezone },
    row.id as ChurchId,
    row.createdAt,
    row.updatedAt,
  );
}
