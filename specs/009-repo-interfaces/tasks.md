# Tasks: Repository Interfaces (Spec R1)

**Input**: Design documents from `/specs/009-repo-interfaces/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Included — contract tests, compilation checks, branded ID tests, and coverage verification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo package**: `packages/core/src/`, `packages/core/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Foundation types, error classes, and branded IDs required by all repository interfaces

- [ ] T001 Create `NotFoundError` class extending `DomainError` in `packages/core/src/not-found-error.ts`
- [ ] T002 Create generic `BrandedId<T>` utility in `packages/core/src/branded-id.ts` and define co-located branded IDs and entity type aliases in `packages/core/src/entities/` (`shared.ts`, `church.ts`, `ministry.ts`, `volunteer.ts`, `role.ts`, `event.ts`, `time-slot.ts`, `assignment.ts`, `availability.ts`, `assignment-audit.ts`, plus barrel export `index.ts`)
- [ ] T003 Create `TransactionContext` opaque type in `packages/core/src/repositories/transaction-context.ts`
- [ ] T004 Create `UnitOfWork` interface with `run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>` in `packages/core/src/repositories/unit-of-work.ts`
- [ ] T005 Create barrel export file `packages/core/src/repositories/index.ts`
- [ ] T006 Update `packages/core/src/index.ts` to re-export `NotFoundError`, `BrandedId`, all entities from `packages/core/src/entities/index.ts`, and repositories

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core interfaces that MUST be complete before domain service integration

**⚠️ CRITICAL**: No user story verification can begin until this phase is complete

- [ ] T007 [P] [US1] Define `ChurchRepository` interface in `packages/core/src/repositories/church.repository.ts` — methods: `getById(id: ChurchId): Promise<Church>`, `getBySlug(slug: string): Promise<Church>` — NOTE: no `churchId` parameter (church IS the tenant root)
- [ ] T008 [P] [US1] Define `MinistryRepository` interface in `packages/core/src/repositories/ministry.repository.ts` — methods: `getById(churchId, id): Promise<Ministry>`, `listByChurch(churchId): Promise<Ministry[]>`, `getSettings(churchId, ministryId): Promise<MinistrySettings>`
- [ ] T009 [P] [US1] Define `RoleRepository` interface in `packages/core/src/repositories/role.repository.ts` — methods: `getById(churchId, id): Promise<Role>`, `listByMinistry(churchId, ministryId): Promise<Role[]>` (includes global roles)
- [ ] T010 [P] [US1] Define `VolunteerRepository` interface in `packages/core/src/repositories/volunteer.repository.ts` — methods: `getById(churchId, id): Promise<Volunteer>`, `findByUserId(churchId, userId): Promise<Volunteer | null>`, `listByMinistry(churchId, ministryId): Promise<Volunteer[]>`, `hasMembershipInMinistry(churchId, volunteerId, ministryId): Promise<boolean>`, `hasRoleQualification(churchId, volunteerId, roleId): Promise<boolean>`, `listQualifiedForRole(churchId, ministryId, roleId): Promise<Volunteer[]>`, `updateStatus(churchId, volunteerId, status): Promise<void>`
- [ ] T011 [P] [US1] Define `AvailabilityRepository` interface in `packages/core/src/repositories/availability.repository.ts` — methods: `listByVolunteerInRange(churchId, volunteerId, startTime, endTime): Promise<Availability[]>`, `create(churchId, data, tx?): Promise<Availability>`, `update(churchId, id, data, tx?): Promise<void>`, `delete(churchId, id, tx?): Promise<void>`
- [ ] T012 [P] [US1] Define `EventRepository` interface in `packages/core/src/repositories/event.repository.ts` — methods: `getById(churchId, id): Promise<Event>`, `getWithSlots(churchId, id): Promise<EventWithSlots>`, `listByMinistry(churchId, ministryId, status?): Promise<Event[]>`, `create(churchId, data, tx?): Promise<Event>`, `updateStatus(churchId, id, status, tx?): Promise<void>`
- [ ] T013 [P] [US1] Define `TimeSlotRepository` interface in `packages/core/src/repositories/time-slot.repository.ts` — methods: `listByEvent(churchId, eventId): Promise<TimeSlot[]>` (includes nested requirements), `bulkCreate(churchId, slots, tx?): Promise<TimeSlot[]>` (includes nested requirements), `deleteByEvent(churchId, eventId, tx?): Promise<void>`
- [ ] T014 [P] [US1] Define `AssignmentRepository` interface in `packages/core/src/repositories/assignment.repository.ts` — methods: `create(churchId, data, tx?): Promise<Assignment>`, `getById(churchId, id): Promise<Assignment>`, `findBySlotAndVolunteer(churchId, slotId, volunteerId): Promise<Assignment | null>`, `listBySlot(churchId, slotId): Promise<Assignment[]>`, `listByEvent(churchId, eventId): Promise<Assignment[]>`, `listByVolunteer(churchId, volunteerId): Promise<Assignment[]>`, `listByVolunteerInRange(churchId, volunteerId, startTime, endTime): Promise<Assignment[]>`, `updateStatus(churchId, id, status, tx?): Promise<void>`, `countByVolunteerInPeriod(churchId, volunteerId, startTime, endTime): Promise<number>`, `deleteByEvent(churchId, eventId, tx?): Promise<void>`, `listDeclinedBySlot(churchId, slotId): Promise<Assignment[]>`
- [ ] T015 [P] [US1] Define `AssignmentAuditRepository` interface in `packages/core/src/repositories/assignment-audit.repository.ts` — methods: `create(churchId, data, tx?): Promise<AssignmentAudit>`, `listByAssignment(churchId, assignmentId): Promise<AssignmentAudit[]>`, `listByChurch(churchId): Promise<AssignmentAudit[]>`, `listByActor(churchId, actorId): Promise<AssignmentAudit[]>`
- [ ] T016 Update barrel export in `packages/core/src/repositories/index.ts` to re-export all 9 repository interfaces, `TransactionContext`, and `UnitOfWork`

