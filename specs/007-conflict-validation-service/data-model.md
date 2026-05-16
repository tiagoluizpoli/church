# Data Model: Conflict & Validation Service

This document outlines the domain types and contracts for the Conflict & Validation Service. All types are pure TypeScript — no ORM or infrastructure coupling.

## New Types

```typescript
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
  details: string;              // Human-readable description
  conflictingId?: string;       // ID of conflicting blockout/assignment
  metadata?: {                  // Extra data for FAIRNESS_EXCEEDED
    serviceCount?: number;
    fairnessThreshold?: number;
  };
};

// --- Conflict Report (aggregated soft conflicts) ---
export type ConflictReport = {
  hasConflicts: true;
  issues: ConflictIssue[];       // Always non-empty when hasConflicts is true
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
  ministryId?: string;           // Required for leader-scoped checks
};

// --- Validation request ---
export type ValidationRequest = {
  churchId: string;
  volunteerId: string;
  ministryId: string;
  roleId: string;
  slotId: string;
  eventStartTime: Date;          // Used for EVENT_IN_PAST check
  now: Date;                     // Injected clock for testability
  availabilityResult: import('./availability/types').AvailabilityResult;
  existingAssignmentIds: string[]; // IDs of assignments already on this slot for this volunteer (DUPLICATE check)
  serviceCount: number;           // Pre-computed count for the scheduling period
  fairnessThreshold: number;      // 0 = disabled
  volunteerQualifiedRoleIds: string[]; // Role IDs the volunteer is qualified for
  volunteerMinistryIds: string[];      // Ministry IDs the volunteer belongs to
};

// --- Override request ---
export type OverrideRequest = {
  churchId: string;               // For audit record scoping
  assignmentId: string;           // The assignment being overridden
  overrideReason: string;
  caller: CallerContext;
  targetMinistryId: string;      // The ministry this assignment is for
};
```

## Entity Extension: AssignmentAudit

The existing `AssignmentAuditProps` will be extended with one optional field:

```typescript
export interface AssignmentAuditProps {
  churchId: string;
  assignmentId: string;
  leaderId: string;
  action: AssignmentAuditAction;
  reason?: string;
  timestamp: Date;
  overrideConflictTypes?: SoftConflictType[];  // NEW: populated only for override audits
}
```

## New Error: HardConstraintError

Extends the existing `DomainError` base from `@church/core`:

```typescript
export class HardConstraintError extends DomainError {
  public readonly reason: HardConstraintReason;
  constructor(reason: HardConstraintReason, message: string) {
    super(message);
    this.reason = reason;
  }
}
```

## Validation Flow (State Machine)

1. **Input**: `ValidationRequest`
2. **Phase 1 — Hard Constraints** (any failure → throw `HardConstraintError`):
   - Check `roleId` ∈ `volunteerQualifiedRoleIds` → else `NOT_QUALIFIED`
   - Check `ministryId` ∈ `volunteerMinistryIds` → else `NOT_IN_MINISTRY`
   - Check `eventStartTime > now` → else `EVENT_IN_PAST`
   - Check `slotId` ∉ `existingAssignmentIds` → else `DUPLICATE_ASSIGNMENT`
3. **Phase 2 — Soft Conflicts** (accumulate all issues):
   - If `availabilityResult.status === 'UNAVAILABLE'` → add `UNAVAILABLE` issue
   - If `availabilityResult.status === 'DOUBLE_BOOKED'` → add `DOUBLE_BOOKED` issue
   - If `fairnessThreshold > 0 && serviceCount >= fairnessThreshold` → add `FAIRNESS_EXCEEDED` issue
4. **Output**: `SoftConflictResult` (either `NoConflict` or `ConflictReport`)

## Override Flow

1. **Input**: `OverrideRequest` (includes `churchId`, `assignmentId`, `overrideReason`, `caller`, `targetMinistryId`) + `ConflictReport`
2. **Validate**: `overrideReason.trim()` is non-empty
3. **Authorize**: `caller.systemRole === 'leader'` (with `caller.ministryId === targetMinistryId`) OR `caller.systemRole === 'admin'`
4. **Output**: `AssignmentAudit` entity (constructed from `OverrideRequest` fields, not persisted — persistence is the caller's responsibility)
