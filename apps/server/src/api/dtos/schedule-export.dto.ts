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
  .describe('The PDF file');

export const scheduleExportFileQuerySchema = z.object({
  format: z.enum(['pdf']),
});

export type ScheduleExportFileQuery = z.infer<
  typeof scheduleExportFileQuerySchema
>;
