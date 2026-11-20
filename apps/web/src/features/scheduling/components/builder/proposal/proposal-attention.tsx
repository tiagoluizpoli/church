import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  type ProposalDay,
  proposalAdditionKey,
} from '../../../utils/builder/assignment-proposal.utils';
import { dateLabel } from '../../../utils/builder/cycle-builder-date.utils';
import {
  AttentionTag,
  LoadOrdinal,
  LoadTag,
  PersonToggle,
  ReasonPopover,
} from './proposal-parts';
import type { SetIncludedInput } from './proposal-side-views';
import { Checkbox } from '@/components/ui/checkbox';
import type { GetAssignmentProposal200AdditionsItem } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { formatTimeOf } from '@/shared/utils/church-time';

type Addition = GetAssignmentProposal200AdditionsItem;

export interface AttentionPerson {
  volunteerId: string;
  name: string;
  total: number;
  /** Every pick of theirs in the proposal. */
  additions: Addition[];
  /** The picks from the heavy-load line on, in time order. */
  flagged: Addition[];
}

interface ProposalAttentionProps {
  days: ProposalDay[];
  people: AttentionPerson[];
  onlyOption: Addition[];
  excluded: ReadonlySet<string>;
  /** Places of the whole proposal, so a row keeps its ordinal while out. */
  ordinals: ReadonlyMap<string, number>;
  heavyLoad: number;
  severeLoad: number;
  locked: boolean;
  timeZone: string;
  onToggle: (addition: Addition) => void;
  onSetIncluded: (input: SetIncludedInput) => void;
}

interface PickRowInput {
  addition: Addition;
  /** The single-option list: name shown, single-option tag. */
  singleOption: boolean;
}

const ROW =
  'flex min-h-10 items-center gap-3 border-border/50 border-b px-3 max-md:flex-wrap max-md:gap-y-1 max-md:px-0 max-md:py-2';

/** What needs a second look, grouped the way the leader decides: by the
 * person carrying the load, then by the places nobody else can fill. */
export function ProposalAttention({
  days,
  people,
  onlyOption,
  excluded,
  ordinals,
  heavyLoad,
  severeLoad,
  locked,
  timeZone,
  onToggle,
  onSetIncluded,
}: ProposalAttentionProps) {
  const places = new Map(
    days.flatMap(({ day, shifts }) =>
      shifts.flatMap((shift) =>
        shift.needs.map(
          (need) => [need.requirementId, { day, shift, need }] as const,
        ),
      ),
    ),
  );
  const time = (value: string) => formatTimeOf({ value, timeZone });
  const pickRow = ({ addition, singleOption }: PickRowInput) => {
    const place = places.get(addition.shiftRequirementId);
    if (!place) return null;
    const key = proposalAdditionKey(addition);
    const out = excluded.has(key);
    const ordinal = ordinals.get(key);
    const total = people.find(
      ({ volunteerId }) => volunteerId === addition.volunteerId,
    )?.total;
    const when = `${dateLabel({ day: place.day, locale: getLocale() })} ${time(place.shift.startTime)}–${time(place.shift.endTime)}`;
    const needLabel = `${place.need.roleName} · ${place.need.sectorName}`;
    return (
      <li key={key} className={ROW}>
        <span
          className={cn(
            'min-w-0 flex-1 md:truncate',
            out && 'text-muted-foreground line-through',
          )}
        >
          <span className="text-muted-foreground tabular-nums first-letter:uppercase">
            {when}
          </span>{' '}
          <span className="font-semibold">{place.shift.eventTitle}</span>
          <span className="text-muted-foreground"> · {needLabel}</span>
          {singleOption && (
            <span className="font-semibold"> · {addition.volunteerName}</span>
          )}
        </span>
        {out ? (
          <span className="text-muted-foreground">
            {m.builder_proposal_excluded_label()}
          </span>
        ) : !singleOption && ordinal !== undefined && total !== undefined ? (
          <LoadOrdinal
            ordinal={ordinal}
            total={total}
            heavyLoad={heavyLoad}
            severeLoad={severeLoad}
          />
        ) : (
          <AttentionTag>{m.builder_proposal_only_option()}</AttentionTag>
        )}
        <ReasonPopover
          name={addition.volunteerName}
          reason={addition.reason}
          ordinal={ordinal}
          total={total ?? 0}
          heavyLoad={heavyLoad}
        />
        <span className="flex min-h-11 min-w-11 items-center justify-end md:min-h-0 md:min-w-8">
          <Checkbox
            checked={!out}
            disabled={locked}
            onCheckedChange={() => onToggle(addition)}
            aria-label={m.builder_proposal_include_pick({
              name: addition.volunteerName,
              need: needLabel,
              shift: when,
            })}
            className="max-md:size-5"
          />
        </span>
      </li>
    );
  };

  return (
    <div className="space-y-6 py-3">
      {people.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-base">
            {m.builder_proposal_attention_load_heading()}
          </h3>
          <p className="text-muted-foreground">
            {m.builder_proposal_attention_load_hint({ count: heavyLoad })}
          </p>
          {people.map((person) => {
            const allOut = person.additions.every((addition) =>
              excluded.has(proposalAdditionKey(addition)),
            );
            return (
              <div key={person.volunteerId} className="pt-2">
                <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-3 max-md:-mx-4 max-md:px-4">
                  <h4 className="font-semibold">{person.name}</h4>
                  <LoadTag total={person.total} severeLoad={severeLoad} />
                  <PersonToggle
                    name={person.name}
                    allOut={allOut}
                    locked={locked}
                    className="ms-auto max-md:w-full"
                    onToggle={() =>
                      onSetIncluded({
                        additions: person.additions,
                        include: allOut,
                      })
                    }
                  />
                </div>
                <ul>
                  {person.flagged.map((addition) =>
                    pickRow({ addition, singleOption: false }),
                  )}
                </ul>
              </div>
            );
          })}
        </section>
      )}
      {onlyOption.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-base">
            {m.builder_proposal_attention_only_heading()}
          </h3>
          <ul>
            {onlyOption.map((addition) =>
              pickRow({ addition, singleOption: true }),
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
