# Test Coverage Plan: Slot & Assignment Manager

**Feature**: Spec L3 — Slot & Assignment Manager
**Testing Framework**: Vitest (Unit)
**Layer**: Pure Domain Service — 100% UNIT tests (no infrastructure dependencies)

---

## 1. Slot Generation — Equal Split

### 1.1 Happy Paths
- `[x]` Even division (120min / 30min = 4 slots): Expect 4 non-overlapping slots, each exactly 30min → UNIT
- `[x]` Single slot (30min / 30min = 1 slot): Expect exactly 1 slot → UNIT
- `[x]` Two-day event (2880min / 60min): Expect 48 slots with correct day labels → UNIT

### 1.2 Edge Cases & Validation
- `[x]` Remainder handling (65min / 30min): Expect 2×30min + 1×5min = 3 slots → UNIT
- `[x]` Very small remainder (61min / 30min): Expect 2×30min + 1×1min → UNIT
- `[x]` Slot duration equals event duration (60min / 60min): Expect exactly 1 slot → UNIT
- `[x]` Slot duration exceeds event duration (30min / 60min): Expect exactly 1 slot = full event → UNIT
- `[x]` Zero-duration slot request (0 min): Expect domain error → UNIT
- `[x]` Negative slot duration: Expect domain error → UNIT

### 1.3 Catastrophic / State Failures
- `[x]` Event already has slots: Expect `DuplicateSlotsError` → UNIT
- `[x]` churchId mismatch (event churchId ≠ request churchId): Expect isolation error → UNIT

---

## 2. Slot Generation — Template-Based

### 2.1 Happy Paths
- `[x]` Template with 3 periods: Expect 3 slots with correct labels and time ranges → UNIT
- `[x]` Template with requirements: Expect each slot has correct `SlotRequirement` entities → UNIT
- `[x]` Template period with multiple requirements (2 roles): Expect 2 `SlotRequirement` per slot → UNIT

### 2.2 Edge Cases & Validation
- `[x]` Template with single period: Expect exactly 1 slot → UNIT
- `[x]` Template with zero requirements on a period: Expect slot with empty requirements array → UNIT
- `[x]` Template periods not contiguous (gap between periods): Expect slots match template exactly — gaps are allowed → UNIT
- `[x]` Event already has slots: Expect `DuplicateSlotsError` → UNIT

---

## 3. Publish Schedule

### 3.1 Happy Paths
- `[x]` Draft event + 5 draft assignments, all pass hard constraints: Expect event → `published`, all assignments → `pending`, transitionedCount = 5 → UNIT
- `[x]` Draft event + 1 assignment: Expect success (minimal valid case) → UNIT

