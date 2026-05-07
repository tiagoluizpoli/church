---
description: "Task list for Local Development Seeding feature implementation"
---

# Tasks: Local Development Seeding

**Input**: Design documents from `specs/003-local-seeding/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

## Phase 1: Setup (Shared Infrastructure)
- [x] T001 Install `@faker-js/faker` as a dev dependency in `packages/db/package.json`
- [x] T002 Add `seed` and `seed:reset` package scripts to `packages/db/package.json`
- [x] T003 Create seeder entry point in `packages/db/src/seed/index.ts` with CLI argument parsing

## Phase 2: Foundational (Blocking Prerequisites)
- [x] T004 Import and validate environment variables using the `@base-fullstack-template/env` schema
- [x] T004.1 Import and configure Drizzle database connection in `packages/db/src/seed/index.ts`
- [x] T005 Implement cascading table truncation logic for the `--reset` flag (initial manual approach)
- [x] T006 Initialize deterministic random data generation `faker.seed(12345)`

## Phase 3: Monolithic Implementation (COMPLETED)
- [x] T007 Create integration test to verify multi-tenant record generation and structure
- [x] T008 Create integration test to verify deterministic repeatability
- [x] T009 [US1] Create Church generation logic
- [x] T010 [US1] Create Ministry and Team generation logic
- [x] T011 [US1] Create Role generation logic
- [x] T012 [US1] Create Volunteer generation logic
- [x] T013 [US1] [US2] Create Event generation logic
- [x] T014 [US1] Create Slot and Requirement generation logic
- [x] T015 [US1] Implement the main seeder execution flow

---

# Phase 4: Modular Refactor & Hardening (Backend Specialist Review) 🎯 CURRENT

**Goal**: Split monolithic seeder into granular factories, isolate DB client, and complete missing domain logic (Assignments/Availability).

## Phase 4.1: Infrastructure Isolation
- [x] T017 Create `packages/db/src/client.ts` for Drizzle instantiation
- [x] T018 Update `packages/db/src/index.ts` to export from client and schema
- [x] T019 Delete legacy seeder at `packages/db/scripts/seed.ts`
- [x] T020 Update `packages/db/package.json` with consolidated `db:seed` scripts

## Phase 4.2: Modular Factories
- [x] T021 Create `packages/db/src/seed/constants.ts` for configuration
- [x] T022 Implement `TRUNCATE CASCADE` logic in `packages/db/src/seed/utils.ts`
- [x] T023 Implement `packages/db/src/seed/factories/church.factory.ts`
- [x] T024 Implement `packages/db/src/seed/factories/ministry.factory.ts`
- [x] T025 Implement `packages/db/src/seed/factories/volunteer.factory.ts`
- [x] T026 Implement `packages/db/src/seed/factories/scheduling.factory.ts`
- [x] T027 Implement `packages/db/src/seed/factories/assignment.factory.ts` (Assignments & Availability)

### Phase 4.3: Final Validation & Integration
- [x] T028: Refactor integration tests to use modular factories (src/seed/index.ts)
- [x] T029: Verify determinism across multiple runs (Integration Test)
- [x] T030: Perform final verification run and certify system
- [x] T031: Fix non-determinism in factory outputs (Sorting & Seed Isolation)
- [x] T032: Achieve 100% test pass rate for database seeding packageh `bun run db:seed:reset`

---

## Dependencies & Execution Order
- Phase 4.1 MUST be completed before Phase 4.2 refactoring starts.
- Phase 4.2 factories can be developed in parallel but should be verified individually.
- Phase 4.3 requires all factories from Phase 4.2 to be ready.

## Implementation Strategy
- **Surgical Execution**: Follow the AGENTS.md rule: Plan -> Approval -> Implement -> Review for EVERY task.
- **Verification First**: Every infrastructure change must be validated with `check-types` and `test` to ensure zero regressions.

---

## Phase 5: Contextual Leadership Implementation 🎯 NEXT
- [ ] T033 Update `packages/db/src/seed/factories/volunteer.factory.ts` to assign contextual `system_role` (`leader`, `sub_leader`, `volunteer`) based on Ministry and Team attachments (FR-007).
- [ ] T034 Update integration tests in `packages/db/src/seed/index.test.ts` to assert that every Ministry has at least one `leader` and every Team has at least one `sub_leader` (SC-005).
- [ ] T035 Verify determinism is maintained after introducing the leadership role logic.
