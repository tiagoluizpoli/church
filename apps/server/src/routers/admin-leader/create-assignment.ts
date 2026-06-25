import { NotFoundError } from '@church/core';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { AvailabilityEngine } from '../../domain/availability/availability-engine';
import { ConflictValidationService } from '../../domain/conflict/conflict-validation-service';
import { HardConstraintError } from '../../domain/conflict/errors/hard-constraint-error';
import type { AssignmentId } from '../../domain/entities/assignment';
import type { ChurchId } from '../../domain/entities/church';
import type { RoleId } from '../../domain/entities/role';
import type { TimeSlotId } from '../../domain/entities/time-slot';
import type { UserId, VolunteerId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const createAssignment = protectedProcedure
  .input(
    z.object({
      timeSlotId: z.string(),
      volunteerId: z.string(),
      roleId: z.string(),
      allowOverride: z.boolean().optional(),
      overrideReason: z.string().optional(),
      asDraft: z.boolean().optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
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

    // 2. Fetch the slot
    const slot = await repositories.timeSlots
      .getById(churchId, input.timeSlotId as TimeSlotId)
      .catch(() => null);

    if (!slot) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Time slot not found',
      });
    }

    const event = await repositories.events
      .getById(slot.churchId, slot.eventId)
      .catch(() => null);

    if (!event) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
    }

    // 2. Authorize
    const authCtx = await authorizeLeaderOrAdmin(
      ctx.session.user.id,
      event.ministryId,
    );

    if (slot.churchId !== authCtx.churchId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Cross-church access denied',
      });
    }

    // 3. Verify the volunteer exists in this church
    const volunteer = await repositories.volunteers
      .getById(authCtx.churchId as ChurchId, input.volunteerId as VolunteerId)
      .catch((err) => {
        if (err instanceof NotFoundError) return null;
        throw err;
      });

    if (!volunteer) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Volunteer not found',
      });
    }

    // 4. Verify the role (church-isolated)
    const role = await repositories.roles
      .getById(authCtx.churchId as ChurchId, input.roleId as RoleId)
      .catch((err) => {
        if (err instanceof NotFoundError) return null;
        throw err;
      });

    if (!role) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Role not found' });
    }

    if (role.ministryId !== event.ministryId && !role.isGlobal) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Role must be global or belong to the target ministry',
      });
    }

    // 5. If draft requested, skip conflict checking
    if (input.asDraft) {
      return repositories.unitOfWork.run(async (tx) => {
        const created = await repositories.assignments.create(
          authCtx.churchId as ChurchId,
          {
            slotId: input.timeSlotId as TimeSlotId,
            volunteerId: input.volunteerId as VolunteerId,
            roleId: input.roleId as RoleId,
            status: 'draft',
            assignedBy: ctx.session.user.id as UserId,
          },
          tx,
        );

        await repositories.assignmentAudits.create(
          authCtx.churchId as ChurchId,
          {
            assignmentId: created.id,
            actorId: ctx.session.user.id as UserId,
            action: 'created',
            reason: 'Draft assignment created',
          },
          tx,
        );

        return {
          assignment: {
            id: created.id,
            slotId: created.slotId,
            volunteerId: created.volunteerId,
            roleId: created.roleId,
            status: 'draft' as const,
          },
          conflictReport: undefined,
        };
      });
    }

    // 6. Resolve conflict-validation inputs via repositories
    const volunteerMinistryIds =
      await repositories.volunteers.listMemberMinistryIds(
        authCtx.churchId as ChurchId,
        input.volunteerId as VolunteerId,
      );

    const volunteerQualifiedRoleIds =
      await repositories.roles.listGlobalAndMinistryRoleIds(
        authCtx.churchId as ChurchId,
        volunteerMinistryIds,
      );

    const existingAssignments = await repositories.assignments.listByVolunteer(
      authCtx.churchId as ChurchId,
      input.volunteerId as VolunteerId,
    );

    const existingSlotIds = existingAssignments
      .filter((a) => ['draft', 'pending', 'confirmed'].includes(a.status))
      .map((a) => a.slotId);

    // 7. Phase 1: Hard constraint validation
    try {
      ConflictValidationService.validateHardConstraints({
        churchId: authCtx.churchId,
        volunteerId: input.volunteerId,
        roleId: input.roleId,
        volunteerQualifiedRoleIds,
        ministryId: event.ministryId,
        volunteerMinistryIds,
        eventStartTime: slot.startTime,
        now: new Date(),
        slotId: input.timeSlotId,
        existingSlotIds,
      });
    } catch (error) {
      if (error instanceof HardConstraintError) {
        const messages: Record<string, string> = {
          NOT_QUALIFIED: 'Volunteer is not qualified for the requested role.',
          NOT_IN_MINISTRY:
            'Volunteer does not belong to the requested ministry.',
          EVENT_IN_PAST: 'Event start time is in the past or present.',
          DUPLICATE_ASSIGNMENT: 'Volunteer is already assigned to this slot.',
        };
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: messages[error.reason] ?? error.message,
        });
      }
      throw error;
    }

    // 8. Fetch blockouts and existing assignments for availability check
    const blockouts = await repositories.availability.listByVolunteerInRange(
      authCtx.churchId as ChurchId,
      input.volunteerId as VolunteerId,
      event.startDate,
      event.endDate,
    );

    // Resolve slot times for existing assignments (in-memory join)
    const slotTimeMap = new Map<string, { startTime: Date; endTime: Date }>([
      [input.timeSlotId, slot],
    ]);
    const uniqueSlotIds = [
      ...new Set(
        existingAssignments
          .map((a) => a.slotId)
          .filter((id) => id !== input.timeSlotId),
      ),
    ];
    const assignedSlots = await Promise.all(
      uniqueSlotIds.map((slotId) =>
        repositories.timeSlots
          .getById(authCtx.churchId as ChurchId, slotId)
          .catch(() => null),
      ),
    );
    assignedSlots.forEach((s) => {
      if (s) {
        slotTimeMap.set(s.id, s);
      }
    });

    const volAssignments = existingAssignments.flatMap((a) => {
      const s = slotTimeMap.get(a.slotId);
      if (!s) return [];
      return [
        {
          id: a.id,
          churchId: a.churchId,
          timeRange: { start: s.startTime, end: s.endTime },
          status: a.status as 'pending' | 'confirmed' | 'declined',
        },
      ];
    });

    const volBlockouts = blockouts.map((b) => ({
      id: b.id,
      churchId: b.churchId,
      timeRange: { start: b.startTime, end: b.endTime },
      isAllDay: b.isAllDay,
    }));

    const availabilityResult = AvailabilityEngine.checkAvailability({
      churchId: authCtx.churchId,
      volunteerId: input.volunteerId,
      timeRange: { start: event.startDate, end: event.endDate },
      existingBlockouts: volBlockouts,
      existingAssignments: volAssignments,
    });

    const conflictResult = ConflictValidationService.validate({
      churchId: authCtx.churchId,
      volunteerId: input.volunteerId,
      roleId: input.roleId,
      volunteerQualifiedRoleIds,
      ministryId: event.ministryId,
      volunteerMinistryIds,
      eventStartTime: slot.startTime,
      now: new Date(),
      slotId: input.timeSlotId,
      existingSlotIds,
      availabilityResult,
      serviceCount: 0,
      fairnessThreshold: 0,
    });

    if (conflictResult.hasConflicts) {
      if (!input.allowOverride) {
        return { assignment: undefined, conflictReport: conflictResult };
      }

      if (!input.overrideReason || input.overrideReason.trim() === '') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Override reason is required when overriding conflicts',
        });
      }

      const newId = crypto.randomUUID() as AssignmentId;

      let auditEntity: ReturnType<
        typeof ConflictValidationService.authorizeOverride
      >;
      try {
        auditEntity = ConflictValidationService.authorizeOverride(
          {
            churchId: authCtx.churchId,
            assignmentId: newId,
            caller: {
              userId: ctx.session.user.id as UserId,
              systemRole: authCtx.systemRole,
              ministryId: authCtx.ministryId,
            },
            targetMinistryId: event.ministryId,
            overrideReason: input.overrideReason,
            now: new Date(),
          },
          conflictResult,
        );
      } catch (err) {
        const error = err as Error;
        throw new TRPCError({
          code:
            error.name === 'UnauthorizedOverrideError'
              ? 'UNAUTHORIZED'
              : 'BAD_REQUEST',
          message: error.message,
        });
      }

      return repositories.unitOfWork.run(async (tx) => {
        const created = await repositories.assignments.create(
          authCtx.churchId as ChurchId,
          {
            slotId: input.timeSlotId as TimeSlotId,
            volunteerId: input.volunteerId as VolunteerId,
            roleId: input.roleId as RoleId,
            status: 'pending',
            reason: input.overrideReason,
            assignedBy: ctx.session.user.id as UserId,
          },
          tx,
        );

        await repositories.assignmentAudits.create(
          authCtx.churchId as ChurchId,
          {
            assignmentId: created.id,
            actorId: ctx.session.user.id as UserId,
            action: 'created',
            reason: input.overrideReason,
            overrideConflictTypes: auditEntity.overrideConflictTypes,
          },
          tx,
        );

        return {
          assignment: {
            id: created.id,
            slotId: created.slotId,
            volunteerId: created.volunteerId,
            roleId: created.roleId,
            status: created.status,
          },
          conflictReport: undefined,
        };
      });
    }

    // 9. Happy path — no conflicts
    const statusToCreate =
      event.status === 'published' ? ('pending' as const) : ('draft' as const);

    return repositories.unitOfWork.run(async (tx) => {
      const created = await repositories.assignments.create(
        authCtx.churchId as ChurchId,
        {
          slotId: input.timeSlotId as TimeSlotId,
          volunteerId: input.volunteerId as VolunteerId,
          roleId: input.roleId as RoleId,
          status: statusToCreate,
          assignedBy: ctx.session.user.id as UserId,
        },
        tx,
      );

      await repositories.assignmentAudits.create(
        authCtx.churchId as ChurchId,
        {
          assignmentId: created.id,
          actorId: ctx.session.user.id as UserId,
          action: 'created',
          reason: 'Initial assignment',
        },
        tx,
      );

      return {
        assignment: {
          id: created.id,
          slotId: created.slotId,
          volunteerId: created.volunteerId,
          roleId: created.roleId,
          status: created.status,
        },
        conflictReport: undefined,
      };
    });
  });
