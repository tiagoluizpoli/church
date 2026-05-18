# Test Coverage Plan: Slot & Assignment Manager

**Feature**: Spec L3 — Slot & Assignment Manager
**Testing Framework**: Vitest (Unit)
**Layer**: Pure Domain Service — 100% UNIT tests (no infrastructure dependencies)

---

## 1. Slot Generation — Equal Split

### 1.1 Happy Paths
- `[ ]` Even division (120min / 30min = 4 slots): Expect 4 non-overlapping slots, each exactly 30min → UNIT
- `[ ]` Single slot (30min / 30min = 1 slot): Expect exactly 1 slot → UNIT
- `[ ]` Two-day event (2880min / 60min): Expect 48 slots with correct day labels → UNIT

### 1.2 Edge Cases & Validation
- `[ ]` Remainder handling (65min / 30min): Expect 2×30min + 1×5min = 3 slots → UNIT
- `[ ]` Very small remainder (61min / 30min): Expect 2×30min + 1×1min → UNIT
- `[ ]` Slot duration equals event duration (60min / 60min): Expect exactly 1 slot → UNIT
- `[ ]` Slot duration exceeds event duration (30min / 60min): Expect exactly 1 slot = full event → UNIT
- `[ ]` Zero-duration slot request (0 min): Expect domain error → UNIT
- `[ ]` Negative slot duration: Expect domain error → UNIT

### 1.3 Catastrophic / State Failures
- `[ ]` Event already has slots: Expect `DuplicateSlotsError` → UNIT
- `[ ]` churchId mismatch (event churchId ≠ request churchId): Expect isolation error → UNIT

---

## 2. Slot Generation — Template-Based

### 2.1 Happy Paths
- `[ ]` Template with 3 periods: Expect 3 slots with correct labels and time ranges → UNIT
- `[ ]` Template with requirements: Expect each slot has correct `SlotRequirement` entities → UNIT
- `[ ]` Template period with multiple requirements (2 roles): Expect 2 `SlotRequirement` per slot → UNIT

### 2.2 Edge Cases & Validation
- `[ ]` Template with single period: Expect exactly 1 slot → UNIT
- `[ ]` Template with zero requirements on a period: Expect slot with empty requirements array → UNIT
- `[ ]` Template periods not contiguous (gap between periods): Expect slots match template exactly — gaps are allowed → UNIT
- `[ ]` Event already has slots: Expect `DuplicateSlotsError` → UNIT

---

## 3. Publish Schedule

### 3.1 Happy Paths
- `[ ]` Draft event + 5 draft assignments, all pass hard constraints: Expect event → `published`, all assignments → `pending`, transitionedCount = 5 → UNIT
- `[ ]` Draft event + 1 assignment: Expect success (minimal valid case) → UNIT

