import {
  type CycleBuilderData,
  type CycleBuilderShiftSummary,
  isActiveAssignment,
  isStaffedEventTimeBlock,
} from '../../hooks/use-cycle-builder';
import { churchDayOf } from './cycle-builder-date.utils';
import { countCoveredPlaces } from './cycle-builder-staffing.utils';
import type {
  GetAssignmentProposal200,
  GetAssignmentProposal200AdditionsItem,
} from '@/infrastructure/api/churchAPI.schemas';

type ProposalAddition = GetAssignmentProposal200AdditionsItem;

/** The load tag never starts below a volunteer's 4th Assignment here. */
export const HEAVY_LOAD_ORDINAL = 4;

export function proposalAdditionKey({
  shiftRequirementId,
  volunteerId,
}: ProposalAddition): string {
  return `${shiftRequirementId}:${volunteerId}`;
}

export interface ProposalExistingAssignee {
  assignmentId: string;
  volunteerId: string;
  name?: string;
}

export interface ProposalNeed {
  requirementId: string;
  roleName: string;
  sectorName: string;
  existing: ProposalExistingAssignee[];
  additions: ProposalAddition[];
  remaining: number;
}

export interface ProposalShift {
  shiftId: string;
  eventTitle: string;
  startTime: string;
  endTime: string;
  needs: ProposalNeed[];
}

export interface ProposalDay {
  /** CalendarDay in the Church Timezone. */
  day: string;
  /** Every staffed Shift of the day: the coverage denominator. */
  dayShifts: CycleBuilderShiftSummary[];
  /** Shifts the proposal touches: additions or places still open. */
  shifts: ProposalShift[];
}

interface GroupProposalByDayInput {
  data: CycleBuilderData;
  proposal: GetAssignmentProposal200;
  timeZone: string;
}

/** Board order (Event → time block → Shift, as the server sends it), folded
 * into church days. Only staffed time blocks: the rest ask for nobody. */
export function groupProposalByDay({
  data,
  proposal,
  timeZone,
}: GroupProposalByDayInput): ProposalDay[] {
  const roleNames = new Map(data.roles.map(({ id, name }) => [id, name]));
  const remainingByNeed = new Map(
    proposal.gaps.map(({ shiftRequirementId, remaining }) => [
      shiftRequirementId,
      remaining,
    ]),
  );
  const additionsByNeed = new Map<string, ProposalAddition[]>();
  for (const addition of proposal.additions) {
    const { shiftRequirementId } = addition;
    additionsByNeed.set(shiftRequirementId, [
      ...(additionsByNeed.get(shiftRequirementId) ?? []),
      addition,
    ]);
  }
  const days = new Map<string, ProposalDay>();
  for (const event of data.events) {
    for (const block of event.eventTimeBlocks) {
      if (!isStaffedEventTimeBlock(block)) continue;
      for (const shift of block.shifts) {
        const day = churchDayOf({ value: shift.startTime, timeZone });
        const entry = days.get(day) ?? { day, dayShifts: [], shifts: [] };
        days.set(day, entry);
        entry.dayShifts.push(shift);
        const needs = shift.requirements.flatMap((requirement) => {
          const additions = additionsByNeed.get(requirement.id) ?? [];
          const remaining = remainingByNeed.get(requirement.id) ?? 0;
          if (additions.length === 0 && remaining === 0) return [];
          const existing = shift.assignments
            .filter(
              (assignment) =>
                assignment.shiftRequirementId === requirement.id &&
                isActiveAssignment(assignment),
            )
            .map(({ id, volunteerId, volunteerName }) => ({
              assignmentId: id,
              volunteerId,
              name: volunteerName,
            }));
          return [
            {
              requirementId: requirement.id,
              roleName: roleNames.get(requirement.roleId) ?? '',
              sectorName: requirement.sectorName,
              existing,
              additions,
              remaining,
            },
          ];
        });
        if (needs.length === 0) continue;
        entry.shifts.push({
          shiftId: shift.shiftId,
          eventTitle: event.title,
          startTime: shift.startTime,
          endTime: shift.endTime,
          needs,
        });
      }
    }
  }
  return [...days.values()].filter(({ shifts }) => shifts.length > 0);
}

export interface ProposalCoverage {
  required: number;
  before: number;
  after: number;
}

interface CoverageOfInput {
  shifts: readonly CycleBuilderShiftSummary[];
  /** The additions that would be written. */
  additions: readonly ProposalAddition[];
}

/** Covered places before and after the additions, capped per requirement so
 * overstaffing one Sector never fills another's places. */
