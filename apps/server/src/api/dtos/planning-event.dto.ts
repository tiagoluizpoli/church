import { instantSchema } from '@church/time';
import { z } from 'zod';
import type {
  PlanningEventGraph,
  PlanningMovePreview,
  PlanningMoveResult,
} from '../../domain/contracts/application/planning-event-manager';
import type { MoveClash } from '../../domain/services/event-move';
import { eventMapper, eventResponseSchema } from './event.dto';
import {
  eventTimeBlockMapper,
  eventTimeBlockResponseSchema,
} from './event-time-block.dto';

const planningEventTimeBlockBodySchema = z.object({
  label: z.string().trim().min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
});

/** A complete Draft Event: its fields and every Time block, saved together. */
export const createPlanningEventBodySchema = z.object({
  title: z.string().trim().min(1),
  location: z.string().optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  eventTimeBlocks: z.array(planningEventTimeBlockBodySchema),
});

export type CreatePlanningEventBody = z.infer<
  typeof createPlanningEventBodySchema
>;

/**
 * The complete desired Draft Event: a block with `id` is retained and updated
 * in place, one without is created and an omitted persisted block is deleted.
 */
export const updatePlanningEventBodySchema = createPlanningEventBodySchema
  .omit({ eventTimeBlocks: true })
  .extend({
    eventTimeBlocks: z.array(
      planningEventTimeBlockBodySchema.extend({
        id: z.string().uuid().optional(),
      }),
    ),
  });

export type UpdatePlanningEventBody = z.infer<
  typeof updatePlanningEventBodySchema
>;

/** A Sent Event's details correction: title and optional location only. */
export const updatePlanningEventDetailsBodySchema = z.object({
  title: z.string().trim().min(1),
  location: z.string().optional(),
});

export type UpdatePlanningEventDetailsBody = z.infer<
  typeof updatePlanningEventDetailsBodySchema
>;

/** An Event with its EventTimeBlocks, as Cycle detail, create and edit return it. */
export const eventGraphResponseSchema = z.object({
  event: eventResponseSchema,
  eventTimeBlocks: z.array(eventTimeBlockResponseSchema),
});

export const eventGraphMapper = {
  toResponse(graph: PlanningEventGraph) {
    return {
      event: eventMapper.toResponse(graph.event),
      eventTimeBlocks: graph.eventTimeBlocks.map(
        eventTimeBlockMapper.toResponse,
      ),
    };
  },
};

/** The new start of the moved scope. */
export const movePlanningEventBodySchema = z.object({
  start: z.string().datetime(),
});

export type MovePlanningEventBody = z.infer<typeof movePlanningEventBodySchema>;

const instantBoundsResponseSchema = z.object({
  start: instantSchema,
  end: instantSchema,
});

/** A moved active Assignment that overlaps another active Assignment of its Volunteer. */
const moveClashResponseSchema = z.object({
  assignmentId: z.string(),
  eventTimeBlockId: z.string(),
  shiftId: z.string(),
  volunteer: z.object({ id: z.string(), name: z.string() }),
  ministry: z.object({ id: z.string(), name: z.string() }),
  proposedStart: instantSchema,
  proposedEnd: instantSchema,
});

function toMoveClashResponse({
  volunteerId,
  volunteerName,
  ministryId,
  ministryName,
  ...clash
}: MoveClash) {
  return {
    ...clash,
    volunteer: { id: volunteerId, name: volunteerName },
    ministry: { id: ministryId, name: ministryName },
  };
}

/** Proposed bounds and typed clash rows; nothing was written. */
export const eventMovePreviewResponseSchema = z.object({
  event: z.object({
    previous: instantBoundsResponseSchema,
    proposed: instantBoundsResponseSchema,
  }),
  eventTimeBlocks: z.array(
    z.object({
      id: z.string(),
      label: z.string().optional(),
      moved: z.boolean(),
      previous: instantBoundsResponseSchema,
      proposed: instantBoundsResponseSchema,
    }),
  ),
  clashes: z.array(moveClashResponseSchema),
});

export const eventMovePreviewMapper = {
  toResponse({ proposal, clashes }: PlanningMovePreview) {
    return {
      event: {
        previous: proposal.previousEvent,
        proposed: proposal.proposedEvent,
      },
      eventTimeBlocks: proposal.eventTimeBlocks.map(
        ({ eventTimeBlockId, label, moved, previous, proposed }) => ({
          id: eventTimeBlockId,
          label,
          moved,
          previous,
          proposed,
        }),
      ),
      clashes: clashes.map(toMoveClashResponse),
    };
  },
};

/** The moved Event graph and the Assignments confirm actually withdrew. */
export const eventMoveResponseSchema = eventGraphResponseSchema.extend({
  withdrawn: z.array(moveClashResponseSchema),
});

export const eventMoveMapper = {
  toResponse({ graph, withdrawn }: PlanningMoveResult) {
    return {
      ...eventGraphMapper.toResponse(graph),
      withdrawn: withdrawn.map(toMoveClashResponse),
    };
  },
};

/** The typed gate: the locale's fixed word, trimmed and case-insensitive. */
export const cancelPlanningEventBodySchema = z.object({
  confirmation: z.string(),
});

export type CancelPlanningEventBody = z.infer<
  typeof cancelPlanningEventBodySchema
>;

/** What a cancellation affects: preview and confirm both return it. */
export const cancellationImpactResponseSchema = z.object({
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('event') }),
    z.object({
      kind: z.literal('eventTimeBlock'),
      eventTimeBlockId: z.string(),
    }),
  ]),
  eventId: z.string(),
  eventTitle: z.string(),
  /** The selected scope's own bounds. */
  start: instantSchema,
  end: instantSchema,
  /** Distinct published Volunteers told now. */
  volunteerCount: z.number().int().nonnegative(),
  /** Ministries those Volunteers span. */
  ministryCount: z.number().int().nonnegative(),
  /** Every participating Ministry with its told count, possibly 0. */
  ministries: z.array(
    z.object({
      ministryId: z.string(),
      ministryName: z.string(),
      volunteerCount: z.number().int().nonnegative(),
    }),
  ),
  openSwapRequestCount: z.number().int().nonnegative(),
});
