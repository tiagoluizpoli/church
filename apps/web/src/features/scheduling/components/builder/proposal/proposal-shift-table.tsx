import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { ChevronDown, CircleDashed, Minus, Plus } from 'lucide-react';
import { type KeyboardEvent, memo, useMemo, useRef, useState } from 'react';
import {
  type ProposalCoverage,
  type ProposalDay,
  type ProposalExistingAssignee,
  type ProposalNeed,
  type ProposalShift,
  proposalAdditionKey,
} from '../../../utils/builder/assignment-proposal.utils';
import { dateLabel } from '../../../utils/builder/cycle-builder-date.utils';
import { CoverageMeter, PickNotes, ReasonPopover } from './proposal-parts';
import { Checkbox } from '@/components/ui/checkbox';
import type { GetAssignmentProposal200AdditionsItem } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { formatTimeOf } from '@/shared/utils/church-time';

type Addition = GetAssignmentProposal200AdditionsItem;

interface RowPlace {
  /** For a pick, its `proposalAdditionKey`. */
  key: string;
  need: ProposalNeed;
  firstInNeed: boolean;
  lastInShift: boolean;
}

type ShiftRowContent =
  | { kind: 'existing'; assignee: ProposalExistingAssignee }
  | { kind: 'addition'; addition: Addition }
  | { kind: 'open'; count: number };

type ShiftRow = RowPlace & ShiftRowContent;

interface RowsOfInput {
  shift: ProposalShift;
}

/** Per need: who is already there (muted, first), the picks, then what
 * stays open — so a slot reads filled / suggested / still open. An
 * excluded pick keeps its row (marked), so nothing below it moves. */
function rowsOf({ shift }: RowsOfInput): ShiftRow[] {
  const rows = shift.needs.flatMap((need) => {
    const contents: ShiftRowContent[] = [
      ...need.existing.map(
        (assignee): ShiftRowContent => ({ kind: 'existing', assignee }),
      ),
      ...need.additions.map(
        (addition): ShiftRowContent => ({ kind: 'addition', addition }),
      ),
      ...(need.remaining > 0
        ? [{ kind: 'open', count: need.remaining } as const]
        : []),
    ];
    return contents.map(
      (content, index): ShiftRow => ({
        ...content,
        key:
          content.kind === 'addition'
            ? proposalAdditionKey(content.addition)
            : `${need.requirementId}:${
                content.kind === 'existing'
                  ? content.assignee.assignmentId
                  : 'open'
              }`,
        need,
        firstInNeed: index === 0,
        lastInShift: false,
      }),
    );
  });
  if (rows.length > 0) rows[rows.length - 1].lastInShift = true;
  return rows;
}

const CELL =
  'h-10 px-3 align-middle md:border-b md:border-border/50 max-md:h-auto max-md:px-0';
const HEAD = 'h-9 border-b px-3 font-normal';
const COLUMNS = 5;

type RovingColumn = 'day' | 'why' | 'include';

function columnOf(id: string): RovingColumn {
  if (id.startsWith('day:')) return 'day';
  return id.endsWith(':why') ? 'why' : 'include';
}

interface PickRowProps {
  row: ShiftRow;
  dayLabel: string;
  shiftLabel: string;
  isExcluded: boolean;
  ordinal: number | undefined;
  total: number;
  heavyLoad: number;
  severeLoad: number;
  locked: boolean;
  /** Which of this row's controls holds the table's single tab stop. */
  activeControl: RovingColumn | null;
  onToggle: (addition: Addition) => void;
  onActivate: (id: string) => void;
}

