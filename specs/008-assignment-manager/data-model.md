# Data Model: Slot & Assignment Manager

This document outlines the domain types and contracts for the Slot & Assignment Manager. All types are pure TypeScript — no ORM or infrastructure coupling.

## Entity Extensions (Existing D1 Entities)

### Event — Add `past` Status

```typescript
// MODIFIED: Add 'past' to the union
export const EVENT_STATUS_OPTIONS = [
  'draft',
  'published',
  'cancelled',
  'past',        // NEW
] as const;
export type EventStatus = (typeof EVENT_STATUS_OPTIONS)[number];

// NEW mutation method on Event class:
public markAsPast(): void {
  this._props.status = 'past';
  this._updatedAt = new Date();
}
```

### Assignment — Add `draft` and `cancelled` Statuses

```typescript
// MODIFIED: Add 'draft' and 'cancelled' to the union
export const ASSIGNMENT_STATUS_OPTIONS = [
  'draft',       // NEW — pre-publish, invisible to volunteers
  'pending',
  'confirmed',
  'declined',
  'cancelled',   // NEW — event was cancelled
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUS_OPTIONS)[number];

// MODIFIED: default changes from 'pending' to 'draft'
constructor(
  props: Omit<AssignmentProps, 'status' | 'assignedAt'> &
    Partial<Pick<AssignmentProps, 'status' | 'assignedAt'>>,
  ...
) {
  super({
    ...props,
    status: props.status ?? 'draft',    // CHANGED from 'pending'
    assignedAt: props.assignedAt ?? new Date(),
  }, ...);
}

// NEW mutation methods on Assignment class:
public markAsPending(): void {
  this._props.status = 'pending';
  this._updatedAt = new Date();
}

public cancel(): void {
  this._props.status = 'cancelled';
  this._updatedAt = new Date();
}
```

### TimeSlot — Add `status` Field

```typescript
// NEW status values
export const TIME_SLOT_STATUS_OPTIONS = ['active', 'cancelled'] as const;
export type TimeSlotStatus = (typeof TIME_SLOT_STATUS_OPTIONS)[number];

// MODIFIED: Add status to props
export interface TimeSlotProps {
  churchId: string;
  eventId: string;
  startTime: Date;
  endTime: Date;
  label?: string;
  status: TimeSlotStatus;   // NEW — defaults to 'active'
}

// NEW mutation method on TimeSlot class:
public cancel(): void {
  this._props.status = 'cancelled';
  this._updatedAt = new Date();
}
```

### AssignmentAudit — Extend Action Types

```typescript
// MODIFIED: Add event-level actions
export const ASSIGNMENT_AUDIT_ACTION_OPTIONS = [
  'created',
  'updated',
  'deleted',
  'status_change',
  'event_published',   // NEW
  'event_cancelled',   // NEW
] as const;
export type AssignmentAuditAction =
  (typeof ASSIGNMENT_AUDIT_ACTION_OPTIONS)[number];
```

## New Types

