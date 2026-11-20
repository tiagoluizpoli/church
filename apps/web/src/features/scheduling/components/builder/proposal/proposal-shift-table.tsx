import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { ChevronDown, CircleDashed, Plus } from 'lucide-react';
import { useState } from 'react';
import {
  coverageOf,
  HEAVY_LOAD_ORDINAL,
  type ProposalDay,
  type ProposalExistingAssignee,
  type ProposalNeed,
  type ProposalShift,
  proposalAdditionKey,
} from '../../../utils/builder/assignment-proposal.utils';
import { dateLabel } from '../../../utils/builder/cycle-builder-date.utils';
import { CoverageMeter, PickTags, ReasonPopover } from './proposal-parts';
import { Checkbox } from '@/components/ui/checkbox';
import type { GetAssignmentProposal200AdditionsItem } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { formatTimeOf } from '@/shared/utils/church-time';

type Addition = GetAssignmentProposal200AdditionsItem;

interface RowPlace {
  key: string;
  need: ProposalNeed;
  firstInShift: boolean;
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
  excluded: ReadonlySet<string>;
}

/** Per need: who is already there (muted, first), the picks, then what
 * stays open — so a slot reads filled / suggested / still open. */
function rowsOf({ shift, excluded }: RowsOfInput): ShiftRow[] {
  const rows = shift.needs.flatMap((need) => {
    const excludedHere = need.additions.filter((addition) =>
      excluded.has(proposalAdditionKey(addition)),
    ).length;
    const open = need.remaining + excludedHere;
    const contents: ShiftRowContent[] = [
      ...need.existing.map(
        (assignee): ShiftRowContent => ({ kind: 'existing', assignee }),
      ),
      ...need.additions.map(
        (addition): ShiftRowContent => ({ kind: 'addition', addition }),
      ),
      ...(open > 0 ? [{ kind: 'open', count: open } as const] : []),
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
        firstInShift: false,
        lastInShift: false,
      }),
    );
  });
  if (rows.length > 0) {
    rows[0].firstInShift = true;
    rows[rows.length - 1].lastInShift = true;
  }
  return rows;
}

const CELL =
  'h-10 px-3 align-middle md:border-b md:border-border/50 max-md:h-auto max-md:px-0';

interface ProposalShiftTableProps {
  days: ProposalDay[];
  included: readonly Addition[];
  excluded: ReadonlySet<string>;
  ordinals: ReadonlyMap<string, number>;
  locked: boolean;
  timeZone: string;
  onToggle: (addition: Addition) => void;
}

/**
 * One line per place on desktop, day groups that fold, and every column
 * aligned so a 150-pick proposal scans top to bottom. Below `md` each row
 * restacks into a short card with a 44px include control.
 */
