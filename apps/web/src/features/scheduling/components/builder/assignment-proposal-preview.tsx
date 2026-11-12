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
import { formatInstantRangeOf } from '@/shared/utils/church-time';

export type AssignmentProposal = GetAssignmentProposal200;

interface AssignmentProposalPreviewProps {
  data: CycleBuilderData;
  proposal: AssignmentProposal;
  onDiscard: () => void;
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
 * Read-only review of a proposal: nothing here writes. Apply arrives with
 * safe application (#873); until then the only action is Discard.
 */
export function AssignmentProposalPreview({
  data,
  proposal,
  onDiscard,
}: AssignmentProposalPreviewProps) {
  const { churchTimezone: timeZone } = useTimezone();
  const groups = groupProposalByShift({ data, proposal });
  const openPlaces = proposal.gaps.reduce(
    (total, { remaining }) => total + remaining,
    0,
  );
  const { excludedUnconfirmedCount } = proposal;
  const emptyText = emptyReasonText(proposal);

  return (
    <ResponsiveFormSurface
      open
      onOpenChange={(open) => !open && onDiscard()}
      title={m.builder_proposal_title()}
      description={m.builder_proposal_description()}
      footer={
        <Button variant="outline" size="touch" onClick={onDiscard}>
          {m.builder_proposal_discard()}
        </Button>
      }
    >
      <div className="space-y-4" data-testid="assignment-proposal-preview">
        <div className="space-y-1 text-sm">
          {emptyText ? (
            <p className="font-medium">{emptyText}</p>
          ) : (
            <p className="font-medium">
              {m.builder_proposal_summary({
                additions: proposal.additions.length,
                places: openPlaces,
              })}
            </p>
          )}
          {excludedUnconfirmedCount > 0 ? (
            <p className="text-muted-foreground">
              {excludedUnconfirmedCount === 1
                ? m.builder_proposal_unconfirmed_one()
                : m.builder_proposal_unconfirmed_many({
                    count: excludedUnconfirmedCount,
                  })}
            </p>
          ) : null}
        </div>
        {groups.length > 0 ? (
          <ul
            aria-label={m.builder_proposal_list_label()}
            className="space-y-3"
          >
            {groups.map((group) => (
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
                {group.needs.map((need) => (
                  <div key={need.requirementId} className="space-y-1">
                    <p className="font-medium text-xs">{need.label}</p>
                    <ul className="space-y-1">
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
                    </ul>
                    {need.remaining > 0 ? (
                      <p className="text-muted-foreground text-xs">
                        {need.remaining === 1
                          ? m.builder_proposal_gap_one()
                          : m.builder_proposal_gap_many({
                              count: need.remaining,
                            })}
                      </p>
                    ) : null}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </ResponsiveFormSurface>
  );
}
