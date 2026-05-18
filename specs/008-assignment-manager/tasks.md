# Tasks: Slot & Assignment Manager (Spec L3)

**Input**: Design documents from `specs/008-assignment-manager/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅

**Tests**: Included — spec mandates 100% automated test coverage for all service operations (SC-001 through SC-008).

**Organization**: Tasks are grouped by user story. Each task is an atomic **round** following the Karpathy loop:

> **Round Protocol** (per task):
> 1. Present micro-plan → prompt for approval/suggestions
> 2. Back-and-forth until satisfied
> 3. Implement the approved micro-plan
> 4. Prompt for code review
> 5. Back-and-forth until satisfied
> 6. ✅ Check the task box → move to next round

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4, US5, US6, US7)

---

## Test Coverage Plan

> Full plan: [tests/test-coverage-plan.md](./tests/test-coverage-plan.md) — 79 test cases across 10 areas.

### 1. Happy Paths (18 cases)
- [ ] Slot generation (equal split) — exact divisions → UNIT
- [ ] Slot generation (template) — periods with requirements → UNIT
- [ ] Publish — all pass hard constraints → UNIT
- [ ] Cancel published event — cascade to slots and assignments → UNIT
- [ ] Cancel draft event — delete draft assignments → UNIT
- [ ] Decline pending assignment with reason → UNIT
- [ ] Confirm pending assignment → UNIT
- [ ] Replacement search — qualified, available, sorted by workload → UNIT
- [ ] Lifecycle — published past event → `past`, pending → confirmed → UNIT
- [ ] Lifecycle — draft past event → cancelled → UNIT

### 2. Edge Cases & Validation (57 cases)
- [ ] Equal split remainder handling → UNIT
- [ ] Template with zero requirements → UNIT
- [ ] Publish zero assignments → `EmptyScheduleError` → UNIT
- [ ] Publish already published → `InvalidStateTransitionError` → UNIT
- [ ] Publish with stale hard constraint → `PublishValidationError` → UNIT
- [ ] Cancel already cancelled → `InvalidStateTransitionError` → UNIT
- [ ] Decline draft assignment → rejected → UNIT
- [ ] Confirm already confirmed (idempotent) → no duplicate audit → UNIT
- [ ] Replacement — all candidates filtered → empty list → UNIT
- [ ] churchId isolation in every operation → UNIT

### 3. Catastrophic Failures (4 cases)
- [ ] Slot generation on event with existing slots → `DuplicateSlotsError` → UNIT
- [ ] churchId mismatch on blockout → isolation error → UNIT
- [ ] churchId mismatch on assignment → isolation error → UNIT
- [ ] Event already has slots (re-generation) → `DuplicateSlotsError` → UNIT

---

## Phase 1: Setup (Module Structure & Types)

**Purpose**: Create the assignment module directory structure, all types, and error classes

- [ ] T001 Create assignment module directory at `packages/api/src/domain/assignment/` and `packages/api/src/domain/assignment/errors/`
- [ ] T002 [P] Define all new types (`SlotGenerationStrategy`, `EqualSplitStrategy`, `TemplateBasedStrategy`, `TemplatePeriod`, `SlotGenerationRequest`, `GeneratedSlot`, `SlotGenerationResult`, `PublishRequest`, `HardConstraintFailure`, `SchedulePublishResult`, `CancelEventRequest`, `EventCancellationResult`, `DeclineAssignmentRequest`, `ConfirmAssignmentRequest`, `ReplacementCandidate`, `ReplacementSearchRequest`, `LifecycleTransitionRequest`, `LifecycleTransitionResult`) in `packages/api/src/domain/assignment/types.ts`
- [ ] T003 [P] Create `PublishValidationError` extending `DomainError` in `packages/api/src/domain/assignment/errors/publish-validation-error.ts`
- [ ] T004 [P] Create `InvalidStateTransitionError` extending `DomainError` in `packages/api/src/domain/assignment/errors/invalid-state-transition-error.ts`
- [ ] T005 [P] Create `EmptyScheduleError` extending `DomainError` in `packages/api/src/domain/assignment/errors/empty-schedule-error.ts`
- [ ] T006 [P] Create `DuplicateSlotsError` extending `DomainError` in `packages/api/src/domain/assignment/errors/duplicate-slots-error.ts`
- [ ] T007 [P] Create barrel export at `packages/api/src/domain/assignment/errors/index.ts`

---

## Phase 2: Foundational (Entity Extensions)

**Purpose**: Extend existing D1 entities required by all user stories

**⚠️ CRITICAL**: Must complete before user story implementation begins

- [ ] T008 Extend `EVENT_STATUS_OPTIONS` with `'past'` and add `markAsPast()` mutation method in `packages/api/src/domain/entities/event.ts`
- [ ] T009 Extend `ASSIGNMENT_STATUS_OPTIONS` with `'draft'` and `'cancelled'`, change default from `'pending'` to `'draft'`, add `markAsPending()` and `cancel()` mutation methods in `packages/api/src/domain/entities/assignment.ts`
- [ ] T010 Add `status` field (`'active' | 'cancelled'`) to `TimeSlotProps` with default `'active'`, add `cancel()` mutation method and `status` getter in `packages/api/src/domain/entities/time-slot.ts`
- [ ] T011 Extend `ASSIGNMENT_AUDIT_ACTION_OPTIONS` with `'event_published'` and `'event_cancelled'` in `packages/api/src/domain/entities/assignment-audit.ts`
- [ ] T012 [P] Update existing entity tests for `Event` (add `markAsPast()`, `'past'` status) in `packages/api/tests/domain/entities/event.test.ts`
- [ ] T013 [P] Update existing entity tests for `Assignment` (add `'draft'`/`'cancelled'` statuses, `markAsPending()`, `cancel()`, new default) in `packages/api/tests/domain/entities/assignment.test.ts`
- [ ] T014 [P] Update existing entity tests for `TimeSlot` (add `status` field, `cancel()`) in `packages/api/tests/domain/entities/time-slot.test.ts`
- [ ] T015 [P] Update existing entity tests for `AssignmentAudit` (new action types) in `packages/api/tests/domain/entities/assignment-audit.test.ts`
- [ ] T016 Create barrel export at `packages/api/src/domain/assignment/index.ts` and re-export from `packages/api/src/domain/index.ts` and `packages/api/src/domain/errors/index.ts`

**Checkpoint**: All entity extensions and error classes in place. Existing entity tests pass. Foundation ready.

---

## Phase 3: User Story 1 — Generate Time Slots (Priority: P1) 🎯 MVP

**Goal**: Generate non-overlapping time slots from an event using Equal Split or Template-Based strategies

**Independent Test**: Provide event duration and strategy, assert correct slot count, time ranges, and requirements

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T017 [US1] Create test file `packages/api/tests/domain/assignment-manager-service.test.ts` with `describe('Slot Generation — Equal Split')` block containing:
  - Test: even division (120min / 30min = 4 slots) — 4 non-overlapping slots
  - Test: remainder (65min / 30min) — 2×30min + 1×5min = 3 slots, `hasRemainder: true`
  - Test: single slot (30min / 30min = 1 slot)
  - Test: slot duration exceeds event duration — 1 slot = full event
  - Test: very small remainder (61min / 30min) — 2×30min + 1×1min
  - Edge: zero-duration slot request → domain error
  - Edge: negative slot duration → domain error
  - Edge: event already has existing slots → `DuplicateSlotsError`
  - Isolation: all generated slots have correct `churchId` and `eventId`

- [ ] T018 [P] [US1] Add `describe('Slot Generation — Template-Based')` block to same test file containing:
  - Test: 3 periods → 3 slots with correct labels and time ranges
  - Test: period with requirements → `SlotRequirement` entities created
  - Test: period with multiple requirements → multiple requirements per slot
  - Test: single period → 1 slot
  - Test: period with zero requirements → slot with empty requirements
  - Test: non-contiguous periods (gap) → slots match template exactly
  - Edge: event already has existing slots → `DuplicateSlotsError`

### Implementation for User Story 1

- [ ] T019 [US1] Implement `generateSlots(request: SlotGenerationRequest): SlotGenerationResult` in `packages/api/src/domain/assignment/assignment-manager-service.ts` with private helpers `generateEqualSplitSlots()` and `generateTemplateSlots()`

**Checkpoint**: Slot generation works for both strategies. Tests pass.

---

## Phase 4: User Story 2 — Publish a Schedule (Priority: P1)

**Goal**: Transition event from `draft` → `published` and all assignments from `draft` → `pending`, with hard constraint re-validation

**Independent Test**: Create draft event + assignments, publish, assert status transitions and audit records

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T020 [US2] Add `describe('Publish Schedule')` block to `packages/api/tests/domain/assignment-manager-service.test.ts` containing:
  - Test: draft event + 5 draft assignments, all pass → event `published`, assignments `pending`, transitionedCount = 5
  - Test: draft event + 1 assignment → success (minimal case)
  - Edge: zero assignments → `EmptyScheduleError`
  - Edge: event already published → `InvalidStateTransitionError`
  - Edge: event already cancelled → `InvalidStateTransitionError`
  - Edge: event already past → `InvalidStateTransitionError`
  - Edge: event start date in past → domain error
  - Edge: 1 of 3 assignments fails hard constraint → `PublishValidationError` with 1 failure
  - Edge: all assignments fail → `PublishValidationError` with all failures
  - Edge: hard constraint failure does NOT mutate any status (rollback)

### Implementation for User Story 2

- [ ] T021 [US2] Implement `publish(request: PublishRequest): SchedulePublishResult` in `packages/api/src/domain/assignment/assignment-manager-service.ts`

**Checkpoint**: Publishing validates and transitions atomically. Tests pass.

---

## Phase 5: User Story 3 — Cancel an Event (Priority: P1)

**Goal**: Cascade cancellation from event → slots → assignments with draft/published differentiation

**Independent Test**: Publish event, cancel, assert cascade to all slots and assignments

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T022 [US3] Add `describe('Cancel Event')` block to `packages/api/tests/domain/assignment-manager-service.test.ts` containing:
  - Test: published event + 3 slots + 8 assignments → all cancelled
  - Test: draft event + 2 draft assignments → assignments deleted (assignmentsDeleted = 2)
  - Edge: already cancelled → `InvalidStateTransitionError`
  - Edge: past event → `InvalidStateTransitionError`
  - Edge: mixed assignment statuses (pending + confirmed + declined) → pending/confirmed → cancelled, declined unchanged
  - Edge: event with zero assignments → event cancelled, slotsAffected = N
  - Isolation: churchId mismatch on slots/assignments → error

### Implementation for User Story 3

- [ ] T023 [US3] Implement `cancelEvent(request: CancelEventRequest): EventCancellationResult` in `packages/api/src/domain/assignment/assignment-manager-service.ts`

**Checkpoint**: Cancellation cascades correctly with draft vs published differentiation. Tests pass.

---

## Phase 6: User Story 4 — Volunteer Confirms Assignment (Priority: P1)

**Goal**: Transition assignment from `pending` → `confirmed` with audit trail and idempotency

**Independent Test**: Confirm a pending assignment, assert status change and audit record

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T024 [US4] Add `describe('Confirm Assignment')` block to `packages/api/tests/domain/assignment-manager-service.test.ts` containing:
  - Test: pending → confirmed, audit returned with action `status_change`
  - Edge: already confirmed (idempotent) → success, returns `null` (no duplicate audit)
  - Edge: draft assignment → `InvalidStateTransitionError`
  - Edge: cancelled assignment → `InvalidStateTransitionError`
  - Edge: declined assignment → `InvalidStateTransitionError`
  - Audit: correct `assignmentId`, `leaderId`, `churchId`, `timestamp`
  - Audit: timestamp uses injected `now`, not system time

### Implementation for User Story 4

- [ ] T025 [US4] Implement `confirmAssignment(request: ConfirmAssignmentRequest): AssignmentAudit | null` in `packages/api/src/domain/assignment/assignment-manager-service.ts`

**Checkpoint**: Confirm is idempotent, produces audit records. Tests pass.

---

## Phase 7: User Story 5 — Volunteer Declines Assignment (Priority: P1)

**Goal**: Transition assignment from `pending`/`confirmed` → `declined` with optional reason and audit trail

**Independent Test**: Decline a pending assignment with reason, assert status change and audit record

### Tests for User Story 5

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T026 [US5] Add `describe('Decline Assignment')` block to `packages/api/tests/domain/assignment-manager-service.test.ts` containing:
  - Test: pending + reason → declined, audit with reason
  - Test: pending without reason → declined, audit with empty reason
  - Test: confirmed + reason → declined (withdraw after confirming)
  - Edge: draft assignment → `InvalidStateTransitionError`
  - Edge: cancelled assignment → `InvalidStateTransitionError`
  - Edge: already declined → `InvalidStateTransitionError`
  - Isolation: churchId mismatch → error
  - Audit: timestamp uses injected `now`

### Implementation for User Story 5

- [ ] T027 [US5] Implement `declineAssignment(request: DeclineAssignmentRequest): AssignmentAudit` in `packages/api/src/domain/assignment/assignment-manager-service.ts`

**Checkpoint**: Decline with audit trail works. Tests pass.

---

## Phase 8: User Story 6 — Find Replacement Volunteers (Priority: P2)

**Goal**: Search for qualified, available, non-conflicting, non-declined replacement candidates sorted by workload

**Independent Test**: Provide candidate pool with known filters, assert correct filtered and sorted result

### Tests for User Story 6

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T028 [US6] Add `describe('Find Replacement Volunteers')` block to `packages/api/tests/domain/assignment-manager-service.test.ts` containing:
  - Test: 3 qualified, all available, none declined → 3 candidates sorted ascending by workload
  - Test: 3 qualified, 1 unavailable, 1 double-booked → 1 candidate
  - Edge: all unavailable → empty list
  - Edge: all already declined → empty list
  - Edge: all overlapping assignments → empty list
  - Edge: mixed filtering (1 unavailable + 1 declined + 1 overlapping + 1 valid) → 1 candidate
  - Edge: workload tie — both returned, stable order
  - Edge: zero qualified volunteers → empty list
  - Isolation: blockout from different church → error
  - Isolation: assignment from different church → error

### Implementation for User Story 6

- [ ] T029 [US6] Implement `findReplacements(request: ReplacementSearchRequest): ReplacementCandidate[]` in `packages/api/src/domain/assignment/assignment-manager-service.ts`

**Checkpoint**: Replacement search filters correctly and sorts by fairness. Tests pass.

---

## Phase 9: User Story 7 — Automatic Lifecycle Transitions (Priority: P2)

**Goal**: Transition expired events to terminal states and auto-confirm pending assignments on past events

**Independent Test**: Create published event past end date, transition, assert `past` status and pending → confirmed

### Tests for User Story 7

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T030 [US7] Add `describe('Lifecycle Transitions')` block to `packages/api/tests/domain/assignment-manager-service.test.ts` containing:
  - Test: published event past end date → event `past`, pending → confirmed
  - Test: draft event past end date → event `cancelled`, assignments deleted
  - Edge: event end date in future → no transition (`transitioned: false`)
  - Edge: already past → no transition
  - Edge: already cancelled → no transition
  - Edge: mixed statuses (pending + confirmed + declined) → only pending → confirmed
  - Edge: zero assignments → event `past`, assignmentsAutoConfirmed = 0

### Implementation for User Story 7

- [ ] T031 [US7] Implement `transitionExpiredEvent(request: LifecycleTransitionRequest): LifecycleTransitionResult` in `packages/api/src/domain/assignment/assignment-manager-service.ts`

**Checkpoint**: Lifecycle transitions work for all event states. Tests pass.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final quality gates, barrel exports, and regression checks

- [ ] T032 Add new error test cases (`PublishValidationError`, `InvalidStateTransitionError`, `EmptyScheduleError`, `DuplicateSlotsError`) to `packages/api/tests/domain/errors.test.ts`
- [ ] T033 Run Biome lint check on all new files: `bunx biome check packages/api/src/domain/assignment/`
- [ ] T034 Run full test suite: `bun run test --filter=api`
- [ ] T035 Verify existing `AvailabilityEngine` tests still pass (no regression): `bun run test packages/api/tests/domain/availability-engine.test.ts`
- [ ] T036 Verify existing `ConflictValidationService` tests still pass (no regression): `bun run test packages/api/tests/domain/conflict-validation-service.test.ts`
- [ ] T037 Verify ALL existing entity tests still pass after extensions: `bun run test packages/api/tests/domain/entities/`
- [ ] T038 Run quickstart.md validation — verify usage examples compile conceptually against the implemented API

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types and errors must exist)
- **User Stories (Phase 3–9)**: All depend on Phase 2 completion
  - US1 (slots) → independent
  - US2 (publish) → depends on US1 concepts (needs slots to exist for context) but can be tested independently
  - US3 (cancel) → independent (can cancel without publishing first in tests)
  - US4 (confirm) → independent
  - US5 (decline) → independent
  - US6 (replacements) → independent
  - US7 (lifecycle) → independent
- **Polish (Phase 10)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 1 → Phase 2 → ┬→ US1 (slot generation)       ← P1 MVP
                     ├→ US2 (publish)                ← P1
                     ├→ US3 (cancel)                 ← P1
                     ├→ US4 (confirm)                ← P1
                     ├→ US5 (decline)                ← P1
                     ├→ US6 (replacements)           ← P2
                     └→ US7 (lifecycle transitions)  ← P2
```

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation follows test tasks
- Story complete before moving to next (per Karpathy Guidelines)

