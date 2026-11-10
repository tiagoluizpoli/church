import { z } from 'zod';
import type { PlanningEventGraph } from '../../domain/contracts/application/planning-event-manager';
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
