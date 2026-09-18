import { calendarDaySchema, instantSchema, parseInstant } from '@church/time';
import { z } from 'zod';
import type {
  DashboardAssignmentGroup,
  DashboardAssignmentItem,
  DashboardAvailabilityTask,
  DashboardNotificationPreview,
  MinistrySchedule,
  MinistryScheduleEvent,
  VolunteerAvailabilityCheckDetail,
  VolunteerAvailabilityCheckSummary,
  VolunteerDashboard,
} from '../../domain/contracts/application/volunteer-manager';
import type { Assignment } from '../../domain/entities/assignment';

export const assignmentResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  slotId: z.string(),
  participationId: z.string().optional(),
  shiftId: z.string().optional(),
  volunteerId: z.string(),
  roleId: z.string(),
  status: z.enum(['draft', 'pending', 'confirmed', 'declined', 'cancelled']),
  reason: z.string().optional(),
  assignedAt: instantSchema,
  assignedBy: z.string().optional(),
});
export type AssignmentResponse = z.infer<typeof assignmentResponseSchema>;

export const availabilityCheckSummarySchema = z.object({
  id: z.string(),
  planningCycleId: z.string(),
  planningCycleName: z.string(),
  ministryId: z.string(),
  ministryName: z.string(),
  state: z.enum(['pending', 'confirmed']),
  confirmedAt: instantSchema.optional(),
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
});

export const availabilityCheckDetailResponseSchema = z.object({
  id: z.string(),
  planningCycleId: z.string(),
  planningCycleName: z.string(),
  ministryId: z.string(),
  ministryName: z.string(),
  state: z.enum(['pending', 'confirmed']),
  confirmedAt: instantSchema.optional(),
  shifts: z.array(availabilityCheckShiftSchema),
});
export type AvailabilityCheckDetailResponse = z.infer<
  typeof availabilityCheckDetailResponseSchema
>;

export const setUnavailabilityMarksBodySchema = z.object({
  shiftIds: z.array(z.string()),
  wholeDayDates: z.array(calendarDaySchema).optional(),
});

const dashboardAssignmentItemSchema = z.object({
  assignmentId: z.string(),
  slotId: z.string(),
  shiftId: z.string(),
  participationId: z.string(),
  roleId: z.string(),
  roleName: z.string(),
  teamId: z.string().optional(),
  teamName: z.string().optional(),
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

const dashboardAvailabilityTaskSchema = z.object({
  eventId: z.string(),
  eventTitle: z.string(),
  ministryId: z.string(),
  ministryName: z.string(),
  eventType: z.enum(['hourly', 'day_based']),
  eventStart: instantSchema,
  eventEnd: instantSchema,
  completionState: z.enum(['missing', 'partial', 'complete']),
});
type DashboardAvailabilityTaskResponse = z.infer<
  typeof dashboardAvailabilityTaskSchema
>;

const dashboardNotificationPreviewSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  readAt: instantSchema.optional(),
  createdAt: instantSchema,
});
type DashboardNotificationPreviewResponse = z.infer<
  typeof dashboardNotificationPreviewSchema
>;

const dashboardMinistryOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const dashboardResponseSchema = z.object({
  availabilityTasks: z.array(dashboardAvailabilityTaskSchema),
  upcomingAssignmentGroups: z.array(dashboardAssignmentGroupSchema),
  unreadNotificationCount: z.number(),
  notificationPreview: z.array(dashboardNotificationPreviewSchema),
  defaultMinistryId: z.string().optional(),
  ministryOptions: z.array(dashboardMinistryOptionSchema),
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;

export const assignmentListResponseSchema = z.object({
  assignments: z.array(assignmentResponseSchema),
});

const ministryScheduleEventResponseSchema = z.object({
  eventId: z.string(),
  title: z.string(),
  startDate: instantSchema,
  endDate: instantSchema,
  assignmentCount: z.number(),
  rows: z.array(
    z.object({
      slotId: z.string(),
      slotLabel: z.string(),
      roleName: z.string(),
      teamName: z.string().optional(),
      volunteerDisplayName: z.string().optional(),
      confirmationState: z.enum(['pending', 'confirmed', 'declined', 'open']),
    }),
  ),
});
type MinistryScheduleEventResponse = z.infer<
  typeof ministryScheduleEventResponseSchema
>;

export const ministryScheduleResponseSchema = z.object({
  ministryId: z.string(),
  ministryName: z.string(),
  events: z.array(ministryScheduleEventResponseSchema),
});
export type MinistryScheduleResponse = z.infer<
  typeof ministryScheduleResponseSchema
>;

export const respondToAssignmentBodySchema = z.object({
  response: z.enum(['accepted', 'declined']),
  reason: z.string().optional(),
});

function assignmentToResponse(a: Assignment): AssignmentResponse {
  return {
    id: a.id as string,
    churchId: a.churchId as string,
    slotId: a.slotId as string,
    participationId: a.participationId as string | undefined,
    shiftId: a.shiftId as string | undefined,
    volunteerId: a.volunteerId as string,
    roleId: a.roleId as string,
    status: a.status,
    reason: a.reason,
    assignedAt: a.assignedAt,
    assignedBy: a.assignedBy as string | undefined,
  };
}

function availabilityCheckSummaryToResponse(
  summary: VolunteerAvailabilityCheckSummary,
): AvailabilityCheckSummaryResponse {
  return {
    id: summary.id,
    planningCycleId: summary.planningCycleId,
    planningCycleName: summary.planningCycleName,
    ministryId: summary.ministryId,
    ministryName: summary.ministryName,
    state: summary.state,
    confirmedAt: summary.confirmedAt,
    totalShiftCount: summary.totalShiftCount,
    unavailableShiftCount: summary.unavailableShiftCount,
  };
}

function availabilityCheckDetailToResponse(
  detail: VolunteerAvailabilityCheckDetail,
): AvailabilityCheckDetailResponse {
  return {
    id: detail.id,
    planningCycleId: detail.planningCycleId,
    planningCycleName: detail.planningCycleName,
    ministryId: detail.ministryId,
    ministryName: detail.ministryName,
    state: detail.state,
    confirmedAt: detail.confirmedAt,
    shifts: detail.shifts.map((shift) => ({
      shiftId: shift.shiftId,
      eventId: shift.eventId,
      eventTitle: shift.eventTitle,
      startTime: shift.startTime,
      endTime: shift.endTime,
      label: shift.label,
      available: shift.available,
    })),
  };
}

function dashboardAvailabilityTaskToResponse(
  task: DashboardAvailabilityTask,
): DashboardAvailabilityTaskResponse {
  return {
    eventId: task.eventId,
    eventTitle: task.eventTitle,
    ministryId: task.ministryId,
    ministryName: task.ministryName,
    eventType: task.eventType,
    eventStart: parseInstant({ value: task.eventStart }),
    eventEnd: parseInstant({ value: task.eventEnd }),
    completionState: task.completionState,
  };
}

function dashboardAssignmentItemToResponse(
  item: DashboardAssignmentItem,
): DashboardAssignmentItemResponse {
  return {
    assignmentId: item.assignmentId,
    slotId: item.slotId,
    shiftId: item.shiftId,
    participationId: item.participationId,
    roleId: item.roleId,
    roleName: item.roleName,
    teamId: item.teamId,
    teamName: item.teamName,
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

function dashboardNotificationPreviewToResponse(
  preview: DashboardNotificationPreview,
): DashboardNotificationPreviewResponse {
  return {
    id: preview.id,
    type: preview.type,
    title: preview.title,
    body: preview.body,
    readAt: preview.readAt
      ? parseInstant({ value: preview.readAt })
      : undefined,
    createdAt: parseInstant({ value: preview.createdAt }),
  };
}

function dashboardToResponse(dashboard: VolunteerDashboard): DashboardResponse {
  return {
    availabilityTasks: dashboard.availabilityTasks.map(
      dashboardAvailabilityTaskToResponse,
    ),
    upcomingAssignmentGroups: dashboard.upcomingAssignmentGroups.map(
      dashboardAssignmentGroupToResponse,
    ),
    unreadNotificationCount: dashboard.unreadNotificationCount,
    notificationPreview: dashboard.notificationPreview.map(
      dashboardNotificationPreviewToResponse,
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
    startDate: parseInstant({ value: event.startDate }),
    endDate: parseInstant({ value: event.endDate }),
    assignmentCount: event.assignmentCount,
    rows: event.rows.map((row) => ({
      slotId: row.slotId,
      slotLabel: row.slotLabel,
      roleName: row.roleName,
      teamName: row.teamName,
      volunteerDisplayName: row.volunteerDisplayName,
      confirmationState: row.confirmationState,
    })),
  };
}

function ministryScheduleToResponse(
  schedule: MinistrySchedule,
): MinistryScheduleResponse {
  return {
    ministryId: schedule.ministryId,
    ministryName: schedule.ministryName,
    events: schedule.events.map(ministryScheduleEventToResponse),
  };
}

export const volunteerMapper = {
  dashboardToResponse,
  assignmentsToResponse(assignments: Assignment[]) {
    return { assignments: assignments.map(assignmentToResponse) };
  },
  ministryScheduleToResponse,
  availabilityCheckListToResponse(
    summaries: VolunteerAvailabilityCheckSummary[],
  ) {
    return { checks: summaries.map(availabilityCheckSummaryToResponse) };
  },
  availabilityCheckDetailToResponse,
  assignmentToResponse,
};
