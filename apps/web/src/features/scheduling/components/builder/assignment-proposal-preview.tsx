import { m } from '@church/i18n/messages';
import {
  type CycleBuilderData,
  isActiveAssignment,
} from '../../hooks/use-cycle-builder';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  GetAssignmentProposal200,
  GetAssignmentProposal200AdditionsItem,
  GetAssignmentProposal200AdditionsItemReason,
} from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatDayOf, formatInstantRangeOf } from '@/shared/utils/church-time';

export type AssignmentProposal = GetAssignmentProposal200;

/** `unknown`: the request failed without an answer, so it may have committed. */
export type ProposalApplyState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'unknown' }
  | { status: 'refused'; message: string };

interface AssignmentProposalPreviewProps {
  data: CycleBuilderData;
  proposal: AssignmentProposal;
  applyState: ProposalApplyState;
  onApply: (proposal: AssignmentProposal) => void;
  onReviewNew: () => void;
  onDiscard: () => void;
}

interface ApplyActionProps {
  proposal: AssignmentProposal;
  applyState: ProposalApplyState;
  onApply: (proposal: AssignmentProposal) => void;
  onReviewNew: () => void;
}

function ApplyAction({
  proposal,
  applyState,
  onApply,
  onReviewNew,
}: ApplyActionProps) {
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
      disabled={status === 'pending'}
      onClick={() => onApply(proposal)}
    >
      {status === 'pending'
        ? m.builder_proposal_applying()
        : status === 'unknown'
          ? m.builder_proposal_apply_retry()
          : m.builder_proposal_apply()}
    </Button>
  );
}

interface ExistingAssignee {
  assignmentId: string;
  name: string;
}

interface ProposalNeedRow {
  requirementId: string;
  label: string;
  existing: ExistingAssignee[];
  additions: GetAssignmentProposal200AdditionsItem[];
  remaining: number;
}

interface ProposalShiftGroup {
  shiftId: string;
  eventTitle: string;
  startTime: string;
  endTime: string;
  needs: ProposalNeedRow[];
}

interface GroupProposalInput {
  data: CycleBuilderData;
  proposal: AssignmentProposal;
}

/** Board order (Event → time block → Shift); only needs the proposal touches. */
function groupProposalByShift({
  data,
  proposal,
}: GroupProposalInput): ProposalShiftGroup[] {
  const roleNames = new Map(data.roles.map(({ id, name }) => [id, name]));
  const remainingByNeed = new Map(
    proposal.gaps.map(({ shiftRequirementId, remaining }) => [
      shiftRequirementId,
      remaining,
    ]),
  );
  return data.events.flatMap((event) =>
    event.eventTimeBlocks.flatMap(({ shifts }) =>
      shifts.flatMap((shift) => {
        const needs = shift.requirements.flatMap((requirement) => {
          const additions = proposal.additions.filter(
            ({ shiftRequirementId }) => shiftRequirementId === requirement.id,
          );
          const remaining = remainingByNeed.get(requirement.id) ?? 0;
          if (additions.length === 0 && remaining === 0) return [];
          const existing = shift.assignments
            .filter(
              (assignment) =>
                assignment.shiftRequirementId === requirement.id &&
                isActiveAssignment(assignment),
            )
            .map(({ id, volunteerName }) => ({
              assignmentId: id,
              name: volunteerName ?? m.builder_ui_the_volunteer(),
            }));
          const roleName = roleNames.get(requirement.roleId) ?? '';
          return [
            {
              requirementId: requirement.id,
              label: `${roleName} · ${requirement.sectorName}`,
              existing,
              additions,
              remaining,
            },
          ];
        });
        if (needs.length === 0) return [];
        return [
          {
            shiftId: shift.shiftId,
            eventTitle: event.title,
            startTime: shift.startTime,
            endTime: shift.endTime,
            needs,
          },
        ];
      }),
    ),
  );
}

