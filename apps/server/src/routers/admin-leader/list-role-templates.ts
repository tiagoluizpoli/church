import { z } from 'zod';
import type { ChurchId } from '../../domain/entities/church';
import type { MinistryId } from '../../domain/entities/ministry';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const listRoleTemplates = protectedProcedure
  .input(z.object({ ministryId: z.string() }))
  .query(async ({ input, ctx }) => {
    const authCtx = await authorizeLeaderOrAdmin(
      ctx.session.user.id,
      input.ministryId,
    );
    const churchId = authCtx.churchId as ChurchId;

    const [templates, roles] = await Promise.all([
      repositories.roleTemplates.listByMinistry(
        churchId,
        input.ministryId as MinistryId,
      ),
      repositories.roles.listByMinistry(
        churchId,
        input.ministryId as MinistryId,
      ),
    ]);
    const roleName = new Map(roles.map((r) => [r.id as string, r.name]));

    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      items: t.items.map((item) => ({
        roleId: item.roleId as string,
        roleName: roleName.get(item.roleId as string) ?? '',
        requiredCount: item.requiredCount,
      })),
    }));
  });
