import { NotFoundError } from '@church/core';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { ConflictValidationService } from '../../domain/conflict/conflict-validation-service';
import { HardConstraintError } from '../../domain/conflict/errors/hard-constraint-error';
import type { Assignment } from '../../domain/entities/assignment';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { MinistryId } from '../../domain/entities/ministry';
import type { UserId, VolunteerId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { notificationService } from '../../infrastructure/services/local-notification-service';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const publishEvent = protectedProcedure
  .input(z.object({ eventId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    // 1. Resolve volunteer from session user globally to get churchId
    const vol = await repositories.volunteers.findByUserIdGlobally(
      ctx.session.user.id as UserId,
    );
    if (!vol) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Active volunteer profile not found',
      });
    }
    const churchId = vol.churchId;

    // 2. Fetch the event
    const event = await repositories.events
      .getById(churchId, input.eventId as EventId)
      .catch((err) => {
        if (err instanceof NotFoundError) return null;
        throw err;
      });

    if (!event) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
    }

    // 3. Authorize
    const authCtx = await authorizeLeaderOrAdmin(
      ctx.session.user.id,
      event.ministryId,
    );

    if (event.churchId !== authCtx.churchId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Cross-church access denied',
      });
    }

    // 3. State validations
    if (event.status !== 'draft') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Event is already in status: ${event.status}`,
      });
    }

    if (event.startDate <= new Date()) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Event start time is in the past or present',
      });
    }

    // 4. Fetch slots
    const slots = await repositories.timeSlots.listByEvent(
      authCtx.churchId as ChurchId,
      input.eventId as EventId,
    );

    if (slots.length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Event has no time slots',
      });
    }

    // 5. Fetch assignments for this event
    const assignments = await repositories.assignments.listByEvent(
      authCtx.churchId as ChurchId,
      input.eventId as EventId,
    );

    if (assignments.length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Event has no assignments scheduled',
      });
    }

    const draftAssignments = assignments.filter((a) => a.status === 'draft');

    // 6. Batch-validate all draft assignments
    if (draftAssignments.length > 0) {
      const volunteerIds = Array.from(
        new Set(draftAssignments.map((a) => a.volunteerId as string)),
      );

      // Bulk fetch membership data for all involved volunteers
      const membershipResults = await Promise.all(
        volunteerIds.map(async (vid) => ({
          volunteerId: vid,
          ministryIds: await repositories.volunteers.listMemberMinistryIds(
            authCtx.churchId as ChurchId,
            vid as VolunteerId,
          ),
        })),
      );

      const membershipMap = new Map(
        membershipResults.map((m) => [m.volunteerId, m.ministryIds]),
      );

      // Bulk fetch qualified role IDs per volunteer (cache per unique ministry set)
      const roleIdCache = new Map<string, string[]>();
      const getQualifiedRoleIds = async (ministryIds: string[]) => {
        const key = ministryIds.sort().join(',');
        let cached = roleIdCache.get(key);
        if (cached === undefined) {
          cached = await repositories.roles.listGlobalAndMinistryRoleIds(
            authCtx.churchId as ChurchId,
            ministryIds as MinistryId[],
          );
          roleIdCache.set(key, cached);
        }
        return cached;
      };

      // Bulk fetch existing assignments per volunteer
      const existingAssignmentsMap = new Map<string, Assignment[]>();
      await Promise.all(
        volunteerIds.map(async (vid) => {
          const vAssignments = await repositories.assignments.listByVolunteer(
            authCtx.churchId as ChurchId,
            vid as VolunteerId,
          );
          existingAssignmentsMap.set(vid, vAssignments);
        }),
      );

      const slotMap = new Map(slots.map((s) => [s.id, s]));

      for (const a of draftAssignments) {
        const volunteerMinistryIds = membershipMap.get(a.volunteerId) ?? [];
        const volunteerQualifiedRoleIds =
          await getQualifiedRoleIds(volunteerMinistryIds);
        const existingSlotIds = (
          existingAssignmentsMap.get(a.volunteerId) ?? []
        )
          .filter(
            (ex) =>
              ex.id !== a.id &&
              ['draft', 'pending', 'confirmed'].includes(ex.status),
          )
          .map((ex) => ex.slotId);
        const slotObj = slotMap.get(a.slotId);
        const startTime = slotObj?.startTime ?? event.startDate;

        try {
          ConflictValidationService.validateHardConstraints({
            churchId: event.churchId,
            volunteerId: a.volunteerId,
            roleId: a.roleId,
            volunteerQualifiedRoleIds,
            ministryId: event.ministryId,
            volunteerMinistryIds,
            eventStartTime: startTime,
            now: new Date(),
            slotId: a.slotId,
            existingSlotIds,
          });
        } catch (err) {
          if (err instanceof HardConstraintError) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Validation failed for draft assignment: ${err.message}`,
            });
          }
          throw err;
        }
      }
    }

    // 7. Atomic transaction: publish event + promote draft assignments
    await repositories.unitOfWork.run(async (tx) => {
      await repositories.events.updateStatus(
        authCtx.churchId as ChurchId,
        input.eventId as EventId,
        { status: 'published' },
        tx,
      );

      for (const a of draftAssignments) {
        await repositories.assignments.updateStatus(
          authCtx.churchId as ChurchId,
          a.id,
          { status: 'pending' },
          tx,
        );

        await repositories.assignmentAudits.create(
          authCtx.churchId as ChurchId,
          {
            assignmentId: a.id,
            actorId: ctx.session.user.id as UserId,
            action: 'status_change',
            reason: 'Event published',
          },
          tx,
        );
      }
    });

    // 8. Dispatch notifications
    const slotById = new Map(slots.map((slot) => [slot.id, slot]));

    for (const assignment of draftAssignments) {
      const slot = slotById.get(assignment.slotId);
      const role = await repositories.roles.getById(
        authCtx.churchId as ChurchId,
        assignment.roleId,
      );

      await notificationService.notifyVolunteer({
        churchId: authCtx.churchId,
        volunteerId: assignment.volunteerId,
        ministryId: event.ministryId,
        eventId: event.id,
        assignmentId: assignment.id,
        type: 'schedule_published',
        title: 'Schedule published',
        body: `You are scheduled as ${role.name} for ${event.title}${slot?.label ? ` (${slot.label})` : ''}.`,
        payload: {
          assignmentId: assignment.id,
          eventId: event.id,
          ministryId: event.ministryId,
          section: 'assignments',
        },
      });
    }

    await notificationService.publish({
      type: 'event_published',
      churchId: authCtx.churchId,
      eventId: input.eventId,
      actorId: ctx.session.user.id,
      assignmentIds: draftAssignments.map((a) => a.id as string),
    });

    return {
      success: true,
      transitionedCount: draftAssignments.length,
    };
  });
