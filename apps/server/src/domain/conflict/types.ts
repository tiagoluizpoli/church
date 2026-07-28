import type { AvailabilityResult } from '../availability/types';

// --- Hard Constraint Reason Codes ---
export type HardConstraintReason =
  | 'NOT_QUALIFIED'
  | 'NOT_IN_MINISTRY'
  | 'EVENT_IN_PAST'
  | 'DUPLICATE_ASSIGNMENT';

// --- Soft Conflict Issue Types ---
export type SoftConflictType =
  | 'UNAVAILABLE'
  | 'DOUBLE_BOOKED'
  | 'FAIRNESS_EXCEEDED'
  | 'NOT_QUALIFIED';

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

// --- Conflict Report (aggregated soft conflicts) ---
export type ConflictReport = {
  hasConflicts: true;
  issues: ConflictIssue[];
};

// --- No-Conflict sentinel ---
export type NoConflict = {
  hasConflicts: false;
};

// --- Combined validation result for soft constraints ---
export type SoftConflictResult = ConflictReport | NoConflict;

// --- Caller context for override authorization ---
export type CallerContext = {
  userId: string;
  /** Church-wide administration, read from the organization membership's `admin` level. */
  isChurchAdmin: boolean;
  /** Ministry Access Level `leader` for `ministryId` below. TeamLeader never carried override authority. */
  isMinistryLeader: boolean;
  ministryId?: string;
};

// --- Validation request ---
export type ValidationRequest = {
  churchId: string;
  volunteerId: string;
  ministryId: string;
  roleId: string;
  slotId: string;
  eventStartTime: Date;
  now: Date;
  availabilityResult: AvailabilityResult;
  existingSlotIds: string[];
  serviceCount: number;
  fairnessThreshold: number;
  volunteerQualifiedRoleIds: string[];
  volunteerMinistryIds: string[];
};

// --- Override request ---
export type OverrideRequest = {
  churchId: string;
  assignmentId: string;
  overrideReason: string;
  caller: CallerContext;
  targetMinistryId: string;
  /** Injected clock — used as the audit timestamp. Pass `request.now` from the calling context. */
  now: Date;
};
