interface IsCancelledEventInput {
  eventStatus: string;
}

export function isCancelledEvent({ eventStatus }: IsCancelledEventInput) {
  return eventStatus === 'cancelled';
}

// An allowlist rather than "everything except cancelled": a status added later
// must not silently start counting (FR-017).
const ACTIVE_ASSIGNMENT_STATUSES: ReadonlySet<string> = new Set([
  'draft',
  'pending',
]);

interface IsActiveAssignmentInput {
  status: string;
}

/** The one definition of an Assignment that counts. */
export function isActiveAssignment({
  status,
}: IsActiveAssignmentInput): boolean {
  return ACTIVE_ASSIGNMENT_STATUSES.has(status);
}
