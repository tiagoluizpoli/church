import { z } from 'zod';
import type {
  CycleParticipationView,
  ParticipationEventView,
  ParticipationSlotView,
} from '../../domain/contracts/application/participation-manager';
import type { MinistryParticipation } from '../../domain/entities/ministry-participation';
import type { Shift } from '../../domain/entities/shift';
import type { SlotRequirement } from '../../domain/entities/slot-requirement';
import { eventMapper, eventResponseSchema } from './event.dto';
import { timeSlotMapper, timeSlotResponseSchema } from './time-slot.dto';

export const participationResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  ministryId: z.string(),
  eventId: z.string(),
  state: z.enum(['tailoring', 'availability_fired', 'rostering', 'published']),
});
export type ParticipationResponse = z.infer<typeof participationResponseSchema>;

export const shiftResponseSchema = z.object({
  id: z.string(),
  participationId: z.string(),
  timeSlotId: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  label: z.string().optional(),
});
export type ShiftResponse = z.infer<typeof shiftResponseSchema>;

export const shiftRequirementResponseSchema = z.object({
  id: z.string(),
  shiftId: z.string(),
  participationId: z.string(),
  roleId: z.string(),
  teamId: z.string().optional(),
  requiredCount: z.number(),
  notes: z.string().optional(),
});
export type ShiftRequirementResponse = z.infer<
  typeof shiftRequirementResponseSchema
>;

export const participationSlotViewSchema = z.object({
  slot: timeSlotResponseSchema,
  included: z.boolean(),
  shifts: z.array(shiftResponseSchema),
  requirements: z.array(shiftRequirementResponseSchema),
});

export const participationEventViewSchema = z.object({
  participation: participationResponseSchema,
  event: eventResponseSchema,
  slots: z.array(participationSlotViewSchema),
});

export const cycleParticipationResponseSchema = z.object({
  events: z.array(participationEventViewSchema),
});
export type CycleParticipationResponse = z.infer<
  typeof cycleParticipationResponseSchema
>;

export const setInclusionsBodySchema = z.object({
  timeSlotIds: z.array(z.string()),
});

const manualSplitSpanSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  label: z.string().optional(),
});

export const splitShiftsBodySchema = z.object({
  strategy: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('equal-n'),
      n: z.number().int().min(1),
    }),
    z.object({
      kind: z.literal('manual'),
      spans: z.array(manualSplitSpanSchema).min(1),
    }),
  ]),
});
export type SplitShiftsBody = z.infer<typeof splitShiftsBodySchema>;

export const updateShiftBodySchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  label: z.string().optional(),
});
export type UpdateShiftBody = z.infer<typeof updateShiftBodySchema>;

export const shiftRequirementBodySchema = z.object({
  roleId: z.string(),
  teamId: z.string().optional(),
  requiredCount: z.number().int().min(1),
  notes: z.string().optional(),
});
export type ShiftRequirementBody = z.infer<typeof shiftRequirementBodySchema>;

export const shiftListResponseSchema = z.object({
  shifts: z.array(shiftResponseSchema),
});

export const fireAvailabilityResponseSchema = z.object({
  createdCheckCount: z.number(),
  notifiedVolunteerCount: z.number(),
});

function toParticipationResponse(
  participation: MinistryParticipation,
): ParticipationResponse {
  return {
    id: participation.id as string,
    churchId: participation.churchId as string,
    ministryId: participation.ministryId as string,
    eventId: participation.eventId as string,
    state: participation.state,
  };
}

function toShiftResponse(shift: Shift): ShiftResponse {
  return {
    id: shift.id as string,
    participationId: shift.participationId as string,
    timeSlotId: shift.timeSlotId as string,
    startTime: shift.startTime.toISOString(),
    endTime: shift.endTime.toISOString(),
    label: shift.label,
  };
}

function toShiftRequirementResponse(
  requirement: SlotRequirement,
): ShiftRequirementResponse {
  return {
    id: requirement.id as string,
    shiftId: (requirement.shiftId ?? '') as string,
    participationId: (requirement.participationId ?? '') as string,
    roleId: requirement.roleId as string,
    teamId: requirement.teamId as string | undefined,
    requiredCount: requirement.requiredCount,
    notes: requirement.notes,
  };
}

function toSlotView(view: ParticipationSlotView) {
  return {
    slot: timeSlotMapper.toResponse(view.slot),
    included: view.included,
    shifts: view.shifts.map(toShiftResponse),
    requirements: view.requirements.map(toShiftRequirementResponse),
  };
}

function toEventView(view: ParticipationEventView) {
  return {
    participation: toParticipationResponse(view.participation),
    event: eventMapper.toResponse(view.event),
    slots: view.slots.map(toSlotView),
  };
}

export const participationMapper = {
  toResponse: toParticipationResponse,
  shiftToResponse: toShiftResponse,
  requirementToResponse: toShiftRequirementResponse,
  shiftListToResponse(shifts: Shift[]) {
    return { shifts: shifts.map(toShiftResponse) };
  },
  cycleViewToResponse(
    view: CycleParticipationView,
  ): CycleParticipationResponse {
    return { events: view.events.map(toEventView) };
  },
};
