import { z } from 'zod';
import type { CalendarDay, Instant, TimeOfDay } from './brands';

/** Wire format matches the request-side validators already in use
 * (`z.string().datetime()`, `.date()`, `HH:mm[:ss]` regex) so JSON-schema
 * output (fastify serialization, OpenAPI) is unchanged; only the TS type is
 * branded, so a response DTO stops erasing what the domain entity already
 * knows. */
export const instantSchema = z.string().datetime() as unknown as z.ZodType<
  Instant,
  string
>;

export const calendarDaySchema = z.string().date() as unknown as z.ZodType<
  CalendarDay,
  string
>;

export const timeOfDaySchema = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/) as unknown as z.ZodType<TimeOfDay, string>;
