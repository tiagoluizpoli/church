import { calendarDaySchema, fromDate, instantSchema } from '@church/time';
import { z } from 'zod';
import type { CycleDetails } from '../../domain/contracts/application/cycle-manager';
import type { Cycle } from '../../domain/entities/cycle';
import { eventMapper, eventResponseSchema } from './event.dto';
import {
  eventTimeBlockMapper,
  eventTimeBlockResponseSchema,
} from './event-time-block.dto';

/** Matches the `cycle.name` column length. */
const CYCLE_NAME_MAX_LENGTH = 255;

export const createCycleBodySchema = z.object({
  name: z.string().trim().min(1).max(CYCLE_NAME_MAX_LENGTH),
  startDate: z.string().date(),
  endDate: z.string().date(),
});

/** A 409 `OVERLAPPING_CYCLE`: the localized envelope plus each colliding Cycle. */
export const overlappingCycleResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  conflictingCycles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      startDate: calendarDaySchema,
      endDate: calendarDaySchema,
    }),
  ),
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
  events: z.array(
    z.object({
      event: eventResponseSchema,
      eventTimeBlocks: z.array(eventTimeBlockResponseSchema),
    }),
  ),
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
      events: details.events.map((eventGroup) => ({
        event: eventMapper.toResponse(eventGroup.event),
        eventTimeBlocks: eventGroup.eventTimeBlocks.map(
          eventTimeBlockMapper.toResponse,
        ),
      })),
    };
  },
};
