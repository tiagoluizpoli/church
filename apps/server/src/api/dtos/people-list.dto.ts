import { z } from 'zod';
import { MINISTRY_ACCESS_LEVEL_OPTIONS } from '../../domain/entities/ministry-membership';
import { PEOPLE_ACCESS_OPTIONS } from '../../domain/entities/people-list-item';
import { decodePeopleListCursor } from '../../domain/people-list-cursor';

export const peopleListResponseSchema = z.object({
  items: z.array(
    z.object({
      /** Church Membership id: opaque, not a Volunteer or User id. */
      id: z.string(),
      name: z.string(),
      email: z.string(),
      isAdmin: z.boolean(),
      ministries: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          ministryAccessLevel: z.enum(MINISTRY_ACCESS_LEVEL_OPTIONS),
        }),
      ),
    }),
  ),
  nextCursor: z.string().optional(),
  /** Pickers limited to the Ministries the caller may see. */
  options: z.object({
    ministries: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});

export const peopleListQuerystringSchema = z.object({
  search: z.string().trim().min(1).max(254).optional(),
  ministryId: z.string().uuid().optional(),
  access: z.enum(PEOPLE_ACCESS_OPTIONS).optional(),
  cursor: z
    .string()
    .refine((cursor) => decodePeopleListCursor({ cursor }) !== undefined, {
      message: 'Invalid cursor',
    })
    .optional(),
});
