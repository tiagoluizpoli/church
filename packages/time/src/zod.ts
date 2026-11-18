import { z } from 'zod';
import {
  type CalendarDay,
  type Instant,
  isInstant,
  isTimeOfDay,
  type TimeOfDay,
} from './brands';

/**
 * Wire format matches the request-side validators already in use
 * (`z.string().datetime()`, `.date()`, `HH:mm[:ss]` regex) so JSON-schema
 * output (fastify serialization, OpenAPI) is unchanged; only the TS type is
 * branded, so a response DTO stops erasing what the domain entity already
 * knows. `.refine` against the same predicate `parseInstant`/`parseTimeOfDay`
 * use keeps this the same seam, not a second, laxer one — zod's own
 * `.datetime()`/regex alone accept shapes (microseconds, `HH:mm:ss`,
 * out-of-range hours) the brand constructors reject. `.refine` doesn't change
 * the emitted JSON Schema, so the OpenAPI output is unaffected.
 *
 * Cast via `as unknown as z.ZodType<Brand, string>` rather than zod's own
 * `.brand()`: zod's brand uses its own `unique symbol`, a different nominal
 * tag than this package's `timeBrand` (`./brands.ts`) — reusing `.brand()`
 * would create two incompatible brand universes for the same `Instant` name.
 */
export const instantSchema = z
  .string()
  .datetime()
  .refine((value) => isInstant({ value })) as unknown as z.ZodType<
  Instant,
  string
>;

export const calendarDaySchema = z.string().date() as unknown as z.ZodType<
  CalendarDay,
  string
>;

export const timeOfDaySchema = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/)
  .refine((value) => isTimeOfDay({ value })) as unknown as z.ZodType<
  TimeOfDay,
  string
>;
