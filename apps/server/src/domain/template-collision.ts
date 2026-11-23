import {
  addCalendarDays,
  type CalendarDay,
  enumerateCalendarDays,
} from '@church/time';
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

const MINUTES_PER_DAY = 24 * 60;

interface ShareADayInput {
  left: Recurrence;
  right: Recurrence;
  /** Calendar days `right`'s day falls after `left`'s: 0 the same day, 1 the next. */
  offsetDays: number;
}

function canShareADay({ left, right, offsetDays }: ShareADayInput): boolean {
  return ALL_MONTH_SHAPES.some(
    (day) =>
      recurrenceNamesDay({ recurrence: left, day }) &&
      recurrenceNamesDay({
        recurrence: right,
        day: addCalendarDays({ day, days: offsetDays }),
      }),
  );
}

function minutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Minutes from the day's midnight; an end at or before the start crosses into the next day. */
function resolved(block: CollisionShape['blocks'][number]) {
  const start = minutes(block.startTime);
  const end = minutes(block.endTime);
  return { start, end: end <= start ? end + MINUTES_PER_DAY : end };
}

interface BlocksOverlapInput {
  left: CollisionShape['blocks'];
  right: CollisionShape['blocks'];
}

interface TimeBlocksOverlapInput {
  left: CollisionShape['blocks'][number];
  right: CollisionShape['blocks'][number];
  /** Calendar days `right`'s day falls after `left`'s (default 0, the same day; -1 the day before). */
  offsetDays?: number;
}

/** Two blocks overlap on resolved times, `right` on its own day; touching blocks do not. */
export function timeBlocksOverlap({
  left,
  right,
  offsetDays = 0,
}: TimeBlocksOverlapInput): boolean {
  const a = resolved(left);
  const b = resolved(right);
  const shift = offsetDays * MINUTES_PER_DAY;
  return a.start < b.end + shift && b.start + shift < a.end;
}

interface ShiftedBlocksOverlapInput extends BlocksOverlapInput {
  /** Minutes `right`'s day starts after `left`'s. */
  shift: number;
}

/** Some pair overlaps on resolved times; blocks that merely touch do not. */
function someBlocksOverlap({
  left,
  right,
  shift,
}: ShiftedBlocksOverlapInput): boolean {
  return left
    .map(resolved)
    .some((a) =>
      right
        .map(resolved)
        .some((b) => a.start < b.end + shift && b.start + shift < a.end),
    );
}

interface CollideOnDaysInput extends TemplatesCollideInput {
  offsetDays: number;
}

/** `left` on some day and `right` `offsetDays` later have overlapping blocks. */
function collideOnDays({
  left,
  right,
  offsetDays,
}: CollideOnDaysInput): boolean {
  return (
    someBlocksOverlap({
      left: left.blocks,
      right: right.blocks,
      shift: offsetDays * MINUTES_PER_DAY,
    }) &&
    canShareADay({
      left: left.recurrence,
      right: right.recurrence,
      offsetDays,
    })
  );
}

export interface TemplatesCollideInput {
  left: CollisionShape;
  right: CollisionShape;
}

/**
 * Two templates collide when some of their blocks overlap on resolved times:
 * on a CalendarDay both Recurrences name, or, for a block crossing
 * midnight, with the other template's blocks of the next day.
 */
export function templatesCollide({
  left,
  right,
}: TemplatesCollideInput): boolean {
  return (
    collideOnDays({ left, right, offsetDays: 0 }) ||
    collideOnDays({ left, right, offsetDays: 1 }) ||
    collideOnDays({ left: right, right: left, offsetDays: 1 })
  );
}
