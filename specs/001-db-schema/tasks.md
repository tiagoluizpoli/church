# Tasks: Database Schema (Phase 1)

**Input**: Design documents from `/specs/001-db-schema/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, test-plan.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create database schema directory structure (`packages/database/src/schema/`)
- [x] T002 Update `drizzle.config.ts` to point to the new modular schema structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Create `Church` base tenant entity in `packages/database/src/schema/core.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Multi-Tenant Data Isolation (Priority: P1) 🎯 MVP

**Goal**: Establish isolated tenant boundaries across all core entities (Ministry, Team, Volunteer, Role).

**Independent Test**: Can be fully tested by attempting to retrieve records using a different `church_id` than the one assigned to the context.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T004 [P] [US1] Integration test: "Ministry requires valid church_id" (TC-BE-001) in `packages/database/tests/schema/multi-tenant.test.ts`
- [x] T005 [P] [US1] Integration test: "Ministry soft-delete preserves records" (TC-BE-002) in `packages/database/tests/schema/multi-tenant.test.ts`
- [x] T006 [P] [US1] Integration test: "MinistryInvitation unique token constraint" (TC-BE-005) in `packages/database/tests/schema/onboarding.test.ts`
- [x] T026 [P] [US1] Integration test: "Unauthorized cross-church queries return zero results" (TC-BE-006) in `packages/database/tests/schema/multi-tenant.test.ts`

### Implementation for User Story 1

- [x] T007 [P] [US1] Create `Ministry` model in `packages/database/src/schema/core.ts` (include `deleted_at: timestamp` and `enforcement_type` enum)
- [x] T008 [P] [US1] Create `Team` model in `packages/database/src/schema/core.ts`
- [x] T009 [US1] Create `Volunteer` model in `packages/database/src/schema/core.ts` (with `user_id: text` foreign key reference to Better Auth user)
- [x] T010 [US1] Create `MinistryVolunteer` join model in `packages/database/src/schema/core.ts`
- [x] T011 [US1] Create `Role` model in `packages/database/src/schema/core.ts`
- [x] T012 [P] [US1] Create `MinistryInvitation` model in `packages/database/src/schema/onboarding.ts`
- [x] T030 [P] [US1] Integration test: "Invitation expiry, usage, and deleted ministry edge cases" (TC-BE-010, TC-BE-011, EC-3) in `packages/database/tests/schema/onboarding.test.ts`
- [x] T034 [P] [US1] Integration test: "Role constraints (global vs ministry-scoped)" in `packages/database/tests/schema/core.test.ts`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Core Scheduling Structure (Priority: P1)

**Goal**: Implement the foundational data structures (Events, TimeSlots, Requirements, Assignments, Availability) to eventually schedule volunteers.

**Independent Test**: Can be tested by inserting and retrieving structured event and slot data while enforcing cascading logic.

### Tests for User Story 2 ⚠️

- [x] T013 [P] [US2] Integration test: "TimeSlot timestamp precision" (TC-BE-003) in `packages/database/tests/schema/scheduling.test.ts`
- [x] T014 [P] [US2] Integration test: "SlotRequirement minimum count" (TC-BE-004) in `packages/database/tests/schema/scheduling.test.ts`
- [x] T027 [P] [US2] Integration test: "Assignment state transitions" (TC-BE-007) in `packages/database/tests/schema/assignments.test.ts`
- [x] T028 [P] [US2] Integration test: "Assignment audit logging" (TC-BE-008) in `packages/database/tests/schema/assignments.test.ts`

### Implementation for User Story 2

- [x] T015 [P] [US2] Create `Event` model in `packages/database/src/schema/scheduling.ts`
- [x] T016 [US2] Create `TimeSlot` model in `packages/database/src/schema/scheduling.ts`
- [x] T017 [US2] Create `SlotRequirement` model in `packages/database/src/schema/scheduling.ts`
- [x] T018 [P] [US2] Create `Availability` model in `packages/database/src/assignments.ts`
- [x] T019 [US2] Create `Assignment` model in `packages/database/src/assignments.ts`
- [x] T020 [US2] Create `AssignmentAudit` model in `packages/database/src/assignments.ts`
- [x] T029 [P] [US2] Integration test: "Concurrent assignment unique constraint" (TC-BE-009) in `packages/database/tests/schema/assignments.test.ts`
- [x] T035 [US2] Implement DB-level constraints (or application-level Drizzle logic) for `TimeSlot` bounds, `SlotRequirement` minimum count, and `Assignment` state transitions (per data-model validation rules).

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T021 [P] Ensure all schema models are exported properly in `packages/database/src/schema/index.ts`
- [x] T022 Generate migration via `pnpm --filter database db:generate`
- [x] T023 Run `drizzle-kit check:pg` to validate schema configurations
- [x] T024 Develop `packages/database/scripts/seed.ts` script to insert base `Church` record
- [x] T025 Execute migration and seeding against local database

---

## Phase N+1: Contextual Leadership Refactor 🎯 NEXT

**Purpose**: Implement the updated contextual leadership mechanism in the core schema.

- [x] T031 Update `packages/database/src/schema/core.ts` to remove `leader_id` from the `Team` model.
- [x] T032 Ensure `MinistryVolunteer` model in `packages/database/src/schema/core.ts` explicitly documents `system_role` enum (`LEADER`, `SUB_LEADER`, `VOLUNTEER`) usage for team leadership.
- [x] T033 Create integration test: "Team leadership queries rely on Ministry_Volunteer join table" (SC-004) in `packages/database/tests/schema/core.test.ts` (or `multi-tenant.test.ts`).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Integrates with US1 components (Ministry, Volunteer) but could theoretically be built in parallel.

### Parallel Opportunities

- Within US1, core models like Ministry, Team, Volunteer, and MinistryInvitation can be created in parallel.
- Within US2, scheduling models and assignment models can be grouped into parallel lanes.
- All integration tests can be written in parallel before implementation.

---

## Implementation Strategy
- **Surgical Execution**: Follow the AGENTS.md rule: Plan -> Approval -> Implement -> Review for EVERY task.
- **Verification First**: Every infrastructure change must be validated with `lint`, `check-types` and `test` to ensure zero regressions.
