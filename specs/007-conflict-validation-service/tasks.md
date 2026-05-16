# Tasks: Conflict & Validation Service (Spec L2)

**Input**: Design documents from `specs/007-conflict-validation-service/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅

**Tests**: Included — spec mandates 100% automated test coverage for all constraint categories (SC-001 through SC-006).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)

---

## Test Coverage Plan

### 1. Happy Paths
- [x] Hard validator passes for a fully eligible volunteer → UNIT
- [x] Soft detector returns NoConflict when volunteer is AVAILABLE and under fairness threshold → UNIT
- [x] Override authorized for LEADER with valid reason → UNIT
- [x] Override authorized for ADMIN with valid reason → UNIT
- [x] Audit record created with correct fields on successful override → UNIT

### 2. Permission Matrix
- [x] VOLUNTEER role: override rejected → UNIT
- [x] LEADER role (wrong ministry): override rejected → UNIT
- [x] LEADER role (correct ministry): override accepted → UNIT
- [x] ADMIN role (any ministry): override accepted → UNIT
- [x] SUB_LEADER role: override rejected → UNIT

### 3. Edge Cases & Validation
- [x] Empty string override reason: rejected → UNIT
- [x] Whitespace-only override reason: rejected → UNIT
- [x] Fairness threshold = 0 (disabled): no FAIRNESS_EXCEEDED issue → UNIT
- [x] Multiple simultaneous soft conflicts: ALL reported in ConflictReport → UNIT
- [x] Volunteer qualifies for role via global role: accepted → UNIT
- [x] Duplicate assignment to same slot: DUPLICATE_ASSIGNMENT hard error → UNIT
- [x] Event exactly at `now` boundary: EVENT_IN_PAST or not? (strict `>` means equal = past) → UNIT

### 4. Catastrophic Failures
- [x] N/A — pure domain service with no I/O. All inputs are injected. No infrastructure failures possible at this layer.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the conflict module directory structure and foundational types

- [x] T001 Create conflict module directory at `packages/api/src/domain/conflict/` and `packages/api/src/domain/conflict/errors/`
- [x] T002 [P] Define all new types (`HardConstraintReason`, `SoftConflictType`, `ConflictIssue`, `ConflictReport`, `NoConflict`, `SoftConflictResult`, `CallerContext`, `ValidationRequest`, `OverrideRequest`) in `packages/api/src/domain/conflict/types.ts`
- [x] T003 [P] Create `HardConstraintError` extending `DomainError` with typed `reason` field in `packages/api/src/domain/conflict/errors/hard-constraint-error.ts`

---

## Phase 2: Foundational (Entity Extension)

**Purpose**: Extend existing entities required by all user stories

**⚠️ CRITICAL**: Must complete before user story implementation begins

- [x] T004 Extend `AssignmentAuditProps` with optional `overrideConflictTypes?: SoftConflictType[]` field in `packages/api/src/domain/entities/assignment-audit.ts`
- [x] T005 Add getter `overrideConflictTypes` to `AssignmentAudit` class in `packages/api/src/domain/entities/assignment-audit.ts`
- [x] T006 Re-export `HardConstraintError` from `packages/api/src/domain/errors/index.ts`
- [x] T007 Export conflict module from `packages/api/src/domain/index.ts`
- [x] T008 Create barrel export at `packages/api/src/domain/conflict/index.ts`

**Checkpoint**: Foundation ready — all types, errors, and entity extensions are in place

---

## Phase 3: User Story 1 — Validate Assignment Against Hard Constraints (Priority: P1) 🎯 MVP

**Goal**: Reject assignments that violate non-overridable eligibility rules (NOT_QUALIFIED, NOT_IN_MINISTRY, EVENT_IN_PAST, DUPLICATE_ASSIGNMENT)

**Independent Test**: Provide a `ValidationRequest` with ineligible data and assert `HardConstraintError` is thrown with the correct reason code

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Create test file `packages/api/tests/domain/conflict-validation-service.test.ts` with `describe('Hard Constraints')` block containing:
  - Test: throws `HardConstraintError` with `NOT_QUALIFIED` when `roleId` is not in `volunteerQualifiedRoleIds`
  - Test: throws `HardConstraintError` with `NOT_IN_MINISTRY` when `ministryId` is not in `volunteerMinistryIds`
  - Test: throws `HardConstraintError` with `EVENT_IN_PAST` when `eventStartTime <= now`
  - Test: throws `HardConstraintError` with `DUPLICATE_ASSIGNMENT` when `slotId` is in `existingAssignmentIds`
  - Test: does NOT throw when volunteer is qualified, in ministry, event is future, and no duplicate
  - Test: hard constraints are evaluated in order — `NOT_QUALIFIED` checked before `NOT_IN_MINISTRY`
  - Edge: `eventStartTime` exactly equal to `now` is treated as past (strict `>`)
  - Isolation: all validation inputs MUST match the request's `churchId` — assert no cross-tenant data leaks (FR-009)

### Implementation for User Story 1

- [x] T010 [US1] Implement `validateHardConstraints(request: ValidationRequest): void` private function in `packages/api/src/domain/conflict/conflict-validation-service.ts` — throws `HardConstraintError` on failure
- [x] T011 [US1] Wire `validateHardConstraints` into the public `validate(request: ValidationRequest): SoftConflictResult` method that calls hard checks first, then delegates to soft conflict detection in `packages/api/src/domain/conflict/conflict-validation-service.ts`

**Checkpoint**: Hard constraints block invalid assignments. Tests pass. Service is partially functional.

---

## Phase 4: User Story 2 — Detect Soft Conflicts and Present Override Decision (Priority: P1)

**Goal**: Accumulate all soft conflicts (UNAVAILABLE, DOUBLE_BOOKED, FAIRNESS_EXCEEDED) into a `ConflictReport` when hard constraints pass

**Independent Test**: Provide a `ValidationRequest` with known availability status and fairness data, assert correct `ConflictReport` or `NoConflict` returned

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T012 [P] [US2] Add `describe('Soft Conflicts')` block to `packages/api/tests/domain/conflict-validation-service.test.ts` containing:
  - Test: returns `{ hasConflicts: false }` when availability is `AVAILABLE` and `serviceCount < fairnessThreshold`
  - Test: returns ConflictReport with `UNAVAILABLE` issue when `availabilityResult.status === 'UNAVAILABLE'`
  - Test: returns ConflictReport with `DOUBLE_BOOKED` issue when `availabilityResult.status === 'DOUBLE_BOOKED'`
  - Test: returns ConflictReport with `FAIRNESS_EXCEEDED` issue when `serviceCount >= fairnessThreshold` and `fairnessThreshold > 0`
  - Test: skips fairness check when `fairnessThreshold === 0`
  - Test: accumulates ALL issues when multiple soft conflicts exist simultaneously (e.g., UNAVAILABLE + FAIRNESS_EXCEEDED)
  - Test: ConflictReport `issues` array contains the correct `conflictingId` from `availabilityResult`
  - Test: ConflictReport `issues` metadata includes `serviceCount` and `fairnessThreshold` for FAIRNESS_EXCEEDED
  - Test: `hasConflicts` is `true` when at least one issue exists
  - Edge: hard constraints still throw even when soft conflicts would also exist (hard first, soft never reached)

### Implementation for User Story 2

- [x] T013 [US2] Implement `detectSoftConflicts(request: ValidationRequest): SoftConflictResult` private function in `packages/api/src/domain/conflict/conflict-validation-service.ts`
- [x] T014 [US2] Integrate soft conflict detection into the `validate()` method after hard constraint check in `packages/api/src/domain/conflict/conflict-validation-service.ts`

**Checkpoint**: Full validation pipeline works — hard constraints block, soft conflicts are reported. Tests pass.

---

## Phase 5: User Story 3 — Audit Trail for Override Decisions (Priority: P2)

**Goal**: Create `AssignmentAudit` entities when a leader overrides soft conflicts, with all required fields populated

**Independent Test**: Execute an override flow and assert the returned `AssignmentAudit` has correct `overrideConflictTypes`, `reason`, `leaderId`, etc.

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T015 [P] [US3] Add `describe('Override Audit Creation')` block to `packages/api/tests/domain/conflict-validation-service.test.ts` containing:
  - Test: `authorizeOverride` returns an `AssignmentAudit` entity with correct `leaderId`, `churchId`, `reason`, and `overrideConflictTypes`
  - Test: `overrideConflictTypes` contains all conflict types from the `ConflictReport`
  - Test: `action` is `'created'` on the returned audit
  - Test: `timestamp` is set on the returned audit
  - Test: NO audit is created when there are no soft conflicts (calling authorize override with `NoConflict` should be impossible/rejected)

### Implementation for User Story 3

- [x] T016 [US3] Implement `createOverrideAudit(request: OverrideRequest, report: ConflictReport): AssignmentAudit` helper in `packages/api/src/domain/conflict/conflict-validation-service.ts` — uses `request.churchId` and `request.assignmentId` from the `OverrideRequest`
- [x] T017 [US3] Wire audit creation into `authorizeOverride()` method in `packages/api/src/domain/conflict/conflict-validation-service.ts`

**Checkpoint**: Override flow produces auditable records. Tests pass.

---

## Phase 6: User Story 4 — Role-Based Override Authorization (Priority: P2)

**Goal**: Enforce that only LEADER (ministry-scoped) or ADMIN can authorize overrides; reject VOLUNTEER and SUB_LEADER

**Independent Test**: Attempt overrides with each `SystemRole` and assert correct acceptance or rejection

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T018 [P] [US4] Add `describe('Override Authorization')` block to `packages/api/tests/domain/conflict-validation-service.test.ts` containing:
  - Test: LEADER with matching `ministryId` → override accepted, audit returned
  - Test: LEADER with non-matching `ministryId` → permission error thrown
  - Test: ADMIN with any `ministryId` → override accepted, audit returned
  - Test: ADMIN without `ministryId` → override accepted (admin is global)
  - Test: VOLUNTEER → permission error thrown
  - Test: SUB_LEADER → permission error thrown
  - Test: empty `overrideReason` → rejected (before role check)
  - Test: whitespace-only `overrideReason` → rejected (before role check)

### Implementation for User Story 4

- [x] T019 [US4] Implement `validateOverrideAuthorization(request: OverrideRequest): void` private function in `packages/api/src/domain/conflict/conflict-validation-service.ts`
- [x] T020 [US4] Wire authorization check into `authorizeOverride()` before audit creation in `packages/api/src/domain/conflict/conflict-validation-service.ts`
- [x] T021 [US4] Create `UnauthorizedOverrideError` extending `DomainError` in `packages/api/src/domain/conflict/errors/unauthorized-override-error.ts`
- [x] T022 [US4] Create `InvalidOverrideReasonError` extending `DomainError` in `packages/api/src/domain/conflict/errors/invalid-override-reason-error.ts`
- [x] T023 [US4] Re-export new errors from `packages/api/src/domain/conflict/errors/index.ts` and `packages/api/src/domain/errors/index.ts`

**Checkpoint**: Full authorization enforcement works. All role combinations tested. Tests pass.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final quality gates across all user stories

- [x] T024 Update `packages/api/src/index.ts` barrel exports to include conflict module
- [x] T025 Run Biome lint check on all new files: `bunx biome check packages/api/src/domain/conflict/`
- [x] T026 Run full test suite: `bun run test --filter=api`
- [x] T027 Run quickstart.md validation — verify usage examples compile conceptually against the implemented API
- [x] T028 Verify existing `AvailabilityEngine` tests still pass (no regression): `bun run test packages/api/tests/domain/availability-engine.test.ts`
- [x] T029 Verify existing `AssignmentAudit` entity tests still pass after extension: `bun run test packages/api/tests/domain/entities/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types and errors must exist)
- **User Stories (Phase 3–6)**: All depend on Phase 2 completion
  - US1 and US2 can proceed in parallel (different functions)
  - US3 depends on US2 (needs `ConflictReport` type and `authorizeOverride` signature)
  - US4 depends on US3 (adds authorization to the override method)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 1 → Phase 2 → ┬→ US1 (hard constraints)
                     ├→ US2 (soft conflicts)    → US3 (audit) → US4 (authorization)
                     └→ (US1 + US2 compose into validate())
