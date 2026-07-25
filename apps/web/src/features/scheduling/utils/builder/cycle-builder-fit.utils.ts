import type {
  CycleBuilderEligibleVolunteerSummary,
  CycleBuilderShiftSummary,
} from '../../hooks/use-cycle-builder';

/**
 * How well one volunteer fits one shift×role. **This is the builder's only
 * qualification rule** — the rail's ranking, the picker's list, the picker's
 * recommendations, the board's reverse highlight and every drop target read it,
 * so no two gestures can enforce different rules (B-2).
 *
 * `ready`       — qualified and genuinely free: the obvious drop target.
 * `override`    — qualified but unavailable or double-booked. Still assignable;
 *                 overriding is a real workflow, it just must not look routine —
 *                 and FR-016 requires a reason before it is accepted, which is
 *                 why the tier carries `conflictType` rather than leaving each
 *                 caller to re-derive it. A caller holding the fit cannot drop
 *                 the conflict on the floor without the compiler noticing.
 * `unqualified` — not qualified for this role, but still assignable: the
 *                 server only warns `NOT_QUALIFIED` and a reason clears it
 *                 under either enforcement mode, so hard-filtering here would
 *                 make the rail's "the leader can overrule" stance a lie
 *                 (B-2). Ranked last and routed to `OverrideDialog`'s
 *                 `not_qualified` variant by every gesture via
 *                 `overrideKindForFit()`.
 * `none`        — not a candidate for this shift at all (not in the ministry,
 *                 not in the cycle). A hard `NOT_IN_MINISTRY` server-side, so
 *                 no gesture may offer it.
 */
export type ShiftRoleFit =
  | { tier: 'ready' }
  | { tier: 'override'; conflictType: SoftConflictType }
  | { tier: 'unqualified'; conflictType?: SoftConflictType }
  | { tier: 'none' };

/** Mirrors the picker's own conflict vocabulary (`recommendations()`). */
export type SoftConflictType = 'double_booked' | 'unavailable';

/**
 * The fit of someone already known to be in a shift's eligible pool. `none`
 * means "not a candidate for this shift at all", which is unreachable once the
 * caller is holding a member of `shift.eligibleVolunteers` — so
 * `shiftRoleFitForEligibleVolunteer` returns this narrower type and its callers
 * need no `none` guard. Only the id-based `volunteerFitForShiftRole` (which can
 * fail to find anyone) widens back to `ShiftRoleFit`.
 */
export type EligibleShiftRoleFit = Exclude<ShiftRoleFit, { tier: 'none' }>;

/**
 * Every tier a leader may actually commit — `ShiftRoleFit` minus `none`.
 * Includes `unqualified`: assignable with an override reason, not filtered
 * out (B-2).
 */
export type AssignableFitTier = EligibleShiftRoleFit['tier'];

/**
 * What a caller would have to justify. Builder candidates are NOT
 * qualification-filtered before this translation runs — `'not_qualified'` is
 * a real, reachable value here, not a defensive-only case (B-2). The one
 * function that does filter qualification is `recommendations()`, and only
 * for its own suggestion groups: nobody is ever *recommended* into a reason
 * they did not ask for.
 */
export type AssignmentOverrideKind = SoftConflictType | 'not_qualified';

interface OverrideKindForFitInput {
  fit: ShiftRoleFit;
}

/**
 * The one translation from "how well does she fit" to "what must she justify".
 * Every assign gesture goes through here rather than testing tiers by hand —
 * that hand-testing is precisely how "Pick me" came to commit an unqualified
 * volunteer with no dialog while the droppable refused the same person.
 */
export function overrideKindForFit({
  fit,
}: OverrideKindForFitInput): AssignmentOverrideKind | undefined {
  if (fit.tier === 'unqualified') return 'not_qualified';
  if (fit.tier === 'override') return fit.conflictType;
  return undefined;
}

interface IsAssignableFitInput {
  fit: ShiftRoleFit;
}

/**
 * Whether a leader may commit this pick at all. Only `none` (not a candidate
 * for this shift — not in the ministry, not in the cycle) is a hard no;
 * qualification, like availability, is overridable with a reason (B-2).
 *
 * Written as an exhaustive switch rather than `tier !== 'none'` so that adding
 * a fifth tier fails to compile here instead of silently defaulting to
 * assignable. `ShiftRoleFit` has already grown once (B-2 added `unqualified`),
 * and every such widening is a decision each predicate must make explicitly.
 */
export function isAssignableFit({ fit }: IsAssignableFitInput): boolean {
  switch (fit.tier) {
    case 'ready':
    case 'override':
    case 'unqualified':
      return true;
    case 'none':
      return false;
  }
}

interface IsRecommendableFitInput {
  fit: ShiftRoleFit;
}

/**
 * Whether this pick may be *suggested*, which is a stronger claim than whether
 * it may be committed: recommending someone into an override reason they did
 * not go looking for is the one thing the picker must never do. So
 * `unqualified` is assignable (`isAssignableFit`) but not recommendable.
 *
 * This exists because `recommendations()` used to hand-roll the same rule as
 * `fit.tier !== 'unqualified'` while its two sibling consumers went through a
 * shared predicate — the exact "one rule, three spellings" drift that B-2 was
 * written to end and that has recurred three times in this directory.
 * Exhaustive for the same reason as `isAssignableFit`.
 */
export function isRecommendableFit({ fit }: IsRecommendableFitInput): boolean {
  switch (fit.tier) {
    case 'ready':
    case 'override':
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
 *
 * Returns `EligibleShiftRoleFit`, not `ShiftRoleFit`: being handed a member of
 * the eligible pool is exactly what rules `none` out, so callers get that
 * guarantee from the type instead of re-asserting it with a filter that can
 * never fire.
 */
export function shiftRoleFitForEligibleVolunteer({
  volunteer,
  roleId,
}: ShiftRoleFitForEligibleVolunteerInput): EligibleShiftRoleFit {
  const conflictType: SoftConflictType | undefined = volunteer.hasConflict
    ? 'double_booked'
    : volunteer.isAvailable
      ? undefined
      : 'unavailable';
  if (!volunteer.qualifiedRoleIds.includes(roleId))
    return { tier: 'unqualified', conflictType };
  if (!conflictType) return { tier: 'ready' };
  return { tier: 'override', conflictType };
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
