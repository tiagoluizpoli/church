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

const partSchema = z.object({
  name: z.string().nullable(),
  singleSector: z.string().nullable(),
  singleRole: z.string().nullable(),
  events: z.array(eventSchema),
});

export const scheduleExportDataSchema = z.object({
  ministry: z.object({ name: z.string() }),
  cycle: z.object({
    name: z.string(),
    startDate: calendarDaySchema,
    endDate: calendarDaySchema,
  }),
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

export const scheduleExportFileQuerySchema = z.object({
  format: exportFormatSchema,
});

export const scheduleExportPreviewQuerySchema = z.object({
  /** The file this previews: the A4 PDF pages or the one table image. */
  format: exportFormatSchema,
  /** 1-based; past the last page is 404. */
  page: z.coerce.number().int().min(1).default(1),
});

export type ScheduleExportFormat = z.infer<typeof exportFormatSchema>;

export type ScheduleExportFileQuery = z.infer<
  typeof scheduleExportFileQuerySchema
>;

export type ScheduleExportPreviewQuery = z.infer<
  typeof scheduleExportPreviewQuerySchema
>;
