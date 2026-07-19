import { z } from 'zod';
import type {
  CycleBuilderView,
  PublishCycleView,
} from '../../domain/contracts/application/participation-manager';
import { assignmentMapper, assignmentResponseSchema } from './assignment.dto';
import { eventMapper, eventResponseSchema } from './event.dto';
import {
  participationMapper,
  participationResponseSchema,
  shiftRequirementResponseSchema,
  shiftResponseSchema,
} from './participation.dto';
import {
  eligibleVolunteerResponseSchema,
  rosteringMapper,
} from './rostering.dto';
import { timeSlotMapper, timeSlotResponseSchema } from './time-slot.dto';

// Cycle builder read (R1) — composes existing atomic schemas; no new leaf shapes.
// Nesting: cycle -> events -> slots -> shifts.

export const cycleBuilderShiftViewSchema = z.object({
  shift: shiftResponseSchema,
  requirements: z.array(shiftRequirementResponseSchema),
  assignments: z.array(assignmentResponseSchema), // [] when none
  eligibleVolunteers: z.array(eligibleVolunteerResponseSchema),
});
export type CycleBuilderShiftViewResponse = z.infer<
  typeof cycleBuilderShiftViewSchema
>;

export const cycleBuilderSlotViewSchema = z.object({
  slot: timeSlotResponseSchema,
  included: z.boolean(),
  shifts: z.array(cycleBuilderShiftViewSchema),
});
export type CycleBuilderSlotViewResponse = z.infer<
  typeof cycleBuilderSlotViewSchema
>;

export const cycleBuilderEventViewSchema = z.object({
  participation: participationResponseSchema, // carries state (rostering/published)
  event: eventResponseSchema,
  slots: z.array(cycleBuilderSlotViewSchema),
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
  state: z.enum(['tailoring', 'availability_fired', 'rostering', 'published']),
  requiredCount: z.number(),
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
        requiredCount: participation.requiredCount,
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
        slots: eventView.slots.map((slotView) => ({
          slot: timeSlotMapper.toResponse(slotView.slot),
          included: slotView.included,
          shifts: slotView.shifts.map((shiftView) => ({
            shift: participationMapper.shiftToResponse(shiftView.shift),
            requirements: shiftView.requirements.map((requirement) =>
              participationMapper.requirementToResponse(requirement),
            ),
            assignments: shiftView.assignments.map((assignment) =>
              assignmentMapper.toResponse(assignment),
            ),
            eligibleVolunteers: shiftView.eligibleVolunteers.map((volunteer) =>
              rosteringMapper.eligibleVolunteerToResponse(volunteer),
            ),
          })),
        })),
      })),
      roles: view.roles.map((role) => ({
        id: role.id as string,
        name: role.name,
      })),
    };
  },
};
