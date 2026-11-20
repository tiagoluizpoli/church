import { m } from '@church/i18n/messages';
import { useState } from 'react';
import type { CycleBuilderData } from '../../hooks/use-cycle-builder';
import {
  coverageOf,
  groupProposalByDay,
  includedShifts,
  proposalAdditionKey,
  scheduleOrdinals,
} from '../../utils/builder/assignment-proposal.utils';
import { AttentionTag, CoverageMeter } from './proposal/proposal-parts';
import { ProposalShiftTable } from './proposal/proposal-shift-table';
import {
  ProposalGapTable,
  type ProposalVolunteerGroup,
  ProposalVolunteerTable,
  type SetIncludedInput,
} from './proposal/proposal-side-views';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  GetAssignmentProposal200,
  GetAssignmentProposal200AdditionsItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';

export type AssignmentProposal = GetAssignmentProposal200;
type Addition = GetAssignmentProposal200AdditionsItem;

/** `unknown`: the request failed without an answer, so it may have committed. */
export type ProposalApplyState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'unknown' }
  | { status: 'refused'; message: string };

/** The reviewed proposal and the picks left out of it. */
export interface ProposalSelection {
  proposal: AssignmentProposal;
  excluded: Addition[];
}

interface AssignmentProposalPreviewProps {
  data: CycleBuilderData;
  proposal: AssignmentProposal;
  applyState: ProposalApplyState;
  onApply: (selection: ProposalSelection) => void;
  onReviewNew: () => void;
  onDiscard: () => void;
}

interface ApplyActionProps {
  proposal: AssignmentProposal;
  excluded: Addition[];
  applyState: ProposalApplyState;
  onApply: (selection: ProposalSelection) => void;
  onReviewNew: () => void;
}

function ApplyAction({
  proposal,
  excluded,
  applyState,
  onApply,
  onReviewNew,
}: ApplyActionProps) {
  const selectedCount = proposal.additions.length - excluded.length;
  const { status } = applyState;
  if (proposal.additions.length === 0) return null;
  if (status === 'refused')
    return (
      <Button size="touch" onClick={onReviewNew}>
        {m.builder_proposal_refresh()}
      </Button>
    );
  return (
    <Button
      size="touch"
      disabled={status === 'pending' || selectedCount === 0}
      onClick={() => onApply({ proposal, excluded })}
    >
      {status === 'pending'
        ? m.builder_proposal_applying()
        : status === 'unknown'
          ? m.builder_proposal_apply_retry()
          : m.builder_proposal_apply_count({
              selected: selectedCount,
              total: proposal.additions.length,
            })}
    </Button>
  );
}

interface EmptyReasonInput {
  emptyReason: AssignmentProposal['emptyReason'];
}

function emptyReasonText({ emptyReason }: EmptyReasonInput): string | null {
  if (emptyReason === 'no_open_needs')
    return m.builder_proposal_empty_no_open_needs();
  if (emptyReason === 'no_confirmed_responses')
    return m.builder_proposal_empty_no_confirmed();
  if (emptyReason === 'no_eligible_placements')
    return m.builder_proposal_empty_no_eligible();
  return null;
}

interface VolunteerGroupsInput {
  additions: readonly Addition[];
}

/** Busiest first; equal loads by name, so the order never shuffles. */
function volunteerGroups({
  additions,
}: VolunteerGroupsInput): ProposalVolunteerGroup[] {
  const groups = new Map<string, ProposalVolunteerGroup>();
  for (const addition of additions) {
    const group = groups.get(addition.volunteerId) ?? {
      volunteerId: addition.volunteerId,
      name: addition.volunteerName,
      additions: [],
    };
    group.additions.push(addition);
    groups.set(addition.volunteerId, group);
  }
  return [...groups.values()].sort(
    (left, right) =>
      right.additions.length - left.additions.length ||
      left.name.localeCompare(right.name),
  );
}

interface ProposalRuleProps {
  heavyLoad: number;
}

function ProposalRule({ heavyLoad }: ProposalRuleProps) {
  return (
    <div className="space-y-1.5 text-muted-foreground text-sm">
      <p>{m.builder_proposal_rule()}</p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <AttentionTag>{m.builder_proposal_only_option()}</AttentionTag>
        <span className="me-3">{m.builder_proposal_legend_only()}</span>
        <AttentionTag>
          {m.builder_proposal_tag_load({ ordinal: heavyLoad })}
        </AttentionTag>
        <span>{m.builder_proposal_legend_load({ count: heavyLoad })}</span>
      </p>
    </div>
  );
}

/**
 * Review of a proposal. Only Apply writes: exactly these additions, once
 * (ADR 0013). A refusal asks for a fresh review; an unanswered attempt is
 * retried with the same key so its committed outcome is recovered.
 */