function reasonText({
  eligibleShiftCount,
  needCandidateCount,
  decidedBy,
}: GetAssignmentProposal200AdditionsItemReason): string {
  const parts = [
    eligibleShiftCount === 1
      ? m.builder_proposal_reason_shifts_one()
      : m.builder_proposal_reason_shifts_many({ count: eligibleShiftCount }),
    needCandidateCount === 1
      ? m.builder_proposal_reason_need_one()
      : m.builder_proposal_reason_need_many({ count: needCandidateCount }),
  ];
  if (decidedBy === 'fewest_cycle_assignments')
    parts.push(m.builder_proposal_reason_workload());
  if (decidedBy === 'stable_order')
    parts.push(m.builder_proposal_reason_stable());
  return parts.join(' · ');
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
  const groups = groupProposalByShift({ data, proposal });
  const additionDays = new Map<string, ProposalShiftGroup[]>();
  for (const group of [...groups].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  )) {
    if (!group.needs.some((need) => need.additions.length > 0)) continue;
    const day = formatDayOf({ value: group.startTime, timeZone });
    const dayGroups = additionDays.get(day) ?? [];
    dayGroups.push(group);
    additionDays.set(day, dayGroups);
  }
  const openPlaces = proposal.gaps.reduce(
    (total, { remaining }) => total + remaining,
    0,
  );
  const { excludedUnconfirmedCount } = proposal;
  const emptyText = emptyReasonText(proposal);
  const isApplying = applyState.status === 'pending';
  const applyAlert =
    applyState.status === 'refused'
      ? applyState.message
      : applyState.status === 'unknown'
        ? m.builder_proposal_apply_unknown()
        : null;

  return (
    <ResponsiveFormSurface
      open
      onOpenChange={(open) => !(open || isApplying) && onDiscard()}
      title={m.builder_proposal_title()}
      description={m.builder_proposal_description()}
      reviewBodyLabel={m.builder_proposal_list_label()}
      reviewSummary={
        <div className="mt-2 space-y-1 text-sm">
          <p className="font-medium">
            {m.builder_proposal_summary({
              additions: proposal.additions.length,
              places: openPlaces,
            })}
          </p>
          <p className="text-muted-foreground">
            {excludedUnconfirmedCount === 1
              ? m.builder_proposal_unconfirmed_one()
              : m.builder_proposal_unconfirmed_many({
                  count: excludedUnconfirmedCount,
                })}
          </p>
        </div>
      }
      footer={
        <>
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
          />
        </>
      }
    >
      <div className="space-y-4" data-testid="assignment-proposal-preview">
        {applyAlert ? (
          <p role="alert" className="text-destructive text-sm">
            {applyAlert}
          </p>
        ) : null}
        {emptyText ? <p className="font-medium text-sm">{emptyText}</p> : null}
        {groups.length > 0 ? (
          <ul
            aria-label={m.builder_proposal_list_label()}
            className="space-y-3"
          >
            {[...additionDays].map(([day, dayGroups]) => (
              <li key={day} className="space-y-2">
                <h3 className="font-medium text-sm">{day}</h3>
                <ul className="space-y-3">
                  {dayGroups.map((group) => (
                    <li
                      key={group.shiftId}
                      className="radius-surface space-y-2 border border-border/70 p-3"
                    >
                      <p className="text-sm">
                        <span className="font-medium">{group.eventTitle}</span>
                        <span className="block text-muted-foreground text-xs">
                          {formatInstantRangeOf({
                            start: group.startTime,
                            end: group.endTime,
                            timeZone,
                          })}
                        </span>
                      </p>
                      {group.needs
                        .filter((need) => need.additions.length > 0)
                        .map((need) => (
                          <div key={need.requirementId} className="space-y-1">
                            <p className="font-medium text-xs">{need.label}</p>
                            <ul className="space-y-1">
                              {need.additions.map((addition) => (
                                <li
                                  key={addition.volunteerId}
                                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                                >
                                  <Badge variant="secondary">
                                    {m.builder_proposal_added()}
                                  </Badge>
                                  <span className="font-medium">
                                    {addition.volunteerName}
                                  </span>
                                  <span className="w-full text-muted-foreground text-xs">
                                    {reasonText(addition.reason)}
                                  </span>
                                </li>
                              ))}
                              {need.existing.map(({ assignmentId, name }) => (
                                <li
                                  key={assignmentId}
                                  className="flex flex-wrap items-center gap-2 text-sm"
                                >
                                  <Badge variant="outline">
                                    {m.builder_proposal_existing()}
                                  </Badge>
                                  <span>{name}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}
        {openPlaces > 0 ? (
          <section
            className="space-y-2"
            aria-label={m.builder_proposal_still_open()}
          >
            <h3 className="font-medium text-sm">
              {m.builder_proposal_still_open()}
            </h3>
            <ul className="divide-y divide-border/70">
              {groups
                .filter((group) =>
                  group.needs.some((need) => need.remaining > 0),
                )
                .map((group) => {
                  const remaining = group.needs.reduce(
                    (total, need) => total + need.remaining,
                    0,
                  );
                  return (
                    <li key={group.shiftId} className="py-2 text-sm">
                      <span className="font-medium">{group.eventTitle}</span>
                      {' · '}
                      {formatInstantRangeOf({
                        start: group.startTime,
                        end: group.endTime,
                        timeZone,
                      })}
                      {' · '}
                      <span className="text-muted-foreground">
                        {remaining === 1
                          ? m.builder_proposal_gap_one()
                          : m.builder_proposal_gap_many({ count: remaining })}
                      </span>
                      {group.needs.flatMap((need) => need.existing).length >
                      0 ? (
                        <span className="block text-muted-foreground text-xs">
                          {m.builder_proposal_existing()}:{' '}
                          {group.needs
                            .flatMap((need) => need.existing)
                            .map(({ name }) => name)
                            .join(', ')}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          </section>
        ) : null}
      </div>
    </ResponsiveFormSurface>
  );
}