```typescript
// --- Time Range (reuse from Availability Engine) ---
import type { TimeRange } from '../availability/types';

// --- Slot Generation Strategy (discriminated union) ---
export type EqualSplitStrategy = {
  kind: 'equal-split';
  slotDurationMinutes: number;
};

export type TemplatePeriod = {
  label: string;
  startTime: Date;         // Absolute time for the target event day
  endTime: Date;
  requirements?: Array<{
    roleId: string;
    teamId?: string;
    requiredCount: number;
    notes?: string;
  }>;
};

export type TemplateBasedStrategy = {
  kind: 'template-based';
  periods: TemplatePeriod[];
};

export type SlotGenerationStrategy = EqualSplitStrategy | TemplateBasedStrategy;

// --- Slot Generation Request ---
export type SlotGenerationRequest = {
  churchId: string;
  eventId: string;
  eventStartTime: Date;
  eventEndTime: Date;
  strategy: SlotGenerationStrategy;
};

// --- Slot Generation Result ---
export type GeneratedSlot = {
  slot: import('../entities/time-slot').TimeSlot;
  requirements: import('../entities/slot-requirement').SlotRequirement[];
};

export type SlotGenerationResult = {
  slots: GeneratedSlot[];
  totalCount: number;
  hasRemainder: boolean;  // true if equal-split produced a shorter trailing slot
};

// --- Publish Request ---
export type PublishRequest = {
  churchId: string;
  event: import('../entities/event').Event;
  assignments: import('../entities/assignment').Assignment[];
  now: Date;  // Injected clock
  // Data for hard constraint re-validation per assignment
  assignmentValidationData: Map<string, {
    volunteerId: string;
    ministryId: string;
    roleId: string;
    slotId: string;
    eventStartTime: Date;
    volunteerQualifiedRoleIds: string[];
    volunteerMinistryIds: string[];
    existingSlotIds: string[];
  }>;
};

// --- Publish Result ---
export type HardConstraintFailure = {
  assignmentId: string;
  volunteerId: string;
  reason: import('../conflict/types').HardConstraintReason;
  message: string;
};

export type SchedulePublishResult = {
  event: import('../entities/event').Event;
  transitionedCount: number;
  warnings: string[];
};

// --- Cancel Request ---
export type CancelEventRequest = {
  churchId: string;
  event: import('../entities/event').Event;
  slots: import('../entities/time-slot').TimeSlot[];
  assignments: import('../entities/assignment').Assignment[];
};

// --- Cancel Result ---
export type EventCancellationResult = {
  event: import('../entities/event').Event;
  slotsAffected: number;
  assignmentsCancelled: number;   // Published assignments transitioned
  assignmentsDeleted: number;     // Draft assignments removed
};

// --- Decline Request ---
export type DeclineAssignmentRequest = {
  churchId: string;
  assignment: import('../entities/assignment').Assignment;
  reason?: string;
  actorId: string;
  now: Date;  // Injected clock
};

// --- Confirm Request ---
export type ConfirmAssignmentRequest = {
  churchId: string;
  assignment: import('../entities/assignment').Assignment;
  actorId: string;
  now: Date;  // Injected clock
};

// --- Replacement Candidate ---
export type ReplacementCandidate = {
  volunteerId: string;
  workloadCount: number;  // For sorting (ascending)
};

// --- Replacement Search Request ---
export type ReplacementSearchRequest = {
  churchId: string;
  slotId: string;
  roleId: string;
  slotTimeRange: TimeRange;
  qualifiedVolunteerIds: string[];      // Pre-filtered by role
  declinedVolunteerIds: string[];       // Already declined this slot
  existingAssignments: import('../availability/types').AssignmentContext[];
  existingBlockouts: import('../availability/types').BlockoutContext[];
  workloadMap: Map<string, number>;     // volunteerId → service count
};

// --- Lifecycle Transition Request ---
export type LifecycleTransitionRequest = {
  churchId: string;
  event: import('../entities/event').Event;
  assignments: import('../entities/assignment').Assignment[];
  now: Date;  // Injected clock
};

// --- Lifecycle Transition Result ---
export type LifecycleTransitionResult = {
  transitioned: boolean;
  newStatus?: import('../entities/event').EventStatus;
  assignmentsAutoConfirmed: number;
};
```

## Service API Surface

```typescript
export const AssignmentManagerService = {
  // Slot Generation
  generateSlots(request: SlotGenerationRequest): SlotGenerationResult;

  // Publishing
  publish(request: PublishRequest): SchedulePublishResult;
  // throws: PublishValidationError (wraps HardConstraintFailure[])

  // Cancellation
  cancelEvent(request: CancelEventRequest): EventCancellationResult;
  // throws: InvalidStateTransitionError

  // Assignment Actions
  declineAssignment(request: DeclineAssignmentRequest): AssignmentAudit;
  confirmAssignment(request: ConfirmAssignmentRequest): AssignmentAudit | null;
  // returns null for idempotent no-op (already confirmed)

  // Replacement Search
  findReplacements(request: ReplacementSearchRequest): ReplacementCandidate[];

  // Lifecycle Transitions
  transitionExpiredEvent(request: LifecycleTransitionRequest): LifecycleTransitionResult;
} as const;
```

## New Errors

```typescript
// --- Publish Validation Error (wraps stale hard constraint failures) ---
export class PublishValidationError extends DomainError {
  public readonly failures: HardConstraintFailure[];
  constructor(failures: HardConstraintFailure[]) {
    super(`Cannot publish: ${failures.length} assignment(s) fail hard constraints`);
    this.failures = failures;
  }
}

// --- Invalid State Transition Error ---
export class InvalidStateTransitionError extends DomainError {
  public readonly currentStatus: string;
  public readonly attemptedAction: string;
  constructor(currentStatus: string, attemptedAction: string) {
    super(`Cannot ${attemptedAction}: event is in '${currentStatus}' status`);
    this.currentStatus = currentStatus;
    this.attemptedAction = attemptedAction;
  }
}

// --- Empty Schedule Error ---
export class EmptyScheduleError extends DomainError {
  constructor() {
    super('Cannot publish an event with no assignments');
  }
}

// --- Duplicate Slots Error ---
export class DuplicateSlotsError extends DomainError {
  constructor() {
    super('Event already has existing slots. Delete them before regenerating.');
  }
}
```

## State Machines

### Event Lifecycle
```
draft ──publish()──→ published ──(end date passes)──→ past
  │                     │
  │                     └──cancel()──→ cancelled
  │
  └──cancel()──→ cancelled
  │
  └──(end date passes)──→ cancelled  (auto-cleanup of unpublished drafts)
```

### Assignment Lifecycle
```
draft ──publish()──→ pending ──confirm()──→ confirmed
                       │                        │
                       └──decline()──→ declined  └──decline()──→ declined
                       │
                       └──cancel()──→ cancelled

draft ──cancel(draft event)──→ [DELETED]
```
