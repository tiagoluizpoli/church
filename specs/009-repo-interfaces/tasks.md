# Tasks: Repository Interfaces (Spec R1)

**Input**: Design documents from `/specs/009-repo-interfaces/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Included — contract tests, compilation checks, branded ID tests, and coverage verification.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo core**: `packages/core/src/`
- **Server domain**: `apps/server/src/domain/`
- **Server infrastructure**: `apps/server/src/infrastructure/`
- **Server tests**: `apps/server/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Foundation types, error classes, and branded IDs required by all repository interfaces

- [ ] T001 Create `NotFoundError` class extending `DomainError` in `packages/core/src/not-found-error.ts`
- [ ] T002 Create generic `BrandedId<T>` utility in `packages/core/src/branded-id.ts`
- [ ] T003 Integrate concrete branded ID definitions and props in existing entities under `apps/server/src/domain/entities/` (`church.ts`, `ministry.ts`, `volunteer.ts`, `role.ts`, `event.ts`, `time-slot.ts`, `assignment.ts`, `availability.ts`, `assignment-audit.ts`)
- [ ] T004 Create `TransactionContext` opaque branded type in `apps/server/src/domain/repositories/transaction-context.ts`
- [ ] T005 Create `UnitOfWork` interface in `apps/server/src/domain/repositories/unit-of-work.ts`
- [ ] T006 Create barrel export file `apps/server/src/domain/repositories/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core interfaces that MUST be complete before domain service integration

**⚠️ CRITICAL**: No user story verification can begin until this phase is complete

- [ ] T007 [P] [US1] Define `ChurchRepository` interface in `apps/server/src/domain/repositories/church.repository.ts` — methods: `getById(id: ChurchId): Promise<Church>`, `getBySlug(slug: string): Promise<Church>`
- [ ] T008 [P] [US1] Define `MinistryRepository` interface in `apps/server/src/domain/repositories/ministry.repository.ts` — methods: `getById(churchId, id): Promise<Ministry>`, `listByChurch(churchId): Promise<Ministry[]>`, `getSettings(churchId, ministryId): Promise<MinistrySettings>`
- [ ] T009 [P] [US1] Define `RoleRepository` interface in `apps/server/src/domain/repositories/role.repository.ts` — methods: `getById(churchId, id): Promise<Role>`, `listByMinistry(churchId, ministryId): Promise<Role[]>`
- [ ] T010 [P] [US1] Define `VolunteerRepository` interface in `apps/server/src/domain/repositories/volunteer.repository.ts` — methods: `getById(churchId, id): Promise<Volunteer>`, `findByUserId(churchId, userId): Promise<Volunteer | null>`, `listByMinistry(churchId, ministryId): Promise<Volunteer[]>`, `hasMembershipInMinistry(churchId, volunteerId, ministryId): Promise<boolean>`, `hasRoleQualification(churchId, volunteerId, roleId): Promise<boolean>`, `listQualifiedForRole(churchId, ministryId, roleId): Promise<Volunteer[]>`, `updateStatus(churchId, volunteerId, status): Promise<void>`
- [ ] T011 [P] [US1] Define `AvailabilityRepository` interface in `apps/server/src/domain/repositories/availability.repository.ts` — methods: `listByVolunteerInRange(churchId, volunteerId, startTime, endTime): Promise<Availability[]>`, `create(churchId, data, tx?): Promise<Availability>`, `update(churchId, id, data, tx?): Promise<void>`, `delete(churchId, id, tx?): Promise<void>`
- [ ] T012 [P] [US1] Define `EventRepository` interface in `apps/server/src/domain/repositories/event.repository.ts` — methods: `getById(churchId, id): Promise<Event>`, `getWithSlots(churchId, id): Promise<EventWithSlots>`, `listByMinistry(churchId, ministryId, status?): Promise<Event[]>`, `create(churchId, data, tx?): Promise<Event>`, `updateStatus(churchId, id, status, tx?): Promise<void>`
- [ ] T013 [P] [US1] Define `TimeSlotRepository` interface in `apps/server/src/domain/repositories/time-slot.repository.ts` — methods: `listByEvent(churchId, eventId): Promise<TimeSlot[]>`, `bulkCreate(churchId, slots, tx?): Promise<TimeSlot[]>`, `deleteByEvent(churchId, eventId, tx?): Promise<void>`
- [ ] T014 [P] [US1] Define `AssignmentRepository` interface in `apps/server/src/domain/repositories/assignment.repository.ts` — methods: `create(churchId, data, tx?): Promise<Assignment>`, `getById(churchId, id): Promise<Assignment>`, `findBySlotAndVolunteer(churchId, slotId, volunteerId): Promise<Assignment | null>`, `listBySlot(churchId, slotId): Promise<Assignment[]>`, `listByEvent(churchId, eventId): Promise<Assignment[]>`, `listByVolunteer(churchId, volunteerId): Promise<Assignment[]>`, `listByVolunteerInRange(churchId, volunteerId, startTime, endTime): Promise<Assignment[]>`, `listByRange(churchId, startTime, endTime): Promise<Assignment[]>`, `updateStatus(churchId, id, status, tx?): Promise<void>`, `countByVolunteerInPeriod(churchId, volunteerId, startTime, endTime): Promise<number>`, `deleteByEvent(churchId, eventId, tx?): Promise<void>`, `listDeclinedBySlot(churchId, slotId): Promise<Assignment[]>`
- [ ] T015 [P] [US1] Define `AssignmentAuditRepository` interface in `apps/server/src/domain/repositories/assignment-audit.repository.ts` — methods: `create(churchId, data, tx?): Promise<AssignmentAudit>`, `listByAssignment(churchId, assignmentId): Promise<AssignmentAudit[]>`, `listByChurch(churchId): Promise<AssignmentAudit[]>`, `listByActor(churchId, actorId): Promise<AssignmentAudit[]>`
- [ ] T016 Update barrel export in `apps/server/src/domain/repositories/index.ts` to re-export all 9 repository interfaces, `TransactionContext`, and `UnitOfWork`

---

## Phase 3: User Story 1 — Type-Safe Data Access Contracts (Priority: P1) 🎯 MVP

**Goal**: Verify that all interfaces compile, are mockable, and return domain entities with branded IDs

**Independent Test**: Create mock implementations for each interface and verify TypeScript compilation succeeds with zero errors

### Tests for User Story 1

- [ ] T017 [P] [US1] Contract test: create a `MockChurchRepository` implementing `ChurchRepository` and verify compilation in `apps/server/tests/contract/repositories/church.repository.test.ts`
- [ ] T018 [P] [US1] Contract test: create a `MockMinistryRepository` implementing `MinistryRepository` and verify compilation in `apps/server/tests/contract/repositories/ministry.repository.test.ts`
- [ ] T019 [P] [US1] Contract test: create a `MockRoleRepository` implementing `RoleRepository` and verify compilation in `apps/server/tests/contract/repositories/role.repository.test.ts`
- [ ] T020 [P] [US1] Contract test: create a `MockVolunteerRepository` implementing `VolunteerRepository` and verify compilation in `apps/server/tests/contract/repositories/volunteer.repository.test.ts`
- [ ] T021 [P] [US1] Contract test: create a `MockAvailabilityRepository` implementing `AvailabilityRepository` and verify compilation in `apps/server/tests/contract/repositories/availability.repository.test.ts`
- [ ] T022 [P] [US1] Contract test: create a `MockEventRepository` implementing `EventRepository` and verify compilation in `apps/server/tests/contract/repositories/event.repository.test.ts`
- [ ] T023 [P] [US1] Contract test: create a `MockTimeSlotRepository` implementing `TimeSlotRepository` and verify compilation in `apps/server/tests/contract/repositories/time-slot.repository.test.ts`
- [ ] T024 [P] [US1] Contract test: create a `MockAssignmentRepository` implementing `AssignmentRepository` and verify compilation in `apps/server/tests/contract/repositories/assignment.repository.test.ts`
- [ ] T025 [P] [US1] Contract test: create a `MockAssignmentAuditRepository` implementing `AssignmentAuditRepository` and verify compilation in `apps/server/tests/contract/repositories/assignment-audit.repository.test.ts`
- [ ] T026 [P] [US1] Contract test: create a `MockUnitOfWork` implementing `UnitOfWork` and verify compilation in `apps/server/tests/contract/repositories/unit-of-work.test.ts`

---

## Phase 4: User Story 2 — Domain Service Data Coverage (Priority: P1)

**Goal**: Verify that every data access operation needed by L1, L2, and L3 is covered by the interfaces

### Tests for User Story 2

- [ ] T027 [US2] Coverage test: verify Availability Engine (L1) data access needs are covered in `apps/server/tests/domain/repositories/coverage-l1.test.ts`
- [ ] T028 [US2] Coverage test: verify Conflict & Validation Service (L2) data access needs are covered in `apps/server/tests/domain/repositories/coverage-l2.test.ts`
- [ ] T029 [US2] Coverage test: verify Slot & Assignment Manager (L3) data access needs are covered in `apps/server/tests/domain/repositories/coverage-l3.test.ts`

---

## Phase 5: User Story 3 — Church Isolation & Branded IDs (Priority: P1)

**Goal**: Verify that `churchId` is required on every method (except ChurchRepository) and branded IDs prevent cross-entity swapping

### Tests for User Story 3

- [ ] T030 [US3] Type safety test: verify every method on all 8 non-Church repositories requires `ChurchId` (branded) as first parameter in `apps/server/tests/domain/repositories/church-isolation.test.ts`
- [ ] T031 [US3] Branded ID test: verify that passing `VolunteerId` where `AssignmentId` is expected causes a type error in `apps/server/tests/domain/repositories/branded-ids.test.ts`

---

## Phase 6: User Story 4 — Transaction Context & UnitOfWork (Priority: P2)

**Goal**: Verify that mutation methods accept an optional transaction context and UnitOfWork provides callback-based orchestration

### Tests for User Story 4

- [ ] T032 [US4] Transaction test: verify all mutation methods accept optional `tx?: TransactionContext` parameter in `apps/server/tests/domain/repositories/transaction-context.test.ts`
- [ ] T033 [US4] UnitOfWork test: verify `UnitOfWork.run()` callback receives a `TransactionContext` and multiple repo calls can share it in `apps/server/tests/domain/repositories/unit-of-work-integration.test.ts`

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T034 Run full test suite: `pnpm --filter server test` — verify zero failures
- [ ] T035 Verify TypeScript strict compilation: `pnpm --filter server exec tsc --noEmit` — verify zero errors
- [ ] T036 Review `find*`/`get*`/`has*` naming convention consistency across all 9 interfaces
- [ ] T037 Verify all interfaces use Domain Entity types (not Drizzle schema types) in return positions
- [ ] T038 Verify all branded ID types are used consistently (no bare `string` for entity IDs)
