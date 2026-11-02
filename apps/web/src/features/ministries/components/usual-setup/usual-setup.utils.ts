import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatWeekdayOfIndex } from '@church/time';
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

export { formatTimeRange } from '@/features/scheduling/components/shift-split-editor/shift-split.utils';

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

interface HeadcountsInput {
  headcounts: UsualSetupEntry['headcounts'];
  /** The split's Shifts in chronological order; position is the saved index. */
  shifts: HeadcountGridShift[];
}

export function toGridValues({
  headcounts,
  shifts,
}: HeadcountsInput): HeadcountGridValues {
  return Object.fromEntries(
    headcounts.flatMap(({ shiftIndex, sectorId, roleId, peopleNeeded }) => {
      const shift = shifts[shiftIndex];
      return shift
        ? [
            [
              headcountGridKey({ shiftKey: shift.key, sectorId, roleId }),
              String(peopleNeeded),
            ],
          ]
        : [];
    }),
  );
}

interface GridEntriesInput {
  entries: HeadcountGridEntry[];
  shifts: HeadcountGridShift[];
}

/** Editor Shift keys back to the indexed persistence. */
export function toIndexedHeadcounts({
  entries,
  shifts,
}: GridEntriesInput): SaveUsualSetupBlockBodyHeadcountsItem[] {
  return entries.map(({ shiftKey, sectorId, roleId, peopleNeeded }) => ({
    shiftIndex: shifts.findIndex((shift) => shift.key === shiftKey),
    sectorId,
    roleId,
    peopleNeeded,
  }));
}
