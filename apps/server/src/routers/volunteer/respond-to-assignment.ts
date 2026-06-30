import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { AssignmentId } from '../../domain/entities/assignment';
import type { RoleId } from '../../domain/entities/role';
import type { UserId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { notificationService } from '../../infrastructure/services/local-notification-service';
import { protectedProcedure } from '../../trpc';

/**
 * Volunteer responds to one of their own assignments (confirm / decline).
 * On a decline of a published event, notifies the assigning leader (FR-027).
 */
export const respondToAssignment = protectedProcedure
  .input(
    z.object({
      assignmentId: z.string(),
      response: z.enum(['confirmed', 'declined']),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const now = new Date();
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

    const assignment = await repositories.assignments
      .getById(churchId, input.assignmentId as AssignmentId)
      .catch(() => null);
    if (!assignment) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Assignment not found',
      });
    }

    if (assignment.volunteerId !== callerVol.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Cannot respond to another volunteer’s assignment',
      });
    }

    const slot = await repositories.timeSlots.getById(
      churchId,
      assignment.slotId,
    );
    const event = await repositories.events.getById(churchId, slot.eventId);

    if (slot.startTime <= now) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'This assignment is already in progress and can no longer be updated.',
      });
    }

    const previousStatus = assignment.status;
    const role = await repositories.roles
      .getById(churchId, assignment.roleId as RoleId)
      .catch(() => null);

    await repositories.unitOfWork.run(async (tx) => {
      await repositories.assignments.updateStatus(
        churchId,
        assignment.id,
        { status: input.response },
        tx,
      );
      await repositories.assignmentAudits.create(
        churchId,
        {
          assignmentId: assignment.id,
          actorId: ctx.session.user.id as UserId,
          action: 'status_change',
          reason: `Volunteer ${input.response}`,
        },
        tx,
      );
    });

    const shouldNotifyVolunteer =
      event.status === 'published' && previousStatus !== input.response;
    const notificationType =
      input.response === 'declined' && previousStatus === 'confirmed'
        ? 'assignment_removed'
        : 'assignment_changed';
    const notificationTitle =
      notificationType === 'assignment_removed'
        ? 'Assignment removed'
        : 'Assignment updated';
    const notificationBody =
      notificationType === 'assignment_removed'
        ? `You are no longer scheduled for ${role?.name ?? 'this role'} at ${event.title}${slot.label ? ` (${slot.label})` : ''}.`
        : `Your assignment for ${role?.name ?? 'this role'} at ${event.title}${slot.label ? ` (${slot.label})` : ''} changed from ${previousStatus} to ${input.response}.`;

    if (shouldNotifyVolunteer) {
      await notificationService.notifyVolunteer({
        churchId,
        volunteerId: callerVol.id,
        ministryId: event.ministryId,
        eventId: event.id,
        assignmentId: assignment.id,
        type: notificationType,
        title: notificationTitle,
        body: notificationBody,
        payload: {
          assignmentId: assignment.id,
          eventId: event.id,
          ministryId: event.ministryId,
          section: 'assignments',
        },
      });
    }

    // FR-027: notify the assigning leader on decline of a published event.
    if (
      input.response === 'declined' &&
      event.status === 'published' &&
      assignment.assignedBy
    ) {
      await notificationService.notifyLeaderOfDecline({
        churchId,
        eventId: slot.eventId,
        leaderUserId: assignment.assignedBy,
        volunteerId: callerVol.id,
        volunteerName: callerVol.name ?? callerVol.id,
        slotLabel: slot.label ?? slot.startTime.toISOString(),
        roleName: role?.name ?? '',
      });
    }

    return { success: true as const, status: input.response };
  });
