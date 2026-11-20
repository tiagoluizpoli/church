import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatDayAndMonth, parseCalendarDay } from '@church/time';
import {
  type ProposalDay,
  type ProposalNeed,
  type ProposalShift,
  proposalAdditionKey,
} from '../../../utils/builder/assignment-proposal.utils';
import { dateLabel } from '../../../utils/builder/cycle-builder-date.utils';
import { LoadTag, PersonToggle } from './proposal-parts';
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
  /** Volunteer id → everything they would serve here, existing included. */
  totals: ReadonlyMap<string, number>;
  heavyLoad: number;
  severeLoad: number;
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
  totals,
  heavyLoad,
  severeLoad,
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
        <col className="w-32" />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-popover text-muted-foreground text-sm max-md:hidden">
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
                {(totals.get(volunteerId) ?? 0) >= heavyLoad && (
                  <span className="ms-2 font-normal">
                    <LoadTag
                      total={totals.get(volunteerId) ?? 0}
                      severeLoad={severeLoad}
                    />
                  </span>
                )}
              </th>
              <td className={CELL}>
                <span className="flex flex-wrap items-center gap-1.5 py-1.5 max-md:py-0">
                  {additions.length > 1 && (
                    <span className="me-2 text-muted-foreground tabular-nums">
                      {m.builder_proposal_volunteer_included({
                        selected: kept,
                        total: additions.length,
                      })}
                    </span>
                  )}
                  {picksByDay({ additions, shifts }).map(({ day, picks }) => {
                    const out = picks.every((pick) =>
                      excluded.has(proposalAdditionKey(pick.addition)),
                    );
                    return (
                      <span
                        key={day}
                        className={cn(
                          'radius-control inline-flex h-7 items-center whitespace-nowrap bg-secondary px-2 text-secondary-foreground text-sm tabular-nums',
                          out && 'text-muted-foreground line-through',
                        )}
                      >
                        {formatDayAndMonth({
                          day: parseCalendarDay({ value: day }),
                        })}
                        {picks.length > 1 && (
                          <span
                            aria-hidden
                            className="ms-1 text-muted-foreground"
                          >
                            ×{picks.length}
                          </span>
                        )}
                        {/* The times, for every reader, without widening the chip. */}
                        <span className="sr-only">
                          {m.builder_proposal_chip_times({
                            times: picks
                              .map(({ shift }) =>
                                formatTimeOf({
                                  value: shift.startTime,
                                  timeZone,
                                }),
                              )
                              .join(', '),
                          })}
                        </span>
                      </span>
                    );
                  })}
                </span>
              </td>
              <td className={cn(CELL, 'text-right')}>
                <PersonToggle
                  name={name}
                  allOut={allOut}
                  locked={locked}
                  className="max-md:w-full"
                  onToggle={() => onSetIncluded({ additions, include: allOut })}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export interface OpenPlace {
  day: string;
  shift: ProposalShift;
  need: ProposalNeed;
  open: number;
  /** Of those, places the leader reopened by leaving a pick out. */
  reopened: number;
}

interface OpenPlacesOfInput {
  days: ProposalDay[];
  excluded: ReadonlySet<string>;
}

/** Places still open after applying, in board order. */
export function openPlacesOf({
  days,
  excluded,
}: OpenPlacesOfInput): OpenPlace[] {
  return days.flatMap(({ day, shifts }) =>
    shifts.flatMap((shift) =>
      shift.needs.flatMap((need) => {
        const reopened = need.additions.filter((addition) =>
          excluded.has(proposalAdditionKey(addition)),
        ).length;
        const open = need.remaining + reopened;
        return open > 0 ? [{ day, shift, need, open, reopened }] : [];
      }),
    ),
  );
}

interface ProposalGapTableProps {
  days: ProposalDay[];
  excluded: ReadonlySet<string>;
  timeZone: string;
  onJumpToDay: (day: string) => void;
  onShowShifts: () => void;
}

/** Places still open after applying, in board order. */
export function ProposalGapTable({
  days,
  excluded,
  timeZone,
  onJumpToDay,
  onShowShifts,
}: ProposalGapTableProps) {
  const rows = openPlacesOf({ days, excluded });
  if (rows.length === 0)
    return (
      <div className="flex flex-wrap items-center gap-3 py-6">
        <p className="text-muted-foreground">
          {m.builder_proposal_gaps_empty()}
        </p>
        <Button variant="outline" size="sm" onClick={onShowShifts}>
          {m.builder_proposal_gaps_show_shifts()}
        </Button>
      </div>
    );
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {m.builder_proposal_gaps_hint()}
      </p>
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm max-md:block">
        <colgroup>
          <col className="w-[40%]" />
          <col />
          <col className="w-56" />
          <col className="w-36" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-popover text-muted-foreground text-sm max-md:hidden">
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
            <th scope="col" className={HEAD}>
              <span className="sr-only">{m.builder_proposal_gap_jump()}</span>
            </th>
          </tr>
        </thead>
        <tbody className="max-md:block">
          {rows.map(({ day, shift, need, open, reopened }) => (
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
                <span className="max-md:hidden">{open}</span>
                {reopened > 0 && (
                  <span className="ms-2 text-muted-foreground">
                    {/* All of them reopened: say so without repeating the number. */}
                    {reopened === open
                      ? `· ${
                          open === 1
                            ? m.builder_proposal_gap_reopened_all_one()
                            : m.builder_proposal_gap_reopened_all_many()
                        }`
                      : reopened === 1
                        ? m.builder_proposal_gap_reopened_one()
                        : m.builder_proposal_gap_reopened_many({
                            count: reopened,
                          })}
                  </span>
                )}
                <span className="md:hidden">
                  {open === 1
                    ? m.builder_proposal_gap_one()
                    : m.builder_proposal_gap_many({ count: open })}
                </span>
              </td>
              <td className={cn(CELL, 'text-right')}>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={m.builder_proposal_gap_jump_for({
                    day: dateLabel({ day, locale: getLocale() }),
                    need: `${need.roleName} · ${need.sectorName}`,
                  })}
                  className="max-md:h-11 max-md:w-full max-md:text-sm"
                  onClick={() => onJumpToDay(day)}
                >
                  {m.builder_proposal_gap_jump()}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
