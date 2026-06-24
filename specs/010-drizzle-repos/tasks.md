# Tasks: Drizzle Repository Implementations (Spec R2)

**Input**: Design documents from `/specs/010-drizzle-repos/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: TDD approach is enabled (requested via `/tdd`). All phases include writing failing tests before their concrete implementation.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create repository structure under `apps/server/src/infrastructure/repositories/`
- [X] T002 Configure Vitest database connection and truncation helpers in `apps/server/tests/integration/repositories/setup.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core transaction and isolation utilities that MUST be completed before user stories

**⚠️ CRITICAL**: No user story implementation can begin until these foundational helpers are built.

- [X] T003 [P] Implement `DrizzleTransactionContext` class in `apps/server/src/infrastructure/repositories/drizzle-transaction-context.ts`
- [X] T004 [P] Implement concrete `DrizzleUnitOfWork` wrapping `db.transaction()` in `apps/server/src/infrastructure/repositories/drizzle-unit-of-work.ts`
- [X] T005 [P] Implement `withChurchIsolation` helper in `apps/server/src/infrastructure/repositories/helpers.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Type-Safe Data Persistence via Drizzle ORM (Priority: P1) 🎯 MVP

**Goal**: Implement Drizzle repositories for all 9 contracts to load/save domain entities

**Independent Test**: Contract tests run and pass against concrete Drizzle implementations

### Tests for User Story 1

- [X] T006 [P] [US1] Create integration test runner in `apps/server/tests/integration/repositories/drizzle-repos.test.ts` executing all contract test suites against Drizzle repositories (initially failing)

### Implementation for User Story 1

- [X] T007 [P] [US1] Implement `DrizzleChurchRepository` and entity mapper in `apps/server/src/infrastructure/repositories/drizzle-church.repository.ts`
- [X] T008 [P] [US1] Implement `DrizzleMinistryRepository` and entity mapper in `apps/server/src/infrastructure/repositories/drizzle-ministry.repository.ts`
- [X] T009 [P] [US1] Implement `DrizzleVolunteerRepository` and entity mapper in `apps/server/src/infrastructure/repositories/drizzle-volunteer.repository.ts`
- [X] T010 [P] [US1] Implement `DrizzleRoleRepository` and entity mapper in `apps/server/src/infrastructure/repositories/drizzle-role.repository.ts`
- [X] T011 [P] [US1] Implement `DrizzleEventRepository` and entity mapper in `apps/server/src/infrastructure/repositories/drizzle-event.repository.ts`
- [X] T012 [P] [US1] Implement `DrizzleTimeSlotRepository` and entity mapper in `apps/server/src/infrastructure/repositories/drizzle-time-slot.repository.ts`
- [X] T013 [P] [US1] Implement `DrizzleAssignmentRepository` and entity mapper in `apps/server/src/infrastructure/repositories/drizzle-assignment.repository.ts`
- [X] T014 [P] [US1] Implement `DrizzleAvailabilityRepository` and entity mapper in `apps/server/src/infrastructure/repositories/drizzle-availability.repository.ts`
- [X] T015 [P] [US1] Implement `DrizzleAssignmentAuditRepository` and entity mapper in `apps/server/src/infrastructure/repositories/drizzle-assignment-audit.repository.ts`

**Checkpoint**: User Story 1 fully functional and passes all repository contract tests.

---

## Phase 4: User Story 2 - Strict Multi-Tenant Isolation (Priority: P1)

**Goal**: Scope all repository operations to the provided `churchId` to prevent cross-tenant leakages

**Independent Test**: Isolation integration tests verify that cross-tenant operations throw `NotFoundError`

### Tests for User Story 2

- [X] T016 [P] [US2] Write tenant isolation integration tests in `apps/server/tests/integration/repositories/isolation.test.ts` (initially failing)

### Implementation for User Story 2

- [X] T017 [US2] Apply the `withChurchIsolation` filter helper to query logic in all 9 repositories in `apps/server/src/infrastructure/repositories/`

**Checkpoint**: Cross-tenant queries fail with `NotFoundError`; isolation integration tests pass.

---

## Phase 5: User Story 3 - Transactional Database Operations (Priority: P1)

**Goal**: Support atomic database transactions spanning multiple repository writes

**Independent Test**: Integration test executes multi-repository transaction; failure rolls back all updates

### Tests for User Story 3

- [X] T018 [P] [US3] Write transactional rollback integration tests in `apps/server/tests/integration/repositories/transactions.test.ts` (initially failing)

### Implementation for User Story 3

- [X] T019 [US3] Modify repository database operations to extract and use the transaction client if a valid `DrizzleTransactionContext` is supplied

**Checkpoint**: Unsuccessful operations inside `DrizzleUnitOfWork` trigger clean rollback; tests pass.

---

## Phase 6: User Story 4 - Consistent Mapping and Domain Error Handling (Priority: P2)

**Goal**: Standardize error mapping (`NotFoundError` throwing) and strict enum validation

**Independent Test**: Verification that invalid DB enums throw mapping errors, and missing rows throw `NotFoundError`

### Tests for User Story 4

- [X] T020 [P] [US4] Write mapping and error-handling tests in `apps/server/tests/integration/repositories/mapping-errors.test.ts` (initially failing)

### Implementation for User Story 4

- [X] T021 [US4] Refine all repository mappers to strictly validate DB enums and cast branded nominal IDs at compile time

**Checkpoint**: Entity mapping validation and domain-specific errors successfully verified.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verification and structural quality standards

- [X] T022 [P] Export all concrete repositories through named exports in `apps/server/src/infrastructure/repositories/index.ts`
- [X] T023 Run Biome format and lint verification commands on all new files
- [X] T024 Verify integration test runner runs and passes within the target duration

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - starts immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - blocks all user stories.
- **User Stories (Phases 3 to 6)**: All depend on Foundational completion.
- **Polish (Phase 7)**: Depends on all user story implementations being completed.

### User Story Dependencies

- **US1 (Type-Safe persistence)**: Base story, blocks US2, US3, and US4.
- **US2 (Multi-Tenant isolation)**: Can run after US1 completion.
- **US3 (Transactions)**: Can run after US1 completion.
- **US4 (Error Handling)**: Can run after US1 completion.

### Parallel Opportunities

- Foundational tasks `T003` to `T005` can run in parallel.
- All implementation tasks within User Story 1 (`T007` to `T015`) can run in parallel once failing test runner `T006` is defined.

---

## Parallel Example: User Story 1

```bash
# Implement repositories in parallel:
Task: "Implement DrizzleChurchRepository and entity mapper in apps/server/src/infrastructure/repositories/drizzle-church.repository.ts"
Task: "Implement DrizzleMinistryRepository and entity mapper in apps/server/src/infrastructure/repositories/drizzle-ministry.repository.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Setup (Phase 1)
2. Complete Foundational (Phase 2)
3. Write test runner (T006)
4. Implement all repositories (T007 to T015) to satisfy contract tests
5. **Checkpoint**: Drizzle repositories successfully load/save entities
