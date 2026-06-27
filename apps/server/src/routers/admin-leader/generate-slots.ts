import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { UserId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

interface SlotRange {
  startTime: Date;
  endTime: Date;
  label: string;
}

function computeRanges(
  start: Date,
  end: Date,
  strategy: 'duration' | 'count',
  value: number,
): SlotRange[] {
  const totalMs = end.getTime() - start.getTime();
  if (totalMs <= 0 || value <= 0) return [];

  const ranges: SlotRange[] = [];
  if (strategy === 'duration') {
    const stepMs = value * 60_000;
    let cursor = start.getTime();
    let i = 1;
    while (cursor < end.getTime()) {
      const next = Math.min(cursor + stepMs, end.getTime());
      ranges.push({
        startTime: new Date(cursor),
        endTime: new Date(next),
        label: `Slot ${i}`,
      });
      cursor = next;
      i++;
    }
  } else {
    const stepMs = Math.floor(totalMs / value);
    for (let i = 0; i < value; i++) {
      const s = start.getTime() + i * stepMs;
      const e = i === value - 1 ? end.getTime() : s + stepMs;
      ranges.push({
        startTime: new Date(s),
        endTime: new Date(e),
        label: `Slot ${i + 1}`,
      });
    }
  }
  return ranges;
}

export const generateSlots = protectedProcedure
  .input(
    z.object({
      eventId: z.string(),
      strategy: z.enum(['duration', 'count']),
      value: z.number().int().positive(),
      confirm: z.boolean(),
    }),
  )
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

    const event = await repositories.events
      .getById(callerVol.churchId, input.eventId as EventId)
      .catch(() => null);
    if (!event) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
    }

    const authCtx = await authorizeLeaderOrAdmin(
      ctx.session.user.id,
      event.ministryId,
    );
    const churchId = authCtx.churchId as ChurchId;

    if (event.status === 'published') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot generate slots for a published event',
      });
    }

    const ranges = computeRanges(
      event.startDate,
      event.endDate,
      input.strategy,
      input.value,
    );

    if (ranges.length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Could not generate slots for the given parameters',
      });
    }

    if (!input.confirm) {
      return {
        preview: ranges.map((r) => ({
          startTime: r.startTime.toISOString(),
          endTime: r.endTime.toISOString(),
          label: r.label,
        })),
        slotCount: ranges.length,
      };
    }

    const created = await repositories.timeSlots.bulkCreate(churchId, {
      eventId: input.eventId as EventId,
      slots: ranges.map((r) => ({
        startTime: r.startTime,
        endTime: r.endTime,
        label: r.label,
      })),
    });

    return {
      slots: created.map((s) => ({
        id: s.id,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime.toISOString(),
        label: s.label ?? null,
      })),
      slotCount: created.length,
    };
  });
