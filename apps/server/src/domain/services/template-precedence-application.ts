import { type CalendarDay, enumerateCalendarDays } from '@church/time';
import type { EventId, EventTimeBlockId } from '../branded-ids';
import { type Recurrence, recurrenceNamesDay } from '../recurrence';
import { timeBlocksOverlap } from '../template-collision';

export interface PrecedenceTemplateBlock {
  id: string;
  startTime: string;
  endTime: string;
}

/** The parts of an EventTemplate that precedence reads. */
export interface PrecedenceTemplate {
  id: string;
  name: string;
  recurrence: Recurrence;
  blocks: PrecedenceTemplateBlock[];
}

/** One stored answer other than "both": `winner` beats `loser`. */
export interface PrecedencePair {
  winner: PrecedenceTemplate;
  loser: PrecedenceTemplate;
}

interface LosingBlockIdsInput {
  day: CalendarDay;
  loser: PrecedenceTemplate;
  pairs: PrecedencePair[];
}

/**
 * The loser's blocks that overlap a winner's block on `day`. Each pair is
 * judged on the winner's Recurrence alone, so a winner that itself loses
 * elsewhere still wins here (precedence is not transitive).
 */
export function losingBlockIds({
  day,
  loser,
  pairs,
}: LosingBlockIdsInput): Set<string> {
  const winners = pairs
    .filter(
      (pair) =>
        pair.loser.id === loser.id &&
        recurrenceNamesDay({ recurrence: pair.winner.recurrence, day }),
    )
    .flatMap((pair) => pair.winner.blocks);
  return new Set(
    loser.blocks
      .filter((block) =>
        winners.some((winnerBlock) =>
          timeBlocksOverlap({ left: block, right: winnerBlock }),
        ),
      )
      .map((block) => block.id),
  );
}

export interface ExistingLoserEventTimeBlock {
  eventId: EventId;
  eventTitle: string;
  eventDate: CalendarDay;
  eventTimeBlockId: EventTimeBlockId;
  label?: string;
  startTime: string;
  endTime: string;
  sourceTemplateTimeBlockId?: string;
}

export interface LosingEventTimeBlock extends ExistingLoserEventTimeBlock {
  loserTemplateName: string;
  winnerTemplateName: string;
}

interface ListLosingEventTimeBlocksInput {
  pairs: PrecedencePair[];
  cycleStart: CalendarDay;
  cycleEnd: CalendarDay;
  existing: ExistingLoserEventTimeBlock[];
}

/** Existing blocks the loser would now skip on a winner day. Ordered by start, then id. */
export function listLosingEventTimeBlocks({
  pairs,
  cycleStart,
  cycleEnd,
  existing,
}: ListLosingEventTimeBlocksInput): LosingEventTimeBlock[] {
  const days = enumerateCalendarDays({ start: cycleStart, end: cycleEnd });
  const found = new Map<string, LosingEventTimeBlock>();
  for (const { winner, loser } of pairs) {
    const winnerDays = new Set(
      days.filter((day) =>
        recurrenceNamesDay({ recurrence: winner.recurrence, day }),
      ),
    );
    for (const block of existing) {
      const loserBlock = loser.blocks.find(
        ({ id }) => id === block.sourceTemplateTimeBlockId,
      );
      const loses =
        loserBlock &&
        winnerDays.has(block.eventDate) &&
        winner.blocks.some((winnerBlock) =>
          timeBlocksOverlap({ left: loserBlock, right: winnerBlock }),
        );
      if (loses && !found.has(block.eventTimeBlockId)) {
        found.set(block.eventTimeBlockId, {
          ...block,
          loserTemplateName: loser.name,
          winnerTemplateName: winner.name,
        });
      }
    }
  }
  return [...found.values()].sort(
    (left, right) =>
      left.startTime.localeCompare(right.startTime) ||
      left.eventTimeBlockId.localeCompare(right.eventTimeBlockId),
  );
}
