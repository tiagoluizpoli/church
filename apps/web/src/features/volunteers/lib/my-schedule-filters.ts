import { z } from 'zod';

export const MY_SCHEDULE_SEARCH_MAX_LENGTH = 200;

/** The page's filters live in the URL; a malformed value is dropped, not an error. */
export const myScheduleSearchSchema = z.object({
  search: z
    .string()
    .trim()
    .min(1)
    .max(MY_SCHEDULE_SEARCH_MAX_LENGTH)
    .optional()
    .catch(undefined),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
  ministryId: z.string().uuid().optional().catch(undefined),
  // Absent means the default grouping; an empty list means a flat list.
  group: z
    .array(z.enum(['month', 'week', 'day']))
    .optional()
    .catch(undefined),
});

export type MyScheduleFilters = z.infer<typeof myScheduleSearchSchema>;

export type GroupLevel = NonNullable<MyScheduleFilters['group']>[number];

/** Outermost first: a month holds weeks, a week holds days. */
export const GROUP_LEVELS: GroupLevel[] = ['month', 'week', 'day'];

export const DEFAULT_GROUPS: GroupLevel[] = ['month', 'day'];

/** The chosen levels, always in nesting order. */
export function groupLevels(filters: MyScheduleFilters): GroupLevel[] {
  const chosen = filters.group ?? DEFAULT_GROUPS;
  return GROUP_LEVELS.filter((level) => chosen.includes(level));
}
