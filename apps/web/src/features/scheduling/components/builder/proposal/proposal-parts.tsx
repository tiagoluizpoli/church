import { m } from '@church/i18n/messages';
import { Info, TriangleAlert } from 'lucide-react';
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

/** The Staffing Meter read as a change: the darker part is already on the
 * board, the brighter part is what applying would add. Coloured by the
 * result; both parts keep 3:1 against the track. */
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
            'absolute inset-y-0 left-0 brightness-90 transition-[width] duration-300 ease-out dark:brightness-125',
            status.bar,
          )}
          style={{ width: `${afterPercent}%` }}
        />
        <span
          className={cn(
            'absolute inset-y-0 left-0 brightness-[0.7] dark:brightness-100',
            status.bar,
          )}
          style={{ width: `${beforePercent}%` }}
        />
      </span>
    </span>
  );
}

interface AttentionTagProps {
  /** Twice the usual load: louder, with an icon, so it can't blend in. */
  strong?: boolean;
  children: ReactNode;
}

/** Needs-attention amber (DESIGN.md): a pick worth a second look. */
export function AttentionTag({ strong = false, children }: AttentionTagProps) {
  return (
    <span
      className={cn(
        'radius-control inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap px-2 align-middle text-xs',
        strong
          ? 'bg-amber-500/25 font-semibold text-amber-900 ring-1 ring-amber-600/50 ring-inset dark:bg-amber-400/25 dark:text-amber-100'
          : 'bg-amber-500/12 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200',
      )}
    >
      {strong && <TriangleAlert aria-hidden className="size-3.5" />}
      {children}
    </span>
  );
}

interface LoadTagProps {
  /** Everything the volunteer would serve in this Schedule. */
  total: number;
  severeLoad: number;
}

/** One load wording everywhere: rows, the volunteers tab and the legend. */
export function LoadTag({ total, severeLoad }: LoadTagProps) {
  return (
    <AttentionTag strong={total >= severeLoad}>
      {m.builder_proposal_tag_total({ count: total })}
    </AttentionTag>
  );
}

interface InformativeReasonInput {
  reason: GetAssignmentProposal200AdditionsItemReason;
}

/** The reason in a few words, only when it tells the leader something:
 * the person can serve almost nowhere else. */
function informativeReason({
  reason: { eligibleShiftCount },
}: InformativeReasonInput): string | null {
  if (eligibleShiftCount === 1)
    return m.builder_proposal_reason_short_one_shift();
  if (eligibleShiftCount === 2)
    return m.builder_proposal_reason_short_few_shifts({ count: 2 });
  return null;
}

interface PickNotesProps {
  addition: GetAssignmentProposal200AdditionsItem;
  ordinal: number | undefined;
  total: number;
  heavyLoad: number;
  severeLoad: number;
}

/** What is worth a look about a pick, in one cell: the amber tags, then a
 * short reason when it is informative. */
export function PickNotes({
  addition,
  ordinal,
  total,
  heavyLoad,
  severeLoad,
}: PickNotesProps) {
  const onlyOption = addition.reason.needCandidateCount === 1;
  const loaded = ordinal !== undefined && ordinal >= heavyLoad;
  const reason = informativeReason(addition);
  if (!(onlyOption || loaded || reason)) return null;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {onlyOption && (
        <AttentionTag>{m.builder_proposal_only_option()}</AttentionTag>
      )}
      {loaded && <LoadTag total={total} severeLoad={severeLoad} />}
      {reason && (
        <span className="truncate text-muted-foreground">{reason}</span>
      )}
    </span>
  );
}

interface ReasonLinesInput {
  reason: GetAssignmentProposal200AdditionsItemReason;
  ordinal: number | undefined;
  total: number;
  heavyLoad: number;
}

function reasonLines({
  reason: { eligibleShiftCount, needCandidateCount, decidedBy },
  ordinal,
  total,
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
      ? [m.builder_proposal_reason_load({ ordinal, total })]
      : []),
  ];
}

/** One roving tab stop in a grid of row controls. */
export interface RovingProps {
  tabIndex: number;
  'data-roving': string;
  onFocus: () => void;
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
            size={touch ? 'icon-touch' : 'icon'}
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
