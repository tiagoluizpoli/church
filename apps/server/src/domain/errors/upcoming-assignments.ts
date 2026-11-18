import { DomainError } from '@church/core';
import type { UpcomingMembershipAssignment } from '../upcoming-membership-assignments';

export interface UpcomingAssignmentsErrorInput {
  assignments: UpcomingMembershipAssignment[];
}

/** Upcoming Assignments still depend on a removed Role or an ending Membership. */
export class UpcomingAssignmentsError extends DomainError {
  readonly code = 'UPCOMING_ASSIGNMENTS' as const;
  readonly assignments: UpcomingMembershipAssignment[];

  constructor({ assignments }: UpcomingAssignmentsErrorInput) {
    super('Upcoming Assignments depend on this Ministry Membership');
    this.assignments = assignments;
  }
}
