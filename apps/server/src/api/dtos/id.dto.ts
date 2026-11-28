import { z } from 'zod';

/**
 * The one UUID rule for every id the API reads or returns: any 8-4-4-4-12 hex
 * id, the shape the Postgres `uuid` column accepts. A malformed path or query
 * id is refused by the standard validation response before any handler runs.
 */
export const idSchema = z.guid();

/** Every route under `/ministries/:ministryId`. */
export const ministryParamsSchema = z.object({ ministryId: idSchema });

/** Every route under `.../assignments/:assignmentId`. */
export const assignmentParamsSchema = z.object({ assignmentId: idSchema });
