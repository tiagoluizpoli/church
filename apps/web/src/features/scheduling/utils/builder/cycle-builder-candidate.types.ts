import type { AvailabilityStatus } from '../../hooks/use-volunteer-pool';
import type { AssigneeMembership } from '@/utils/format-assignee-role-label';

/**
 * The shapes the builder's decision core hands to the surfaces that render it.
 *
 * These used to live in `assignment-picker.tsx` and `suggestion-list.tsx`, which
 * made `cycle-builder-assignment-index.utils.ts` — the module that *produces*
 * them — import back out of `utils/` into `components/`. That inverted the very
 * layering the util extraction was for: the board's decision core could not be
 * read, tested or reused without dragging two presentational components in with
 * it. The producer owns its output shape; the components consume it.
 */

/** One assignment a volunteer already holds, phrased for display. */
export interface ServingAssignmentContext {
  /** Compact form for a list row: date · shift · role. */
  summary: string;
  /** Long form for a tooltip: event · date · shift · role. */
  detail: string;
}

/** A row in the cell's Add picker — the output of `candidates()`. */
export interface PickerVolunteer {
  id: string;
  name: string;
  membership?: AssigneeMembership;
  availabilityStatus: AvailabilityStatus;
  /**
   * Qualified for the role this picker is filling. `false` still lists the
   * candidate — qualification is overridable with a reason, not a hard filter
   * (B-2) — it only badges the pick as needing one and sorts it last.
   */
  isQualified?: boolean;
  alreadyAssignedCount: number;
  alreadyServingAssignments?: ServingAssignmentContext[];
}

/** A row in one of the picker's suggestion groups — output of `recommendations()`. */
export interface SuggestedVolunteer {
  id: string;
  name: string;
  membership?: AssigneeMembership;
  status: 'available' | 'partial' | 'needs_response' | 'conflict';
  workloadCount: number;
  conflictType?: 'double_booked' | 'unavailable';
  alreadyServingAssignments?: ServingAssignmentContext[];
}
