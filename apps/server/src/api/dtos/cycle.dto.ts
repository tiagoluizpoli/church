import { calendarDaySchema, fromDate, instantSchema } from '@church/time';
import { z } from 'zod';
import type { CycleDetails } from '../../domain/contracts/application/cycle-manager';
import type {
  Cycle,
  CycleAnchors,
  CycleList,
} from '../../domain/entities/cycle';
import type { EventWithEventTimeBlocks } from '../../domain/entities/event';
import { isEventTimeBlockHidden } from '../../domain/event-time-block-cancellation';
import { errorResponseSchema } from './error-response.dto';
import { eventMapper, eventResponseSchema } from './event.dto';
import {
  eventTimeBlockMapper,
  eventTimeBlockResponseSchema,
} from './event-time-block.dto';
import { idSchema } from './id.dto';

/** Matches the `cycle.name` column length. */
const CYCLE_NAME_MAX_LENGTH = 255;

/** The `:cycleId` route param. */
export const cycleParamsSchema = z.object({ cycleId: idSchema });

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
export const overlappingCycleResponseSchema = errorResponseSchema.extend({
  conflictingCycles: conflictingCyclesSchema,
});

/**
 * A 409 to an edit: `OVERLAPPING_CYCLE` with `conflictingCycles`,
 * `EVENT_OUTSIDE_CYCLE` with every excluded Event, or a bare
 * `ILLEGAL_STATE_TRANSITION` envelope.
 */
export const updateCycleConflictResponseSchema = errorResponseSchema.extend({
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

/** Advisory Send confirmation facts for a Draft Cycle. */
export const cycleSendSummaryResponseSchema = z.object({
  eventCount: z.number().int().nonnegative(),
  prefilledMinistryCount: z.number().int().nonnegative(),
});

/**
 * A 409 to Send: `EMPTY_CYCLE`, `DRAFT_STAFFING_RECONCILIATION_REQUIRED`,
 * `ILLEGAL_STATE_TRANSITION`, or `INVALID_CYCLE_EVENTS` naming every Event
 * of this Cycle to repair.
 */
export const sendCycleConflictResponseSchema = errorResponseSchema.extend({
  invalidEvents: z
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
  /** current: Draft and Sent; past: Past. Ignored when `state` is given. */
  period: z.enum(['current', 'past']).optional(),
  /** Case-insensitive part of the name. */
  search: z.string().trim().min(1).max(100).optional(),
  /** Only Cycles overlapping these days, both included; either may be open. */
  from: calendarDaySchema.optional(),
  to: calendarDaySchema.optional(),
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
  cycles: z.array(
    cycleResponseSchema.extend({
      /** Events that are not cancelled. */
      eventCount: z.number().int(),
    }),
  ),
  /** Past Cycles matching `search`, `from` and `to`, whatever `state` or `period`. */
  pastMatching: z.number().int(),
  /** The Sent Cycle running on the Church's today, null when none is. */
  currentCycleId: z.string().nullable(),
  /** The month to plan next, from the day after the latest Cycle. */
  next: z.object({
    startDate: calendarDaySchema,
    endDate: calendarDaySchema,
    /** It starts this month or next: time to create it. */
    isDue: z.boolean(),
  }),
  /** Every Cycle of the Church per state, whatever the filter. */
  counts: z.object({
    draft: z.number().int(),
    sent: z.number().int(),
    past: z.number().int(),
  }),
});

/** Home's anchors: the running Sent Cycle and the earliest upcoming one, either absent. */
export const cycleAnchorsResponseSchema = z.object({
  current: cycleResponseSchema.nullable(),
  next: cycleResponseSchema.nullable(),
});

/** The Planning read alone carries the hidden flags: only ChurchAdmins read it. */
const plannedEventGraphResponseSchema = z.object({
  event: eventResponseSchema.extend({ isHidden: z.boolean() }),
  eventTimeBlocks: z.array(
    eventTimeBlockResponseSchema.extend({
      /** Hidden itself or through its Event. */
      isHidden: z.boolean(),
    }),
  ),
});

function toPlannedEventGraph(graph: EventWithEventTimeBlocks) {
  const { event, eventTimeBlocks } = graph;
  return {
    event: { ...eventMapper.toResponse(event), isHidden: event.isHidden },
    eventTimeBlocks: eventTimeBlocks.map((eventTimeBlock) => ({
      ...eventTimeBlockMapper.toResponse(eventTimeBlock),
      isHidden: isEventTimeBlockHidden({ event, eventTimeBlock }),
    })),
  };
}

export const cycleDetailsResponseSchema = z.object({
  cycle: cycleResponseSchema,
  events: z.array(plannedEventGraphResponseSchema),
  /** Events and EventTimeBlocks that are not cancelled. */
  counts: z.object({
    eventCount: z.number().int(),
    eventTimeBlockCount: z.number().int(),
  }),
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
  listToResponse({
    cycles,
    counts,
    eventCounts,
    pastMatching,
    currentCycleId,
    next,
  }: CycleList) {
    return {
      cycles: cycles.map((listed) => ({
        ...toCycleResponse(listed),
        eventCount: eventCounts[listed.id] ?? 0,
      })),
      counts,
      pastMatching,
      currentCycleId,
      next,
    };
  },
  anchorsToResponse({ current, next }: CycleAnchors) {
    return {
      current: current ? toCycleResponse(current) : null,
      next: next ? toCycleResponse(next) : null,
    };
  },
  detailsToResponse(details: CycleDetails) {
    return {
      cycle: toCycleResponse(details.cycle),
      events: details.events.map(toPlannedEventGraph),
      counts: details.counts,
    };
  },
};
