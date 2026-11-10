import { instantSchema } from '@church/time';
import { z } from 'zod';

// The note's maximum length is enforced by the domain (400 naming the limit),
// not here: a schema violation would answer 422.
export const raiseSwapRequestBodySchema = z.object({
  note: z.string().optional(),
});

export const swapRequestResponseSchema = z.object({
  id: z.string(),
  assignmentId: z.string(),
  status: z.enum(['open', 'covered', 'kept', 'withdrawn', 'expired']),
  note: z.string().optional(),
  raisedAt: instantSchema,
});

export const leaderSwapRequestsQuerySchema = z.object({
  cycleId: z.uuid().optional(),
});

export const leaderSwapRequestsResponseSchema = z.object({
  schedules: z.array(
    z.object({
      cycleId: z.string(),
      openCount: z.number().int().nonnegative(),
      requests: z.array(
        z.object({
          id: z.string(),
          assignmentId: z.string(),
          volunteerName: z.string(),
          eventTitle: z.string(),
          roleName: z.string(),
          sectorName: z.string(),
          startsAt: instantSchema,
          endsAt: instantSchema,
          note: z.string().optional(),
          raisedAt: instantSchema,
          status: z.enum(['open', 'expired']),
        }),
      ),
    }),
  ),
});
