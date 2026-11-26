import {
  churchAddress,
  cycle,
  event,
  eventTimeBlock,
  eventTimeBlockMove,
} from '@church/db';
import { fromDate, toDate } from '@church/time';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type {
  ListPublicEventsInput,
  PublicEventRepository,
} from '../../domain/contracts/infrastructure/public-event.repository';
import type {
  PublicEvent,
  PublicEventPage,
} from '../../domain/entities/public-event';
import {
  type EventTimeBlockMove,
  eventTimeBlockMovePath,
} from '../../domain/services/event-time-block-move-path';
import { withChurchIsolation } from './helpers';
import { resolvedPlace } from './time-block-place';
import type { AnyDrizzleDb } from './types';

interface DrizzlePublicEventRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzlePublicEventRepository implements PublicEventRepository {
  private readonly db: AnyDrizzleDb;

  constructor({ db }: DrizzlePublicEventRepositoryInput) {
    this.db = db;
  }

  async listPublicEvents({
    churchId,
    now,
    limit,
    after,
  }: ListPublicEventsInput): Promise<PublicEventPage> {
    const nowDate = toDate({ instant: now });
    const firstStart = sql`min(${eventTimeBlock.startTime})`.mapWith(
      eventTimeBlock.startTime,
    );
    const allBlocksCancelled = sql`bool_and(${eventTimeBlock.status} = 'cancelled')`;
    const cancelled = sql`(${event.status} = 'cancelled' or ${allBlocksCancelled})`;
    // A cancelled item stays until its last start passes, others until the last end.
    const stillShown = sql`case when ${cancelled}
      then max(${eventTimeBlock.startTime}) > ${nowDate}
      else max(${eventTimeBlock.endTime}) > ${nowDate} end`;
    const afterCursor = after
      ? sql` and (${firstStart}, ${event.id}) > (${toDate({ instant: after.start })}, ${after.eventId}::uuid)`
      : sql``;

    const heads = await this.db
      .select({
        eventId: event.id,
        title: event.title,
        eventStatus: event.status,
        start: firstStart,
        allCancelled: allBlocksCancelled,
      })
      .from(eventTimeBlock)
      .innerJoin(event, eq(eventTimeBlock.eventId, event.id))
      .innerJoin(cycle, eq(event.cycleId, cycle.id))
      .where(
        and(
          withChurchIsolation({ table: event, churchId }),
          eq(cycle.hasBeenSent, true),
          // A draft Event is never shown publicly.
          ne(event.status, 'draft'),
          eq(eventTimeBlock.isPublic, true),
        ),
      )
      .groupBy(event.id, event.title, event.status)
      .having(sql`${stillShown}${afterCursor}`)
      .orderBy(asc(firstStart), asc(event.id))
      .limit(limit + 1);

    const page = heads.slice(0, limit);
    const eventIds = page.map((head) => head.eventId);
    if (eventIds.length === 0) return { items: [], nextCursor: null };

    const blocks = await this.db
      .select({
        id: eventTimeBlock.id,
        eventId: eventTimeBlock.eventId,
        label: eventTimeBlock.label,
        start: eventTimeBlock.startTime,
        end: eventTimeBlock.endTime,
        place: resolvedPlace(eventTimeBlock.place),
        status: eventTimeBlock.status,
      })
      .from(eventTimeBlock)
      .leftJoin(
        churchAddress,
        eq(churchAddress.id, eventTimeBlock.placeAddressId),
      )
      .where(
        and(
          withChurchIsolation({ table: eventTimeBlock, churchId }),
          inArray(eventTimeBlock.eventId, eventIds),
          eq(eventTimeBlock.isPublic, true),
        ),
      )
      .orderBy(asc(eventTimeBlock.startTime), asc(eventTimeBlock.id));

    const moveRows = await this.db
      .select()
      .from(eventTimeBlockMove)
      .where(
        and(
          withChurchIsolation({ table: eventTimeBlockMove, churchId }),
          inArray(
            eventTimeBlockMove.eventTimeBlockId,
            blocks.map((block) => block.id),
          ),
        ),
      )
      .orderBy(asc(eventTimeBlockMove.movedAt), asc(eventTimeBlockMove.id));

    const movesByBlock = new Map<string, EventTimeBlockMove[]>();
    for (const row of moveRows) {
      const moves = movesByBlock.get(row.eventTimeBlockId) ?? [];
      moves.push({
        previousStart: fromDate({ date: row.previousStart }),
        previousEnd: fromDate({ date: row.previousEnd }),
        newStart: fromDate({ date: row.newStart }),
        newEnd: fromDate({ date: row.newEnd }),
      });
      movesByBlock.set(row.eventTimeBlockId, moves);
    }

    const items: PublicEvent[] = page.map((head) => {
      const eventCancelled =
        head.eventStatus === 'cancelled' || head.allCancelled === true;
      return {
        eventId: head.eventId,
        title: head.title,
        cancelled: eventCancelled,
        start: fromDate({ date: head.start }),
        blocks: blocks
          .filter((block) => block.eventId === head.eventId)
          .map((block) => {
            const start = fromDate({ date: block.start });
            const end = fromDate({ date: block.end });
            return {
              label: block.label,
              start,
              end,
              place: block.place,
              cancelled:
                head.eventStatus === 'cancelled' ||
                block.status === 'cancelled',
              movePath: eventTimeBlockMovePath({
                currentStart: start,
                currentEnd: end,
                moves: movesByBlock.get(block.id) ?? [],
              }),
            };
          }),
      };
    });

    const last = items.at(-1);
    return {
      items,
      nextCursor:
        heads.length > limit && last
          ? { start: last.start, eventId: last.eventId }
          : null,
    };
  }
}
