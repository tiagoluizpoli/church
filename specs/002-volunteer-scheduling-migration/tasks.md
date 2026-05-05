# Tasks: Volunteer Scheduling Migration

**Input**: Design documents from `/specs/002-volunteer-scheduling-migration/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Tests are MANDATORY. Every user story and functional requirement must be verified using the scenarios defined in `tests/exhaustive-scenarios.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Configure `.env.example` with system initialization placeholders in `apps/server/.env.example`
- [ ] T002 [P] Create `packages/database/seed-data.json` template with example dummy data
- [ ] T003 [P] Add `zod` dependency to `packages/database` if not present for seed validation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 [P] Create `packages/database/src/schemas/seed.ts` for `seed-data.json` validation
- [ ] T005 [P] Create `packages/database/src/scripts/init-system.ts` entry point boilerplate
- [ ] T006 Configure `packages/database/package.json` with a `db:init-system` run command

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - System Initialization (Priority: P1) 🎯 MVP

**Goal**: Establish foundational Church and Admin records using a local JSON seed file.

**Independent Test**: Run `bun db:init-system` and verify via database query that the Church exists and the admin user is linked as LEADER of the "Administration" ministry.

### Tests for User Story 1

- [ ] T007 [US1] Write integration test BT-001 (Happy Path: valid initialization) in `packages/database/tests/scripts/init-system.test.ts`
- [ ] T008 [US1] Write integration test BT-004 (Edge: malformed JSON validation)
- [ ] T009 [US1] Write integration test BT-005 (Edge: admin user email not found)
- [ ] T010 [US1] Write integration test BT-006 (Edge: church slug already exists)

### Implementation for User Story 1

- [ ] T011 [US1] Implement JSON seed parsing and Zod validation in `packages/database/src/scripts/init-system.ts`
- [ ] T012 [US1] Implement atomic transaction logic for Church and Ministry creation
- [ ] T013 [US1] Implement Admin user lookup and promotion (link to "Administration" ministry as LEADER)
- [ ] T014 [US1] Implement idempotency check to avoid duplicate Church creation for existing slugs

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Lazy Volunteer Onboarding (Priority: P1)

**Goal**: Automatically create a Volunteer profile upon the first successful user login.

**Independent Test**: Simulate a Better Auth session creation for a new user and verify a corresponding `active` Volunteer record is created in the System Church.

### Tests for User Story 2

- [ ] T015 [US2] Write integration test BT-002 (Happy Path: first login onboarding) in `packages/auth/tests/hooks/soft-registration.test.ts`
- [ ] T016 [US2] Write integration test BT-003 (Edge: skip for existing volunteer)
- [ ] T017 [US2] Write integration test BT-007 (Edge: concurrent login idempotency)
- [ ] T018 [US2] Write integration test BT-009 (Edge: Database error during hook execution)

### Implementation for User Story 2

- [ ] T019 [US2] Implement Better Auth `after.sessionCreate` hook in `packages/auth/src/index.ts`
- [ ] T020 [US2] Implement lookup logic for default `church_id` in the registration hook
- [ ] T021 [US2] Implement idempotent `Volunteer` record insertion with `status: 'active'` and graceful error handling (BT-009)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Relational Integrity (Priority: P2)

**Goal**: Ensure strict data links and prevent orphaned records during and after migration.

**Independent Test**: Verify database-level constraints block insertions of Volunteers without valid `church_id` or `user_id`.

### Tests for User Story 3

- [ ] T022 [US3] Write unit tests for `Volunteer` and `Ministry` model schema constraints in `packages/database/tests/schema/integrity.test.ts`
- [ ] T023 [US3] Write integration test for **SC-001** (Zero session loss): Verify existing session tokens remain valid after schema updates

### Implementation for User Story 3

- [ ] T024 [US3] Verify and enforce `notNull()` and `references()` constraints in `packages/database/src/schema/core.ts`
- [ ] T025 [US3] Verify BT-008 (rollback on failure) integration test in `packages/database/tests/scripts/init-system.test.ts`

**Checkpoint**: All user stories should now be independently functional

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T026 [P] Update root `package.json` to expose the initialization command
- [ ] T027 [US1] Performance benchmark for SC-003: Verify soft registration completes < 500ms
- [ ] T028 [P] Run `quickstart.md` validation against a clean database state
- [ ] T029 Code cleanup and Biome linting across all modified packages

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
- **Polish (Final Phase)**: Depends on all user stories being complete

### Implementation Strategy

- Foundation ready.
- Add System Initialization (US1) -> Admin ready.
- Add Soft Registration (US2) -> Users ready.
- Add Integrity checks (US3) -> System hardened.
- Final validation and performance benchmarking.
