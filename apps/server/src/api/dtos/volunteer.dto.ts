import { z } from 'zod';
import type { VolunteerDashboard } from '../../domain/contracts/application/volunteer-manager';
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

export const dashboardResponseSchema = z.object({
  upcomingAssignments: z.array(assignmentResponseSchema),
  unreadNotificationCount: z.number(),
});

export const assignmentListResponseSchema = z.object({
  assignments: z.array(assignmentResponseSchema),
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
      upcomingAssignments:
        dashboard.upcomingAssignments.map(assignmentToResponse),
      unreadNotificationCount: dashboard.unreadNotificationCount,
    };
  },
  assignmentsToResponse(assignments: Assignment[]) {
    return { assignments: assignments.map(assignmentToResponse) };
  },
  availabilityListToResponse(items: Availability[]) {
    return { availability: items.map(availabilityToResponse) };
  },
  assignmentToResponse,
  availabilityToResponse,
};
