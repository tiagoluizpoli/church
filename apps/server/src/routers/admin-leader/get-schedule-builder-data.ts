import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { AvailabilityEngine } from '../../domain/availability/availability-engine';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { TimeSlotId } from '../../domain/entities/time-slot';
import type { UserId, VolunteerId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { authorizeScheduleBuilderAccess } from './authorize';

export const getScheduleBuilderData = protectedProcedure
  .input(z.object({ eventId: z.string() }))
  .query(async ({ input, ctx }) => {
    // 1. Resolve volunteer from session user globally to get churchId
    const callerVol = await repositories.volunteers.findByUserIdGlobally(
      ctx.session.user.id as UserId,
    );
    if (!callerVol) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Active volunteer profile not found',
      });
    }
    const churchId = callerVol.churchId;

    // 2. Fetch the event
    const event = await repositories.events
      .getById(churchId, input.eventId as EventId)
      .catch(() => null);

    if (!event) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
    }

    // 3. Authorize — admits leaders, admins, and sub-leaders (team-scoped)
    const authCtx = await authorizeScheduleBuilderAccess(
      ctx.session.user.id,
      event.ministryId,
    );

    // 3. Fetch slots (TimeSlot entities carry their SlotRequirements eagerly)
    const slots = await repositories.timeSlots.listByEvent(
      authCtx.churchId as ChurchId,
      input.eventId as EventId,
    );

    // Build a lookup map: slotId → { startTime, endTime } for O(1) joins
    const slotTimeMap = new Map<TimeSlotId, { startTime: Date; endTime: Date }>(
      slots.map((s) => [s.id, { startTime: s.startTime, endTime: s.endTime }]),
    );

    // 4. Extract requirements from loaded slot entities (avoids a separate query)
    const requirements = slots.flatMap((s) => s.requirements);

    // 5. Fetch all assignments for this event in one query
    const assignments = await repositories.assignments.listByEvent(
      authCtx.churchId as ChurchId,
      input.eventId as EventId,
    );

    // 6. Fetch volunteers in this ministry (with names joined at the repo level)
    const volunteers = await repositories.volunteers.listByMinistry(
      authCtx.churchId as ChurchId,
      event.ministryId,
    );

    // 6b. Fetch roles for this ministry (used for grid column labels + picker)
    const roles = await repositories.roles.listByMinistry(
      authCtx.churchId as ChurchId,
      event.ministryId,
    );

    const volunteerIds = volunteers.map((v) => v.id);

    // 7. Bulk-fetch all unavailability blocks for these volunteers
    const blockouts = await repositories.availability.listByVolunteers(
      authCtx.churchId as ChurchId,
      volunteerIds as VolunteerId[],
    );

    // 8. Bulk-fetch all assignments for these volunteers for overlap checking.
    //    We use listByVolunteer per volunteer — a future optimization can add
    //    a bulk method to AssignmentRepository if this becomes a bottleneck.
    const existingAssignments = (
      await Promise.all(
        volunteerIds.map((vid) =>
          repositories.assignments.listByVolunteer(
            authCtx.churchId as ChurchId,
            vid as VolunteerId,
          ),
        ),
      )
    ).flat();

    // Resolve missing slot details for cross-event assignments
    const uniqueSlotIds = [
      ...new Set(existingAssignments.map((a) => a.slotId)),
    ];
    const loadedSlotIds = new Set(slots.map((s) => s.id));
    const missingSlotIds = uniqueSlotIds.filter((id) => !loadedSlotIds.has(id));
    const missingSlots = await Promise.all(
      missingSlotIds.map((slotId) =>
        repositories.timeSlots
          .getById(authCtx.churchId as ChurchId, slotId)
          .catch(() => null),
      ),
    );
    missingSlots.forEach((s) => {
      if (s) {
        slotTimeMap.set(s.id, { startTime: s.startTime, endTime: s.endTime });
      }
    });

    // 9. Calculate per-volunteer availability for the event time range
    const volunteerAvailability = volunteers.map((vol) => {
      const volBlockouts = blockouts
        .filter((b) => b.volunteerId === vol.id)
        .map((b) => ({
          id: b.id,
          churchId: b.churchId,
          timeRange: { start: b.startTime, end: b.endTime },
          isAllDay: b.isAllDay,
        }));

      // Join assignment → slot times using the in-memory slotTimeMap
      const volAssignments = existingAssignments
        .filter((a) => a.volunteerId === vol.id)
        .flatMap((a) => {
          const times = slotTimeMap.get(a.slotId);
          if (!times) return [];
          return [
            {
              id: a.id,
              churchId: a.churchId,
              timeRange: { start: times.startTime, end: times.endTime },
              status: a.status as 'pending' | 'confirmed' | 'declined',
            },
          ];
        });

      const availResult = AvailabilityEngine.checkAvailability({
        churchId: authCtx.churchId,
        volunteerId: vol.id,
        timeRange: { start: event.startDate, end: event.endDate },
        existingBlockouts: volBlockouts,
        existingAssignments: volAssignments,
      });

      return {
        volunteerId: vol.id,
        volunteerName: vol.name ?? vol.userId,
        status: availResult.status,
        conflictReason:
          'conflictReason' in availResult
            ? availResult.conflictReason
            : undefined,
        conflictingId:
          'conflictingId' in availResult
            ? availResult.conflictingId
            : undefined,
      };
    });

    // 9b. Sub-leader team scoping (US6): restrict the volunteer pool to the
    //     caller's own team. Full leaders/admins see everyone (teamId null).
    const callerTeamId = authCtx.teamId;
    let scopedAvailability = volunteerAvailability;
    if (authCtx.systemRole === 'sub_leader' && callerTeamId) {
      const memberships = await repositories.volunteers.listMinistryMemberships(
        authCtx.churchId as ChurchId,
        event.ministryId,
      );
      const teamVolunteerIds = new Set(
        memberships
          .filter((m) => m.teamId === callerTeamId)
          .map((m) => m.volunteerId),
      );
      scopedAvailability = volunteerAvailability.filter((v) =>
        teamVolunteerIds.has(v.volunteerId),
      );
    }

    return {
      event: {
        id: event.id,
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        ministryId: event.ministryId,
        status: event.status,
        eventType: event.eventType,
      },
      roles: roles.map((r) => ({ id: r.id, name: r.name })),
      slots: slots.map((s) => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        label: s.label,
      })),
      requirements: requirements.map((r) => ({
        id: r.id,
        slotId: r.slotId,
        roleId: r.roleId,
        requiredCount: r.requiredCount,
        teamId: r.teamId ?? null,
      })),
      assignments: assignments.map((a) => ({
        id: a.id,
        slotId: a.slotId,
        volunteerId: a.volunteerId,
        roleId: a.roleId,
        status: a.status,
        volunteerName:
          volunteers.find((v) => v.id === a.volunteerId)?.name ?? undefined,
      })),
      volunteerAvailability: scopedAvailability,
      // Sub-leader team scoping (US6): null = full leader/admin access.
      callerTeamId,
    };
  });
