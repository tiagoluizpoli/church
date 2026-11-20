import { m } from '@church/i18n/messages';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  type ProposalCoverage,
  percentOf,
} from '../../../utils/builder/assignment-proposal.utils';
import { staffingStatusClasses } from '../../../utils/builder/cycle-builder-staffing.utils';
import { Button } from '@/components/ui/button';
import { useFormControlSize } from '@/components/ui/form-control-size';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import type {
  GetAssignmentProposal200AdditionsItem,
  GetAssignmentProposal200AdditionsItemReason,
} from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';

interface CoverageMeterProps {
  coverage: ProposalCoverage;
  className?: string;
}

/** The Staffing Meter read as a change: the solid part is already on the
 * board, the faint part is what applying would add. Coloured by the result. */
export function CoverageMeter({ coverage, className }: CoverageMeterProps) {
  const { required, before, after } = coverage;
  const beforePercent = percentOf({ covered: before, required });
  const afterPercent = percentOf({ covered: after, required });
  const status = staffingStatusClasses({
    percent: afterPercent,
    hasRequirement: required > 0,
  });
  return (
    <span className={cn('flex items-center gap-3', className)}>
      <span className="sr-only">
        {m.builder_proposal_coverage_change({
          before: beforePercent,
          after: afterPercent,
        })}
      </span>
      <span aria-hidden className="whitespace-nowrap text-sm tabular-nums">
        <span className="text-muted-foreground">{beforePercent}% → </span>
        <span className={cn('font-semibold', status.text)}>
          {afterPercent}%
        </span>
      </span>
      <span
        aria-hidden
        className="relative h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <span
          className={cn(
            'absolute inset-y-0 left-0 opacity-45 transition-[width] duration-300 ease-out',
            status.bar,
          )}
          style={{ width: `${afterPercent}%` }}
        />
        <span
          className={cn('absolute inset-y-0 left-0', status.bar)}
          style={{ width: `${beforePercent}%` }}
        />
      </span>
    </span>
  );
}

interface AttentionTagProps {
  children: ReactNode;
}

/** Needs-attention amber (DESIGN.md): a pick worth a second look. */
export function AttentionTag({ children }: AttentionTagProps) {
  return (
    <span className="radius-control inline-flex h-6 shrink-0 items-center whitespace-nowrap bg-amber-500/12 px-2 align-middle text-amber-800 text-xs dark:bg-amber-400/15 dark:text-amber-200">
      {children}
    </span>
  );
}

interface PickTagsProps {
  addition: GetAssignmentProposal200AdditionsItem;
  ordinal: number | undefined;
  heavyLoad: number;
}

export function PickTags({ addition, ordinal, heavyLoad }: PickTagsProps) {
  const onlyOption = addition.reason.needCandidateCount === 1;
  const loaded = ordinal !== undefined && ordinal >= heavyLoad;
  if (!(onlyOption || loaded)) return null;
  return (
    <span className="flex items-center gap-1.5">
      {onlyOption && (
        <AttentionTag>{m.builder_proposal_only_option()}</AttentionTag>
      )}
      {loaded && (
        <AttentionTag>{m.builder_proposal_tag_load({ ordinal })}</AttentionTag>
      )}
    </span>
  );
}

interface ReasonLinesInput {
  reason: GetAssignmentProposal200AdditionsItemReason;
  ordinal: number | undefined;
  heavyLoad: number;
}

function reasonLines({
  reason: { eligibleShiftCount, needCandidateCount, decidedBy },
  ordinal,
  heavyLoad,
}: ReasonLinesInput): string[] {
  return [
    needCandidateCount === 1
      ? m.builder_proposal_reason_need_one()
      : m.builder_proposal_reason_need_many({ count: needCandidateCount }),
    eligibleShiftCount === 1
      ? m.builder_proposal_reason_shifts_one()
      : m.builder_proposal_reason_shifts_many({ count: eligibleShiftCount }),
    ...(decidedBy === 'fewest_eligible_shifts'
      ? [m.builder_proposal_reason_scarcity()]
      : decidedBy === 'fewest_cycle_assignments'
        ? [m.builder_proposal_reason_workload()]
        : []),
    ...(ordinal !== undefined && ordinal >= heavyLoad
      ? [m.builder_proposal_reason_load({ ordinal })]
      : []),
  ];
}

/** One roving tab stop in a grid of row controls. */
export interface RovingProps {
  tabIndex: number;
  'data-roving': string;
  onFocus: () => void;
}

interface ShortReasonInput {
  reason: GetAssignmentProposal200AdditionsItemReason;
}

/** The deciding rule in a few words, for the row itself. */
export function shortReason({ reason }: ShortReasonInput): string {
  if (reason.decidedBy === 'only_candidate')
    return m.builder_proposal_reason_short_only();
  if (reason.decidedBy === 'fewest_eligible_shifts')
    return m.builder_proposal_reason_short_scarcity();
  if (reason.decidedBy === 'fewest_cycle_assignments')
    return m.builder_proposal_reason_short_workload();
  return m.builder_proposal_reason_short_options({
    count: reason.needCandidateCount,
  });
}

interface ReasonPopoverProps extends ReasonLinesInput {
  name: string;
  roving?: RovingProps;
}

/** The full reason on click (never hover-only), so the row keeps one line. */
export function ReasonPopover({ name, roving, ...input }: ReasonPopoverProps) {
  const touch = useFormControlSize() === 'touch';
  const label = m.builder_proposal_why_for({ name });
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size={touch ? 'icon-touch' : 'icon-sm'}
            aria-label={label}
            className="text-muted-foreground hover:text-foreground"
            {...roving}
          />
        }
      >
        <Info />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-2 p-3 text-sm">
        <PopoverTitle className="font-semibold text-sm">{label}</PopoverTitle>
        <ul className="list-disc space-y-1 ps-4 text-sm/relaxed">
          {reasonLines(input).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
