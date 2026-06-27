import { TRPCError } from '@trpc/server';
import type { UserId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';

/**
 * Lists the ministries the calling user leads (or administers). Used by the
 * scheduling event-list page to scope events and the quick-create modal.
 */
export const listMyMinistries = protectedProcedure.query(async ({ ctx }) => {
  const vol = await repositories.volunteers.findByUserIdGlobally(
    ctx.session.user.id as UserId,
  );
  if (!vol) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Active volunteer profile not found',
    });
  }

  const led = await repositories.volunteers.listLedMinistries(
    vol.churchId,
    vol.id,
  );

  return led.map((l) => ({
    ministryId: l.ministryId as string,
    ministryName: l.ministryName,
  }));
});