### 3.2 Permission / Authorization
- `[x]` (Handled at application layer — domain service doesn't check caller role for publish)

### 3.3 Edge Cases & Validation
- `[x]` Zero assignments: Expect `EmptyScheduleError` → UNIT
- `[x]` Event already published: Expect `InvalidStateTransitionError('published', 'publish')` → UNIT
- `[x]` Event already cancelled: Expect `InvalidStateTransitionError('cancelled', 'publish')` → UNIT
- `[x]` Event already past: Expect `InvalidStateTransitionError('past', 'publish')` → UNIT
- `[x]` Event start date in the past (`now > event.startDate`): Expect domain error → UNIT
- `[x]` 1 of 3 assignments fails hard constraint re-validation (stale qualification): Expect `PublishValidationError` with 1 failure listed → UNIT
- `[x]` All assignments fail hard constraints: Expect `PublishValidationError` with all failures → UNIT
- `[x]` Hard constraint failure does NOT mutate event or assignment statuses: Expect all remain `draft` after error → UNIT

### 3.4 State Machine Integrity
- `[x]` Assignments already in non-draft status mixed in: Expect only draft assignments are transitioned → UNIT
- `[x]` Event mutation is atomic — event.status set AFTER all assignments pass → UNIT

---

## 4. Cancel Event

### 4.1 Happy Paths
- `[x]` Published event + 3 slots + 8 assignments: Expect event → `cancelled`, all slots → `cancelled`, all assignments → `cancelled` → UNIT
- `[x]` Draft event + 2 draft assignments: Expect event → `cancelled`, assignments are flagged for deletion (assignmentsDeleted = 2, assignmentsCancelled = 0) → UNIT

### 4.2 Edge Cases & Validation
- `[x]` Already cancelled event: Expect `InvalidStateTransitionError('cancelled', 'cancel')` → UNIT
- `[x]` Past event: Expect `InvalidStateTransitionError('past', 'cancel')` → UNIT
- `[x]` Published event with mixed statuses (pending + confirmed + declined): Expect pending → cancelled, confirmed → cancelled, declined remains declined → UNIT
- `[x]` Event with zero assignments: Expect event → `cancelled`, slotsAffected = N, assignmentsCancelled = 0 → UNIT
- `[x]` churchId on slots/assignments doesn't match event: Expect isolation error → UNIT

---

## 5. Decline Assignment

### 5.1 Happy Paths
- `[x]` Pending assignment + reason: Expect assignment → `declined`, audit with action `status_change` and reason → UNIT
- `[x]` Pending assignment without reason: Expect assignment → `declined`, audit with empty reason → UNIT
- `[x]` Confirmed assignment + reason: Expect assignment → `declined` (withdraw after confirming) → UNIT

### 5.2 Edge Cases & Validation
- `[x]` Draft assignment: Expect `InvalidStateTransitionError('draft', 'decline')` → UNIT
- `[x]` Cancelled assignment: Expect `InvalidStateTransitionError('cancelled', 'decline')` → UNIT
- `[x]` Already declined assignment: Expect `InvalidStateTransitionError('declined', 'decline')` → UNIT
- `[x]` churchId mismatch: Expect isolation error → UNIT

### 5.3 Audit Integrity
- `[x]` Audit record has correct `assignmentId`, `leaderId` (actorId), `churchId`, `timestamp`, `action` → UNIT
- `[x]` Audit timestamp uses injected clock (`now`), not system time → UNIT

---

## 6. Confirm Assignment

### 6.1 Happy Paths
- `[x]` Pending assignment: Expect assignment → `confirmed`, audit with action `status_change` → UNIT

### 6.2 Edge Cases & Validation
- `[x]` Already confirmed (idempotent): Expect success, NO duplicate audit record → UNIT
- `[x]` Draft assignment: Expect `InvalidStateTransitionError('draft', 'confirm')` → UNIT
- `[x]` Cancelled assignment: Expect `InvalidStateTransitionError('cancelled', 'confirm')` → UNIT
- `[x]` Declined assignment: Expect `InvalidStateTransitionError('declined', 'confirm')` → UNIT

### 6.3 Audit Integrity
- `[x]` Audit record uses injected clock → UNIT
- `[x]` No audit record created for idempotent no-op → UNIT

---

## 7. Find Replacement Volunteers

### 7.1 Happy Paths
- `[x]` 3 qualified, all available, none declined: Expect 3 candidates sorted by workload (ascending) → UNIT
- `[x]` 3 qualified, 1 unavailable, 1 double-booked: Expect 1 candidate → UNIT

### 7.2 Edge Cases & Validation
- `[x]` All qualified volunteers unavailable: Expect empty list → UNIT
- `[x]` All qualified volunteers already declined: Expect empty list → UNIT
- `[x]` All qualified volunteers have overlapping assignments (different ministry): Expect empty list → UNIT
- `[x]` Mixed filtering (1 unavailable + 1 declined + 1 overlapping + 1 valid): Expect 1 candidate → UNIT
- `[x]` Workload tie-breaking: Two candidates with same workload — both returned, stable order → UNIT
- `[x]` Zero qualified volunteers provided: Expect empty list → UNIT

### 7.3 churchId Isolation
- `[x]` Blockout from different church is rejected: Expect isolation error → UNIT
- `[x]` Assignment from different church is rejected: Expect isolation error → UNIT

---

## 8. Lifecycle Transitions (transitionExpiredEvent)

### 8.1 Happy Paths
- `[x]` Published event past end date: Expect event → `past`, all pending assignments → `confirmed` (assumed attended) → UNIT
- `[x]` Draft event past end date: Expect event → `cancelled`, draft assignments → deleted → UNIT

### 8.2 Edge Cases & Validation
- `[x]` Event end date in the future: Expect no transition (transitioned = false) → UNIT
- `[x]` Already past event: Expect no transition (already in terminal state) → UNIT
- `[x]` Already cancelled event: Expect no transition → UNIT
- `[x]` Published event with mixed assignment statuses (pending + confirmed + declined): Expect only pending → confirmed, others unchanged → UNIT
- `[x]` Event with zero assignments transitioning to past: Expect event → `past`, assignmentsAutoConfirmed = 0 → UNIT

---

## 9. Entity Extension Tests

### 9.1 Event Entity
- `[x]` `markAsPast()` transitions to `past` → UNIT
- `[x]` `past` status is recognized in `EVENT_STATUS_OPTIONS` → UNIT

### 9.2 Assignment Entity
- `[x]` Default status is `draft` (CHANGED from `pending`) → UNIT
- `[x]` `markAsPending()` transitions to `pending` → UNIT
- `[x]` `cancel()` transitions to `cancelled` → UNIT
- `[x]` `draft` and `cancelled` are in `ASSIGNMENT_STATUS_OPTIONS` → UNIT

### 9.3 TimeSlot Entity
- `[x]` Default status is `active` → UNIT
- `[x]` `cancel()` transitions to `cancelled` → UNIT
- `[x]` `status` getter returns correct value → UNIT

### 9.4 AssignmentAudit Entity
- `[x]` `event_published` and `event_cancelled` are valid action types → UNIT
- `[x]` Audit can be constructed with new action types → UNIT

---

## 10. Error Classes

- `[x]` `PublishValidationError` stores failures array and produces descriptive message → UNIT
- `[x]` `InvalidStateTransitionError` stores currentStatus and attemptedAction → UNIT
- `[x]` `EmptyScheduleError` produces correct message → UNIT
- `[x]` `DuplicateSlotsError` produces correct message → UNIT
- `[x]` All errors extend `DomainError` → UNIT

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
