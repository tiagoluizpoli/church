---
description: "Task list for Local Development Seeding feature implementation"
---

# Tasks: Local Development Seeding

**Input**: Design documents from `specs/003-local-seeding/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Organization**: Tasks are grouped by phase and user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for the seeder

- [ ] T001 Install `@faker-js/faker` as a dev dependency in `packages/db/package.json`
- [ ] T002 Add `seed` and `seed:reset` package scripts to `packages/db/package.json`
- [ ] T003 Create seeder entry point in `packages/db/src/seed/index.ts` with CLI argument parsing (checking for `--reset`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before data generation

**⚠️ CRITICAL**: No generation logic can begin until this phase is complete

- [ ] T004 Import and validate environment variables using the `@base-fullstack-template/env` schema before script execution
- [ ] T004.1 Import and configure Drizzle database connection in `packages/db/src/seed/index.ts`
- [ ] T005 Implement cascading table truncation logic for the `--reset` flag in `packages/db/src/seed/index.ts`
- [ ] T006 Initialize deterministic random data generation `faker.seed(12345)` in `packages/db/src/seed/index.ts`

**Checkpoint**: Foundation ready - database connection is active and reset logic works.

---

## Phase 3: User Story 1 & 2 - Data Generation (Priority: P1) 🎯 MVP

**Goal**: Generate a predictable, deterministic, multi-tenant baseline of data representing multiple churches, ministries, teams, and volunteers with associated roles and events. Ensure reproducible and predictable data states.

**Independent Test**: Can be tested by running the seeder twice in a row (with reset) and verifying that the generated entity IDs, names, and date relationships match identically and no foreign key constraint errors occur.

### Tests for User Story 1 & 2 (REQUIRED) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T006.1 [P] [Foundational] Create unit test to verify script fails fast on missing environment variables in `packages/db/tests/seed.test.ts`
- [ ] T007 [P] [US1] Create integration test to verify multi-tenant record generation and structure in `packages/db/tests/seed.test.ts`
- [ ] T008 [P] [US2] Create integration test to verify deterministic repeatability across multiple seed runs in `packages/db/tests/seed.test.ts`

### Implementation for User Story 1 & 2

- [ ] T009 [US1] Create Church generation logic in `packages/db/src/seed/index.ts` (generate 3 distinct churches)
- [ ] T010 [US1] Create Ministry and Team generation logic mapping to Churches in `packages/db/src/seed/index.ts`
- [ ] T011 [US1] Create Role generation logic in `packages/db/src/seed/index.ts`
- [ ] T012 [US1] Create Volunteer generation logic mapping to Roles and Teams in `packages/db/src/seed/index.ts` (10+ per church)
- [ ] T013 [US1] [US2] Create Event generation logic (80% future, 20% past) in `packages/db/src/seed/index.ts`
- [ ] T014 [US1] Create Slot and Requirement generation logic tied to Events in `packages/db/src/seed/index.ts`
- [ ] T015 [US1] Implement the main seeder execution flow calling the above generators in correct referential order in `packages/db/src/seed/index.ts`

**Checkpoint**: At this point, the seeder is fully functional, creates reproducible datasets, and passes all integration tests.

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements and validations

- [ ] T016 Run validation by executing `bun run seed:reset` manually to verify zero constraint errors and correct standard output

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 & 2**: Handled sequentially due to file co-location in `index.ts` but requires Foundational (Phase 2) to be complete. Tests must be written before logic implementation.

### Parallel Opportunities

- T007 and T008 can be executed in parallel as they target the same test file but describe different testing requirements.
- Due to the nature of seeding scripts where referential integrity forces a strict insertion order (Churches -> Ministries -> Volunteers -> Events), parallelization is minimal for the actual seeding logic. All tasks are currently targeted at `packages/db/src/seed/index.ts` to ensure execution within a single deterministic run context.

---

## Implementation Strategy

### MVP First

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: Data Generation (Write tests first, then implementation)
4. **STOP and VALIDATE**: Test the seeder script independently (T016)
