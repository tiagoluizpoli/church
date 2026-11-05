import { calendarDaySchema, fromDate, instantSchema } from '@church/time';
import { z } from 'zod';
import type { CycleDetails } from '../../domain/contracts/application/cycle-manager';
import type { Cycle } from '../../domain/entities/cycle';
import {
  eventGraphMapper,
  eventGraphResponseSchema,
} from './planning-event.dto';

/** Matches the `cycle.name` column length. */
const CYCLE_NAME_MAX_LENGTH = 255;

export const createCycleBodySchema = z.object({
  name: z.string().trim().min(1).max(CYCLE_NAME_MAX_LENGTH),
  startDate: z.string().date(),
  endDate: z.string().date(),
});

/** An edit submits every editable field together, validated as on creation. */
export const updateCycleBodySchema = createCycleBodySchema;

const conflictingCyclesSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    startDate: calendarDaySchema,
    endDate: calendarDaySchema,
  }),
);

/** A 409 `OVERLAPPING_CYCLE`: the localized envelope plus each colliding Cycle. */
export const overlappingCycleResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  conflictingCycles: conflictingCyclesSchema,
});

/**
 * A 409 to an edit: `OVERLAPPING_CYCLE` with `conflictingCycles`,
 * `EVENT_OUTSIDE_CYCLE` with every excluded Event, or a bare
 * `ILLEGAL_STATE_TRANSITION` envelope.
 */
export const updateCycleConflictResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  conflictingCycles: conflictingCyclesSchema.optional(),
  outsideEvents: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        start: instantSchema,
        end: instantSchema,
      }),
    )
    .optional(),
});

export const listCyclesQuerySchema = z.object({
  state: z.enum(['draft', 'sent', 'past']).optional(),
});

export const cycleResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  name: z.string(),
  startDate: calendarDaySchema,
  endDate: calendarDaySchema,
  state: z.enum(['draft', 'sent', 'past']),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});

export const cycleListResponseSchema = z.object({
  cycles: z.array(cycleResponseSchema),
});

export const cycleDetailsResponseSchema = z.object({
  cycle: cycleResponseSchema,
  events: z.array(eventGraphResponseSchema),
});

export type CycleResponse = z.infer<typeof cycleResponseSchema>;

function toCycleResponse(cycle: Cycle): CycleResponse {
  return {
    id: cycle.id as string,
    churchId: cycle.churchId as string,
    name: cycle.name,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    state: cycle.state,
    createdAt: fromDate({ date: cycle.createdAt }),
    updatedAt: fromDate({ date: cycle.updatedAt }),
  };
}

export const cycleMapper = {
  toResponse: toCycleResponse,
  listToResponse(cycles: Cycle[]) {
    return { cycles: cycles.map(toCycleResponse) };
  },
  detailsToResponse(details: CycleDetails) {
    return {
      cycle: toCycleResponse(details.cycle),
      events: details.events.map(eventGraphMapper.toResponse),
    };
  },
};
