import { churchAddress } from '@church/db';
import { type AnyColumn, type SQL, sql } from 'drizzle-orm';

/**
 * A time block's place as visitors read it, resolved now so an edited address
 * shows everywhere: its free text, or its Church Address (left-joined on
 * `place_address_id`) by label or one-line summary. A private address shows
 * only bairro and city/UF.
 */
export function resolvedPlace(place: AnyColumn): SQL<string | null> {
  const area = sql`${churchAddress.bairro} || ' · ' || ${churchAddress.city} || '/' || ${churchAddress.uf}`;
  return sql<string | null>`CASE
    WHEN ${churchAddress.id} IS NULL THEN ${place}
    WHEN NOT ${churchAddress.isPublic} THEN ${area}
    WHEN ${churchAddress.label} IS NOT NULL THEN ${churchAddress.label}
    ELSE ${churchAddress.street} || ', ' || ${churchAddress.number}
      || coalesce(' – ' || ${churchAddress.complement}, '') || ' · ' || ${area}
  END`;
}
