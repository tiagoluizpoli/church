import type { AvailabilityResult } from '../availability/types';

// --- Hard Constraint Reason Codes ---
export const HARD_CONSTRAINT_REASONS = [
  'NOT_QUALIFIED',
  'NOT_IN_MINISTRY',
  'EVENT_IN_PAST',
  'DUPLICATE_ASSIGNMENT',
] as const;
export type HardConstraintReason = (typeof HARD_CONSTRAINT_REASONS)[number];

// --- Soft Conflict Issue Types ---
export const SOFT_CONFLICT_TYPES = [
  'UNAVAILABLE',
  'DOUBLE_BOOKED',
  'FAIRNESS_EXCEEDED',
] as const;
export type SoftConflictType = (typeof SOFT_CONFLICT_TYPES)[number];

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
  systemRole: 'leader' | 'sub_leader' | 'volunteer' | 'admin';
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