export function AssignmentProposalPreview({
  data,
  proposal,
  applyState,
  onApply,
  onReviewNew,
  onDiscard,
}: AssignmentProposalPreviewProps) {
  const { churchTimezone: timeZone } = useTimezone();
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [tab, setTab] = useState(
    proposal.additions.length > 0 ? 'shifts' : 'gaps',
  );
  const setIncluded = ({ additions, include }: SetIncludedInput) =>
    setExcluded((previous) => {
      const next = new Set(previous);
      for (const addition of additions) {
        const key = proposalAdditionKey(addition);
        if (include) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  const toggle = (addition: Addition) =>
    setIncluded({
      additions: [addition],
      include: excluded.has(proposalAdditionKey(addition)),
    });

  const included = proposal.additions.filter(
    (addition) => !excluded.has(proposalAdditionKey(addition)),
  );
  const days = groupProposalByDay({ data, proposal, timeZone });
  const { ordinals, heavyLoad } = scheduleOrdinals({
    data,
    additions: included,
  });
  const coverage = coverageOf({
    shifts: includedShifts({ data }),
    additions: included,
  });
  const openPlaces =
    proposal.gaps.reduce((total, { remaining }) => total + remaining, 0) +
    excluded.size;
  const emptyText = emptyReasonText(proposal);
  const isApplying = applyState.status === 'pending';
  const locked = isApplying || applyState.status === 'unknown';
  const applyAlert =
    applyState.status === 'refused'
      ? applyState.message
      : applyState.status === 'unknown'
        ? m.builder_proposal_apply_unknown()
        : null;
  const hasAdditions = proposal.additions.length > 0;

  return (
    <Tabs value={tab} onValueChange={setTab} className="contents">
      <ResponsiveFormSurface
        open
        wide
        closeDisabled={isApplying}
        onOpenChange={(open) => !(open || isApplying) && onDiscard()}
        title={m.builder_proposal_title()}
        description={m.builder_proposal_description()}
        reviewBodyLabel={m.builder_proposal_list_label()}
        reviewSummary={
          <div className="mt-3 space-y-4">
            <div className="grid gap-x-12 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] md:items-start">
              <div className="space-y-2">
                <p className="text-foreground text-sm">
                  {hasAdditions && (
                    <>
                      <strong className="font-semibold">
                        {proposal.additions.length === 1
                          ? m.builder_proposal_stat_additions_one()
                          : m.builder_proposal_stat_additions_many({
                              count: proposal.additions.length,
                            })}
                      </strong>
                      {openPlaces > 0 && (
                        <>
                          <span aria-hidden className="text-muted-foreground">
                            {' · '}
                          </span>
                          {openPlaces === 1
                            ? m.builder_proposal_gap_one()
                            : m.builder_proposal_gap_many({
                                count: openPlaces,
                              })}
                        </>
                      )}
                      <span aria-hidden className="text-muted-foreground">
                        {' · '}
                      </span>
                    </>
                  )}
                  <span className="text-muted-foreground">
                    {proposal.excludedUnconfirmedCount === 1
                      ? m.builder_proposal_unconfirmed_one()
                      : m.builder_proposal_unconfirmed_many({
                          count: proposal.excludedUnconfirmedCount,
                        })}
                  </span>
                </p>
                {hasAdditions && (
                  <div className="max-md:hidden">
                    <ProposalRule heavyLoad={heavyLoad} />
                  </div>
                )}
              </div>
              {coverage.required > 0 && (
                <div className="space-y-1.5">
                  <p className="text-muted-foreground text-xs">
                    {m.builder_proposal_coverage_label()}
                  </p>
                  <CoverageMeter coverage={coverage} />
                </div>
              )}
            </div>
            {days.length > 0 && (
              <TabsList
                variant="line"
                className="h-auto max-w-full justify-start gap-4 overflow-x-auto p-0"
              >
                <TabsTrigger
                  className="h-10 flex-none px-0 text-sm"
                  value="shifts"
                >
                  {m.builder_proposal_tab_shifts()}
                </TabsTrigger>
                {hasAdditions && (
                  <TabsTrigger
                    className="h-10 flex-none px-0 text-sm"
                    value="volunteers"
                  >
                    {m.builder_proposal_tab_volunteers()}
                  </TabsTrigger>
                )}
                <TabsTrigger
                  className="h-10 flex-none px-0 text-sm"
                  value="gaps"
                >
                  {m.builder_proposal_tab_gaps({ count: openPlaces })}
                </TabsTrigger>
              </TabsList>
            )}
          </div>
        }
        footer={
          <>
            {applyAlert && (
              <p
                role="alert"
                className="text-destructive text-sm sm:mr-auto sm:self-center"
              >
                {applyAlert}
              </p>
            )}
            <Button
              variant="outline"
              size="touch"
              disabled={isApplying}
              onClick={onDiscard}
            >
              {m.builder_proposal_discard()}
            </Button>
            <ApplyAction
              proposal={proposal}
              applyState={applyState}
              onApply={onApply}
              onReviewNew={onReviewNew}
              excluded={proposal.additions.filter((addition) =>
                excluded.has(proposalAdditionKey(addition)),
              )}
            />
          </>
        }
      >
        <div data-testid="assignment-proposal-preview" className="text-sm">
          {emptyText && <p className="py-4 font-semibold">{emptyText}</p>}
          {hasAdditions && (
            <div className="border-b py-3 md:hidden">
              <ProposalRule heavyLoad={heavyLoad} />
            </div>
          )}
          {days.length > 0 && (
            <>
              <TabsContent value="shifts" className="text-sm">
                <ProposalShiftTable
                  days={days}
                  included={included}
                  excluded={excluded}
                  ordinals={ordinals}
                  heavyLoad={heavyLoad}
                  locked={locked}
                  timeZone={timeZone}
                  onToggle={toggle}
                />
              </TabsContent>
              <TabsContent value="volunteers" className="text-sm">
                <ProposalVolunteerTable
                  groups={volunteerGroups(proposal)}
                  days={days}
                  excluded={excluded}
                  locked={locked}
                  timeZone={timeZone}
                  onSetIncluded={setIncluded}
                />
              </TabsContent>
              <TabsContent value="gaps" className="pt-3 text-sm">
                <ProposalGapTable
                  days={days}
                  excluded={excluded}
                  timeZone={timeZone}
                />
              </TabsContent>
            </>
          )}
        </div>
      </ResponsiveFormSurface>
    </Tabs>
  );
}
