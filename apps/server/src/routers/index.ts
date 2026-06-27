import { protectedProcedure, publicProcedure, router } from '../trpc';
import { adminLeaderRouter } from './admin-leader';
import { todoRouter } from './todo';
import { volunteerRouter } from './volunteer';

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return 'OK';
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: 'This is private',
      user: ctx.session.user,
    };
  }),
  todo: todoRouter,
  adminLeader: adminLeaderRouter,
  volunteer: volunteerRouter,
});
export type AppRouter = typeof appRouter;
