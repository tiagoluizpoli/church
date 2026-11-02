import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  formatWeekdayOfIndex,
  parseTimeOfDay,
  timeOfDaySpan,
} from '@church/time';
import type {
  HeadcountGridEntry,
  HeadcountGridShift,
  HeadcountGridValues,
} from '@/features/scheduling/components/headcount-grid/headcount-grid';
import { headcountGridKey } from '@/features/scheduling/components/headcount-grid/headcount-grid';
import type {
  ListUsualSetup200BlocksItem,
  ListUsualSetup200BlocksItemEntry,
  SaveUsualSetupBlockBodyHeadcountsItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { pluralMessage } from '@/shared/utils/plural';

export type UsualSetupBlock = ListUsualSetup200BlocksItem;
export type UsualSetupEntry = ListUsualSetup200BlocksItemEntry;
type UsualSetupShiftSplit = UsualSetupEntry['shiftSplit'];

interface ShiftSplitInput {
  shiftSplit: UsualSetupShiftSplit;
}

export function shiftCountOf({ shiftSplit }: ShiftSplitInput): number {
  return shiftSplit.kind === 'equal'
    ? shiftSplit.count
    : shiftSplit.spans.length;
}

interface TimeRangeInput {
  startTime: string;
  endTime: string;
}

/** `09:00–11:00`, marked when the end falls on the next day. */
export function formatTimeRange({ startTime, endTime }: TimeRangeInput) {
  const start = parseTimeOfDay({ value: startTime });
  const end = parseTimeOfDay({ value: endTime });
  const range = `${start}–${end}`;
  const { crossesToNextDay } = timeOfDaySpan({ start, end });
  return crossesToNextDay ? `${range} (${m.usual_setup_next_day()})` : range;
}

interface WeekdayInput {
  weekday: number;
}

export function formatWeekday({ weekday }: WeekdayInput): string {
  return formatWeekdayOfIndex({
    index: weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    locale: getLocale(),
  });
}

interface DescribeEntryInput {
  entry?: UsualSetupEntry;
}

/** Not served, or the Shift count and the people needed across every Shift. */
export function describeUsualSetupEntry({ entry }: DescribeEntryInput): string {
  if (!entry?.serves) return m.usual_setup_not_served();
  const shifts = shiftCountOf(entry);
  const people = entry.headcounts.reduce(
    (total, headcount) => total + headcount.peopleNeeded,
    0,
  );
  const shiftText = pluralMessage({
    count: shifts,
    one: m.usual_setup_shift_count_one,
    other: () => m.usual_setup_shift_count_other({ count: shifts }),
  });
  const peopleText = pluralMessage({
    count: people,
    one: m.usual_setup_people_count_one,
    other: () => m.usual_setup_people_count_other({ count: people }),
  });
  return `${shiftText} · ${peopleText}`;
}

/** The grid's Shifts: the split's chronological Shifts, keyed by their index. */
export function usualSetupShifts({
  shiftSplit,
}: ShiftSplitInput): HeadcountGridShift[] {
  if (shiftSplit.kind === 'manual') {
    return shiftSplit.spans.map((span, index) => ({
      key: String(index),
      label: `${span.label || m.usual_setup_shift_label({ number: index + 1 })} · ${formatTimeRange(span)}`,
    }));
  }
  if (shiftSplit.count === 1) {
    return [{ key: '0', label: m.usual_setup_whole_block_shift() }];
  }
  return Array.from({ length: shiftSplit.count }, (_, index) => ({
    key: String(index),
    label: m.usual_setup_shift_label({ number: index + 1 }),
  }));
}

interface HeadcountsInput {
  headcounts: UsualSetupEntry['headcounts'];
}

export function toGridValues({
  headcounts,
}: HeadcountsInput): HeadcountGridValues {
  return Object.fromEntries(
    headcounts.map(({ shiftIndex, sectorId, roleId, peopleNeeded }) => [
      headcountGridKey({ shiftKey: String(shiftIndex), sectorId, roleId }),
      String(peopleNeeded),
    ]),
  );
}

interface GridEntriesInput {
  entries: HeadcountGridEntry[];
}

/** Editor Shift keys back to the indexed persistence. */
export function toIndexedHeadcounts({
  entries,
}: GridEntriesInput): SaveUsualSetupBlockBodyHeadcountsItem[] {
  return entries.map(({ shiftKey, sectorId, roleId, peopleNeeded }) => ({
    shiftIndex: Number(shiftKey),
    sectorId,
    roleId,
    peopleNeeded,
  }));
}
