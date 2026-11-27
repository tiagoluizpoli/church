import {
  type AssignmentStatus,
  PUBLISHED_ASSIGNMENT_STATUSES,
} from '../../entities/assignment';
import type { ListedAssignmentInput } from './listed-assignment.types';

/**
 * Published work, plus what an Event or EventTimeBlock cancellation cancelled.
 * A `reason` marks a Volunteer Transfer's own cancellation, which stays hidden.
 * SQL twin: `listPublishedByVolunteer` (drizzle-assignment.repository.ts).
 */
export function isListedAssignment({
  assignment: { status, reason },
  cancelled,
}: ListedAssignmentInput): boolean {
  const published: readonly AssignmentStatus[] = PUBLISHED_ASSIGNMENT_STATUSES;
  if (published.includes(status)) return true;
  return cancelled && status === 'cancelled' && !reason;
}
