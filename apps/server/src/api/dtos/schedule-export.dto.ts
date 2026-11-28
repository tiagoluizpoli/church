import { calendarDaySchema } from '@church/time';
import { z } from 'zod';

const personSchema = z.object({
  /** Null for an empty spot, shown on a draft only. */
  name: z.string().nullable(),
  role: z.string(),
});

const sectorSchema = z.object({
  name: z.string(),
  paletteIndex: z.number().int(),
  people: z.array(personSchema),
});

const shiftSchema = z.object({
  label: z.string().nullable(),
  day: calendarDaySchema.nullable(),
  startTime: z.string(),
  endTime: z.string(),
  sectors: z.array(sectorSchema),
});

const timeBlockSchema = z.object({
  label: z.string().nullable(),
  cancelled: z.boolean(),
  shifts: z.array(shiftSchema),
});

const eventSchema = z.object({
  startDay: calendarDaySchema,
  endDay: calendarDaySchema,
  title: z.string(),
  cancelled: z.boolean(),
  timeBlocks: z.array(timeBlockSchema),
});

/** `list` without Event groups; else each `group` in order, then the `catchAll`. */
const groupSchema = z.object({
  kind: z.enum(['list', 'group', 'catchAll']),
  /** Null for the plain list and a catch-all keeping its default name. */
  name: z.string().nullable(),
  events: z.array(eventSchema),
});

const rangeSchema = z.object({
  from: calendarDaySchema,
  to: calendarDaySchema,
});

const partSchema = z.object({
  /** `all` unsplit; else the Event group (`group`, `catchAll`), week, Sector or Role it holds. */
  kind: z.enum(['all', 'group', 'catchAll', 'week', 'sector', 'role']),
  /** The group, Sector or Role name; null for `all`, a week and a default-named catch-all. */
  name: z.string().nullable(),
  /** A week part's Monday to Sunday, kept inside the range. */
  week: rangeSchema.nullable(),
  singleSector: z.string().nullable(),
  singleRole: z.string().nullable(),
  groups: z.array(groupSchema),
});

export const scheduleExportDataSchema = z.object({
  ministry: z.object({ name: z.string() }),
  cycle: z.object({
    name: z.string(),
    startDate: calendarDaySchema,
    endDate: calendarDaySchema,
  }),
  /** The inclusive days exported: the Cycle's span unless narrowed. */
  range: rangeSchema,
  isDraft: z.boolean(),
  hasUnsentChanges: z.boolean(),
  singleSector: z.string().nullable(),
  singleRole: z.string().nullable(),
  duplicateNames: z.array(z.array(z.string())),
  parts: z.array(partSchema),
});

/** The file's bytes; a Buffer skips serialization. */
export const scheduleExportFileSchema = z
  .string()
  .meta({ format: 'binary' })
  .describe('The PDF or PNG file');

/** One SVG page; a Buffer skips serialization. */
export const scheduleExportPreviewSchema = z
  .string()
  .meta({ format: 'binary' })
  .describe('One SVG page');

const exportFormatSchema = z.enum(['pdf', 'png']);

/**
 * Inclusive Church-local days inside the Cycle (an Event belongs by its start
 * day) and Separar: one part, or one per Event group, Monday-to-Sunday week,
 * Sector or Role.
 */
export const scheduleExportRangeQuerySchema = z.object({
  from: calendarDaySchema.optional(),
  to: calendarDaySchema.optional(),
  split: z.enum(['none', 'group', 'week', 'sector', 'role']).default('none'),
});

/** 1-based part of a split export's image; past the last part is 404. */
const partQuerySchema = z.coerce.number().int().min(1).default(1);

export const scheduleExportFileQuerySchema =
  scheduleExportRangeQuerySchema.extend({
    format: exportFormatSchema,
    /** The image's part; the PDF holds every part. */
    part: partQuerySchema,
  });

export const scheduleExportPreviewQuerySchema =
  scheduleExportRangeQuerySchema.extend({
    /** The file this previews: the A4 PDF pages or the one table image. */
    format: exportFormatSchema,
    /** The table image's part; the PDF's pages run through every part. */
    part: partQuerySchema,
    /** 1-based; past the last page is 404. */
    page: z.coerce.number().int().min(1).default(1),
  });

export const scheduleExportCyclesQuerySchema = z.object({
  /** Words each found in the name, a date or a month covered, ignoring case and accents. */
  q: z.string().trim().max(100).optional(),
});

export const scheduleExportCyclesSchema = z.object({
  cycles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      startDate: calendarDaySchema,
      endDate: calendarDaySchema,
      /** The Church's today falls inside it. */
      isCurrent: z.boolean(),
    }),
  ),
});

export type ScheduleExportRangeQuery = z.infer<
  typeof scheduleExportRangeQuerySchema
>;

export type ScheduleExportCyclesQuery = z.infer<
  typeof scheduleExportCyclesQuerySchema
>;

export type ScheduleExportFileQuery = z.infer<
  typeof scheduleExportFileQuerySchema
>;

export type ScheduleExportPreviewQuery = z.infer<
  typeof scheduleExportPreviewQuerySchema
>;
