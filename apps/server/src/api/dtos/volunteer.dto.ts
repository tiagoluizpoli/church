import { z } from 'zod';
import type {
  MinistrySchedule,
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
  assignedAt: z.string(),
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
  confirmedAt: z.string().optional(),
  totalShiftCount: z.number(),
  unavailableShiftCount: z.number(),
});

export const availabilityCheckListResponseSchema = z.object({
  checks: z.array(availabilityCheckSummarySchema),
});

const availabilityCheckShiftSchema = z.object({
  shiftId: z.string(),
  eventId: z.string(),
  eventTitle: z.string(),
  startTime: z.string(),
  endTime: z.string(),
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
  confirmedAt: z.string().optional(),
  shifts: z.array(availabilityCheckShiftSchema),
});

export const setUnavailabilityMarksBodySchema = z.object({
  shiftIds: z.array(z.string()),
  wholeDayDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
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
  startTime: z.string(),
  endTime: z.string(),
  status: z.enum(['pending', 'confirmed', 'declined']),
  timingState: z.enum(['in_progress', 'upcoming']),
  canRespond: z.boolean(),
});

const dashboardAssignmentGroupSchema = z.object({
  eventId: z.string(),
  eventTitle: z.string(),
  ministryId: z.string(),
  ministryName: z.string(),
  eventStart: z.string(),
  aggregateResponseState: z.enum(['pending', 'confirmed', 'mixed', 'declined']),
  hasPendingResponse: z.boolean(),
  assignments: z.array(dashboardAssignmentItemSchema),
});

const dashboardAvailabilityTaskSchema = z.object({
  eventId: z.string(),
  eventTitle: z.string(),
  ministryId: z.string(),
  ministryName: z.string(),
  eventType: z.enum(['hourly', 'day_based']),
  eventStart: z.string(),
  eventEnd: z.string(),
  completionState: z.enum(['missing', 'partial', 'complete']),
});

const dashboardNotificationPreviewSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  readAt: z.string().optional(),
  createdAt: z.string(),
});

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

export const assignmentListResponseSchema = z.object({
  assignments: z.array(assignmentResponseSchema),
});

export const ministryScheduleResponseSchema = z.object({
  ministryId: z.string(),
  ministryName: z.string(),
  events: z.array(
    z.object({
      eventId: z.string(),
      title: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      assignmentCount: z.number(),
      rows: z.array(
        z.object({
          slotId: z.string(),
          slotLabel: z.string(),
          roleName: z.string(),
          teamName: z.string().optional(),
          volunteerDisplayName: z.string().optional(),
          confirmationState: z.enum([
            'pending',
            'confirmed',
            'declined',
            'open',
          ]),
        }),
      ),
    }),
  ),
});

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
    assignedAt: a.assignedAt.toISOString(),
    assignedBy: a.assignedBy as string | undefined,
  };
}

function availabilityCheckSummaryToResponse(
  summary: VolunteerAvailabilityCheckSummary,
): z.infer<typeof availabilityCheckSummarySchema> {
  return {
    id: summary.id,
    planningCycleId: summary.planningCycleId,
    planningCycleName: summary.planningCycleName,
    ministryId: summary.ministryId,
    ministryName: summary.ministryName,
    state: summary.state,
    confirmedAt: summary.confirmedAt?.toISOString(),
    totalShiftCount: summary.totalShiftCount,
    unavailableShiftCount: summary.unavailableShiftCount,
  };
}

function availabilityCheckDetailToResponse(
  detail: VolunteerAvailabilityCheckDetail,
): z.infer<typeof availabilityCheckDetailResponseSchema> {
  return {
    id: detail.id,
    planningCycleId: detail.planningCycleId,
    planningCycleName: detail.planningCycleName,
    ministryId: detail.ministryId,
    ministryName: detail.ministryName,
    state: detail.state,
    confirmedAt: detail.confirmedAt?.toISOString(),
    shifts: detail.shifts.map((shift) => ({
      shiftId: shift.shiftId,
      eventId: shift.eventId,
      eventTitle: shift.eventTitle,
      startTime: shift.startTime.toISOString(),
      endTime: shift.endTime.toISOString(),
      label: shift.label,
      available: shift.available,
    })),
  };
}

export const volunteerMapper = {
  dashboardToResponse(dashboard: VolunteerDashboard) {
    return {
      availabilityTasks: dashboard.availabilityTasks,
      upcomingAssignmentGroups: dashboard.upcomingAssignmentGroups,
      unreadNotificationCount: dashboard.unreadNotificationCount,
      notificationPreview: dashboard.notificationPreview,
      defaultMinistryId: dashboard.defaultMinistryId,
      ministryOptions: dashboard.ministryOptions,
    };
  },
  assignmentsToResponse(assignments: Assignment[]) {
    return { assignments: assignments.map(assignmentToResponse) };
  },
  ministryScheduleToResponse(schedule: MinistrySchedule) {
    return schedule;
  },
  availabilityCheckListToResponse(
    summaries: VolunteerAvailabilityCheckSummary[],
  ) {
    return { checks: summaries.map(availabilityCheckSummaryToResponse) };
  },
  availabilityCheckDetailToResponse,
  assignmentToResponse,
};
