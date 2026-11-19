import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  addCalendarDays,
  type CalendarDay,
  formatCalendarDay,
  formatDayAndMonth,
  formatWeekdayShort,
  now,
  today,
  weekdayIndex,
} from '@church/time';
import { Link } from '@tanstack/react-router';
import { ChevronRightIcon, TriangleAlertIcon } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { blockTitle, coverageTone } from '../participation-prepare.utils';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  GROUP_INDENT,
  type GroupedGroupRow,
  GroupRowLabel,
  groupedRowProps,
  groupLeaves,
  leafIndentStep,
  MOBILE_RAIL,
  MobileGroupHeading,
  useGroupCollapse,
} from '@/components/ui/data-table-groups';
import { useMediaQuery } from '@/hooks/use-media-query';
import type {
  GetCycleParticipation200EventsItem,
  GetCycleParticipation200EventsItemEventTimeBlocksItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/shared/hooks/use-timezone';
import {
  dayOf,
  formatInstantOf,
  formatTimeOf,
} from '@/shared/utils/church-time';
import { pluralMessage } from '@/shared/utils/plural';

export interface PrepareEventTimeBlockListProps {
  events: GetCycleParticipation200EventsItem[];
  ministryId: string;
  cycleId: string;
  selectedBlockId?: string;
  /** A block is open beside the list: keep the columns that decide, one status each. */
  compact?: boolean;
  stage?: string;
  /** Asked volunteers who have not answered yet (cycle-wide); only tones
   * coverage, never shown per row. */
  pendingAnswers?: number;
  /** The deadline passed or the Schedule is past asking. */
  answersClosed?: boolean;
  /** No filter is on: fold weeks that have fully elapsed on first render.
   * False (filtering) shows every group unfolded, so every match is visible. */
  foldElapsedWeeks?: boolean;
  /** The cycle's first and last day: a week label never runs past them. */
  cycleStart?: CalendarDay;
  cycleEnd?: CalendarDay;
}

interface BlockLeaf {
  event: GetCycleParticipation200EventsItem;
  block: GetCycleParticipation200EventsItemEventTimeBlocksItem;
  /** Church day of the start, and the Sunday that opens its week. */
  day: CalendarDay;
  week: CalendarDay;
}

/** Week, then day, then time block. */
const WEEK_DEPTH = 0;
const DAYS_IN_WEEK = 7;
const LEVELS = [(leaf: BlockLeaf) => leaf.week, (leaf: BlockLeaf) => leaf.day];
const leafKey = (leaf: BlockLeaf) => leaf.block.eventTimeBlock.id;

interface BlockSummaryInput {
  block: GetCycleParticipation200EventsItemEventTimeBlocksItem;
}

function blockSummary({ block }: BlockSummaryInput): string {
  const shiftCount = block.shifts.length;
  const peopleCount = block.shifts.reduce(
    (total, shift) =>
      total +
      shift.requirements.reduce(
        (sum, requirement) => sum + requirement.peopleNeeded,
        0,
      ),
    0,
  );
  const shifts = pluralMessage({
    count: shiftCount,
    one: () => m.usual_setup_shift_count_one(),
    other: () => m.usual_setup_shift_count_other({ count: shiftCount }),
  });
  const people = pluralMessage({
    count: peopleCount,
    one: () => m.prepare_people_count_one(),
    other: () => m.prepare_people_count_other({ count: peopleCount }),
  });
  return m.prepare_row_summary({ shifts, people });
}

function weekEnd(week: CalendarDay): CalendarDay {
  return addCalendarDays({ day: week, days: DAYS_IN_WEEK - 1 });
}

/** Memoised: the route re-renders on every filter and roster change, the list
 * only when its own inputs do. */
export const PrepareEventTimeBlockList = memo(
  function PrepareEventTimeBlockList({
    events,
    ministryId,
    cycleId,
    selectedBlockId,
    compact = false,
    stage,
    pendingAnswers = 0,
    answersClosed = stage === 'assigning',
    foldElapsedWeeks = false,
    cycleStart,
    cycleEnd,
  }: PrepareEventTimeBlockListProps) {
    const { churchTimezone } = useTimezone();
    const churchDay = today({ instant: now(), timeZone: churchTimezone });
    const isMobile = useMediaQuery('(max-width: 767px)');
    // The read is already in time order, so days and weeks arrive contiguous.
    const leaves = useMemo(
      () =>
        events.flatMap((event) =>
          event.eventTimeBlocks.map((block): BlockLeaf => {
            const day = dayOf({
              value: block.eventTimeBlock.startTime,
              timeZone: churchTimezone,
            });
            return {
              event,
              block,
              day,
              week: addCalendarDays({ day, days: -weekdayIndex({ day }) }),
            };
          }),
        ),
      [events, churchTimezone],
    );
    const rows = useMemo(
      () => groupLeaves({ leaves, levels: LEVELS, leafKey }),
      [leaves],
    );
    // Browsing folds the weeks already gone; a filtered list starts unfolded, so
    // every match it counts is on screen, and clearing it restores the browse folds.
    const browsing = useGroupCollapse({
      defaultCollapsed: foldElapsedWeeks
        ? leaves
            .map((leaf) => leaf.week)
            .filter((week) => weekEnd(week) < churchDay)
        : [],
    });
    const filtering = useGroupCollapse();
    const { setCollapsed, toggle, visible } = foldElapsedWeeks
      ? browsing
      : filtering;
    // Each new filter result opens unfolded: adjusted while rendering, not in an
    // effect, so a new result costs no extra commit.
    const [shown, setShown] = useState({ events, foldElapsedWeeks });
    if (
      shown.events !== events ||
      shown.foldElapsedWeeks !== foldElapsedWeeks
    ) {
      setShown({ events, foldElapsedWeeks });
      if (!foldElapsedWeeks) filtering.setCollapsed(new Set());
    }
    // Fresh rows on every render of this (memoised) list: cells also follow selection and stage.
    const items = visible({ rows });
    const selectedPathKey = rows
      .find(
        (row) =>
          row.kind === 'leaf' &&
          row.leaf.block.eventTimeBlock.id === selectedBlockId,
      )
      ?.path.join('|');
    useEffect(() => {
      // The open block's week and day never stay folded (Anterior/Próximo can reach a folded one).
      if (!selectedPathKey) return;
      const keys = selectedPathKey.split('|');
      setCollapsed((current) =>
        keys.some((key) => current.has(key))
          ? new Set([...current].filter((key) => !keys.includes(key)))
          : current,
      );
    }, [selectedPathKey, setCollapsed]);

    const showsCoverage = stage === 'asking' || stage === 'assigning';
    function coverage({ block }: Pick<BlockLeaf, 'block'>) {
      const { available, needed } = block.answerCoverage;
      if (!showsCoverage || needed === null) return null;
      const tone = coverageTone({
        available,
        needed,
        pending: pendingAnswers,
        answersClosed,
      });
      return (
        <Badge
          variant="outline"
          className={cn(
            'tabular-nums',
            tone === 'neutral' && 'text-muted-foreground',
            tone === 'short' &&
              'border-destructive/40 bg-destructive/8 text-destructive',
            tone === 'low' &&
              'border-amber-600/40 bg-amber-500/8 text-amber-800 dark:text-amber-200',
          )}
        >
          {tone === 'neutral' ? null : <TriangleAlertIcon aria-hidden="true" />}
          {available === 1
            ? m.prepare_answer_coverage_one({ needed })
            : m.prepare_answer_coverage({ available, needed })}
        </Badge>
      );
    }
    function notServed() {
      return (
        <Badge variant="secondary" className="text-muted-foreground">
          {m.prepare_not_served()}
        </Badge>
      );
    }
    function needsHeadcount() {
      return (
        <Badge
          variant="outline"
          className="border-amber-600/40 bg-amber-500/8 text-amber-700 dark:text-amber-300"
        >
          {m.prepare_needs_headcount()}
        </Badge>
      );
    }
    function hasStatus({ block, event }: BlockLeaf) {
      return Boolean(
        (showsCoverage && block.answerCoverage.needed !== null) ||
          !event.generatedFromTemplate ||
          !block.included ||
          block.shifts.some((shift) => shift.flagged) ||
          block.shiftsChangedAfterAsk,
      );
    }
    function title({ event, block }: BlockLeaf) {
      return blockTitle({
        eventTitle: event.event.title,
        label: block.eventTimeBlock.label,
        startTime: formatTimeOf({
          value: block.eventTimeBlock.startTime,
          timeZone: churchTimezone,
        }),
      });
    }
    /** `10:30 – 12:30`; the day comes from its group, so only a block that
     * crosses midnight names its end date. */
    function timeRange({ block }: Pick<BlockLeaf, 'block'>) {
      const { startTime, endTime } = block.eventTimeBlock;
      const sameDay =
        dayOf({ value: startTime, timeZone: churchTimezone }) ===
        dayOf({ value: endTime, timeZone: churchTimezone });
      const end = sameDay
        ? formatTimeOf({ value: endTime, timeZone: churchTimezone })
        : formatInstantOf({ value: endTime, timeZone: churchTimezone });
      return `${formatTimeOf({ value: startTime, timeZone: churchTimezone })} – ${end}`;
    }
    function statusBadges(leaf: BlockLeaf) {
      const { block, event } = leaf;
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          {coverage({ block })}
          {!event.generatedFromTemplate ? (
            <Badge variant="outline">{m.prepare_one_off()}</Badge>
          ) : null}
          {!block.included
            ? notServed()
            : block.shifts.some((shift) => shift.flagged)
              ? needsHeadcount()
              : null}
          {block.shiftsChangedAfterAsk ? (
            <Badge variant="outline">{m.prepare_answers_coverage_note()}</Badge>
          ) : null}
        </span>
      );
    }
    /** The one token a narrowed row has room for: what most needs a decision. */
    function primaryStatus({ block }: BlockLeaf) {
      if (!block.included) return notServed();
      if (block.shifts.some((shift) => shift.flagged)) return needsHeadcount();
      return coverage({ block });
    }
    function weekLabel(week: CalendarDay) {
      const end = weekEnd(week);
      return m.cycle_review_week({
        start: formatCalendarDay({
          day: cycleStart && week < cycleStart ? cycleStart : week,
        }),
        end: formatCalendarDay({
          day: cycleEnd && end > cycleEnd ? cycleEnd : end,
        }),
      });
    }
    function dayLabel(day: CalendarDay) {
      const date = `${formatWeekdayShort({ day, locale: getLocale() })} ${formatDayAndMonth({ day })}`;
      return day === churchDay ? `${m.my_schedule_today()} · ${date}` : date;
    }
    function groupLabel(group: GroupedGroupRow<BlockLeaf>) {
      return group.depth === WEEK_DEPTH
        ? weekLabel(group.leaf.week)
        : dayLabel(group.leaf.day);
    }
    function isPast({ day }: BlockLeaf) {
      return day < churchDay;
    }
    /** The row's one way in, as on every other list: an Abrir action at its end.
     * It carries the row's id, so closing a block returns focus here. */
    function openAction(leaf: BlockLeaf) {
      const { id } = leaf.block.eventTimeBlock;
      return (
        <Link
          id={isMobile ? undefined : `event-time-block-${id}`}
          data-testid={
            isMobile ? undefined : `prepare-event-time-block-row-${id}`
          }
          to="/schedules/$ministryId/$cycleId/slots/$timeSlotId"
          params={{ ministryId, cycleId, timeSlotId: id }}
          search={(previous) => previous}
          aria-current={id === selectedBlockId ? 'page' : undefined}
          aria-label={m.ministries_open_label({ name: title(leaf) })}
          className={buttonVariants({ variant: 'outline', size: 'xs' })}
        >
          {m.ministries_open()}
          {/* Named by aria-label; the hidden title keeps the row findable by its text. */}
          <span className="sr-only"> {title(leaf)}</span>
        </Link>
      );
    }
    /** The phone card: the whole card opens the block. */
    function mobileCard(leaf: BlockLeaf) {
      const { block } = leaf;
      const { id } = block.eventTimeBlock;
      const selected = id === selectedBlockId;
      return (
        <Link
          // On a phone the card is the row; on desktop the table's Abrir is.
          id={isMobile ? `event-time-block-${id}` : undefined}
          data-testid={
            isMobile ? `prepare-event-time-block-row-${id}` : undefined
          }
          to="/schedules/$ministryId/$cycleId/slots/$timeSlotId"
          params={{ ministryId, cycleId, timeSlotId: id }}
          search={(previous) => previous}
          aria-current={selected ? 'page' : undefined}
          className={cn(
            'surface-subtle radius-control flex items-center gap-3 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selected && 'bg-accent/60',
            isPast(leaf) && 'text-muted-foreground',
          )}
        >
          <span className="min-w-0 flex-1 space-y-1">
            <span
              className={cn(
                'block break-words',
                selected ? 'font-bold' : 'font-medium',
              )}
            >
              <span className="tabular-nums">{timeRange(leaf)}</span>{' '}
              <span>{title(leaf)}</span>
            </span>
            {/* Coverage replaces the summary; an unserved block says so in its badge. */}
            {(showsCoverage && block.answerCoverage.needed !== null) ||
            !block.included ? null : (
              <span className="block text-muted-foreground text-xs">
                {blockSummary({ block })}
              </span>
            )}
            {hasStatus(leaf) ? statusBadges(leaf) : null}
          </span>
          <ChevronRightIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </Link>
      );
    }
    const showStatus = leaves.some(hasStatus);
    const columns: DataTableColumn[] = [
      { id: 'time', name: m.prepare_table_time() },
      { id: 'event', name: m.prepare_table_event(), isRowHeader: true },
      // Beside an open block: time, event and Abrir; one status rides with the title.
      ...(compact
        ? []
        : [
            { id: 'people', name: m.prepare_table_people() },
            ...(showStatus
              ? [{ id: 'status', name: m.prepare_table_status() }]
              : []),
          ]),
      { id: 'actions', name: m.people_column_actions() },
    ];
    return (
      <Card className="surface-panel">
        <CardContent>
          <DataTable
            aria-label={m.prepare_table_event()}
            items={items}
            columns={columns}
            // Cells read these besides their row; react-aria re-renders rows only when they change.
            dependencies={[
              selectedBlockId,
              stage,
              pendingAnswers,
              answersClosed,
              churchDay,
              isMobile,
              toggle,
            ]}
            rowId={({ item }) =>
              item.kind === 'group'
                ? `prepare-${item.depth === WEEK_DEPTH ? 'week' : 'day'}-${item.key}`
                : `prepare-table-${item.leaf.block.eventTimeBlock.id}`
            }
            {...groupedRowProps<BlockLeaf>({
              nestLeaves: true,
              isSelected: ({ leaf }) =>
                leaf.block.eventTimeBlock.id === selectedBlockId,
              leafClassName: ({ leaf }) =>
                isPast(leaf) ? 'text-muted-foreground' : undefined,
            })}
            renderCell={({ item, column }) => {
              if (item.kind === 'group')
                return (
                  <GroupRowLabel
                    item={item}
                    label={groupLabel(item)}
                    name={groupLabel(item)}
                    onToggle={toggle}
                  />
                );
              const { leaf } = item;
              const { block } = leaf;
              const selected = block.eventTimeBlock.id === selectedBlockId;
              if (column.id === 'time')
                return (
                  <span
                    className={cn(
                      'block whitespace-nowrap tabular-nums',
                      GROUP_INDENT[
                        leafIndentStep({ depth: item.depth, nested: true })
                      ],
                    )}
                  >
                    {timeRange(leaf)}
                  </span>
                );
              if (column.id === 'event')
                return (
                  <span
                    className={cn(
                      // Narrowed beside a block the row stays one line: the title takes
                      // the room the column has and truncates only past it, never the status.
                      compact
                        ? 'grid grid-cols-[minmax(0,auto)_auto] items-center justify-start gap-2'
                        : 'inline-flex items-center gap-1',
                      selected ? 'font-bold' : 'font-medium',
                    )}
                  >
                    {compact ? (
                      <span className="truncate" title={title(leaf)}>
                        {title(leaf)}
                      </span>
                    ) : (
                      title(leaf)
                    )}
                    {compact ? (
                      <span className="font-normal">{primaryStatus(leaf)}</span>
                    ) : null}
                    {selected && !compact ? (
                      <ChevronRightIcon
                        className="size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                );
              if (column.id === 'people')
                return (
                  <span className="text-muted-foreground">
                    {block.included ? blockSummary({ block }) : '—'}
                  </span>
                );
              if (column.id === 'status') return statusBadges(leaf);
              return openAction(leaf);
            }}
            renderMobileCard={({ item }) =>
              item.kind === 'group' ? (
                <MobileGroupHeading
                  item={item}
                  label={groupLabel(item)}
                  // Weeks sit straight under the page's h1.
                  headingLevel={2}
                  onToggle={toggle}
                />
              ) : (
                <div className={MOBILE_RAIL[item.depth]}>
                  {mobileCard(item.leaf)}
                </div>
              )
            }
          />
        </CardContent>
      </Card>
    );
  },
);
