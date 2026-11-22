import { instantSchema } from '@church/time';
import { z } from 'zod';
import type { PublicEventPage } from '../../domain/entities/public-event';
import {
  decodePublicEventCursor,
  encodePublicEventCursor,
} from '../../domain/public-event-cursor';

export const publicEventsQuerystringSchema = z.object({
  cursor: z
    .string()
    .refine((cursor) => decodePublicEventCursor({ cursor }) !== undefined, {
      message: 'Invalid cursor',
    })
    .optional(),
});

const publicEventBlockSchema = z.strictObject({
  label: z.string().nullable(),
  start: instantSchema,
  end: instantSchema,
  place: z.string().nullable(),
  cancelled: z.boolean(),
  /** As-sent time first, each later time after it, the current one last; empty when not moved. */
  movePath: z.array(
    z.strictObject({ start: instantSchema, end: instantSchema }),
  ),
});

/** The explicit allow-list of a Public Event: public blocks only, no internal Event details. */
const publicEventSchema = z.strictObject({
  title: z.string(),
  cancelled: z.boolean(),
  start: instantSchema,
  blocks: z.array(publicEventBlockSchema),
});

export const publicEventsResponseSchema = z.strictObject({
  /** The Church Timezone, to show the times on the Church's clock. */
  timezone: z.string(),
  items: z.array(publicEventSchema),
  nextCursor: z.string().optional(),
});

interface PublicEventsToResponseInput {
  timezone: string;
  page: PublicEventPage;
}

export function publicEventsToResponse({
  timezone,
  page,
}: PublicEventsToResponseInput): z.infer<typeof publicEventsResponseSchema> {
  const { items, nextCursor } = page;
  return {
    timezone,
    items: items.map(({ title, cancelled, start, blocks }) => ({
      title,
      cancelled,
      start,
      blocks: blocks.map(
        ({
          label,
          start: blockStart,
          end,
          place,
          cancelled: blockCancelled,
          movePath,
        }) => ({
          label,
          start: blockStart,
          end,
          place,
          cancelled: blockCancelled,
          movePath: movePath.moved ? movePath.steps : [],
        }),
      ),
    })),
    nextCursor: nextCursor ? encodePublicEventCursor(nextCursor) : undefined,
  };
}
