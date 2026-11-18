import {
  calendarDaySchema,
  fromDate,
  instantSchema,
  today,
} from '@church/time';
import { z } from 'zod';
import {
  type CycleParticipationView,
  type ParticipationEventTimeBlockView,
  type ParticipationEventView,
  type ParticipationRequirementView,
  type ParticipationShiftView,
  SCHEDULE_LIST_PERIOD_OPTIONS,
  type ScheduleListPage,
  type ScheduleSummaryView,
  type ScheduleView,
} from '../../domain/contracts/application/participation-manager';
import { CYCLE_STATE_OPTIONS } from '../../domain/entities/cycle';
import {
  type MinistryParticipation,
  SCHEDULE_STAGE_OPTIONS,
} from '../../domain/entities/ministry-participation';
import type { Shift } from '../../domain/entities/shift';
import type { ShiftRequirement } from '../../domain/entities/shift-requirement';
import { VALIDATION_REASONS } from '../../domain/errors/validation-rule-error';
import { decodeScheduleListCursor } from '../../domain/schedule-list-cursor';
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
  sectorId: z.string(),
  sectorName: z.string(),
  peopleNeeded: z.number(),
  notes: z.string().optional(),
});
export type ShiftRequirementResponse = z.infer<
  typeof shiftRequirementResponseSchema
>;

export const participationRequirementViewSchema =
  shiftRequirementResponseSchema.extend({
    assignedCount: z.number(),
  });

export const participationShiftViewSchema = shiftResponseSchema.extend({
  requirements: z.array(participationRequirementViewSchema),
  unavailableMarkCount: z.number(),
  assignmentCount: z.number(),
  flagged: z.boolean(),
});

export const participationEventTimeBlockViewSchema = z.object({
  eventTimeBlock: eventTimeBlockResponseSchema,
  included: z.boolean(),
  shifts: z.array(participationShiftViewSchema),
  requirements: z.array(participationRequirementViewSchema),
  shiftsChangedAfterAsk: z.boolean(),
});

export const participationEventViewSchema = z.object({
  participation: participationResponseSchema,
  event: eventResponseSchema,
  generatedFromTemplate: z.boolean(),
  eventTimeBlocks: z.array(participationEventTimeBlockViewSchema),
});

/** A 409 `HEADCOUNT_BELOW_ASSIGNED`: the localized envelope plus every refused floor. */
export const headcountBelowAssignedResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  headcountFloors: z.array(
    z.object({
      shiftId: z.string(),
      sectorId: z.string(),
      roleId: z.string(),
      assignedCount: z.number().int(),
    }),
  ),
});

/** A 409 `SHIFT_HAS_RESPONSES`: the localized envelope plus per-Shift counts. */
export const shiftHasResponsesResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  shiftResponses: z.array(
    z.object({
      shiftId: z.string(),
      unavailableMarkCount: z.number().int(),
      assignmentCount: z.number().int(),
    }),
  ),
});

export const cycleParticipationResponseSchema = z.object({
  events: z.array(participationEventViewSchema),
});
export type CycleParticipationResponse = z.infer<
  typeof cycleParticipationResponseSchema
>;

const manualSplitSpanSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  label: z.string().optional(),
});

const preparationHeadcountSchema = z.object({
  shiftIndex: z.number().int().min(0),
  sectorId: z.string(),
  roleId: z.string(),
  peopleNeeded: z.number().int().min(0),
});

/** One block's complete desired state; a zero count or an omitted pair means no requirement. */
export const savePreparationBodySchema = z.object({
  serves: z.boolean(),
  shiftSplit: z
    .discriminatedUnion('kind', [
      z.object({
        kind: z.literal('equal'),
        count: z.number().int().min(1),
      }),
      z.object({
        kind: z.literal('manual'),
        spans: z.array(manualSplitSpanSchema),
      }),
    ])
    .optional(),
  headcounts: z.array(preparationHeadcountSchema).optional(),
});
export type SavePreparationBody = z.infer<typeof savePreparationBodySchema>;

/** A 422: a named rule's `reason`, or the body schema's field-aware `issues`. */
export const preparationValidationErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  reason: z.enum(VALIDATION_REASONS).optional(),
  issues: z.array(z.unknown()).optional(),
});

