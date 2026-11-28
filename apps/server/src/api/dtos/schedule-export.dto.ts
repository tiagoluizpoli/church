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

const partSchema = z.object({
  name: z.string().nullable(),
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
  range: z.object({ from: calendarDaySchema, to: calendarDaySchema }),
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

/** Inclusive Church-local days inside the Cycle; an Event belongs by its start day. */
export const scheduleExportRangeQuerySchema = z.object({
  from: calendarDaySchema.optional(),
  to: calendarDaySchema.optional(),
});

export const scheduleExportFileQuerySchema =
  scheduleExportRangeQuerySchema.extend({
    format: exportFormatSchema,
    /** 1-based image; the PDF is one file. Past the last is 404. */
    page: z.coerce.number().int().min(1).default(1),
  });

export const scheduleExportPreviewQuerySchema =
  scheduleExportRangeQuerySchema.extend({
    /** The file this previews: the A4 PDF pages or the one table image. */
    format: exportFormatSchema,
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
