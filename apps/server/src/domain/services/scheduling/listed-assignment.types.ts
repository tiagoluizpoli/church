import type { Assignment } from '../../entities/assignment';

export interface ListedAssignmentInput {
  assignment: Pick<Assignment, 'status' | 'reason'>;
  /** Whether its Event or EventTimeBlock is cancelled. */
  cancelled: boolean;
}
