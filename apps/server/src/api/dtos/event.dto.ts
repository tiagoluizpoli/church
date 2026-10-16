import { fromDate, instantSchema } from '@church/time';
import { z } from 'zod';
import type { ScheduleBuilderData } from '../../domain/contracts/application/event-manager';
import type { Event } from '../../domain/entities/event';

export const createEventBodySchema = z.object({
  ministryId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const listEventsQuerySchema = z.object({
  ministryId: z.string(),
  status: z.enum(['draft', 'scheduled', 'cancelled', 'past']).optional(),
});

export const eventResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  cycleId: z.string(),
  sourceTemplateId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: instantSchema,
  end: instantSchema,
  status: z.enum(['draft', 'scheduled', 'cancelled', 'past']),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type EventResponse = z.infer<typeof eventResponseSchema>;

export const eventListResponseSchema = z.object({
  events: z.array(eventResponseSchema),
});

export const scheduleBuilderDataResponseSchema = z.object({
  events: z.array(
    z.object({
      event: eventResponseSchema,
      eventTimeBlocks: z.array(
        z.object({
          id: z.string(),
          churchId: z.string(),
          eventId: z.string(),
          startTime: instantSchema,
          endTime: instantSchema,
          label: z.string().optional(),
          status: z.enum(['active', 'cancelled']),
          requirements: z.array(
            z.object({
              id: z.string(),
              eventTimeBlockId: z.string(),
              roleId: z.string(),
              sectorId: z.string(),
              peopleNeeded: z.number(),
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
      eventTimeBlockId: z.string(),
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
      assignedAt: instantSchema,
      assignedBy: z.string().optional(),
    }),
  ),
  unavailableShifts: z.array(
    z.object({
      id: z.string(),
      volunteerId: z.string(),
      type: z.enum(['available', 'unavailable']),
      startTime: instantSchema,
      endTime: instantSchema,
      isAllDay: z.boolean(),
    }),
  ),
  volunteers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      ministryAccessLevel: z.enum(['leader', 'volunteer']),
      qualifiedRoleIds: z.array(z.string()),
    }),
  ),
  roles: z.array(z.object({ id: z.string(), name: z.string() })),
  sectors: z.array(z.object({ id: z.string(), name: z.string() })),
});

function eventToResponse(ev: Event): EventResponse {
  return {
    id: ev.id as string,
    churchId: ev.churchId as string,
    cycleId: ev.cycleId as string,
    sourceTemplateId: ev.sourceTemplateId as string | undefined,
    title: ev.title,
    description: ev.description,
    location: ev.location,
    start: ev.start,
    end: ev.end,
    status: ev.status,
    createdAt: fromDate({ date: ev.createdAt }),
    updatedAt: fromDate({ date: ev.updatedAt }),
  };
}

export const eventMapper = {
  toResponse: eventToResponse,
  listToResponse(events: Event[]) {
    return { events: events.map(eventToResponse) };
  },
  scheduleBuilderToResponse(data: ScheduleBuilderData) {
    return {
      events: data.events.map(({ event, eventTimeBlocks }) => ({
        event: eventToResponse(event),
        eventTimeBlocks: eventTimeBlocks.map((s) => ({
          id: s.id as string,
          churchId: s.churchId as string,
          eventId: s.eventId as string,
          startTime: s.startTime,
          endTime: s.endTime,
          label: s.label,
          status: s.status,
          requirements: s.requirements.map((r) => ({
            id: r.id as string,
            eventTimeBlockId: r.eventTimeBlockId as string,
            roleId: r.roleId as string,
            sectorId: r.sectorId as string,
            peopleNeeded: r.peopleNeeded,
            notes: r.notes,
          })),
        })),
      })),
      assignments: data.assignments.map((a) => ({
        id: a.id as string,
        churchId: a.churchId as string,
        eventTimeBlockId: a.eventTimeBlockId as string,
        participationId: a.participationId as string | undefined,
        shiftId: a.shiftId as string | undefined,
        volunteerId: a.volunteerId as string,
        roleId: a.roleId as string,
        status: a.status,
        reason: a.reason,
        assignedAt: a.assignedAt,
        assignedBy: a.assignedBy as string | undefined,
      })),
      unavailableShifts: data.unavailableShifts.map((unavailableShift) => ({
        id: unavailableShift.id as string,
        volunteerId: unavailableShift.volunteerId as string,
        // Unavailable shifts are unavailability-only in the reshaped model (FR-018).
        type: 'unavailable' as const,
        startTime: unavailableShift.shiftStartTime,
        endTime: unavailableShift.shiftEndTime,
        isAllDay: false,
      })),
      volunteers: data.volunteers,
      roles: data.roles.map((role) => ({
        id: role.id as string,
        name: role.name,
      })),
      sectors: data.sectors.map((sector) => ({
        id: sector.id as string,
        name: sector.name,
      })),
    };
  },
};
