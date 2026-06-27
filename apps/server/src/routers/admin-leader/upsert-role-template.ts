import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { ChurchId } from '../../domain/entities/church';
import type { MinistryId } from '../../domain/entities/ministry';
import type { RoleId } from '../../domain/entities/role';
import type { RoleTemplateId } from '../../domain/entities/role-template';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const upsertRoleTemplate = protectedProcedure
  .input(
    z.object({
      templateId: z.string().optional(),
      ministryId: z.string(),
      name: z.string().min(1).max(100),
      items: z
        .array(
          z.object({
            roleId: z.string(),
            requiredCount: z.number().int().min(1),
          }),
        )
        .min(1),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const authCtx = await authorizeLeaderOrAdmin(
      ctx.session.user.id,
      input.ministryId,
    );
    const churchId = authCtx.churchId as ChurchId;

    // Validate all roleIds are global or belong to this ministry.
    const validRoleIds = new Set(
      await repositories.roles.listGlobalAndMinistryRoleIds(churchId, [
        input.ministryId as MinistryId,
      ]),
    );
    for (const item of input.items) {
      if (!validRoleIds.has(item.roleId as RoleId)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Role ${item.roleId} is not valid for this ministry`,
        });
      }
    }

    const items = input.items.map((i) => ({
      roleId: i.roleId as RoleId,
      requiredCount: i.requiredCount,
    }));

    const template = input.templateId
      ? await repositories.roleTemplates.update(
          churchId,
          input.templateId as RoleTemplateId,
          { name: input.name, items },
        )
      : await repositories.roleTemplates.create(churchId, {
          ministryId: input.ministryId as MinistryId,
          name: input.name,
          items,
        });

    return {
      id: template.id,
      name: template.name,
      items: template.items.map((i) => ({
        roleId: i.roleId as string,
        requiredCount: i.requiredCount,
      })),
    };
  });
