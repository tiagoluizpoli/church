import { m } from '@church/i18n/messages';
import { useState } from 'react';
import {
  type CycleBuilderData,
  isActiveAssignment,
} from '../../hooks/use-cycle-builder';
import { staffingStatusClasses } from '../../utils/builder/cycle-builder-staffing.utils';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  GetAssignmentProposal200,
  GetAssignmentProposal200AdditionsItem,
  GetAssignmentProposal200AdditionsItemReason,
} from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import {
  formatDayOf,
  formatInstantRangeOf,
  formatTimeOf,
} from '@/shared/utils/church-time';

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
  selectedCount: number;
}

function ApplyAction({
  proposal,
  applyState,
  onApply,
  onReviewNew,
  selectedCount,
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
      disabled={
        status === 'pending' || selectedCount !== proposal.additions.length
      }
      onClick={() => onApply(proposal)}
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
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const keyOf = (addition: GetAssignmentProposal200AdditionsItem) =>
    `${addition.shiftRequirementId}:${addition.volunteerId}`;
  const toggle = (addition: GetAssignmentProposal200AdditionsItem) => {
    setExcluded((previous) => {
      const next = new Set(previous);
      const key = keyOf(addition);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const groups = groupProposalByShift({ data, proposal });
  const days = new Map<string, ProposalShiftGroup[]>();
  for (const group of [...groups].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  )) {
    const day = formatDayOf({ value: group.startTime, timeZone });
    days.set(day, [...(days.get(day) ?? []), group]);
  }
  const volunteers = new Map<string, GetAssignmentProposal200AdditionsItem[]>();
  for (const addition of proposal.additions) {
    volunteers.set(addition.volunteerId, [
      ...(volunteers.get(addition.volunteerId) ?? []),
      addition,
    ]);
  }
  const openPlaces = proposal.gaps.reduce(
    (total, { remaining }) => total + remaining,
    0,
  );
  const emptyText = emptyReasonText(proposal);
  const isApplying = applyState.status === 'pending';
  const locked = isApplying || applyState.status === 'unknown';
  const applyAlert =
    applyState.status === 'refused'
      ? applyState.message
      : applyState.status === 'unknown'
        ? m.builder_proposal_apply_unknown()
        : null;
  const selectedCount = proposal.additions.length - excluded.size;
  const range = (group: ProposalShiftGroup) =>
    formatInstantRangeOf({
      start: group.startTime,
      end: group.endTime,
      timeZone,
    });

  return (
    <ResponsiveFormSurface
      open
      wide
      closeDisabled={isApplying}
      onOpenChange={(open) => !(open || isApplying) && onDiscard()}
      title={m.builder_proposal_title()}
      description={m.builder_proposal_description()}
      reviewSummary={
        <div className="mt-2 space-y-1 text-sm">
          {!emptyText && (
            <p className="font-medium">
              {m.builder_proposal_summary({
                additions: proposal.additions.length,
                places: openPlaces,
              })}
            </p>
          )}
          <p>{m.builder_proposal_rule()}</p>
          <p className="text-muted-foreground">
            {proposal.excludedUnconfirmedCount === 1
              ? m.builder_proposal_unconfirmed_one()
              : m.builder_proposal_unconfirmed_many({
                  count: proposal.excludedUnconfirmedCount,
                })}
          </p>
          {applyAlert && (
            <p role="alert" className="text-destructive">
              {applyAlert}
            </p>
          )}
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
            selectedCount={selectedCount}
          />
        </>
      }
    >
      <div
        data-testid="assignment-proposal-preview"
        className="space-y-4 text-sm"
      >
        {emptyText && <p className="font-medium">{emptyText}</p>}
        {groups.length > 0 && (
          <Tabs defaultValue={proposal.additions.length ? 'shifts' : 'gaps'}>
            <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1">
              <TabsTrigger className="min-h-11 px-3 text-sm" value="shifts">
                {m.builder_proposal_tab_shifts()}
              </TabsTrigger>
              <TabsTrigger className="min-h-11 px-3 text-sm" value="volunteers">
                {m.builder_proposal_tab_volunteers()}
              </TabsTrigger>
              <TabsTrigger className="min-h-11 px-3 text-sm" value="gaps">
                {m.builder_proposal_tab_gaps({ count: openPlaces })}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="shifts" className="text-sm">
              {[...days]
                .filter(([, dayGroups]) =>
                  dayGroups.some((group) =>
                    group.needs.some((need) => need.additions.length > 0),
                  ),
                )
                .map(([day, dayGroups]) => {
                  const needs = dayGroups.flatMap((group) => group.needs);
                  const before = needs.reduce(
                    (sum, need) => sum + need.existing.length,
                    0,
                  );
                  const added = needs
                    .flatMap((need) => need.additions)
                    .filter((item) => !excluded.has(keyOf(item))).length;
                  const total =
                    before +
                    needs.reduce(
                      (sum, need) =>
                        sum + need.additions.length + need.remaining,
                      0,
                    );
                  const percent = total
                    ? Math.round(((before + added) / total) * 100)
                    : 0;
                  const status = staffingStatusClasses({
                    percent,
                    hasRequirement: total > 0,
                  });
                  return (
                    <details key={day} open className="border-b py-3">
                      <summary className="cursor-pointer font-medium">
                        {day} ·{' '}
                        {m.builder_proposal_day_count({
                          count: needs.reduce(
                            (sum, need) => sum + need.additions.length,
                            0,
                          ),
                        })}
                      </summary>
                      <div className="my-2 flex max-w-md items-center gap-3 text-muted-foreground">
                        <span>
                          {before}/{total} → {before + added}/{total}
                        </span>
                        <span className="h-1 flex-1 bg-muted">
                          <span
                            className={`block h-full ${status.bar}`}
                            style={{ width: `${percent}%` }}
                          />
                        </span>
                      </div>
                      {dayGroups.map((group) => (
                        <section key={group.shiftId} className="py-2">
                          <h3 className="font-medium">
                            {formatTimeOf({ value: group.startTime, timeZone })}{' '}
                            – {formatTimeOf({ value: group.endTime, timeZone })}{' '}
                            · {group.eventTitle}
                          </h3>
                          {group.needs.map((need) => (
                            <div
                              key={need.requirementId}
                              className="border-border/50 border-b last:border-0"
                            >
                              <h4 className="sr-only">{need.label}</h4>
                              {need.existing.map(({ assignmentId, name }) => (
                                <div
                                  key={assignmentId}
                                  className="grid gap-1 py-2 text-muted-foreground md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto] md:items-center"
                                >
                                  <span>{need.label}</span>
                                  <span>{name}</span>
                                  <span>{m.builder_proposal_existing()}</span>
                                </div>
                              ))}
                              {need.additions.map((addition) => (
                                <div
                                  key={keyOf(addition)}
                                  className="grid gap-1 py-2 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto_auto] md:items-center md:gap-4"
                                >
                                  <span>{need.label}</span>
                                  <span className="font-medium">
                                    {addition.volunteerName}
                                  </span>
                                  <details>
                                    <summary className="cursor-pointer">
                                      {addition.reason.needCandidateCount === 1
                                        ? m.builder_proposal_only_option()
                                        : m.builder_proposal_why()}
                                    </summary>
                                    <p className="text-muted-foreground">
                                      {reasonText(addition.reason)}
                                    </p>
                                  </details>
                                  <label
                                    htmlFor={keyOf(addition)}
                                    className="flex min-h-11 items-center gap-3 md:min-h-0"
                                  >
                                    <Checkbox
                                      id={keyOf(addition)}
                                      checked={!excluded.has(keyOf(addition))}
                                      disabled={locked}
                                      onCheckedChange={() => toggle(addition)}
                                    />
                                    <span>
                                      {m.builder_proposal_include({
                                        name: addition.volunteerName,
                                      })}
                                    </span>
                                  </label>
                                </div>
                              ))}
                            </div>
                          ))}
                        </section>
                      ))}
                    </details>
                  );
                })}
            </TabsContent>
            <TabsContent value="volunteers" className="divide-y text-sm">
              {[...volunteers.values()]
                .sort((a, b) => b.length - a.length)
                .map((items) => (
                  <section
                    key={items[0].volunteerId}
                    className="flex flex-wrap items-center gap-3 py-3"
                  >
                    <h3 className="font-medium">{items[0].volunteerName}</h3>
                    <span>
                      {m.builder_proposal_day_count({ count: items.length })}
                    </span>
                    <div className="flex flex-1 flex-wrap gap-2">
                      {items.map((item) => {
                        const group = groups.find(
                          (entry) => entry.shiftId === item.shiftId,
                        );
                        return group ? (
                          <span
                            key={keyOf(item)}
                            className="radius-control bg-muted px-2 py-1"
                          >
                            {formatDayOf({ value: group.startTime, timeZone })}{' '}
                            · {range(group)}
                          </span>
                        ) : null;
                      })}
                    </div>
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() =>
                        setExcluded(
                          (previous) =>
                            new Set([...previous, ...items.map(keyOf)]),
                        )
                      }
                    >
                      {m.builder_proposal_exclude_volunteer({
                        name: items[0].volunteerName,
                      })}
                    </Button>
                  </section>
                ))}
            </TabsContent>
            <TabsContent value="gaps" className="divide-y text-sm">
              {groups
                .filter((group) =>
                  group.needs.some((need) => need.remaining > 0),
                )
                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                .map((group) => (
                  <section key={group.shiftId} className="py-3">
                    <h3 className="font-medium">
                      {formatDayOf({ value: group.startTime, timeZone })} ·{' '}
                      {range(group)} · {group.eventTitle}
                    </h3>
                    {group.needs
                      .filter((need) => need.remaining > 0)
                      .map((need) => (
                        <p key={need.requirementId}>
                          {need.label} ·{' '}
                          {need.remaining === 1
                            ? m.builder_proposal_gap_one()
                            : m.builder_proposal_gap_many({
                                count: need.remaining,
                              })}
                        </p>
                      ))}
                  </section>
                ))}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </ResponsiveFormSurface>
  );
}