### 3.2 Permission / Authorization
- `[ ]` (Handled at application layer — domain service doesn't check caller role for publish)

### 3.3 Edge Cases & Validation
- `[ ]` Zero assignments: Expect `EmptyScheduleError` → UNIT
- `[ ]` Event already published: Expect `InvalidStateTransitionError('published', 'publish')` → UNIT
- `[ ]` Event already cancelled: Expect `InvalidStateTransitionError('cancelled', 'publish')` → UNIT
- `[ ]` Event already past: Expect `InvalidStateTransitionError('past', 'publish')` → UNIT
- `[ ]` Event start date in the past (`now > event.startDate`): Expect domain error → UNIT
- `[ ]` 1 of 3 assignments fails hard constraint re-validation (stale qualification): Expect `PublishValidationError` with 1 failure listed → UNIT
- `[ ]` All assignments fail hard constraints: Expect `PublishValidationError` with all failures → UNIT
- `[ ]` Hard constraint failure does NOT mutate event or assignment statuses: Expect all remain `draft` after error → UNIT

### 3.4 State Machine Integrity
- `[ ]` Assignments already in non-draft status mixed in: Expect only draft assignments are transitioned → UNIT
- `[ ]` Event mutation is atomic — event.status set AFTER all assignments pass → UNIT

---

## 4. Cancel Event

### 4.1 Happy Paths
- `[ ]` Published event + 3 slots + 8 assignments: Expect event → `cancelled`, all slots → `cancelled`, all assignments → `cancelled` → UNIT
- `[ ]` Draft event + 2 draft assignments: Expect event → `cancelled`, assignments are flagged for deletion (assignmentsDeleted = 2, assignmentsCancelled = 0) → UNIT

### 4.2 Edge Cases & Validation
- `[ ]` Already cancelled event: Expect `InvalidStateTransitionError('cancelled', 'cancel')` → UNIT
- `[ ]` Past event: Expect `InvalidStateTransitionError('past', 'cancel')` → UNIT
- `[ ]` Published event with mixed statuses (pending + confirmed + declined): Expect pending → cancelled, confirmed → cancelled, declined remains declined → UNIT
- `[ ]` Event with zero assignments: Expect event → `cancelled`, slotsAffected = N, assignmentsCancelled = 0 → UNIT
- `[ ]` churchId on slots/assignments doesn't match event: Expect isolation error → UNIT

---

## 5. Decline Assignment

### 5.1 Happy Paths
- `[ ]` Pending assignment + reason: Expect assignment → `declined`, audit with action `status_change` and reason → UNIT
- `[ ]` Pending assignment without reason: Expect assignment → `declined`, audit with empty reason → UNIT
- `[ ]` Confirmed assignment + reason: Expect assignment → `declined` (withdraw after confirming) → UNIT

### 5.2 Edge Cases & Validation
- `[ ]` Draft assignment: Expect `InvalidStateTransitionError('draft', 'decline')` → UNIT
- `[ ]` Cancelled assignment: Expect `InvalidStateTransitionError('cancelled', 'decline')` → UNIT
- `[ ]` Already declined assignment: Expect `InvalidStateTransitionError('declined', 'decline')` → UNIT
- `[ ]` churchId mismatch: Expect isolation error → UNIT

### 5.3 Audit Integrity
- `[ ]` Audit record has correct `assignmentId`, `leaderId` (actorId), `churchId`, `timestamp`, `action` → UNIT
- `[ ]` Audit timestamp uses injected clock (`now`), not system time → UNIT

---

## 6. Confirm Assignment

### 6.1 Happy Paths
- `[ ]` Pending assignment: Expect assignment → `confirmed`, audit with action `status_change` → UNIT

### 6.2 Edge Cases & Validation
- `[ ]` Already confirmed (idempotent): Expect success, NO duplicate audit record → UNIT
- `[ ]` Draft assignment: Expect `InvalidStateTransitionError('draft', 'confirm')` → UNIT
- `[ ]` Cancelled assignment: Expect `InvalidStateTransitionError('cancelled', 'confirm')` → UNIT
- `[ ]` Declined assignment: Expect `InvalidStateTransitionError('declined', 'confirm')` → UNIT

### 6.3 Audit Integrity
- `[ ]` Audit record uses injected clock → UNIT
- `[ ]` No audit record created for idempotent no-op → UNIT

---

## 7. Find Replacement Volunteers

### 7.1 Happy Paths
- `[ ]` 3 qualified, all available, none declined: Expect 3 candidates sorted by workload (ascending) → UNIT
- `[ ]` 3 qualified, 1 unavailable, 1 double-booked: Expect 1 candidate → UNIT

### 7.2 Edge Cases & Validation
- `[ ]` All qualified volunteers unavailable: Expect empty list → UNIT
- `[ ]` All qualified volunteers already declined: Expect empty list → UNIT
- `[ ]` All qualified volunteers have overlapping assignments (different ministry): Expect empty list → UNIT
- `[ ]` Mixed filtering (1 unavailable + 1 declined + 1 overlapping + 1 valid): Expect 1 candidate → UNIT
- `[ ]` Workload tie-breaking: Two candidates with same workload — both returned, stable order → UNIT
- `[ ]` Zero qualified volunteers provided: Expect empty list → UNIT

### 7.3 churchId Isolation
- `[ ]` Blockout from different church is rejected: Expect isolation error → UNIT
- `[ ]` Assignment from different church is rejected: Expect isolation error → UNIT

---

## 8. Lifecycle Transitions (transitionExpiredEvent)

### 8.1 Happy Paths
- `[ ]` Published event past end date: Expect event → `past`, all pending assignments → `confirmed` (assumed attended) → UNIT
- `[ ]` Draft event past end date: Expect event → `cancelled`, draft assignments → deleted → UNIT

### 8.2 Edge Cases & Validation
- `[ ]` Event end date in the future: Expect no transition (transitioned = false) → UNIT
- `[ ]` Already past event: Expect no transition (already in terminal state) → UNIT
- `[ ]` Already cancelled event: Expect no transition → UNIT
- `[ ]` Published event with mixed assignment statuses (pending + confirmed + declined): Expect only pending → confirmed, others unchanged → UNIT
- `[ ]` Event with zero assignments transitioning to past: Expect event → `past`, assignmentsAutoConfirmed = 0 → UNIT

---

## 9. Entity Extension Tests

### 9.1 Event Entity
- `[ ]` `markAsPast()` transitions to `past` → UNIT
- `[ ]` `past` status is recognized in `EVENT_STATUS_OPTIONS` → UNIT

### 9.2 Assignment Entity
- `[ ]` Default status is `draft` (CHANGED from `pending`) → UNIT
- `[ ]` `markAsPending()` transitions to `pending` → UNIT
- `[ ]` `cancel()` transitions to `cancelled` → UNIT
- `[ ]` `draft` and `cancelled` are in `ASSIGNMENT_STATUS_OPTIONS` → UNIT

### 9.3 TimeSlot Entity
- `[ ]` Default status is `active` → UNIT
- `[ ]` `cancel()` transitions to `cancelled` → UNIT
- `[ ]` `status` getter returns correct value → UNIT

### 9.4 AssignmentAudit Entity
- `[ ]` `event_published` and `event_cancelled` are valid action types → UNIT
- `[ ]` Audit can be constructed with new action types → UNIT

---

## 10. Error Classes

- `[ ]` `PublishValidationError` stores failures array and produces descriptive message → UNIT
- `[ ]` `InvalidStateTransitionError` stores currentStatus and attemptedAction → UNIT
- `[ ]` `EmptyScheduleError` produces correct message → UNIT
- `[ ]` `DuplicateSlotsError` produces correct message → UNIT
- `[ ]` All errors extend `DomainError` → UNIT

---

## Coverage Summary

| Area | Happy | Edge | Permission | Catastrophic | Total |
|------|-------|------|------------|--------------|-------|
| Slot Gen (Equal Split) | 3 | 7 | 0 | 2 | 12 |
| Slot Gen (Template) | 3 | 4 | 0 | 0 | 7 |
| Publish | 2 | 8 | 0 | 0 | 10 |
| Cancel Event | 2 | 5 | 0 | 0 | 7 |
| Decline | 3 | 4 | 0 | 0 | 7 |
| Confirm | 1 | 4 | 0 | 0 | 5 |
| Find Replacements | 2 | 6 | 0 | 2 | 10 |
| Lifecycle Transitions | 2 | 5 | 0 | 0 | 7 |
| Entity Extensions | 0 | 9 | 0 | 0 | 9 |
| Error Classes | 0 | 5 | 0 | 0 | 5 |
| **TOTAL** | **18** | **57** | **0** | **4** | **79** |

> Permission/authorization tests are N/A for this domain service — role enforcement happens at the application layer (Spec A3).
