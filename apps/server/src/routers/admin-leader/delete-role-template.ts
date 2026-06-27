import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { ChurchId } from '../../domain/entities/church';
import type { RoleTemplateId } from '../../domain/entities/role-template';
import type { UserId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const deleteRoleTemplate = protectedProcedure
  .input(z.object({ templateId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const callerVol = await repositories.volunteers.findByUserIdGlobally(
      ctx.session.user.id as UserId,
    );
    if (!callerVol) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Active volunteer profile not found',
      });
    }

    const template = await repositories.roleTemplates.getById(
      callerVol.churchId,
      input.templateId as RoleTemplateId,
    );

    const authCtx = await authorizeLeaderOrAdmin(
      ctx.session.user.id,
      template.ministryId,
    );

    await repositories.roleTemplates.deleteById(
      authCtx.churchId as ChurchId,
      input.templateId as RoleTemplateId,
    );

    return { success: true as const };
  });
