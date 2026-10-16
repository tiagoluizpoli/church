import { instantSchema } from '@church/time';
import { z } from 'zod';
import type { EventTimeBlock } from '../../domain/entities/event-time-block';
import type { ShiftRequirement } from '../../domain/entities/shift-requirement';

export const createEventTimeBlockBodySchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  label: z.string().optional(),
});

export const updateEventTimeBlockBodySchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  label: z.string().optional(),
});

export const shiftRequirementResponseSchema = z.object({
  id: z.string(),
  eventTimeBlockId: z.string(),
  roleId: z.string(),
  sectorId: z.string(),
  peopleNeeded: z.number(),
  notes: z.string().optional(),
});
export type ShiftRequirementResponse = z.infer<
  typeof shiftRequirementResponseSchema
>;

export const eventTimeBlockResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  eventId: z.string(),
  startTime: instantSchema,
  endTime: instantSchema,
  label: z.string().optional(),
  status: z.enum(['active', 'cancelled']),
  requirements: z.array(shiftRequirementResponseSchema),
});
export type EventTimeBlockResponse = z.infer<
  typeof eventTimeBlockResponseSchema
>;

function requirementToResponse(r: ShiftRequirement): ShiftRequirementResponse {
  return {
    id: r.id as string,
    eventTimeBlockId: r.eventTimeBlockId as string,
    roleId: r.roleId as string,
    sectorId: r.sectorId as string,
    peopleNeeded: r.peopleNeeded,
    notes: r.notes,
  };
}

function eventTimeBlockToResponse(s: EventTimeBlock): EventTimeBlockResponse {
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

export const eventTimeBlockMapper = {
  toResponse: eventTimeBlockToResponse,
  listToResponse(eventTimeBlocks: EventTimeBlock[]) {
    return { eventTimeBlocks: eventTimeBlocks.map(eventTimeBlockToResponse) };
  },
  requirementToResponse,
};
