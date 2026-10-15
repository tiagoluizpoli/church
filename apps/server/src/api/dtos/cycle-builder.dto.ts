import { z } from 'zod';
import type {
  CycleBuilderView,
  PublishCycleView,
} from '../../domain/contracts/application/participation-manager';
import { assignMapper, eligibleVolunteerResponseSchema } from './assign.dto';
import { assignmentMapper, assignmentResponseSchema } from './assignment.dto';
import { eventMapper, eventResponseSchema } from './event.dto';
import {
  eventTimeBlockMapper,
  eventTimeBlockResponseSchema,
} from './event-time-block.dto';
import {
  participationMapper,
  participationResponseSchema,
  shiftRequirementResponseSchema,
  shiftResponseSchema,
} from './participation.dto';

// Cycle builder read (R1) — composes existing atomic schemas; no new leaf shapes.
// Nesting: cycle -> events -> event time blocks -> shifts.

export const cycleBuilderShiftViewSchema = z.object({
  shift: shiftResponseSchema,
  requirements: z.array(
    shiftRequirementResponseSchema.extend({
      canMutateAssignments: z.boolean(),
    }),
  ),
  assignments: z.array(assignmentResponseSchema), // [] when none
  eligibleVolunteers: z.array(eligibleVolunteerResponseSchema),
});
export type CycleBuilderShiftViewResponse = z.infer<
  typeof cycleBuilderShiftViewSchema
>;

export const cycleBuilderEventTimeBlockViewSchema = z.object({
  eventTimeBlock: eventTimeBlockResponseSchema,
  included: z.boolean(),
  shifts: z.array(cycleBuilderShiftViewSchema),
});
export type CycleBuilderEventTimeBlockViewResponse = z.infer<
  typeof cycleBuilderEventTimeBlockViewSchema
>;

export const cycleBuilderEventViewSchema = z.object({
  participation: participationResponseSchema, // carries state (assign/published)
  event: eventResponseSchema,
  eventTimeBlocks: z.array(cycleBuilderEventTimeBlockViewSchema),
});
export type CycleBuilderEventViewResponse = z.infer<
  typeof cycleBuilderEventViewSchema
>;

export const cycleBuilderResponseSchema = z.object({
  events: z.array(cycleBuilderEventViewSchema),
  roles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
});
export type CycleBuilderResponse = z.infer<typeof cycleBuilderResponseSchema>;

// Batched cycle publish (R7).

export const publishCycleBodySchema = z.object({
  confirmBelowFull: z.boolean().optional(),
});
export type PublishCycleBody = z.infer<typeof publishCycleBodySchema>;

export const publishCycleParticipationOutcomeSchema = z.object({
  participationId: z.string(),
  state: z.enum([
    'preparing',
    'availability_requested',
    'assigning',
    'published',
  ]),
  peopleNeeded: z.number(),
  assignedCount: z.number(),
});
export type PublishCycleParticipationOutcomeResponse = z.infer<
  typeof publishCycleParticipationOutcomeSchema
>;

export const publishCycleResponseSchema = z.object({
  published: z.boolean(),
  belowFull: z.boolean(),
  participations: z.array(publishCycleParticipationOutcomeSchema),
});
export type PublishCycleResponse = z.infer<typeof publishCycleResponseSchema>;

export const publishCycleMapper = {
  toResponse(view: PublishCycleView): PublishCycleResponse {
    return {
      published: view.published,
      belowFull: view.belowFull,
      participations: view.participations.map((participation) => ({
        participationId: participation.participationId as string,
        state: participation.state,
        peopleNeeded: participation.peopleNeeded,
        assignedCount: participation.assignedCount,
      })),
    };
  },
};

export const cycleBuilderMapper = {
  toResponse(view: CycleBuilderView): CycleBuilderResponse {
    return {
      events: view.events.map((eventView) => ({
        participation: participationMapper.toResponse(eventView.participation),
        event: eventMapper.toResponse(eventView.event),
        eventTimeBlocks: eventView.eventTimeBlocks.map(
          (eventTimeBlockView) => ({
            eventTimeBlock: eventTimeBlockMapper.toResponse(
              eventTimeBlockView.eventTimeBlock,
            ),
            included: eventTimeBlockView.included,
            shifts: eventTimeBlockView.shifts.map((shiftView) => ({
              shift: participationMapper.shiftToResponse(shiftView.shift),
              requirements: shiftView.requirements.map((requirement) => ({
                ...participationMapper.requirementToResponse(
                  requirement.requirement,
                ),
                canMutateAssignments: requirement.canMutateAssignments,
              })),
              assignments: shiftView.assignments.map((assignment) =>
                assignmentMapper.toResponse(assignment),
              ),
              eligibleVolunteers: shiftView.eligibleVolunteers.map(
                (volunteer) =>
                  assignMapper.eligibleVolunteerToResponse(volunteer),
              ),
            })),
          }),
        ),
      })),
      roles: view.roles.map((role) => ({
        id: role.id as string,
        name: role.name,
      })),
    };
  },
};
