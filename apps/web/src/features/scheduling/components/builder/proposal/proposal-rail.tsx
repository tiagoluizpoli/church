import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import type { ReactNode } from 'react';
import { proposalAdditionKey } from '../../../utils/builder/assignment-proposal.utils';
import { dateLabel } from '../../../utils/builder/cycle-builder-date.utils';
import { LoadTag, PersonToggle } from './proposal-parts';
import type {
  OpenPlace,
  ProposalVolunteerGroup,
  SetIncludedInput,
} from './proposal-side-views';
import { Button } from '@/components/ui/button';
import { STRUCK } from '@/lib/struck';
import { cn } from '@/lib/utils';
import { formatTimeOf } from '@/shared/utils/church-time';

/** How many people and places the rail lists before pointing to the tab. */
const RAIL_LIMIT = 6;

export interface RailPerson {
  group: ProposalVolunteerGroup;
  total: number;
}

interface ProposalRailProps {
  /** Heaviest first, from the whole proposal, so rows never reshuffle. */
  people: RailPerson[];
  /** The day strip, which moves here on wide screens. */
  days?: ReactNode;
  openPlaces: OpenPlace[];
  excluded: ReadonlySet<string>;
  severeLoad: number;
  locked: boolean;
  timeZone: string;
  onSetIncluded: (input: SetIncludedInput) => void;
  onJumpToDay: (day: string) => void;
  onShowVolunteers: () => void;
  onShowGaps: () => void;
}

/** Beside the shift list on wide screens: who carries the most (and a
 * one-click way to drop them) and what stays open, without leaving the
 * list. */
export function ProposalRail({
  people,
  days,
  openPlaces,
  excluded,
  severeLoad,
  locked,
  timeZone,
  onSetIncluded,
  onJumpToDay,
  onShowVolunteers,
  onShowGaps,
}: ProposalRailProps) {
  const openCount = openPlaces.reduce((sum, { open }) => sum + open, 0);
  return (
    <div className="space-y-6 py-3">
      {days}
      {people.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-base">
            {m.builder_proposal_rail_load_heading()}
          </h3>
          <ul className="divide-y">
            {people.slice(0, RAIL_LIMIT).map(({ group, total }) => {
              const allOut = group.additions.every((addition) =>
                excluded.has(proposalAdditionKey(addition)),
              );
              return (
                // Removing keeps the row (struck through, with Devolver), so
                // the next button never slides under the pointer.
                <li
                  key={group.volunteerId}
                  className="flex items-center gap-2 py-2"
                >
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <span
                      className={cn(
                        'max-w-full truncate font-semibold',
                        allOut && STRUCK,
                      )}
                    >
                      {group.name}
                    </span>
                    <LoadTag total={total} severeLoad={severeLoad} />
                  </span>
                  <PersonToggle
                    name={group.name}
                    allOut={allOut}
                    locked={locked}
                    onToggle={() =>
                      onSetIncluded({
                        additions: group.additions,
                        include: allOut,
                      })
                    }
                  />
                </li>
              );
            })}
          </ul>
          {people.length > RAIL_LIMIT && (
            <Button variant="link" className="px-0" onClick={onShowVolunteers}>
              {m.builder_proposal_tab_volunteers()}
            </Button>
          )}
        </section>
      )}
      <section className="space-y-2">
        <h3 className="font-semibold text-base">
          {m.builder_proposal_rail_open_heading()}{' '}
          <span className="font-normal text-muted-foreground tabular-nums">
            ({openCount})
          </span>
        </h3>
        {openPlaces.length === 0 ? (
          <p className="text-muted-foreground">
            {m.builder_proposal_rail_open_none()}
          </p>
        ) : (
          <ul className="divide-y">
            {openPlaces
              .slice(0, RAIL_LIMIT)
              .map(({ day, shift, need, open }) => {
                const when = `${dateLabel({ day, locale: getLocale() })} ${formatTimeOf({ value: shift.startTime, timeZone })}`;
                return (
                  <li
                    key={need.requirementId}
                    className="flex items-center gap-2 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate first-letter:uppercase">
                        {when} · {shift.eventTitle}
                      </span>
                      <span className="block truncate text-muted-foreground">
                        {need.roleName} · {need.sectorName} ·{' '}
                        {open === 1
                          ? m.builder_proposal_gap_one()
                          : m.builder_proposal_gap_many({ count: open })}
                      </span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={m.builder_proposal_gap_jump_for({
                        day: dateLabel({ day, locale: getLocale() }),
                        need: `${need.roleName} · ${need.sectorName}`,
                      })}
                      onClick={() => onJumpToDay(day)}
                    >
                      {m.builder_proposal_gap_jump()}
                    </Button>
                  </li>
                );
              })}
          </ul>
        )}
        {openPlaces.length > RAIL_LIMIT && (
          <Button variant="link" className="px-0" onClick={onShowGaps}>
            {m.builder_proposal_tab_gaps({ count: openCount })}
          </Button>
        )}
      </section>
    </div>
  );
}