**Checkpoint**: All 9 repository interfaces + UnitOfWork defined, compiled, and exported

---

## Phase 3: User Story 1 — Type-Safe Data Access Contracts (Priority: P1) 🎯 MVP

**Goal**: Verify that all interfaces compile, are mockable, and return domain entities with branded IDs

**Independent Test**: Create mock implementations for each interface and verify TypeScript compilation succeeds with zero errors

### Tests for User Story 1

- [ ] T017 [P] [US1] Contract test: create a `MockChurchRepository` implementing `ChurchRepository` and verify compilation in `packages/core/tests/repositories/church.repository.test.ts`
- [ ] T018 [P] [US1] Contract test: create a `MockMinistryRepository` implementing `MinistryRepository` and verify compilation in `packages/core/tests/repositories/ministry.repository.test.ts`
- [ ] T019 [P] [US1] Contract test: create a `MockRoleRepository` implementing `RoleRepository` and verify compilation in `packages/core/tests/repositories/role.repository.test.ts`
- [ ] T020 [P] [US1] Contract test: create a `MockVolunteerRepository` implementing `VolunteerRepository` and verify compilation in `packages/core/tests/repositories/volunteer.repository.test.ts`
- [ ] T021 [P] [US1] Contract test: create a `MockAvailabilityRepository` implementing `AvailabilityRepository` and verify compilation in `packages/core/tests/repositories/availability.repository.test.ts`
- [ ] T022 [P] [US1] Contract test: create a `MockEventRepository` implementing `EventRepository` and verify compilation in `packages/core/tests/repositories/event.repository.test.ts`
- [ ] T023 [P] [US1] Contract test: create a `MockTimeSlotRepository` implementing `TimeSlotRepository` and verify compilation in `packages/core/tests/repositories/time-slot.repository.test.ts`
- [ ] T024 [P] [US1] Contract test: create a `MockAssignmentRepository` implementing `AssignmentRepository` and verify compilation in `packages/core/tests/repositories/assignment.repository.test.ts`
- [ ] T025 [P] [US1] Contract test: create a `MockAssignmentAuditRepository` implementing `AssignmentAuditRepository` and verify compilation in `packages/core/tests/repositories/assignment-audit.repository.test.ts`
- [ ] T026 [P] [US1] Contract test: create a `MockUnitOfWork` implementing `UnitOfWork` and verify compilation in `packages/core/tests/repositories/unit-of-work.test.ts`

**Checkpoint**: All 9 interfaces + UnitOfWork have passing contract tests with mock implementations

---

## Phase 4: User Story 2 — Domain Service Data Coverage (Priority: P1)

**Goal**: Verify that every data access operation needed by L1, L2, and L3 is covered by the interfaces

**Independent Test**: Cross-reference each domain service spec against repository methods and assert 100% coverage

### Tests for User Story 2

