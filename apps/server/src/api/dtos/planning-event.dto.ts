import { instantSchema } from '@church/time';
import { z } from 'zod';
import type {
  PlanningEventGraph,
  PlanningMovePreview,
} from '../../domain/contracts/application/planning-event-manager';
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
  clashes: z.array(
    z.object({
      assignmentId: z.string(),
      eventTimeBlockId: z.string(),
      shiftId: z.string(),
      volunteer: z.object({ id: z.string(), name: z.string() }),
      ministry: z.object({ id: z.string(), name: z.string() }),
      proposedStart: instantSchema,
      proposedEnd: instantSchema,
    }),
  ),
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
      clashes: clashes.map(
        ({
          volunteerId,
          volunteerName,
          ministryId,
          ministryName,
          ...clash
        }) => ({
          ...clash,
          volunteer: { id: volunteerId, name: volunteerName },
          ministry: { id: ministryId, name: ministryName },
        }),
      ),
    };
  },
};
