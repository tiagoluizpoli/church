import { z } from 'zod';

export interface PageLimitSchemaInput {
  maxPageSize: number;
}

/** A list route's `limit` querystring: a whole page size from 1 to the route's maximum. */
export function pageLimitSchema({ maxPageSize }: PageLimitSchemaInput) {
  return z.coerce.number().int().min(1).max(maxPageSize);
}