- [ ] T027 [US2] Coverage test: verify Availability Engine (L1) data access needs are covered — `AvailabilityRepository.listByVolunteerInRange`, `AssignmentRepository.listByVolunteerInRange`, `AssignmentRepository.findBySlotAndVolunteer` in `packages/core/tests/repositories/coverage-l1.test.ts`
- [ ] T028 [US2] Coverage test: verify Conflict & Validation Service (L2) data access needs are covered — `VolunteerRepository.hasRoleQualification`, `VolunteerRepository.hasMembershipInMinistry`, `AssignmentRepository.findBySlotAndVolunteer`, `AssignmentRepository.countByVolunteerInPeriod` in `packages/core/tests/repositories/coverage-l2.test.ts`
- [ ] T029 [US2] Coverage test: verify Slot & Assignment Manager (L3) data access needs are covered — `EventRepository.create`, `TimeSlotRepository.bulkCreate`, `AssignmentRepository.create`, `AssignmentRepository.updateStatus`, `AssignmentRepository.listByEvent`, `AssignmentRepository.deleteByEvent`, `AssignmentAuditRepository.create`, `VolunteerRepository.listQualifiedForRole`, `VolunteerRepository.updateStatus`, `AssignmentRepository.listDeclinedBySlot`, `UnitOfWork.run` in `packages/core/tests/repositories/coverage-l3.test.ts`

**Checkpoint**: 100% of L1/L2/L3 data access operations verified against interface methods

---

## Phase 5: User Story 3 — Church Isolation & Branded IDs (Priority: P1)

**Goal**: Verify that `churchId` is required on every method (except ChurchRepository) and branded IDs prevent cross-entity swapping

**Independent Test**: Compile-time verification that omitting `churchId` or swapping entity IDs causes a type error

### Tests for User Story 3

- [ ] T030 [US3] Type safety test: verify every method on all 8 non-Church repositories requires `ChurchId` (branded) as first parameter in `packages/core/tests/repositories/church-isolation.test.ts`
- [ ] T031 [US3] Branded ID test: verify that passing `VolunteerId` where `AssignmentId` is expected causes a type error, and vice versa, in `packages/core/tests/repositories/branded-ids.test.ts`

**Checkpoint**: Church isolation and branded ID safety enforced at compile time

---

## Phase 6: User Story 4 — Transaction Context & UnitOfWork (Priority: P2)

**Goal**: Verify that mutation methods accept an optional transaction context and UnitOfWork provides callback-based orchestration

**Independent Test**: Verify that `TransactionContext` can be passed to create/update/delete methods and `UnitOfWork.run` executes atomically

### Tests for User Story 4

- [ ] T032 [US4] Transaction test: verify all mutation methods (`create*`, `update*`, `delete*`, `bulkCreate`) accept optional `tx?: TransactionContext` parameter in `packages/core/tests/repositories/transaction-context.test.ts`
- [ ] T033 [US4] UnitOfWork test: verify `UnitOfWork.run()` callback receives a `TransactionContext` and multiple repo calls can share it in `packages/core/tests/repositories/unit-of-work-integration.test.ts`

**Checkpoint**: Transaction context and UnitOfWork support verified across all mutation-capable interfaces

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [ ] T034 Run full test suite: `pnpm --filter @church/core test` — verify zero failures
- [ ] T035 Verify TypeScript strict compilation: `pnpm --filter @church/core exec tsc --noEmit` — verify zero errors
- [ ] T036 [P] Review `find*`/`get*`/`has*` naming convention consistency across all 9 interfaces
- [ ] T037 [P] Verify all interfaces use Domain Entity types (not Drizzle schema types) in return positions
- [ ] T038 [P] Verify all branded ID types are used consistently (no bare `string` for entity IDs)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001–T006) — BLOCKS all user stories
- **User Stories (Phases 3–6)**: All depend on Foundational phase completion
  - US1 (Phase 3), US2 (Phase 4), US3 (Phase 5) can proceed in parallel
  - US4 (Phase 6) can proceed in parallel with US1/US2/US3
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 — No dependencies on other stories
- **User Story 2 (P1)**: Can start after Phase 2 — Independent of US1
- **User Story 3 (P1)**: Can start after Phase 2 — Independent of US1/US2
- **User Story 4 (P2)**: Can start after Phase 2 — Independent of all other stories

### Within Each User Story

- Interface definition MUST precede contract tests (already done in Phase 2)
- Tests verify the interfaces are correct and complete
- Each story validates a different dimension of interface quality

### Parallel Opportunities

