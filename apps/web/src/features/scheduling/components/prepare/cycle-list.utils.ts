import { compareCalendarDays, parseCalendarDay } from '@church/time';
import { toCalendarDateString } from '@/features/scheduling/components/participation-prepare.utils';
import type {
  ListScheduleSummaries200CyclesItem,
  ListScheduleSummaries200CyclesItemStatus,
} from '@/infrastructure/api/churchAPI.schemas';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';

export type CyclePrepareStatus = ListScheduleSummaries200CyclesItemStatus;

export interface PrepareCycleSummary {
  id: string;
  name: string;
  window: string;
  startDate: string;
  endDate: string;
  eventCount: number;
  eventTimeBlockCount: number;
  status: CyclePrepareStatus;
  isPartOf: boolean;
  availabilityRequestedForAll: boolean;
  availabilityRequestedForAny: boolean;
}

export type MinistryInvolvementFilter = 'all' | 'part_of' | 'not_part_of';

export type CycleDateRangeMode = 'starts' | 'ends' | 'within';

/** Mirrors `TimeWindowFilter` (the prepare workspace's time-of-day
 * filter): `'starts'` keeps cycles whose start date falls in
 * `[start, end]`, `'ends'` keeps cycles whose end date falls in the range,
 * `'within'` keeps cycles whose entire span (start AND end) falls inside
 * it. Either bound may be omitted to leave that side open-ended; both
 * omitted (the default) applies no date filtering at all. */
export interface CycleDateRangeFilter {
  mode: CycleDateRangeMode;
  start?: string;
  end?: string;
}

export interface CycleFilterSpec {
  dateRange?: CycleDateRangeFilter;
  involvement?: MinistryInvolvementFilter;
  status?: CyclePrepareStatus | 'all';
}

export function isCycleDateRangeFilterEmpty(
  filter: CycleDateRangeFilter,
): boolean {
  return !filter.start && !filter.end;
}

interface IsDateWithinRangeInput {
  date: string;
  filter: CycleDateRangeFilter;
}

function isDateWithinRange({ date, filter }: IsDateWithinRangeInput): boolean {
  if (filter.start && date < filter.start) return false;
  if (filter.end && date > filter.end) return false;
  return true;
}

/** Iteration 3 (research.md R15/R16): sole data source for the cycle-list
 * screen — sorts the batch endpoint's rows chronologically by start date
 * (not alphabetically by formatted label, per the earlier T060a fix) and
 * derives the display-ready window string. Replaces the old client-side
 * join across `listEvents`/`listCycles` outright (post-analyze
 * findings I1/I2) — every sent cycle church-wide is included here,
 * including ones this ministry has zero events in (`isPartOf: false`). */
export interface BuildScheduleSummariesInput {
  cycles: ListScheduleSummaries200CyclesItem[];
}

export function buildScheduleSummaries({
  cycles,
}: BuildScheduleSummariesInput): PrepareCycleSummary[] {
  return [...cycles]
    .sort((left, right) =>
      compareCalendarDays({
        left: parseCalendarDay({ value: toCalendarDateString(left.startDate) }),
        right: parseCalendarDay({
          value: toCalendarDateString(right.startDate),
        }),
      }),
    )
    .map((cycle) => ({
      id: cycle.cycleId,
      name: cycle.name,
      window: `${formatCalendarDateOnly({ value: cycle.startDate })} - ${formatCalendarDateOnly({ value: cycle.endDate })}`,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      eventCount: cycle.eventCount,
      eventTimeBlockCount: cycle.eventTimeBlockCount,
      status: cycle.status,
      isPartOf: cycle.isPartOf,
      availabilityRequestedForAll: cycle.availabilityRequestedForAll,
      availabilityRequestedForAny: cycle.availabilityRequestedForAny,
    }));
}

/** FR-033: date-range/involvement/status filters combine with AND
 * semantics. Date range is mode-driven, mirroring the prepare
 * workspace's `TimeWindowFilter` (`starts`/`ends`/`within`) rather than a
 * fixed overlap rule — a leader can ask for "cycles starting in this
 * range," "ending in this range," or "entirely within this range." All
 * filters operate on already-fetched data — zero network requests
 * (FR-032's batched endpoint already returned everything up front). */
export interface FilterCycleSummariesInput {
  cycles: PrepareCycleSummary[];
  filter: CycleFilterSpec;
}

export function filterCycleSummaries({
  cycles,
  filter,
}: FilterCycleSummariesInput): PrepareCycleSummary[] {
  return cycles.filter((cycle) => {
    if (filter.dateRange && !isCycleDateRangeFilterEmpty(filter.dateRange)) {
      const { mode } = filter.dateRange;
      if (mode === 'starts') {
        if (
          !isDateWithinRange({
            date: cycle.startDate,
            filter: filter.dateRange,
          })
        ) {
          return false;
        }
      } else if (mode === 'ends') {
        if (
          !isDateWithinRange({ date: cycle.endDate, filter: filter.dateRange })
        ) {
          return false;
        }
      } else if (
        !isDateWithinRange({
          date: cycle.startDate,
          filter: filter.dateRange,
        }) ||
        !isDateWithinRange({ date: cycle.endDate, filter: filter.dateRange })
      ) {
        return false;
      }
    }
    if (filter.involvement === 'part_of' && !cycle.isPartOf) {
      return false;
    }
    if (filter.involvement === 'not_part_of' && cycle.isPartOf) {
      return false;
    }
    if (
      filter.status &&
      filter.status !== 'all' &&
      cycle.status !== filter.status
    ) {
      return false;
    }
    return true;
  });
}

const CYCLE_PREPARE_STATUS_LABELS: Record<CyclePrepareStatus, string> = {
  // biome-ignore lint/style/useNamingConvention: matches the API's status enum value verbatim
  not_started: 'Not started',
  // biome-ignore lint/style/useNamingConvention: matches the API's status enum value verbatim
  in_progress: 'In progress',
  published: 'Published',
};

export interface CyclePrepareStatusLabelInput {
  status: CyclePrepareStatus;
}

/** Humanizes FR-030's leader-facing prepare-progress status (research.md
 * R15/R16) — never `Cycle.state` (the P0 mistake this iteration
 * corrects, see research.md R15). */
export function cyclePrepareStatusLabel({
  status,
}: CyclePrepareStatusLabelInput): string {
  return CYCLE_PREPARE_STATUS_LABELS[status];
}

export interface CyclePrepareStatusBadgeVariantInput {
  status: CyclePrepareStatus;
}

/** DESIGN.md's "One Voice Rule" (primary reserved for the rare, meaningful
 * signal): `published` is the goal state a leader is working toward, so it
 * gets the sole `default` (solid) badge; `not_started` is muted (`outline`,
 * least attention-worthy); `in_progress` — the common, wide middle bucket
 * per R15 — is `secondary`, matching how `participationStateLabel`'s badge
 * already avoids `default` for anything that isn't rare/terminal. */
export function cyclePrepareStatusBadgeVariant({
  status,
}: CyclePrepareStatusBadgeVariantInput): 'default' | 'outline' | 'secondary' {
  if (status === 'published') return 'default';
  if (status === 'not_started') return 'outline';
  return 'secondary';
}