```

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation tasks follow test tasks
- Story complete before moving to next (per Karpathy Guidelines)

### Parallel Opportunities

- T002, T003 (Phase 1: types and errors) — different files
- T009, T012 (US1 + US2 test stubs) — same file but different `describe` blocks, can be planned together
- T024–T029 (Phase 7: polish) — independent verification tasks

---

## Parallel Example: Phase 1

```bash
# Launch Phase 1 tasks together:
Task T002: "Define all types in packages/api/src/domain/conflict/types.ts"
Task T003: "Create HardConstraintError in packages/api/src/domain/conflict/errors/hard-constraint-error.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 Only)

1. Complete Phase 1: Setup (types, errors)
2. Complete Phase 2: Foundational (entity extension, barrel exports)
3. Complete Phase 3: US1 — Hard constraint validation
4. Complete Phase 4: US2 — Soft conflict detection
5. **STOP and VALIDATE**: Full `validate()` pipeline works — hard blocks, soft reports
6. The core scheduling validation is functional

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Hard constraints block invalid assignments (MVP core!)
3. Add US2 → Soft conflicts detected and reported → Deploy/Demo
4. Add US3 → Override audit trail → Deploy/Demo
5. Add US4 → Authorization enforcement → Deploy/Demo
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- This is a **pure domain service** — no database, no I/O, no infrastructure. All tests are fast unit tests via Vitest.