- T007–T015: All 9 repository interfaces can be written in parallel (separate files)
- T017–T026: All 10 contract tests can be written in parallel (separate files)
- T027–T029: All 3 coverage tests can be written in parallel
- T030–T031: Both type safety tests can be written in parallel
- Phases 3–6: All user story phases can be worked on in parallel

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch all repository interfaces in parallel:
Task T007: "Define ChurchRepository in packages/core/src/repositories/church.repository.ts"
Task T008: "Define MinistryRepository in packages/core/src/repositories/ministry.repository.ts"
Task T009: "Define RoleRepository in packages/core/src/repositories/role.repository.ts"
Task T010: "Define VolunteerRepository in packages/core/src/repositories/volunteer.repository.ts"
Task T011: "Define AvailabilityRepository in packages/core/src/repositories/availability.repository.ts"
Task T012: "Define EventRepository in packages/core/src/repositories/event.repository.ts"
Task T013: "Define TimeSlotRepository in packages/core/src/repositories/time-slot.repository.ts"
Task T014: "Define AssignmentRepository in packages/core/src/repositories/assignment.repository.ts"
Task T015: "Define AssignmentAuditRepository in packages/core/src/repositories/assignment-audit.repository.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T006)
2. Complete Phase 2: Foundational — define all 9 interfaces + UnitOfWork (T007–T016)
3. Complete Phase 3: Contract tests for all interfaces (T017–T026)
4. **STOP and VALIDATE**: All interfaces compile and have mock implementations
5. Ready for domain service consumption

### Incremental Delivery

1. Complete Setup + Foundational → All interfaces defined
2. Add US1 contract tests → Verify mockability → MVP!
3. Add US2 coverage tests → Verify L1/L2/L3 completeness
4. Add US3 isolation + branded ID tests → Verify compile-time safety
5. Add US4 transaction + UnitOfWork tests → Verify atomicity support
6. Each story adds a validation layer without breaking previous ones

---

## Test Coverage Plan (Spec R1)

### 1. Happy Paths

- [x] All 9 repository interfaces compile with strict TypeScript → UNIT
- [x] Mock implementations satisfy every interface method → UNIT
- [x] `find*` methods return `Promise<T | null>` → UNIT
- [x] `get*` methods return `Promise<T>` → UNIT
- [x] `list*` methods return `Promise<T[]>` → UNIT
- [x] `count*` methods return `Promise<number>` → UNIT
- [x] `create*` methods return `Promise<T>` (created entity) → UNIT
- [x] All mutations accept optional `TransactionContext` → UNIT
- [x] `UnitOfWork.run()` callback receives `TransactionContext` → UNIT
- [x] Branded IDs prevent cross-entity swapping → UNIT

### 2. Permission Matrix

- [x] Every method on 8 non-Church repositories requires branded `ChurchId` → UNIT
- [x] `ChurchRepository.getById` does NOT require `churchId` → UNIT
- [x] `ChurchRepository.getBySlug` does NOT require `churchId` → UNIT

### 3. Edge Cases & Validation

- [x] `find*` with non-existent ID returns `null` (mock behavior) → UNIT
- [x] `get*` with non-existent ID throws `NotFoundError` (type annotation) → UNIT
- [x] `list*` with no matching results returns empty `[]` (mock behavior) → UNIT
- [x] Interfaces contain no Drizzle/SQL/ORM types in signatures → UNIT (code review)
- [x] `NotFoundError` extends `DomainError` → UNIT
- [x] `has*` methods return `Promise<boolean>` (data lookups, not business logic) → UNIT

### 4. Catastrophic Failures

- [x] N/A for pure interfaces — catastrophic failure handling is deferred to Spec R2

### Coverage Summary

| Layer | Count | Description |
|-------|-------|-------------|
| UNIT  | 22    | Contract tests, type tests, branded ID tests, coverage cross-ref |
| INTEGRATION | 0 | Deferred to Spec R2 (Drizzle implementations) |
| E2E   | 0     | Deferred to Spec Q1 |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story validates a different quality dimension of the interfaces
- All interface definitions are in Phase 2 (Foundational) because they are prerequisites for all user stories
- Commit after each phase completion
- Stop at any checkpoint to validate independently
- Total tasks: **38**
  - Setup: 6
  - Foundational: 10 (9 interfaces + barrel export)
  - US1 contract tests: 10 (9 repos + UnitOfWork)
  - US2 coverage tests: 3
  - US3 isolation + branded ID tests: 2
  - US4 transaction + UnitOfWork tests: 2
  - Polish: 5