### Parallel Opportunities

- T002–T007 (Phase 1: types and all errors) — all different files
- T008–T011 (Phase 2: entity extensions) — all different entity files
- T012–T015 (Phase 2: entity tests) — all different test files
- T017, T018 (US1: test blocks) — same file but different `describe` blocks
- T032–T038 (Phase 10: polish) — independent verification tasks

---

## Parallel Example: Phase 1

```bash
# Launch Phase 1 tasks together:
Task T002: "Define all types in packages/api/src/domain/assignment/types.ts"
Task T003: "Create PublishValidationError in packages/api/src/domain/assignment/errors/publish-validation-error.ts"
Task T004: "Create InvalidStateTransitionError in packages/api/src/domain/assignment/errors/invalid-state-transition-error.ts"
Task T005: "Create EmptyScheduleError in packages/api/src/domain/assignment/errors/empty-schedule-error.ts"
Task T006: "Create DuplicateSlotsError in packages/api/src/domain/assignment/errors/duplicate-slots-error.ts"
Task T007: "Create barrel export in packages/api/src/domain/assignment/errors/index.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types, errors)
2. Complete Phase 2: Foundational (entity extensions, barrel exports)
3. Complete Phase 3: US1 — Slot generation (both strategies)
4. **STOP and VALIDATE**: Generate slots from an event
5. The core scheduling building block is functional

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Slot generation works (MVP core!)
3. Add US2 → Publish validates and transitions → Deploy/Demo
4. Add US3 → Cancellation cascades cleanly → Deploy/Demo
5. Add US4+US5 → Volunteer agency (confirm/decline) → Deploy/Demo
6. Add US6 → Replacement search → Deploy/Demo
7. Add US7 → Lifecycle auto-transitions → Deploy/Demo
8. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- This is a **pure domain service** — no database, no I/O, no infrastructure. All tests are fast unit tests via Vitest.
- **Round Protocol enforced**: Each task follows micro-plan → approval → implement → review → next
