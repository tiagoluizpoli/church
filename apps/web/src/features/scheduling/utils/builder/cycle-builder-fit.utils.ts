import type {
  CycleBuilderEligibleVolunteerSummary,
  CycleBuilderShiftSummary,
} from '../../hooks/use-cycle-builder';

/** A candidate's fit for a specific Shift and Role. */
export type ShiftRoleFit =
  | { tier: 'ready' }
  | { tier: 'unavailable' }
  | { tier: 'unqualified' }
  | { tier: 'none' };

export type AssignableFitTier = 'ready' | 'unavailable';

interface IsAssignableFitInput {
  fit: ShiftRoleFit;
}

export function isAssignableFit({ fit }: IsAssignableFitInput): boolean {
  switch (fit.tier) {
    case 'ready':
    case 'unavailable':
      return true;
    case 'unqualified':
      return false;
    case 'none':
      return false;
  }
}

interface IsRecommendableFitInput {
  fit: ShiftRoleFit;
}

export function isRecommendableFit({ fit }: IsRecommendableFitInput): boolean {
  switch (fit.tier) {
    case 'ready':
    case 'unavailable':
      return true;
    case 'unqualified':
    case 'none':
      return false;
  }
}

interface ShiftRoleFitForEligibleVolunteerInput {
  volunteer: CycleBuilderEligibleVolunteerSummary;
  roleId: string;
}

/**
 * The predicate itself, over a volunteer the caller has already found. Callers
 * that walk `shift.eligibleVolunteers` (the ranking, the picker's list, its
 * recommendations) use this directly, so sharing the rule costs them a field
 * read rather than a scan of the whole eligible list per person.
 */
export function shiftRoleFitForEligibleVolunteer({
  volunteer,
  roleId,
}: ShiftRoleFitForEligibleVolunteerInput): ShiftRoleFit {
  if (volunteer.conflict) return { tier: 'none' };
  if (!volunteer.qualifiedRoleIds.includes(roleId))
    return { tier: 'unqualified' };
  return volunteer.answerState === 'unavailable'
    ? { tier: 'unavailable' }
    : { tier: 'ready' };
}

interface VolunteerFitForShiftRoleInput {
  shift: CycleBuilderShiftSummary;
  roleId: string;
  volunteerId: string;
}

/** `shiftRoleFitForEligibleVolunteer` for callers holding only an id. */
export function volunteerFitForShiftRole({
  shift,
  roleId,
  volunteerId,
}: VolunteerFitForShiftRoleInput): ShiftRoleFit {
  const volunteer = shift.eligibleVolunteers.find(
    (candidate) => candidate.volunteerId === volunteerId,
  );
  if (!volunteer) return { tier: 'none' };
  return shiftRoleFitForEligibleVolunteer({ volunteer, roleId });
}
