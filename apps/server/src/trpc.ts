import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context';

export const dateSchema = z.iso.datetime().transform((val) => new Date(val));

export const timezoneSchema = z.string().refine(
  (tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch (_e) {
      return false;
    }
  },
  { error: 'Invalid IANA timezone' },
);

export const t = initTRPC.context<Context>().create();

/**
 * Global middleware to enforce UTC-first policy.
 * Ensures that the execution context respects absolute UTC time.
 */
export const utcMiddleware = t.middleware(({ next, ctx }) => {
  return next({
    ctx: {
      ...ctx,
      now: () => new Date(),
    },
  });
});

export const router = t.router;

export const publicProcedure = t.procedure.use(utcMiddleware);

export const protectedProcedure = t.procedure
  .use(utcMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        cause: 'No session',
      });
    }
    return next({
      ctx: {
        ...ctx,
        session: ctx.session,
      },
    });
  });