/** Memoised: toggling one pick re-renders that row, not all 150. */
const PickRow = memo(function PickRow({
  row,
  dayLabel,
  shiftLabel,
  isExcluded,
  ordinal,
  total,
  heavyLoad,
  severeLoad,
  locked,
  activeControl,
  onToggle,
  onActivate,
}: PickRowProps) {
  const needLabel = `${row.need.roleName} · ${row.need.sectorName}`;
  const roving = (column: RovingColumn) => ({
    tabIndex: activeControl === column ? 0 : -1,
    'data-roving': `${row.key}:${column}`,
    onFocus: () => onActivate(`${row.key}:${column}`),
  });
  const status =
    row.kind === 'existing'
      ? m.builder_proposal_existing()
      : isExcluded
        ? m.builder_proposal_excluded_label()
        : null;
  return (
    <tr
      data-kind={row.kind}
      className={cn(
        'max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto_auto_auto] max-md:items-center max-md:gap-x-1 max-md:[grid-template-areas:"need_need_need_need""name_notes_why_include"]',
        row.lastInShift &&
          'max-md:border-b max-md:pb-2 md:[&>td]:border-border',
      )}
    >
      <td
        className={cn(
          CELL,
          'truncate max-md:pt-1 max-md:text-muted-foreground max-md:[grid-area:need]',
          !row.firstInNeed && 'max-md:hidden',
        )}
      >
        <span className={cn(!row.firstInNeed && 'sr-only')}>{needLabel}</span>
      </td>
      <td className={cn(CELL, 'max-md:py-1 max-md:[grid-area:name]')}>
        <span
          className={cn(
            'flex min-w-0 items-center gap-2',
            row.kind !== 'addition' && 'text-muted-foreground',
          )}
        >
          {row.kind === 'addition' ? (
            isExcluded ? (
              <Minus
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground"
              />
            ) : (
              <Plus aria-hidden className="size-3.5 shrink-0 text-primary" />
            )
          ) : row.kind === 'open' ? (
            <CircleDashed aria-hidden className="size-3.5 shrink-0" />
          ) : (
            <span aria-hidden className="size-3.5 shrink-0" />
          )}
          <span
            className={cn(
              'truncate',
              row.kind === 'addition' && 'font-semibold',
              isExcluded && 'text-muted-foreground line-through',
            )}
          >
            {row.kind === 'existing'
              ? (row.assignee.name ?? m.builder_ui_the_volunteer())
              : row.kind === 'addition'
                ? row.addition.volunteerName
                : row.count === 1
                  ? m.builder_proposal_gap_one()
                  : m.builder_proposal_gap_many({ count: row.count })}
          </span>
          {status && (
            <span className="shrink-0 text-muted-foreground">· {status}</span>
          )}
        </span>
      </td>
      <td
        className={cn(
          CELL,
          'max-md:max-w-36 max-md:overflow-hidden max-md:empty:hidden max-md:[grid-area:notes]',
        )}
      >
        {row.kind === 'addition' && !isExcluded && (
          <PickNotes
            addition={row.addition}
            ordinal={ordinal}
            total={total}
            heavyLoad={heavyLoad}
            severeLoad={severeLoad}
          />
        )}
      </td>
      <td
        className={cn(
          CELL,
          'px-0 text-center max-md:empty:hidden max-md:[grid-area:why]',
        )}
      >
        {row.kind === 'addition' && (
          <ReasonPopover
            name={row.addition.volunteerName}
            reason={row.addition.reason}
            ordinal={ordinal}
            total={total}
            heavyLoad={heavyLoad}
            roving={roving('why')}
          />
        )}
      </td>
      <td
        className={cn(CELL, 'max-md:empty:hidden max-md:[grid-area:include]')}
      >
        {row.kind === 'addition' && (
          <span className="flex min-h-11 min-w-11 items-center justify-end md:min-h-0">
            <Checkbox
              checked={!isExcluded}
              disabled={locked}
              onCheckedChange={() => onToggle(row.addition)}
              aria-label={m.builder_proposal_include_pick({
                name: row.addition.volunteerName,
                need: needLabel,
                shift: `${dayLabel} ${shiftLabel}`,
              })}
              className="max-md:size-5"
              {...roving('include')}
            />
          </span>
        )}
      </td>
    </tr>
  );
});

interface ProposalShiftTableProps {
  days: ProposalDay[];
  coverageByDay: ReadonlyMap<string, ProposalCoverage>;
  folded: ReadonlySet<string>;
  onToggleDay: (day: string) => void;
  excluded: ReadonlySet<string>;
  ordinals: ReadonlyMap<string, number>;
  /** Volunteer id → everything they would serve here. */
  totals: ReadonlyMap<string, number>;
  heavyLoad: number;
  severeLoad: number;
  locked: boolean;
  timeZone: string;
  /** Stable across renders, so memoised rows stay memoised. */
  onToggle: (addition: Addition) => void;
}

