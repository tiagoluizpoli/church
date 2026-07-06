import { z } from 'zod';
import type { ScheduleBuilderData } from '../../domain/contracts/application/event-manager';
import type { Event } from '../../domain/entities/event';

export const createEventBodySchema = z.object({
  ministryId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  eventType: z.enum(['hourly', 'day_based']).optional(),
});

export const listEventsQuerySchema = z.object({
  ministryId: z.string(),
  status: z.enum(['draft', 'scheduled', 'cancelled', 'past']).optional(),
});

export const eventResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  planningCycleId: z.string(),
  sourceTemplateId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(['draft', 'scheduled', 'cancelled', 'past']),
  eventType: z.enum(['hourly', 'day_based']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EventResponse = z.infer<typeof eventResponseSchema>;

export const eventListResponseSchema = z.object({
  events: z.array(eventResponseSchema),
});

export const scheduleBuilderDataResponseSchema = z.object({
  events: z.array(
    z.object({
      event: eventResponseSchema,
      slots: z.array(
        z.object({
          id: z.string(),
          churchId: z.string(),
          eventId: z.string(),
          startTime: z.string(),
          endTime: z.string(),
          label: z.string().optional(),
          status: z.enum(['active', 'cancelled']),
          requirements: z.array(
            z.object({
              id: z.string(),
              slotId: z.string(),
              roleId: z.string(),
              teamId: z.string().optional(),
              requiredCount: z.number(),
              notes: z.string().optional(),
            }),
          ),
        }),
      ),
    }),
  ),
  assignments: z.array(
    z.object({
      id: z.string(),
      churchId: z.string(),
      slotId: z.string(),
      participationId: z.string().optional(),
      shiftId: z.string().optional(),
      volunteerId: z.string(),
      roleId: z.string(),
      status: z.enum([
        'draft',
        'pending',
        'confirmed',
        'declined',
        'cancelled',
      ]),
      reason: z.string().optional(),
      assignedAt: z.string(),
      assignedBy: z.string().optional(),
    }),
  ),
  availability: z.array(
    z.object({
      id: z.string(),
      volunteerId: z.string(),
      type: z.enum(['available', 'unavailable']),
      startTime: z.string(),
      endTime: z.string(),
      isAllDay: z.boolean(),
    }),
  ),
  volunteers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      systemRole: z.enum(['leader', 'sub_leader', 'volunteer']),
    }),
  ),
  roles: z.array(z.object({ id: z.string(), name: z.string() })),
  callerTeamId: z.string().nullable(),
});

function eventToResponse(ev: Event): EventResponse {
  return {
    id: ev.id as string,
    churchId: ev.churchId as string,
    planningCycleId: ev.planningCycleId as string,
    sourceTemplateId: ev.sourceTemplateId as string | undefined,
    title: ev.title,
    description: ev.description,
    location: ev.location,
    startDate: ev.startDate.toISOString(),
    endDate: ev.endDate.toISOString(),
    status: ev.status,
    eventType: ev.eventType,
    createdAt: ev.createdAt.toISOString(),
    updatedAt: ev.updatedAt.toISOString(),
  };
}

export const eventMapper = {
  toResponse: eventToResponse,
  listToResponse(events: Event[]) {
    return { events: events.map(eventToResponse) };
  },
  scheduleBuilderToResponse(data: ScheduleBuilderData) {
    return {
      events: data.events.map(({ event, slots }) => ({
        event: eventToResponse(event),
        slots: slots.map((s) => ({
          id: s.id as string,
          churchId: s.churchId as string,
          eventId: s.eventId as string,
          startTime: s.startTime.toISOString(),
          endTime: s.endTime.toISOString(),
          label: s.label,
          status: s.status,
          requirements: s.requirements.map((r) => ({
            id: r.id as string,
            slotId: r.slotId as string,
            roleId: r.roleId as string,
            teamId: r.teamId as string | undefined,
            requiredCount: r.requiredCount,
            notes: r.notes,
          })),
        })),
      })),
      assignments: data.assignments.map((a) => ({
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
      })),
      availability: data.availability.map((av) => ({
        id: av.id as string,
        volunteerId: av.volunteerId as string,
        // Marks are unavailability-only in the reshaped model (FR-018).
        type: 'unavailable' as const,
        startTime: av.shiftStartTime.toISOString(),
        endTime: av.shiftEndTime.toISOString(),
        isAllDay: false,
      })),
      volunteers: data.volunteers,
      roles: data.roles.map((role) => ({
        id: role.id as string,
        name: role.name,
      })),
      callerTeamId: data.callerTeamId,
    };
  },
};