const flaggedBlockResponseSchema = z.object({
  eventTimeBlockId: z.string(),
  startsAt: instantSchema,
});

const roleWithoutHoldersResponseSchema = z.object({
  roleId: z.string(),
  roleName: z.string(),
  shiftCount: z.number(),
});

export const askPreviewResponseSchema = z.object({
  eligibleVolunteerCount: z.number(),
  shiftCount: z.number(),
  eventCount: z.number(),
  flaggedBlocks: z.array(flaggedBlockResponseSchema),
  rolesWithoutHolders: z.array(roleWithoutHoldersResponseSchema),
});

export const askScheduleBodySchema = z.object({
  ministryId: z.string(),
  answerBy: calendarDaySchema.optional(),
});

export const setAvailabilityDeadlineBodySchema = z.object({
  ministryId: z.string(),
  answerBy: calendarDaySchema.nullable(),
});

export const availabilityDeadlineResponseSchema = z.object({
  answerBy: calendarDaySchema.nullable(),
});

export const askScheduleResponseSchema = z.object({
  createdCheckCount: z.number(),
  notifiedVolunteerCount: z.number(),
  rolesWithoutHolders: z.array(roleWithoutHoldersResponseSchema),
});

/** A 409 `ASK_BLOCKED_FLAGGED_SHIFTS`: the localized envelope plus every flagged block. */
export const askBlockedFlaggedShiftsResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  flaggedBlocks: z.array(flaggedBlockResponseSchema),
});

export const remindScheduleBodySchema = z.object({
  ministryId: z.string(),
});

export const remindScheduleResponseSchema = z.object({
  remindedCount: z.number().int(),
  newCheckCount: z.number().int(),
  remindAvailableAt: instantSchema,
});

/** A 409 `REMIND_ON_COOLDOWN`: the localized envelope plus the next-available Instant. */
export const remindOnCooldownResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  remindAvailableAt: instantSchema,
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

export const scheduleResponseSchema = z.object({
  affectedVolunteerCount: z.number(),
  ministry: z.object({ id: z.string(), name: z.string() }),
  cycle: z.object({
    id: z.string(),
    name: z.string(),
    startDate: calendarDaySchema,
    endDate: calendarDaySchema,
    state: z.enum(CYCLE_STATE_OPTIONS),
  }),
  stage: z.enum(SCHEDULE_STAGE_OPTIONS),
  lateMarkCount: z.number(),
  openSwapRequestCount: z.number(),
  gapCount: z.number(),
  asking: z.object({ confirmed: z.number(), asked: z.number() }).optional(),
});
export type ScheduleResponse = z.infer<typeof scheduleResponseSchema>;

