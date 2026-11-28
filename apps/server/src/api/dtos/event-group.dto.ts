import { z } from 'zod';

const groupName = z.string().trim().min(1).max(255);

const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const eventGroupsResponseSchema = z.object({
  groups: z.array(
    z.object({ name: z.string(), templates: z.array(templateSchema) }),
  ),
  /** The catch-all's custom name; null keeps "Outros" / "Other". */
  catchAllName: z.string().nullable(),
  /** Every EventTemplate of the Church, alphabetical. */
  templates: z.array(templateSchema),
});

/** The whole ordered list; each EventTemplate in at most one group. */
export const eventGroupsBodySchema = z
  .object({
    groups: z.array(
      z.object({ name: groupName, templateIds: z.array(z.uuid()) }),
    ),
    catchAllName: groupName.nullable(),
  })
  .refine(
    ({ groups }) => {
      const ids = groups.flatMap((group) => group.templateIds);
      return new Set(ids).size === ids.length;
    },
    { message: 'An EventTemplate sits in at most one Event group' },
  );

export type EventGroupsBody = z.infer<typeof eventGroupsBodySchema>;