export function ProposalShiftTable({
  days,
  included,
  excluded,
  ordinals,
  locked,
  timeZone,
  onToggle,
}: ProposalShiftTableProps) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const toggleDay = (day: string) =>
    setFolded((previous) => {
      const next = new Set(previous);
      if (!next.delete(day)) next.add(day);
      return next;
    });
  const time = (value: string) => formatTimeOf({ value, timeZone });

  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-sm max-md:block">
      <colgroup>
        <col className="w-[24%]" />
        <col className="w-[18%]" />
        <col />
        <col className="w-44" />
        <col className="w-12" />
        <col className="w-20" />
      </colgroup>
      <thead className="sticky top-0 z-20 bg-popover max-md:hidden">
        <tr className="text-left text-muted-foreground text-xs">
          <th scope="col" className="h-9 border-b px-3 font-normal">
            {m.builder_proposal_col_shift()}
          </th>
          <th scope="col" className="h-9 border-b px-3 font-normal">
            {m.builder_proposal_col_need()}
          </th>
          <th scope="col" className="h-9 border-b px-3 font-normal">
            {m.builder_proposal_col_volunteer()}
          </th>
          <th scope="col" className="h-9 border-b px-3 font-normal">
            {m.builder_proposal_col_attention()}
          </th>
          <th scope="col" className="h-9 border-b px-3 font-normal">
            <span className="sr-only">{m.builder_proposal_col_reason()}</span>
          </th>
          <th scope="col" className="h-9 border-b px-3 text-right font-normal">
            {m.builder_proposal_col_include()}
          </th>
        </tr>
      </thead>
      {days.map((day) => {
        const isFolded = folded.has(day.day);
        const label = dateLabel({ day: day.day, locale: getLocale() });
        const picks = day.shifts.flatMap(({ needs }) =>
          needs.flatMap(({ additions }) => additions),
        ).length;
        return (
          <tbody key={day.day} className="max-md:block">
            <tr className="max-md:block">
              <th
                colSpan={6}
                scope="rowgroup"
                className="sticky top-0 z-10 border-b bg-muted px-3 text-left font-normal max-md:-mx-4 max-md:block max-md:px-4 md:top-9"
              >
                <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 py-1 md:min-h-10 md:flex-nowrap">
                  <button
                    type="button"
                    aria-expanded={!isFolded}
                    onClick={() => toggleDay(day.day)}
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
                  <CoverageMeter
                    className="w-full md:ml-auto md:w-72"
                    coverage={coverageOf({
                      shifts: day.dayShifts,
                      additions: included,
                    })}
                  />
                </div>
              </th>
            </tr>
            {!isFolded &&
              day.shifts.flatMap((shift) => {
                const shiftLabel = `${time(shift.startTime)}–${time(shift.endTime)}`;
                return rowsOf({ shift, excluded }).map((row) => {
                  const needLabel = `${row.need.roleName} · ${row.need.sectorName}`;
                  const isExcluded =
                    row.kind === 'addition' &&
                    excluded.has(proposalAdditionKey(row.addition));
                  return (
                    <tr
                      key={row.key}
                      data-kind={row.kind}
                      className={cn(
                        'max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto_auto] max-md:items-center max-md:[grid-template-areas:"shift_shift_shift""need_need_need""name_why_include""tags_why_include"]',
                        row.lastInShift
                          ? 'max-md:border-b max-md:pb-2 md:[&>td]:border-border'
                          : '',
                        row.firstInShift && 'max-md:pt-3',
                      )}
                    >
                      <td
                        className={cn(
                          CELL,
                          'truncate max-md:pb-1 max-md:[grid-area:shift]',
                          !row.firstInShift && 'max-md:hidden',
                        )}
                      >
                        <span
                          className={cn(
                            'text-muted-foreground tabular-nums',
                            !row.firstInShift && 'text-muted-foreground/70',
                          )}
                        >
                          {shiftLabel}
                        </span>{' '}
                        <span
                          className={cn(
                            'font-semibold',
                            !row.firstInShift && 'sr-only',
                          )}
                        >
                          {shift.eventTitle}
                        </span>
                      </td>
                      <td
                        className={cn(
                          CELL,
                          'truncate max-md:text-muted-foreground max-md:[grid-area:need]',
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
                          'max-md:empty:hidden max-md:[grid-area:tags]',
                          isExcluded && 'opacity-50',
                        )}
                      >
                        {row.kind === 'existing' ? (
                          <span className="text-muted-foreground">
                            {m.builder_proposal_existing()}
                          </span>
                        ) : row.kind === 'addition' ? (
                          <PickTags
                            addition={row.addition}
                            ordinal={ordinals.get(
                              proposalAdditionKey(row.addition),
                            )}
                            heavyLoad={HEAVY_LOAD_ORDINAL}
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
                            ordinal={ordinals.get(
                              proposalAdditionKey(row.addition),
                            )}
                            heavyLoad={HEAVY_LOAD_ORDINAL}
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
                            />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                });
              })}
          </tbody>
        );
      })}
    </table>
  );
}
