import { instantSchema } from '@church/time';
import { z } from 'zod';
import type { SlotRequirement } from '../../domain/entities/slot-requirement';
import type { TimeSlot } from '../../domain/entities/time-slot';

export const createSlotBodySchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  label: z.string().optional(),
});

export const updateSlotBodySchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  label: z.string().optional(),
});

export const slotRequirementResponseSchema = z.object({
  id: z.string(),
  slotId: z.string(),
  roleId: z.string(),
  teamId: z.string().optional(),
  requiredCount: z.number(),
  notes: z.string().optional(),
});
export type SlotRequirementResponse = z.infer<
  typeof slotRequirementResponseSchema
>;

export const timeSlotResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  eventId: z.string(),
  startTime: instantSchema,
  endTime: instantSchema,
  label: z.string().optional(),
  status: z.enum(['active', 'cancelled']),
  requirements: z.array(slotRequirementResponseSchema),
});
export type TimeSlotResponse = z.infer<typeof timeSlotResponseSchema>;

function requirementToResponse(r: SlotRequirement): SlotRequirementResponse {
  return {
    id: r.id as string,
    slotId: r.slotId as string,
    roleId: r.roleId as string,
    teamId: r.teamId as string | undefined,
    requiredCount: r.requiredCount,
    notes: r.notes,
  };
}

function slotToResponse(s: TimeSlot): TimeSlotResponse {
  return {
    id: s.id as string,
    churchId: s.churchId as string,
    eventId: s.eventId as string,
    startTime: s.startTime,
    endTime: s.endTime,
    label: s.label,
    status: s.status,
    requirements: s.requirements.map(requirementToResponse),
  };
}

export const timeSlotMapper = {
  toResponse: slotToResponse,
  listToResponse(slots: TimeSlot[]) {
    return { slots: slots.map(slotToResponse) };
  },
  requirementToResponse,
};
