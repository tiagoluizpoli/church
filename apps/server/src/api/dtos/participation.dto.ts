import {
  calendarDaySchema,
  fromDate,
  instantSchema,
  today,
} from '@church/time';
import { z } from 'zod';
import type {
  CycleParticipationView,
  ParticipationEventTimeBlockView,
  ParticipationEventView,
  ScheduleSummaryView,
} from '../../domain/contracts/application/participation-manager';
import type { MinistryParticipation } from '../../domain/entities/ministry-participation';
import type { Shift } from '../../domain/entities/shift';
import type { ShiftRequirement } from '../../domain/entities/shift-requirement';
import { eventMapper, eventResponseSchema } from './event.dto';
import {
  eventTimeBlockMapper,
  eventTimeBlockResponseSchema,
} from './event-time-block.dto';

export const participationResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  ministryId: z.string(),
  eventId: z.string(),
  state: z.enum([
    'preparing',
    'availability_requested',
    'assigning',
    'published',
  ]),
});
export type ParticipationResponse = z.infer<typeof participationResponseSchema>;

export const shiftResponseSchema = z.object({
  id: z.string(),
  participationId: z.string(),
  eventTimeBlockId: z.string(),
  startTime: instantSchema,
  endTime: instantSchema,
  label: z.string().optional(),
});
export type ShiftResponse = z.infer<typeof shiftResponseSchema>;

export const shiftRequirementResponseSchema = z.object({
  id: z.string(),
  shiftId: z.string(),
  participationId: z.string(),
  roleId: z.string(),
  teamId: z.string().optional(),
  peopleNeeded: z.number(),
  notes: z.string().optional(),
});
export type ShiftRequirementResponse = z.infer<
  typeof shiftRequirementResponseSchema
>;

export const participationEventTimeBlockViewSchema = z.object({
  eventTimeBlock: eventTimeBlockResponseSchema,
  included: z.boolean(),
  shifts: z.array(shiftResponseSchema),
  requirements: z.array(shiftRequirementResponseSchema),
});

export const participationEventViewSchema = z.object({
  participation: participationResponseSchema,
  event: eventResponseSchema,
  eventTimeBlocks: z.array(participationEventTimeBlockViewSchema),
});

export const cycleParticipationResponseSchema = z.object({
  events: z.array(participationEventViewSchema),
});
export type CycleParticipationResponse = z.infer<
  typeof cycleParticipationResponseSchema
>;

export const setInclusionsBodySchema = z.object({
  eventTimeBlockIds: z.array(z.string()),
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
  peopleNeeded: z.number().int().min(1),
  notes: z.string().optional(),
});
export type ShiftRequirementBody = z.infer<typeof shiftRequirementBodySchema>;

export const shiftListResponseSchema = z.object({
  shifts: z.array(shiftResponseSchema),
});

export const askAvailabilityResponseSchema = z.object({
  createdCheckCount: z.number(),
  notifiedVolunteerCount: z.number(),
});

export const scheduleSummaryResponseSchema = z.object({
  cycleId: z.string(),
  name: z.string(),
  startDate: calendarDaySchema,
  endDate: calendarDaySchema,
  isPartOf: z.boolean(),
  eventCount: z.number(),
  eventTimeBlockCount: z.number(),
  status: z.enum(['not_started', 'in_progress', 'published']),
  availabilityRequestedForAll: z.boolean(),
  availabilityRequestedForAny: z.boolean(),
});
export type ScheduleSummaryResponse = z.infer<
  typeof scheduleSummaryResponseSchema
>;

export const scheduleSummaryListResponseSchema = z.object({
  cycles: z.array(scheduleSummaryResponseSchema),
});
export type ScheduleSummaryListResponse = z.infer<
  typeof scheduleSummaryListResponseSchema
>;

export const availabilityStatusResponseSchema = z.object({
  statuses: z.array(
    z.object({
      volunteerId: z.string(),
      volunteerName: z.string(),
      state: z.enum(['pending', 'confirmed']).optional(),
      confirmedAt: instantSchema.optional(),
    }),
  ),
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
    eventTimeBlockId: shift.eventTimeBlockId as string,
    startTime: shift.startTime,
    endTime: shift.endTime,
    label: shift.label,
  };
}

function toShiftRequirementResponse(
  requirement: ShiftRequirement,
): ShiftRequirementResponse {
  return {
    id: requirement.id as string,
    shiftId: (requirement.shiftId ?? '') as string,
    participationId: (requirement.participationId ?? '') as string,
    roleId: requirement.roleId as string,
    teamId: requirement.teamId as string | undefined,
    peopleNeeded: requirement.peopleNeeded,
    notes: requirement.notes,
  };
}

function toEventTimeBlockView(view: ParticipationEventTimeBlockView) {
  return {
    eventTimeBlock: eventTimeBlockMapper.toResponse(view.eventTimeBlock),
    included: view.included,
    shifts: view.shifts.map(toShiftResponse),
    requirements: view.requirements.map(toShiftRequirementResponse),
  };
}

/**
 * `ScheduleSummaryView.startDate/endDate` are still raw `Date` (a
 * pre-seam application-layer gap this DTO can't close — the Cycle
 * entity they originate from is already `CalendarDay`). `timeZone: 'UTC'`
 * only recovers the label as-stored; it is not a Church Timezone read and
 * would be wrong if this ever carried a wall-clock-sensitive value.
 */
interface ToCycleDayInput {
  date: Date;
}

function toCycleDay({ date }: ToCycleDayInput) {
  return today({ instant: fromDate({ date }), timeZone: 'UTC' });
}

function toScheduleSummaryResponse(
  view: ScheduleSummaryView,
): ScheduleSummaryResponse {
  return {
    cycleId: view.cycleId as string,
    name: view.name,
    startDate: toCycleDay({ date: view.startDate }),
    endDate: toCycleDay({ date: view.endDate }),
    isPartOf: view.isPartOf,
    eventCount: view.eventCount,
    eventTimeBlockCount: view.eventTimeBlockCount,
    status: view.status,
    availabilityRequestedForAll: view.availabilityRequestedForAll,
    availabilityRequestedForAny: view.availabilityRequestedForAny,
  };
}

function toEventView(view: ParticipationEventView) {
  return {
    participation: toParticipationResponse(view.participation),
    event: eventMapper.toResponse(view.event),
    eventTimeBlocks: view.eventTimeBlocks.map(toEventTimeBlockView),
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
  scheduleSummaryListToResponse(
    views: ScheduleSummaryView[],
  ): ScheduleSummaryListResponse {
    return { cycles: views.map(toScheduleSummaryResponse) };
  },
};