/**
 * One line per place on desktop under a sticky header per day and per
 * shift, and one tab stop for every row control and fold button (arrow
 * keys move between them), so Apply stays a few Tabs away at 150 picks.
 * Below `md` each row restacks into a short card with a 44px include.
 */
export function ProposalShiftTable({
  days,
  coverageByDay,
  folded,
  onToggleDay,
  excluded,
  ordinals,
  totals,
  heavyLoad,
  severeLoad,
  locked,
  timeZone,
  onToggle,
}: ProposalShiftTableProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [active, setActive] = useState<string>();

  const blocks = useMemo(
    () =>
      days.flatMap((day) => {
        const shifts = day.shifts
          .map((shift) => ({
            shift,
            label: `${formatTimeOf({ value: shift.startTime, timeZone })}–${formatTimeOf({ value: shift.endTime, timeZone })}`,
            rows: rowsOf({ shift }),
          }))
          .filter(({ rows }) => rows.length > 0);
        return shifts.length > 0
          ? [
              {
                day,
                label: dateLabel({ day: day.day, locale: getLocale() }),
                picks: shifts.flatMap(({ rows }) =>
                  rows.filter(({ kind }) => kind === 'addition'),
                ).length,
                shifts,
              },
            ]
          : [];
      }),
    [days, timeZone],
  );
  // Every fold button and row control, in reading order.
  const rovingIds = useMemo(
    () =>
      blocks.flatMap(({ day, shifts }) => [
        `day:${day.day}`,
        ...(folded.has(day.day)
          ? []
          : shifts.flatMap(({ rows }) =>
              rows.flatMap((row) =>
                row.kind === 'addition'
                  ? [`${row.key}:why`, `${row.key}:include`]
                  : [],
              ),
            )),
      ]),
    [blocks, folded],
  );
  const indexById = useMemo(
    () => new Map(rovingIds.map((id, index) => [id, index])),
    [rovingIds],
  );
  const current =
    active !== undefined && indexById.has(active) ? active : rovingIds[0];

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const id = (event.target as HTMLElement)
      .closest('[data-roving]')
      ?.getAttribute('data-roving');
    const index = id === null || id === undefined ? -1 : indexById.get(id);
    if (id == null || index === undefined || index < 0) return;
    const column = columnOf(id);
    // Up and down stay in the column but stop at every fold button.
    const vertical = (other: string) =>
      columnOf(other) === 'day' ||
      columnOf(other) === (column === 'day' ? 'include' : column);
    const next =
      event.key === 'ArrowDown'
        ? rovingIds.slice(index + 1).find(vertical)
        : event.key === 'ArrowUp'
          ? rovingIds.slice(0, index).findLast(vertical)
          : event.key === 'ArrowRight' && column === 'why'
            ? rovingIds[index + 1]
            : event.key === 'ArrowLeft' && column === 'include'
              ? rovingIds[index - 1]
              : event.key === 'Home'
                ? rovingIds[0]
                : event.key === 'End'
                  ? rovingIds.at(-1)
                  : undefined;
    if (!next) return;
    event.preventDefault();
    setActive(next);
    tableRef.current
      ?.querySelector<HTMLElement>(`[data-roving="${next}"]`)
      ?.focus();
  };
  const activeControlOf = (key: string): RovingColumn | null =>
    current === `${key}:why`
      ? 'why'
      : current === `${key}:include`
        ? 'include'
        : null;

  return (
    <table
      ref={tableRef}
      onKeyDown={onKeyDown}
      className="w-full table-fixed border-separate border-spacing-0 text-sm max-md:block"
    >
      <caption className="sr-only">{m.builder_proposal_table_hint()}</caption>
      <colgroup>
        <col className="w-[20%]" />
        <col className="w-[30%]" />
        <col />
        <col className="w-14" />
        <col className="w-20" />
      </colgroup>
      <thead className="sticky top-0 z-20 bg-popover max-md:hidden">
        <tr className="text-left text-muted-foreground text-sm">
          <th scope="col" className={HEAD}>
            {m.builder_proposal_col_need()}
          </th>
          <th scope="col" className={HEAD}>
            {m.builder_proposal_col_volunteer()}
          </th>
          <th scope="col" className={HEAD}>
            {m.builder_proposal_col_attention()}
          </th>
          <th scope="col" className={HEAD}>
            <span className="sr-only">{m.builder_proposal_col_reason()}</span>
          </th>
          <th scope="col" className={cn(HEAD, 'text-right')}>
            {m.builder_proposal_col_include()}
          </th>
        </tr>
      </thead>
      {blocks.map(({ day, label, picks, shifts }) => {
        const isFolded = folded.has(day.day);
        const dayCoverage = coverageByDay.get(day.day);
        const toggleId = `day:${day.day}`;
        return (
          <tbody
            key={day.day}
            id={`proposal-day-${day.day}`}
            className="scroll-mt-9 max-md:block max-md:scroll-mt-0"
          >
            <tr className="max-md:sticky max-md:top-0 max-md:z-10 max-md:-mx-4 max-md:block">
              <th
                colSpan={COLUMNS}
                scope="rowgroup"
                className="border-b bg-popover p-0 text-left font-normal max-md:block md:sticky md:top-9 md:z-10"
              >
                <div className="flex h-11 flex-nowrap items-center gap-x-4 bg-muted/40 px-3 max-md:gap-x-3 max-md:px-4">
                  <button
                    type="button"
                    aria-expanded={!isFolded}
                    onClick={() => onToggleDay(day.day)}
                    tabIndex={current === toggleId ? 0 : -1}
                    data-roving={toggleId}
                    onFocus={() => setActive(toggleId)}
                    className="radius-control -mx-1.5 flex min-h-9 items-center gap-1.5 px-1.5 font-semibold text-foreground text-sm outline-none hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        'size-4 text-muted-foreground transition-transform',
                        isFolded && '-rotate-90',
                      )}
                    />
                    <span className="first-letter:uppercase">{label}</span>
                  </button>
                  <span className="text-muted-foreground text-sm">
                    {picks === 1
                      ? m.builder_proposal_day_count_one()
                      : m.builder_proposal_day_count_many({ count: picks })}
                  </span>
                  {dayCoverage && (
                    <CoverageMeter
                      compactOnPhone
                      className="ml-auto md:w-72"
                      coverage={dayCoverage}
                    />
                  )}
                </div>
              </th>
            </tr>
            {!isFolded &&
              shifts.flatMap(({ shift, label: shiftLabel, rows }) => [
                <tr
                  key={shift.shiftId}
                  className="max-md:sticky max-md:top-[45px] max-md:z-[5] max-md:-mx-4 max-md:block max-md:bg-popover max-md:px-4"
                >
                  <th
                    colSpan={COLUMNS}
                    className="h-9 border-b bg-popover px-3 text-left align-middle font-normal max-md:block max-md:h-auto max-md:px-0 max-md:pt-3 max-md:pb-1 md:sticky md:top-[81px] md:z-[5]"
                  >
                    <span className="tabular-nums">{shiftLabel}</span>{' '}
                    <span className="font-semibold">{shift.eventTitle}</span>
                  </th>
                </tr>,
                ...rows.map((row) => (
                  <PickRow
                    key={row.key}
                    row={row}
                    dayLabel={label}
                    shiftLabel={shiftLabel}
                    isExcluded={excluded.has(row.key)}
                    ordinal={ordinals.get(row.key)}
                    total={
                      row.kind === 'addition'
                        ? (totals.get(row.addition.volunteerId) ?? 0)
                        : 0
                    }
                    heavyLoad={heavyLoad}
                    severeLoad={severeLoad}
                    locked={locked}
                    activeControl={activeControlOf(row.key)}
                    onToggle={onToggle}
                    onActivate={setActive}
                  />
                )),
              ])}
          </tbody>
        );
      })}
    </table>
  );
}