export const scheduleListResponseSchema = z.object({
  schedules: z.array(scheduleResponseSchema),
  nextCursor: z.string().optional(),
  /** Current Schedules per stage in the caller's scope, ignoring the filters and the cursor. */
  counts: z.object(
    Object.fromEntries(
      SCHEDULE_STAGE_OPTIONS.map((stage) => [stage, z.number().int()]),
    ) as Record<(typeof SCHEDULE_STAGE_OPTIONS)[number], z.ZodNumber>,
  ),
  /** Pickers limited to what the caller's authority reaches. */
  options: z.object({
    ministries: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});

const staffingResponseShape = {
  needed: z.number().int(),
  filled: z.number().int(),
};

export const scheduleInsightsResponseSchema = z.object({
  /** The latest Sent or Past Cycles in scope, oldest first. */
  cycles: z.array(
    z.object({
      cycleId: z.string(),
      name: z.string(),
      startDate: calendarDaySchema,
      endDate: calendarDaySchema,
      ...staffingResponseShape,
      asked: z.number().int(),
      answered: z.number().int(),
    }),
  ),
  /** The Cycle running on the Church's today, else the latest; its serving Ministries least covered first. */
  focus: z
    .object({
      cycleId: z.string(),
      name: z.string(),
      ministries: z.array(
        z.object({
          ministryId: z.string(),
          name: z.string(),
          ...staffingResponseShape,
        }),
      ),
    })
    .nullable(),
});

export const scheduleRouteParamsSchema = z.object({
  ministryId: z.uuid(),
  cycleId: z.uuid(),
});

export const scheduleListQuerystringSchema = z.object({
  period: z.enum(SCHEDULE_LIST_PERIOD_OPTIONS).default('current'),
  ministryId: z.string().uuid().optional(),
  stage: z.enum(SCHEDULE_STAGE_OPTIONS).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  attention: z.stringbool().optional(),
  cursor: z
    .string()
    .refine((cursor) => decodeScheduleListCursor({ cursor }) !== undefined, {
      message: 'Invalid cursor',
    })
    .optional(),
});
export type ScheduleListResponse = z.infer<typeof scheduleListResponseSchema>;

export const answersResponseSchema = z.object({
  asked: z.number(),
  confirmed: z.number(),
  answerBy: calendarDaySchema.nullable(),
  remindAvailableAt: instantSchema.nullable(),
  statuses: z.array(
    z.object({
      volunteerId: z.string(),
      volunteerName: z.string(),
      state: z.enum(['pending', 'confirmed']),
      confirmedAt: instantSchema.optional(),
      unavailableShiftCount: z.number(),
      shiftCount: z.number(),
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
    sectorId: requirement.sectorId as string,
    sectorName: requirement.sectorName,
    peopleNeeded: requirement.peopleNeeded,
    notes: requirement.notes,
  };
}

function toRequirementView({
  requirement,
  assignedCount,
}: ParticipationRequirementView) {
  return { ...toShiftRequirementResponse(requirement), assignedCount };
}

function toShiftView(view: ParticipationShiftView) {
  const { shift, requirements, unavailableMarkCount, assignmentCount } = view;
  return {
    ...toShiftResponse(shift),
    requirements: requirements.map(toRequirementView),
    unavailableMarkCount,
    assignmentCount,
    flagged: view.flagged,
  };
}

function toEventTimeBlockView(view: ParticipationEventTimeBlockView) {
  return {
    eventTimeBlock: eventTimeBlockMapper.toResponse(view.eventTimeBlock),
    included: view.included,
    shifts: view.shifts.map(toShiftView),
    requirements: view.requirements.map(toRequirementView),
    shiftsChangedAfterAsk: view.shiftsChangedAfterAsk,
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

function toScheduleResponse({
  affectedVolunteerCount,
  ministry,
  cycle,
  stage,
  lateMarkCount,
  openSwapRequestCount,
  gapCount,
  asking,
}: ScheduleView): ScheduleResponse {
  return {
    ministry: { id: ministry.id as string, name: ministry.name },
    cycle: {
      id: cycle.id as string,
      name: cycle.name,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      state: cycle.state,
    },
    stage,
    lateMarkCount,
    openSwapRequestCount,
    gapCount,
    affectedVolunteerCount,
    asking,
  };
}

function toEventView(view: ParticipationEventView) {
  return {
    participation: toParticipationResponse(view.participation),
    event: eventMapper.toResponse(view.event),
    generatedFromTemplate: view.generatedFromTemplate,
    eventTimeBlocks: view.eventTimeBlocks.map(toEventTimeBlockView),
  };
}

export const participationMapper = {
  toResponse: toParticipationResponse,
  shiftToResponse: toShiftResponse,
  requirementToResponse: toShiftRequirementResponse,
  cycleViewToResponse(
    view: CycleParticipationView,
  ): CycleParticipationResponse {
    return { events: view.events.map(toEventView) };
  },
  eventTimeBlockViewToResponse: toEventTimeBlockView,
  scheduleSummaryListToResponse(
    views: ScheduleSummaryView[],
  ): ScheduleSummaryListResponse {
    return { cycles: views.map(toScheduleSummaryResponse) };
  },
  scheduleToResponse: toScheduleResponse,
  scheduleListToResponse(page: ScheduleListPage): ScheduleListResponse {
    return {
      schedules: page.schedules.map(toScheduleResponse),
      nextCursor: page.nextCursor,
      counts: page.counts,
      options: page.options,
    };
  },
};
