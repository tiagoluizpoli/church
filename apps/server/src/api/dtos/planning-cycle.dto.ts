import { z } from 'zod';
import type { PlanningCycleDetails } from '../../domain/contracts/application/planning-cycle-manager';
import type { PlanningCycle } from '../../domain/entities/planning-cycle';
import { eventMapper, eventResponseSchema } from './event.dto';
import { timeSlotMapper, timeSlotResponseSchema } from './time-slot.dto';

export const createPlanningCycleBodySchema = z.object({
  name: z.string().min(1),
  startDate: z.string().date(),
  endDate: z.string().date(),
});

export const listPlanningCyclesQuerySchema = z.object({
  state: z.enum(['draft', 'locked', 'archived']).optional(),
});

export const planningCycleResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  state: z.enum(['draft', 'locked', 'archived']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const planningCycleListResponseSchema = z.object({
  cycles: z.array(planningCycleResponseSchema),
});

export const planningCycleDetailsResponseSchema = z.object({
  cycle: planningCycleResponseSchema,
  events: z.array(
    z.object({
      event: eventResponseSchema,
      slots: z.array(timeSlotResponseSchema),
    }),
  ),
});

export type PlanningCycleResponse = z.infer<typeof planningCycleResponseSchema>;

function toPlanningCycleResponse(cycle: PlanningCycle): PlanningCycleResponse {
  return {
    id: cycle.id as string,
    churchId: cycle.churchId as string,
    name: cycle.name,
    startDate: cycle.startDate.toISOString().slice(0, 10),
    endDate: cycle.endDate.toISOString().slice(0, 10),
    state: cycle.state,
    createdAt: cycle.createdAt.toISOString(),
    updatedAt: cycle.updatedAt.toISOString(),
  };
}

export const planningCycleMapper = {
  toResponse: toPlanningCycleResponse,
  listToResponse(cycles: PlanningCycle[]) {
    return { cycles: cycles.map(toPlanningCycleResponse) };
  },
  detailsToResponse(details: PlanningCycleDetails) {
    return {
      cycle: toPlanningCycleResponse(details.cycle),
      events: details.events.map((eventGroup) => ({
        event: eventMapper.toResponse(eventGroup.event),
        slots: eventGroup.slots.map(timeSlotMapper.toResponse),
      })),
    };
  },
};