export function coverageOf({
  shifts,
  additions,
}: CoverageOfInput): ProposalCoverage {
  const addedByShift = new Map<string, ProposalAddition[]>();
  for (const addition of additions) {
    addedByShift.set(addition.shiftId, [
      ...(addedByShift.get(addition.shiftId) ?? []),
      addition,
    ]);
  }
  let required = 0;
  let before = 0;
  let after = 0;
  for (const shift of shifts) {
    const added = (addedByShift.get(shift.shiftId) ?? []).map(
      ({ shiftRequirementId }) => ({ shiftRequirementId, status: 'draft' }),
    );
    required += shift.peopleNeeded;
    before += countCoveredPlaces(shift);
    after += countCoveredPlaces({
      requirements: shift.requirements,
      assignments: [...shift.assignments, ...added],
    });
  }
  return { required, before, after };
}

interface PercentOfInput {
  covered: number;
  required: number;
}

export function percentOf({ covered, required }: PercentOfInput): number {
  return required === 0 ? 0 : Math.round((covered / required) * 100);
}

interface IncludedShiftsInput {
  data: CycleBuilderData;
}

export function includedShifts({
  data,
}: IncludedShiftsInput): CycleBuilderShiftSummary[] {
  return data.events.flatMap((event) =>
    event.eventTimeBlocks.flatMap((block) =>
      isStaffedEventTimeBlock(block) ? block.shifts : [],
    ),
  );
}

interface ScheduleOrdinalsInput {
  data: CycleBuilderData;
  /** The additions that would be written. */
  additions: readonly ProposalAddition[];
}

interface DatedAssignment {
  volunteerId: string;
  startTime: string;
  additionKey?: string;
}

export interface ScheduleLoad {
  /** Addition key → its place among its volunteer's Assignments here. */
  ordinals: Map<string, number>;
  /** The ordinal from which a pick is tagged. */
  heavyLoad: number;
  /** The load from which the tag turns strong. */
  severeLoad: number;
  /** Volunteer id → everything they would serve here once applied. */
  totals: Map<string, number>;
}

/** For each addition: its place, by start time, among everything its
 * volunteer would serve in this Schedule once applied. */
export function scheduleOrdinals({
  data,
  additions,
}: ScheduleOrdinalsInput): ScheduleLoad {
  const shifts = includedShifts({ data });
  const startByShift = new Map(
    shifts.map(({ shiftId, startTime }) => [shiftId, startTime]),
  );
  const dated: DatedAssignment[] = [
    ...shifts.flatMap(({ startTime, assignments }) =>
      assignments
        .filter(isActiveAssignment)
        .map(({ volunteerId }) => ({ volunteerId, startTime })),
    ),
    ...additions.map((addition) => ({
      volunteerId: addition.volunteerId,
      startTime: startByShift.get(addition.shiftId) ?? '',
      additionKey: proposalAdditionKey(addition),
    })),
  ];
  const byVolunteer = new Map<string, DatedAssignment[]>();
  for (const entry of dated) {
    byVolunteer.set(entry.volunteerId, [
      ...(byVolunteer.get(entry.volunteerId) ?? []),
      entry,
    ]);
  }
  const ordinals = new Map<string, number>();
  for (const entries of byVolunteer.values()) {
    // ISO instants from one API compare chronologically as strings.
    entries.sort((left, right) =>
      left.startTime.localeCompare(right.startTime),
    );
    entries.forEach(({ additionKey }, index) => {
      if (additionKey) ordinals.set(additionKey, index + 1);
    });
  }
  const totals = new Map(
    [...byVolunteer].map(([volunteerId, entries]) => [
      volunteerId,
      entries.length,
    ]),
  );
  // The usual load is that of people who serve more than once: a crowd of
  // one-off helpers would otherwise drag the median to 1 and flag everyone.
  const loads = [...totals.values()].sort((left, right) => left - right);
  const regular = loads.filter((load) => load > 1);
  const usual = regular.length > 0 ? regular : loads;
  const median = usual[Math.floor((usual.length - 1) / 2)] ?? 0;
  // Only clear outliers: more than half again the usual load. A cluster
  // that serves both Sunday services every week (8x against a median of 6)
  // is the norm, not overload; 14x is.
  const heavyLoad = Math.max(HEAVY_LOAD_ORDINAL, Math.floor(median * 1.5) + 1);
  return {
    ordinals,
    heavyLoad,
    // Twice the usual load: the strong tag.
    severeLoad: Math.max(heavyLoad + 1, median * 2),
    totals,
  };
}
