import { type CalendarDay, enumerateCalendarDays } from '@church/time';
import { type Recurrence, recurrenceNamesDay } from './recurrence';

/** The parts of an EventTemplate collision detection reads. */
export interface CollisionShape {
  recurrence: Recurrence;
  blocks: { startTime: string; endTime: string }[];
}

/**
 * 2000–2027 holds every (month length, weekday of the 1st) pair, leap
 * Februaries included: the Gregorian calendar repeats every 28 years
 * between 1901 and 2099, so any day two Recurrences can share appears here.
 */
const ALL_MONTH_SHAPES: CalendarDay[] = enumerateCalendarDays({
  start: '2000-01-01' as CalendarDay,
  end: '2027-12-31' as CalendarDay,
});

interface ShareADayInput {
  left: Recurrence;
  right: Recurrence;
}

function canShareADay({ left, right }: ShareADayInput): boolean {
  return ALL_MONTH_SHAPES.some(
    (day) =>
      recurrenceNamesDay({ recurrence: left, day }) &&
      recurrenceNamesDay({ recurrence: right, day }),
  );
}

function minutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Minutes from the day's midnight; an end at or before the start crosses into the next day. */
function resolved(block: CollisionShape['blocks'][number]) {
  const start = minutes(block.startTime);
  const end = minutes(block.endTime);
  return { start, end: end <= start ? end + 24 * 60 : end };
}

interface BlocksOverlapInput {
  left: CollisionShape['blocks'];
  right: CollisionShape['blocks'];
}

/** Some pair overlaps on resolved times; blocks that merely touch do not. */
function someBlocksOverlap({ left, right }: BlocksOverlapInput): boolean {
  return left
    .map(resolved)
    .some((a) =>
      right.map(resolved).some((b) => a.start < b.end && b.start < a.end),
    );
}

export interface TemplatesCollideInput {
  left: CollisionShape;
  right: CollisionShape;
}

/** Two templates collide when their Recurrences can name a common CalendarDay and some of their blocks overlap. */
export function templatesCollide({
  left,
  right,
}: TemplatesCollideInput): boolean {
  return (
    someBlocksOverlap({ left: left.blocks, right: right.blocks }) &&
    canShareADay({ left: left.recurrence, right: right.recurrence })
  );
}
