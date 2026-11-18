// --- Hard Constraint Reason Codes ---
export type HardConstraintReason =
  | 'INVALID_MOVE_TARGET'
  | 'NOT_QUALIFIED'
  | 'NOT_IN_MINISTRY'
  | 'EVENT_IN_PAST'
  | 'DUPLICATE_ASSIGNMENT';

// --- Soft Conflict Issue Types ---
export type SoftConflictType = 'UNAVAILABLE' | 'DOUBLE_BOOKED';

// --- Conflict Issue (single detected soft conflict) ---
export type ConflictIssue = {
  type: SoftConflictType;
  details: string;
  conflictingId?: string;
  metadata?: {
    serviceCount?: number;
    fairnessThreshold?: number;
  };
};
