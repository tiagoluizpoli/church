# Tasks: Admin & Leader API (Spec A1)

**Input**: Design documents from `/specs/011-admin-leader-api/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/trpc-router.md

**Tests**: TDD approach is requested. Test tasks must be written first and fail (RED) before implementation (GREEN) for each user story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and validation of the server's test framework.

- [x] T001 Verify server test framework configuration in `apps/server/vitest.config.ts`
- [x] T002 [P] Create folders and verify file structure for router and integration tests under `apps/server/src/routers/` and `apps/server/tests/integration/routers/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core router structure and RBAC validation utility that must be complete before any user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Create empty router skeleton `adminLeaderRouter` and export it in `apps/server/src/routers/admin-leader.ts`
- [x] T004 Mount `adminLeaderRouter` on the main app router at route `adminLeader` in `apps/server/src/routers/index.ts`
- [x] T005 Implement contextual RBAC utility `authorizeLeaderOrAdmin` in `apps/server/src/routers/admin-leader.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Fetch Schedule Builder Data (Priority: P1) 🎯 MVP

**Goal**: Retrieve all slots, requirements, assignments, and volunteer availability for an event.

**Independent Test**: Request schedule builder data for an event and verify the returned JSON projection matches `ScheduleBuilderDataResponse` and is protected by authorization/tenancy.

### Tests for User Story 1 (TDD)
> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T006 [US1] Write integration test cases for `getScheduleBuilderData` verifying schema, authorization rules, and cross-church data leakage prevention in `apps/server/tests/integration/routers/admin-leader.test.ts`

### Implementation for User Story 1
- [x] T007 [US1] Implement `getScheduleBuilderData` query handler in `apps/server/src/routers/admin-leader.ts`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently.

---

## Phase 4: User Story 2 - Add or Update Staffing Needs (Priority: P1)

**Goal**: Create or update required volunteer counts (`SlotRequirement`) for a specific time slot and role.

**Independent Test**: Modify requirement count via `upsertSlotRequirement` and verify count is updated, and check that reducing count below active assignment count returns warning message while leaving assignments intact.

### Tests for User Story 2 (TDD)
> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T008 [US2] Write integration test cases for `upsertSlotRequirement` verifying role validation, tenancy isolation, and overstaffing warning behaviour in `apps/server/tests/integration/routers/admin-leader.test.ts`

### Implementation for User Story 2
- [x] T009 [US2] Implement `upsertSlotRequirement` mutation handler in `apps/server/src/routers/admin-leader.ts`

**Checkpoint**: At this point, User Stories 1 and 2 should both work independently.

---

## Phase 5: User Story 3 - Assign a Volunteer with Conflict Check (Priority: P1)

**Goal**: Assign a volunteer to a role in a time slot with conflict checks, audit log creation, and optional leader overrides.

**Independent Test**: Create assignments via `createAssignment` and verify conflict reporting, status overrides with reasons, hard constraint errors, and draft vs pending status logic.

### Tests for User Story 3 (TDD)
> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T010 [US3] Write integration test cases for `createAssignment` verifying conflict checks, override reasoning requirements, hard constraint failures, status resolution, and audit log generation in `apps/server/tests/integration/routers/admin-leader.test.ts`

### Implementation for User Story 3
- [x] T011 [US3] Implement `createAssignment` mutation handler in `apps/server/src/routers/admin-leader.ts`

**Checkpoint**: At this point, User Stories 1, 2, and 3 should work independently.

---

## Phase 6: User Story 4 - Remove Volunteer Assignment (Priority: P1)

**Goal**: Remove volunteer assignments by either deleting the row if in `draft` status or transitioning to `cancelled` if in `pending` or `confirmed` status.

**Independent Test**: Remove assignments via `deleteAssignment` and verify deletion or status transition as well as audit log generation.

### Tests for User Story 4 (TDD)
> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T012 [US4] Write integration test cases for `deleteAssignment` verifying deletion of draft assignments, status transition to `cancelled` for pending/confirmed, and audit log generation in `apps/server/tests/integration/routers/admin-leader.test.ts`

### Implementation for User Story 4
- [x] T013 [US4] Implement `deleteAssignment` mutation handler in `apps/server/src/routers/admin-leader.ts`

**Checkpoint**: User Stories 1-4 should now be independently functional.

---

## Phase 7: User Story 5 - Publish Event Schedule (Priority: P2)

**Goal**: Transition event status to `published` and change all of its `draft` assignments to `pending` in a single transactional rollback block on hard constraint failure.

**Independent Test**: Call `publishEvent` and verify all draft assignments transition to pending, verify rollback on hard constraint failure, and ensure notification event `EventPublished` is emitted.

### Tests for User Story 5 (TDD)
> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T014 [US5] Write integration test cases for `publishEvent` verifying transition logic, transactional rollback on validation failure, and event emission in `apps/server/tests/integration/routers/admin-leader.test.ts`

### Implementation for User Story 5
- [x] T015 [US5] Implement `publishEvent` mutation handler in `apps/server/src/routers/admin-leader.ts`

**Checkpoint**: Event publishing works atomically.

---

## Phase 8: User Story 6 - Cancel Event Schedule (Priority: P2)

**Goal**: Set event status to `cancelled`, delete all draft assignments, and transition all other active assignments to `cancelled` status.

**Independent Test**: Call `cancelEvent` and verify event and assignment state modifications and emission of `EventCancelled` notification event.

### Tests for User Story 6 (TDD)
> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T016 [US6] Write integration test cases for `cancelEvent` verifying draft assignment deletions, non-draft assignment cancellations, event cancellation, and domain event emission in `apps/server/tests/integration/routers/admin-leader.test.ts`

### Implementation for User Story 6
- [x] T017 [US6] Implement `cancelEvent` mutation handler in `apps/server/src/routers/admin-leader.ts`

**Checkpoint**: Event and assignment cancellation work atomically.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Code styling, documentation, and final system integration validation.

- [x] T018 [P] Update API documentation and usage examples in `specs/011-admin-leader-api/quickstart.md`
- [x] T019 Clean up styling and format code using Biome across modified files
- [x] T020 Run the entire test suite via `bun run test` to verify zero regressions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories.
- **User Stories (Phase 3+)**: All depend on Foundational phase completion.
  - User stories can then proceed sequentially in priority order (P1 → P2).
- **Polish (Final Phase)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: No story dependencies. Can start immediately after Phase 2 is complete.
- **User Story 2 (P1)**: Can run after US1 is completed.
- **User Story 3 (P1)**: Depends on US1 (requires reading data).
- **User Story 4 (P1)**: Depends on US3 (requires existing assignments).
- **User Story 5 (P2)**: Depends on US3 and US4 (publishing lifecycle of assignments).
- **User Story 6 (P2)**: Depends on US3 and US4 (cancelling lifecycle of assignments).

### Within Each User Story

- Tests (TDD) MUST be written first and FAIL before implementation.
- Router endpoint validation schemas before database handler code.
- Core handler logic before custom error handling / domain event logging.

### Parallel Opportunities

- Verification of configuration (T001) and folder structure creation (T002) can run in parallel.
- Documentation update (T018) can run in parallel with final verification steps.

---

## Parallel Example: User Story 1

```bash
# Setup files and folders for User Story 1 integration testing:
Task: "Create folders and verify file structure for router and integration tests..."
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories).
3. Complete Phase 3: User Story 1 (Fetch Schedule Builder Data).
4. **STOP and VALIDATE**: Verify using the newly created tests that schedule data can be requested by authorized roles.

### Incremental Delivery

1. Setup + Foundational → Router scaffolding ready.
2. Add US1 → Test independently → Verify fetch scheduling grid (MVP!).
3. Add US2 → Test independently → Verify requirement adjustments.
4. Add US3 → Test independently → Verify volunteer assignments and conflict detection.
5. Add US4 → Test independently → Verify assignment removal.
6. Add US5 → Test independently → Verify atomic event schedule publishing.
7. Add US6 → Test independently → Verify event schedule cancellation.
