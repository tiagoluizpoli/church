import { calendarDaySchema, instantSchema, parseInstant } from '@church/time';
import { z } from 'zod';
import type {
  DashboardAssignmentGroup,
  DashboardAssignmentItem,
  MinistrySchedule,
  MinistryScheduleEvent,
  VolunteerAvailabilityCheckDetail,
  VolunteerAvailabilityCheckSummary,
  VolunteerDashboard,
} from '../../domain/contracts/application/volunteer-manager';
import {
  type AssignmentResponse,
  assignmentMapper,
  assignmentResponseSchema,
} from './assignment.dto';
import {
  memberNotificationMapper,
  memberNotificationResponseSchema,
} from './member-notification.dto';

export type { AssignmentResponse };
export { assignmentResponseSchema };

export const availabilityCheckSummarySchema = z.object({
  id: z.string(),
  cycleId: z.string(),
  cycleName: z.string(),
  ministryId: z.string(),
  ministryName: z.string(),
  state: z.enum(['pending', 'confirmed']),
  confirmedAt: instantSchema.optional(),
  answerBy: calendarDaySchema.nullable(),
  totalShiftCount: z.number(),
  unavailableShiftCount: z.number(),
});

export type AvailabilityCheckSummaryResponse = z.infer<
  typeof availabilityCheckSummarySchema
>;

export const availabilityCheckListResponseSchema = z.object({
  checks: z.array(availabilityCheckSummarySchema),
});

const availabilityCheckShiftSchema = z.object({
  shiftId: z.string(),
  eventId: z.string(),
  eventTitle: z.string(),
  startTime: instantSchema,
  endTime: instantSchema,
  label: z.string().optional(),
  available: z.boolean(),
  published: z.boolean(),
});

export const availabilityCheckDetailResponseSchema = z.object({
  answerBy: calendarDaySchema.nullable(),
  readOnly: z.boolean(),
  id: z.string(),
  cycleId: z.string(),
  cycleName: z.string(),
  ministryId: z.string(),
  ministryName: z.string(),
  state: z.enum(['pending', 'confirmed']),
  confirmedAt: instantSchema.optional(),
  shifts: z.array(availabilityCheckShiftSchema),
});
export type AvailabilityCheckDetailResponse = z.infer<
  typeof availabilityCheckDetailResponseSchema
>;

export const answerAvailabilityCheckBodySchema = z.object({
  shiftIds: z.array(z.uuid()),
  wholeDayDates: z.array(calendarDaySchema).optional(),
});

export const answerConflictResponseSchema = z.object({
  error: z.enum([
    'SHIFT_PUBLISHED',
    'ILLEGAL_STATE_TRANSITION',
    'CROSS_MINISTRY_SCOPE',
  ]),
  message: z.string(),
  shiftIds: z.array(z.string()).optional(),
});

const dashboardAssignmentItemSchema = z.object({
  assignmentId: z.string(),
  eventTimeBlockId: z.string(),
  shiftId: z.string(),
  participationId: z.string(),
  roleId: z.string(),
  roleName: z.string(),
  startTime: instantSchema,
  endTime: instantSchema,
  status: z.enum(['pending', 'confirmed', 'declined']),
  timingState: z.enum(['in_progress', 'upcoming']),
  canRespond: z.boolean(),
});
type DashboardAssignmentItemResponse = z.infer<
  typeof dashboardAssignmentItemSchema
>;

const dashboardAssignmentGroupSchema = z.object({
  eventId: z.string(),
  eventTitle: z.string(),
  ministryId: z.string(),
  ministryName: z.string(),
  eventStart: instantSchema,
  aggregateResponseState: z.enum(['pending', 'confirmed', 'mixed', 'declined']),
  hasPendingResponse: z.boolean(),
  assignments: z.array(dashboardAssignmentItemSchema),
});
type DashboardAssignmentGroupResponse = z.infer<
  typeof dashboardAssignmentGroupSchema
>;

const dashboardMinistryOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const dashboardResponseSchema = z.object({
  upcomingAssignmentGroups: z.array(dashboardAssignmentGroupSchema),
  unreadNotificationCount: z.number(),
  notificationPreview: z.array(memberNotificationResponseSchema),
  defaultMinistryId: z.string().optional(),
  ministryOptions: z.array(dashboardMinistryOptionSchema),
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;

export const volunteerScheduleResponseSchema = z.object({
  assignments: z.array(
    z.object({
      assignmentId: z.string(),
      eventId: z.string(),
      eventTitle: z.string(),
      shiftId: z.string(),
      startTime: instantSchema,
      endTime: instantSchema,
      ministryId: z.string(),
      ministryName: z.string(),
      sectorName: z.string(),
      roleId: z.string(),
      roleName: z.string(),
      status: z.enum(['pending', 'confirmed', 'declined']),
    }),
  ),
  schedules: z.array(
    z.object({
      ministryId: z.string(),
      ministryName: z.string(),
      cycleId: z.string(),
      cycleName: z.string(),
    }),
  ),
});

const ministryScheduleEventResponseSchema = z.object({
  eventId: z.string(),
  title: z.string(),
  start: instantSchema,
  end: instantSchema,
  assignmentCount: z.number(),
  rows: z.array(
    z.object({
      shiftId: z.string(),
      shiftLabel: z.string(),
      shiftStart: instantSchema,
      shiftEnd: instantSchema,
      sectorName: z.string(),
      roleName: z.string(),
      volunteerDisplayName: z.string().optional(),
    }),
  ),
});
type MinistryScheduleEventResponse = z.infer<
  typeof ministryScheduleEventResponseSchema
>;

export const ministryScheduleResponseSchema = z.object({
  ministryId: z.string(),
  ministryName: z.string(),
  cycleId: z.string(),
  cycleName: z.string(),
  published: z.boolean(),
  events: z.array(ministryScheduleEventResponseSchema),
});
export type MinistryScheduleResponse = z.infer<
  typeof ministryScheduleResponseSchema
>;

export const assignmentDetailResponseSchema = z.object({
  assignmentId: z.string(),
  eventId: z.string(),
  eventTitle: z.string(),
  startTime: instantSchema,
  endTime: instantSchema,
  cycleId: z.string(),
  ministryId: z.string(),
  ministryName: z.string(),
  sectorName: z.string(),
  roleName: z.string(),
  leaderName: z.string().nullable(),
  roster: z.array(
    z.object({
      sectorName: z.string(),
      roleName: z.string(),
      people: z.array(z.object({ name: z.string(), isYou: z.boolean() })),
      openCount: z.number(),
    }),
  ),
  swapRequest: z
    .object({
      id: z.string(),
      status: z.literal('open'),
      note: z.string().nullable(),
      raisedAt: instantSchema,
    })
    .nullable(),
});
export type AssignmentDetailResponse = z.infer<
  typeof assignmentDetailResponseSchema
>;

export const respondToAssignmentBodySchema = z.object({
  response: z.enum(['accepted', 'declined']),
  reason: z.string().optional(),
});

const assignmentToResponse = assignmentMapper.toResponse;

function availabilityCheckSummaryToResponse(
  summary: VolunteerAvailabilityCheckSummary,
): AvailabilityCheckSummaryResponse {
  return {
    id: summary.id,
    cycleId: summary.cycleId,
    cycleName: summary.cycleName,
    ministryId: summary.ministryId,
    ministryName: summary.ministryName,
    state: summary.state,
    confirmedAt: summary.confirmedAt,
    answerBy: summary.answerBy,
    totalShiftCount: summary.totalShiftCount,
    unavailableShiftCount: summary.unavailableShiftCount,
  };
}

function availabilityCheckDetailToResponse(
  detail: VolunteerAvailabilityCheckDetail,
): AvailabilityCheckDetailResponse {
  return {
    id: detail.id,
    cycleId: detail.cycleId,
    cycleName: detail.cycleName,
    ministryId: detail.ministryId,
    ministryName: detail.ministryName,
    state: detail.state,
    confirmedAt: detail.confirmedAt,
    answerBy: detail.answerBy,
    readOnly: detail.readOnly,
    shifts: detail.shifts.map((shift) => ({
      shiftId: shift.shiftId,
      eventId: shift.eventId,
      eventTitle: shift.eventTitle,
      startTime: shift.startTime,
      endTime: shift.endTime,
      label: shift.label,
      available: shift.available,
      published: shift.published,
    })),
  };
}

function dashboardAssignmentItemToResponse(
  item: DashboardAssignmentItem,
): DashboardAssignmentItemResponse {
  return {
    assignmentId: item.assignmentId,
    eventTimeBlockId: item.eventTimeBlockId,
    shiftId: item.shiftId,
    participationId: item.participationId,
    roleId: item.roleId,
    roleName: item.roleName,
    startTime: parseInstant({ value: item.startTime }),
    endTime: parseInstant({ value: item.endTime }),
    status: item.status,
    timingState: item.timingState,
    canRespond: item.canRespond,
  };
}

function dashboardAssignmentGroupToResponse(
  group: DashboardAssignmentGroup,
): DashboardAssignmentGroupResponse {
  return {
    eventId: group.eventId,
    eventTitle: group.eventTitle,
    ministryId: group.ministryId,
    ministryName: group.ministryName,
    eventStart: parseInstant({ value: group.eventStart }),
    aggregateResponseState: group.aggregateResponseState,
    hasPendingResponse: group.hasPendingResponse,
    assignments: group.assignments.map(dashboardAssignmentItemToResponse),
  };
}

function dashboardToResponse(dashboard: VolunteerDashboard): DashboardResponse {
  return {
    upcomingAssignmentGroups: dashboard.upcomingAssignmentGroups.map(
      dashboardAssignmentGroupToResponse,
    ),
    unreadNotificationCount: dashboard.unreadNotificationCount,
    notificationPreview: dashboard.notificationPreview.map(
      memberNotificationMapper.toResponse,
    ),
    defaultMinistryId: dashboard.defaultMinistryId,
    ministryOptions: dashboard.ministryOptions,
  };
}

function ministryScheduleEventToResponse(
  event: MinistryScheduleEvent,
): MinistryScheduleEventResponse {
  return {
    eventId: event.eventId,
    title: event.title,
    start: parseInstant({ value: event.start }),
    end: parseInstant({ value: event.end }),
    assignmentCount: event.assignmentCount,
    rows: event.rows.map((row) => ({
      ...row,
      shiftStart: parseInstant({ value: row.shiftStart }),
      shiftEnd: parseInstant({ value: row.shiftEnd }),
    })),
  };
}

function ministryScheduleToResponse(
  schedule: MinistrySchedule,
): MinistryScheduleResponse {
  return {
    ministryId: schedule.ministryId,
    ministryName: schedule.ministryName,
    cycleId: schedule.cycleId,
    cycleName: schedule.cycleName,
    published: schedule.published,
    events: schedule.events.map(ministryScheduleEventToResponse),
  };
}

export const volunteerMapper = {
  dashboardToResponse,
  ministryScheduleToResponse,
  availabilityCheckListToResponse(
    summaries: VolunteerAvailabilityCheckSummary[],
  ) {
    return { checks: summaries.map(availabilityCheckSummaryToResponse) };
  },
  availabilityCheckDetailToResponse,
  assignmentToResponse,
};
