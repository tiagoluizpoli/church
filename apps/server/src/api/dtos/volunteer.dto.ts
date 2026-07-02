import { z } from 'zod';
import type {
  MinistrySchedule,
  VolunteerDashboard,
} from '../../domain/contracts/application/volunteer-manager';
import type { Assignment } from '../../domain/entities/assignment';
import type { Availability } from '../../domain/entities/availability';

export const assignmentResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  slotId: z.string(),
  volunteerId: z.string(),
  roleId: z.string(),
  status: z.enum(['draft', 'pending', 'confirmed', 'declined', 'cancelled']),
  reason: z.string().optional(),
  assignedAt: z.string(),
  assignedBy: z.string().optional(),
});
export type AssignmentResponse = z.infer<typeof assignmentResponseSchema>;

export const availabilityResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  volunteerId: z.string(),
  eventId: z.string().optional(),
  type: z.enum(['available', 'unavailable']),
  startTime: z.string(),
  endTime: z.string(),
  isAllDay: z.boolean(),
  reason: z.string().optional(),
  repeatRule: z.string().optional(),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

const dashboardAssignmentItemSchema = z.object({
  assignmentId: z.string(),
  slotId: z.string(),
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

export const availabilityListResponseSchema = z.object({
  availability: z.array(availabilityResponseSchema),
});

export const upsertAvailabilityBodySchema = z.object({
  availabilityId: z.string().optional(),
  eventId: z.string().optional(),
  type: z.enum(['available', 'unavailable']),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  isAllDay: z.boolean().default(false),
  reason: z.string().optional(),
  repeatRule: z.string().optional(),
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
    volunteerId: a.volunteerId as string,
    roleId: a.roleId as string,
    status: a.status,
    reason: a.reason,
    assignedAt: a.assignedAt.toISOString(),
    assignedBy: a.assignedBy as string | undefined,
  };
}

function availabilityToResponse(av: Availability): AvailabilityResponse {
  return {
    id: av.id as string,
    churchId: av.churchId as string,
    volunteerId: av.volunteerId as string,
    eventId: av.eventId as string | undefined,
    type: av.type,
    startTime: av.startTime.toISOString(),
    endTime: av.endTime.toISOString(),
    isAllDay: av.isAllDay,
    reason: av.reason,
    repeatRule: av.repeatRule,
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
  availabilityListToResponse(items: Availability[]) {
    return { availability: items.map(availabilityToResponse) };
  },
  assignmentToResponse,
  availabilityToResponse,
};
