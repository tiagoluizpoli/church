import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { ChevronDown, CircleDashed, Plus } from 'lucide-react';
import { type KeyboardEvent, useRef, useState } from 'react';
import {
  type ProposalCoverage,
  type ProposalDay,
  type ProposalExistingAssignee,
  type ProposalNeed,
  type ProposalShift,
  proposalAdditionKey,
} from '../../../utils/builder/assignment-proposal.utils';
import { dateLabel } from '../../../utils/builder/cycle-builder-date.utils';
import {
  CoverageMeter,
  PickTags,
  ReasonPopover,
  type RovingProps,
  shortReason,
} from './proposal-parts';
import { Checkbox } from '@/components/ui/checkbox';
import type { GetAssignmentProposal200AdditionsItem } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { formatTimeOf } from '@/shared/utils/church-time';

type Addition = GetAssignmentProposal200AdditionsItem;

interface RowPlace {
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
  /** Show only these picks (no existing or open rows). */
  only?: ReadonlySet<string>;
}

/** Per need: who is already there (muted, first), the picks, then what
 * stays open — so a slot reads filled / suggested / still open. An
 * excluded pick keeps its row (marked), so nothing below it moves. */
function rowsOf({ shift, only }: RowsOfInput): ShiftRow[] {
  const rows = shift.needs.flatMap((need) => {
    const additions = need.additions
      .filter((addition) => !only || only.has(proposalAdditionKey(addition)))
      .map((addition): ShiftRowContent => ({ kind: 'addition', addition }));
    const contents: ShiftRowContent[] = only
      ? additions
      : [
          ...need.existing.map(
            (assignee): ShiftRowContent => ({ kind: 'existing', assignee }),
          ),
          ...additions,
          ...(need.remaining > 0
            ? [{ kind: 'open', count: need.remaining } as const]
            : []),
        ];
    return contents.map(
      (content, index): ShiftRow => ({
        ...content,
        key: `${need.requirementId}:${
          content.kind === 'existing'
            ? content.assignee.assignmentId
            : content.kind === 'addition'
              ? content.addition.volunteerId
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
const COLUMNS = 6;

interface ProposalShiftTableProps {
  days: ProposalDay[];
  coverageByDay: ReadonlyMap<string, ProposalCoverage>;
  folded: ReadonlySet<string>;
  onToggleDay: (day: string) => void;
  only?: ReadonlySet<string>;
  excluded: ReadonlySet<string>;
  ordinals: ReadonlyMap<string, number>;
  heavyLoad: number;
  locked: boolean;
  timeZone: string;
  onToggle: (addition: Addition) => void;
}

/**
 * One line per place on desktop under a header row per shift, day groups
 * that fold, and one tab stop for all the row controls (arrow keys move
 * between them), so Apply stays a few Tabs away at 150 picks. Below `md`
 * each row restacks into a short card with a 44px include control.
 */
export function ProposalShiftTable({
  days,
  coverageByDay,
  folded,
  onToggleDay,
  only,
  excluded,
  ordinals,
  heavyLoad,
  locked,
  timeZone,
  onToggle,
}: ProposalShiftTableProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [active, setActive] = useState<string>();
  const time = (value: string) => formatTimeOf({ value, timeZone });

  const blocks = days.flatMap((day) => {
    const shifts = day.shifts
      .map((shift) => ({ shift, rows: rowsOf({ shift, only }) }))
      .filter(({ rows }) => rows.length > 0);
    return shifts.length > 0 ? [{ day, shifts }] : [];
  });
  // Row controls in reading order: each pick's reason, then its checkbox.
  const rovingIds = blocks
    .filter(({ day }) => !folded.has(day.day))
    .flatMap(({ shifts }) =>
      shifts.flatMap(({ rows }) =>
        rows.flatMap((row) =>
          row.kind === 'addition'
            ? [`${row.key}:why`, `${row.key}:include`]
            : [],
        ),
      ),
    );
  const current = active && rovingIds.includes(active) ? active : rovingIds[0];
  const roving = (id: string): RovingProps => ({
    tabIndex: id === current ? 0 : -1,
    'data-roving': id,
    onFocus: () => setActive(id),
  });
  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const id = (event.target as HTMLElement)
      .closest('[data-roving]')
      ?.getAttribute('data-roving');
    if (!id) return;
    const index = rovingIds.indexOf(id);
    const column = id.endsWith(':why') ? ':why' : ':include';
    const next =
      event.key === 'ArrowDown'
        ? rovingIds.slice(index + 1).find((other) => other.endsWith(column))
        : event.key === 'ArrowUp'
          ? rovingIds
              .slice(0, index)
              .findLast((other) => other.endsWith(column))
          : event.key === 'ArrowRight' && column === ':why'
            ? rovingIds[index + 1]
            : event.key === 'ArrowLeft' && column === ':include'
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

  return (
    <table
      ref={tableRef}
      onKeyDown={onKeyDown}
      className="w-full table-fixed border-separate border-spacing-0 text-sm max-md:block"
    >
      <caption className="sr-only">{m.builder_proposal_table_hint()}</caption>
      <colgroup>
        <col className="w-[18%]" />
        <col className="w-[22%]" />
        <col />
        <col className="w-48" />
        <col className="w-12" />
        <col className="w-20" />
      </colgroup>
      <thead className="sticky top-0 z-20 bg-popover max-md:hidden">
        <tr className="text-left text-muted-foreground text-xs">
          <th scope="col" className={HEAD}>
            {m.builder_proposal_col_need()}
          </th>
          <th scope="col" className={HEAD}>
            {m.builder_proposal_col_volunteer()}
          </th>
          <th scope="col" className={HEAD}>
            {m.builder_proposal_col_reason()}
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
      {blocks.map(({ day, shifts }) => {
        const isFolded = folded.has(day.day);
        const label = dateLabel({ day: day.day, locale: getLocale() });
        const picks = shifts.flatMap(({ rows }) =>
          rows.filter(({ kind }) => kind === 'addition'),
        ).length;
        const dayCoverage = coverageByDay.get(day.day);
        return (
          <tbody
            key={day.day}
            id={only ? undefined : `proposal-day-${day.day}`}
            className="scroll-mt-9 max-md:block max-md:scroll-mt-0"
          >
            <tr className="max-md:block">
              <th
                colSpan={COLUMNS}
                scope="rowgroup"
                className="sticky top-0 z-10 border-b bg-popover p-0 text-left font-normal max-md:-mx-4 max-md:block md:top-9"
              >
                <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 bg-muted/40 px-3 py-1 max-md:px-4 md:min-h-10 md:flex-nowrap">
                  <button
                    type="button"
                    aria-expanded={!isFolded}
                    onClick={() => onToggleDay(day.day)}
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
                      className="w-full md:ml-auto md:w-72"
                      coverage={dayCoverage}
                    />
                  )}
                </div>
              </th>
            </tr>
            {!isFolded &&
              shifts.flatMap(({ shift, rows }) => {
                const shiftLabel = `${time(shift.startTime)}–${time(shift.endTime)}`;
                return [
                  <tr key={shift.shiftId} className="max-md:block">
                    <th
                      colSpan={COLUMNS}
                      className="h-9 border-b px-3 pt-2 text-left align-bottom font-normal max-md:block max-md:h-auto max-md:px-0 max-md:pt-3"
                    >
                      <span className="tabular-nums">{shiftLabel}</span>{' '}
                      <span className="font-semibold">{shift.eventTitle}</span>
                    </th>
                  </tr>,
                  ...rows.map((row) => {
                    const needLabel = `${row.need.roleName} · ${row.need.sectorName}`;
                    const additionKey =
                      row.kind === 'addition'
                        ? proposalAdditionKey(row.addition)
                        : '';
                    const isExcluded = excluded.has(additionKey);
                    const ordinal = ordinals.get(additionKey);
                    return (
                      <tr
                        key={row.key}
                        data-kind={row.kind}
                        className={cn(
                          'max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto_auto] max-md:items-center max-md:[grid-template-areas:"need_need_need""name_why_include""tags_tags_tags"]',
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
                          <span className={cn(!row.firstInNeed && 'sr-only')}>
                            {needLabel}
                          </span>
                        </td>
                        <td
                          className={cn(
                            CELL,
                            'truncate max-md:py-1 max-md:[grid-area:name]',
                          )}
                        >
                          {row.kind === 'existing' ? (
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <span aria-hidden className="size-3.5 shrink-0" />
                              <span className="truncate">
                                {row.assignee.name ??
                                  m.builder_ui_the_volunteer()}
                              </span>
                            </span>
                          ) : row.kind === 'addition' ? (
                            <span
                              className={cn(
                                'flex items-center gap-2',
                                isExcluded &&
                                  'text-muted-foreground line-through',
                              )}
                            >
                              <Plus
                                aria-hidden
                                className={cn(
                                  'size-3.5 shrink-0',
                                  isExcluded
                                    ? 'text-muted-foreground'
                                    : 'text-primary',
                                )}
                              />
                              <span className="truncate font-semibold">
                                {row.addition.volunteerName}
                              </span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <CircleDashed
                                aria-hidden
                                className="size-3.5 shrink-0"
                              />
                              <span className="truncate">
                                {row.count === 1
                                  ? m.builder_proposal_gap_one()
                                  : m.builder_proposal_gap_many({
                                      count: row.count,
                                    })}
                              </span>
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            CELL,
                            'truncate text-muted-foreground max-md:hidden',
                          )}
                        >
                          {row.kind === 'addition' &&
                            !isExcluded &&
                            shortReason(row.addition)}
                        </td>
                        <td
                          className={cn(
                            CELL,
                            'max-md:empty:hidden max-md:[grid-area:tags]',
                          )}
                        >
                          {isExcluded ? (
                            <span className="text-muted-foreground">
                              {m.builder_proposal_excluded_label()}
                            </span>
                          ) : row.kind === 'existing' ? (
                            <span className="text-muted-foreground">
                              {m.builder_proposal_existing()}
                            </span>
                          ) : row.kind === 'addition' ? (
                            <PickTags
                              addition={row.addition}
                              ordinal={ordinal}
                              heavyLoad={heavyLoad}
                            />
                          ) : null}
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
                              heavyLoad={heavyLoad}
                              roving={roving(`${row.key}:why`)}
                            />
                          )}
                        </td>
                        <td
                          className={cn(
                            CELL,
                            'max-md:empty:hidden max-md:[grid-area:include]',
                          )}
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
                                  shift: `${label} ${shiftLabel}`,
                                })}
                                className="max-md:size-5"
                                {...roving(`${row.key}:include`)}
                              />
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }),
                ];
              })}
          </tbody>
        );
      })}
    </table>
  );
}
