import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  type ProposalDay,
  type ProposalShift,
  proposalAdditionKey,
} from '../../../utils/builder/assignment-proposal.utils';
import { dateLabel } from '../../../utils/builder/cycle-builder-date.utils';
import { Button } from '@/components/ui/button';
import type { GetAssignmentProposal200AdditionsItem } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { formatTimeOf } from '@/shared/utils/church-time';

type Addition = GetAssignmentProposal200AdditionsItem;

const HEAD = 'h-9 border-b px-3 text-left font-normal';
const CELL =
  'h-11 border-b border-border/50 px-3 align-middle max-md:h-auto max-md:border-0 max-md:px-0';

export interface ProposalVolunteerGroup {
  volunteerId: string;
  name: string;
  additions: Addition[];
}

export interface SetIncludedInput {
  additions: readonly Addition[];
  include: boolean;
}

interface DayPick {
  addition: Addition;
  shift: ProposalShift;
}

interface DayPicks {
  day: string;
  picks: DayPick[];
}

interface PicksByDayInput {
  additions: readonly Addition[];
  shifts: ReadonlyMap<string, ShiftPlace>;
}

interface ShiftPlace {
  day: string;
  shift: ProposalShift;
}

/** One chip per church day keeps a busy volunteer's row on one line. */
function picksByDay({ additions, shifts }: PicksByDayInput): DayPicks[] {
  const days = new Map<string, DayPick[]>();
  for (const addition of additions) {
    const place = shifts.get(addition.shiftId);
    if (!place) continue;
    days.set(place.day, [
      ...(days.get(place.day) ?? []),
      { addition, shift: place.shift },
    ]);
  }
  return [...days].map(([day, picks]) => ({ day, picks }));
}

interface ProposalVolunteerTableProps {
  groups: ProposalVolunteerGroup[];
  days: ProposalDay[];
  excluded: ReadonlySet<string>;
  locked: boolean;
  timeZone: string;
  onSetIncluded: (input: SetIncludedInput) => void;
}

/** Who carries the proposal: busiest first, with every pick as a chip and
 * one control to drop (or bring back) all of someone's picks. */
export function ProposalVolunteerTable({
  groups,
  days,
  excluded,
  locked,
  timeZone,
  onSetIncluded,
}: ProposalVolunteerTableProps) {
  const shifts = new Map<string, ShiftPlace>(
    days.flatMap(({ day, shifts: dayShifts }) =>
      dayShifts.map((shift) => [shift.shiftId, { day, shift }] as const),
    ),
  );
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-sm max-md:block">
      <colgroup>
        <col className="w-[22%]" />
        <col />
        <col className="w-60" />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-popover text-muted-foreground text-xs max-md:hidden">
        <tr>
          <th scope="col" className={HEAD}>
            {m.builder_proposal_col_volunteer()}
          </th>
          <th scope="col" className={HEAD}>
            {m.builder_proposal_col_picks()}
          </th>
          <th scope="col" className={HEAD}>
            <span className="sr-only">{m.builder_proposal_col_include()}</span>
          </th>
        </tr>
      </thead>
      <tbody className="max-md:block">
        {groups.map(({ volunteerId, name, additions }) => {
          const kept = additions.filter(
            (addition) => !excluded.has(proposalAdditionKey(addition)),
          ).length;
          const allOut = kept === 0;
          return (
            <tr
              key={volunteerId}
              className="max-md:flex max-md:flex-col max-md:gap-1.5 max-md:border-b max-md:py-3"
            >
              <th
                scope="row"
                className={cn(CELL, 'truncate text-left font-semibold')}
              >
                {name}
              </th>
              <td className={CELL}>
                <span className="flex flex-wrap items-center gap-1.5 py-1.5 max-md:py-0">
                  <span className="me-2 text-muted-foreground tabular-nums">
                    {m.builder_proposal_volunteer_included({
                      selected: kept,
                      total: additions.length,
                    })}
                  </span>
                  {picksByDay({ additions, shifts }).map(({ day, picks }) => {
                    const out = picks.every((pick) =>
                      excluded.has(proposalAdditionKey(pick.addition)),
                    );
                    return (
                      <span
                        key={day}
                        title={picks
                          .map(
                            ({ shift }) =>
                              `${formatTimeOf({ value: shift.startTime, timeZone })} ${shift.eventTitle}`,
                          )
                          .join(', ')}
                        className={cn(
                          'radius-control inline-flex h-6 items-center whitespace-nowrap bg-secondary px-2 text-secondary-foreground text-xs tabular-nums',
                          out && 'text-muted-foreground line-through',
                        )}
                      >
                        <span className="first-letter:uppercase">
                          {dateLabel({ day, locale: getLocale() })}
                        </span>
                        {picks.length > 1 && (
                          <span className="ms-1 text-muted-foreground">
                            ×{picks.length}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </span>
              </td>
              <td className={cn(CELL, 'text-right')}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={locked}
                  className="max-md:h-11 max-md:w-full max-md:text-sm"
                  onClick={() => onSetIncluded({ additions, include: allOut })}
                >
                  {allOut
                    ? m.builder_proposal_include_volunteer({ name })
                    : m.builder_proposal_exclude_volunteer({ name })}
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface ProposalGapTableProps {
  days: ProposalDay[];
  excluded: ReadonlySet<string>;
  timeZone: string;
}

/** Places still open after applying, in board order. */
export function ProposalGapTable({
  days,
  excluded,
  timeZone,
}: ProposalGapTableProps) {
  const rows = days.flatMap(({ day, shifts }) =>
    shifts.flatMap((shift) =>
      shift.needs.flatMap((need) => {
        const open =
          need.remaining +
          need.additions.filter((addition) =>
            excluded.has(proposalAdditionKey(addition)),
          ).length;
        return open > 0 ? [{ day, shift, need, open }] : [];
      }),
    ),
  );
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {m.builder_proposal_gaps_hint()}
      </p>
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm max-md:block">
        <colgroup>
          <col className="w-[45%]" />
          <col />
          <col className="w-40" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-popover text-muted-foreground text-xs max-md:hidden">
          <tr>
            <th scope="col" className={HEAD}>
              {m.builder_proposal_col_shift()}
            </th>
            <th scope="col" className={HEAD}>
              {m.builder_proposal_col_need()}
            </th>
            <th scope="col" className={cn(HEAD, 'text-right')}>
              {m.builder_proposal_col_open()}
            </th>
          </tr>
        </thead>
        <tbody className="max-md:block">
          {rows.map(({ day, shift, need, open }) => (
            <tr
              key={need.requirementId}
              className="max-md:flex max-md:flex-col max-md:gap-0.5 max-md:border-b max-md:py-3"
            >
              <td className={cn(CELL, 'truncate')}>
                <span className="text-muted-foreground tabular-nums first-letter:uppercase">
                  {dateLabel({ day, locale: getLocale() })}{' '}
                  {formatTimeOf({ value: shift.startTime, timeZone })}–
                  {formatTimeOf({ value: shift.endTime, timeZone })}
                </span>{' '}
                <span className="font-semibold">{shift.eventTitle}</span>
              </td>
              <td className={cn(CELL, 'truncate')}>
                {need.roleName} · {need.sectorName}
              </td>
              <td
                className={cn(CELL, 'text-right tabular-nums max-md:text-left')}
              >
                {open === 1
                  ? m.builder_proposal_gap_one()
                  : m.builder_proposal_gap_many({ count: open })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
