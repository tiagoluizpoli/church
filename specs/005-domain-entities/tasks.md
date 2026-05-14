# Tasks: Domain Entities

**Input**: Design documents from `/specs/005-domain-entities/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — spec explicitly requires SC-002 (100% coverage on Entity base), SC-003 (round-trip), SC-005 (contract alignment).

**Organization**: Tasks are grouped by user story (US1–US5) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the `packages/core` package and the `domain/` folder structure inside `packages/api`.

- [x] T001 Create `packages/core/` package with `package.json` (`@church/core`, zero runtime deps), `tsconfig.json`, and `vitest.config.ts`
- [x] T002 Create domain folder structure: `packages/api/src/domain/entities/`, `packages/api/src/domain/errors/`
- [x] T003 [P] Create test folder structure: `packages/core/tests/`, `packages/api/tests/domain/entities/`, `packages/api/tests/contract/`
- [x] T004 Add `"@church/core": "workspace:*"` to `packages/api/package.json` dependencies and run `bun install`

**Checkpoint**: Folder structure exists, core package resolves, `bunx tsc --noEmit` passes on both packages.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Base classes and error hierarchy that ALL entities depend on.

**⚠️ CRITICAL**: No entity can be created until this phase is complete.

- [x] T005 Implement `DomainError` abstract base class in `packages/core/src/domain-error.ts` — extends `Error`, sets `name` to class name
- [x] T006 Implement `Entity<T>` abstract base class in `packages/core/src/entity.ts` — `protected _props: T`, `_id` (auto-UUID), `_createdAt`, `_updatedAt`, `get id()`, `get createdAt()`, `get updatedAt()`, `equals()` method
- [x] T007 Create barrel export in `packages/core/src/index.ts` — export `Entity`, `DomainError`
- [x] T008 Implement `InvalidDateRangeError` in `packages/api/src/domain/errors/invalid-date-range.ts` — extends `DomainError`, fixed message "Start date must be before end date"
- [x] T009 [P] Implement `InvalidRequiredCountError` in `packages/api/src/domain/errors/invalid-required-count.ts` — extends `DomainError`, fixed message "Required count must be at least 1"
- [x] T010 Create error barrel export in `packages/api/src/domain/errors/index.ts`

**Checkpoint**: `Entity<T>` and all error classes compile. Base class ready for entity extension.

---

## Phase 3: User Story 1 - Entity Base Class Foundation (Priority: P1) 🎯 MVP

**Goal**: Prove the `Entity<T>` base class works correctly with 100% test coverage.

**Independent Test**: Instantiate base class with mock props, verify auto-UUID, explicit ID, equality, and timestamp defaults.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation passes**

- [x] T011 [US1] Write unit tests for `Entity<T>` in `packages/core/tests/entity.test.ts` — covers all 5 acceptance scenarios: auto-UUID generation, explicit ID, equality true, equality false, equality with null/undefined
- [x] T012 [US1] Write unit tests for domain error subclasses in `packages/api/tests/domain/errors.test.ts` — covers `InvalidDateRangeError` and `InvalidRequiredCountError` (correct message, `instanceof DomainError`, `instanceof Error`)

### Verification for User Story 1

- [x] T013 [US1] Run `bun test` in `packages/core` — all Entity base tests pass with 100% coverage (SC-002)

**Checkpoint**: Entity base class and error hierarchy fully tested. All US1 acceptance scenarios verified.

---

## Phase 4: User Story 2 - Core Organizational Entities (Priority: P1)

**Goal**: Define Church, Ministry, Team, Role, Volunteer, and MinistryVolunteer entities with typed getters and encapsulated mutations.

**Independent Test**: Construct each entity from raw props, verify all getters, confirm optional defaults.

### Implementation for User Story 2

- [x] T014 [P] [US2] Implement `Church` entity in `packages/api/src/domain/entities/church.ts` — `ChurchProps` interface, getters: `name`, `slug`, `timezone`, `settings`
- [x] T015 [P] [US2] Implement `Ministry` entity in `packages/api/src/domain/entities/ministry.ts` — `MinistryProps` interface, getters: `churchId`, `name`, `description`, `enforcementType`, `deletedAt`; mutation: `softDelete()`
- [x] T016 [P] [US2] Implement `Team` entity in `packages/api/src/domain/entities/team.ts` — `TeamProps` interface, getters: `churchId`, `ministryId`, `name`
- [x] T017 [P] [US2] Implement `Role` entity in `packages/api/src/domain/entities/role.ts` — `RoleProps` interface, getters: `churchId`, `ministryId`, `name`, `isGlobal`
- [x] T018 [P] [US2] Implement `Volunteer` entity in `packages/api/src/domain/entities/volunteer.ts` — `VolunteerProps` interface, getters: `churchId`, `userId`, `status`, `notes`; mutations: `activate()`, `deactivate()`, `putOnHold()`
- [x] T019 [P] [US2] Implement `MinistryVolunteer` entity in `packages/api/src/domain/entities/ministry-volunteer.ts` — `MinistryVolunteerProps` interface, getters: `churchId`, `volunteerId`, `ministryId`, `teamId`, `systemRole`, `status`, `joinedAt`; mutations: `promote(role)`, `assignTeam(teamId)`, `removeTeam()`

### Tests for User Story 2

- [x] T020 [P] [US2] Write unit tests for `Church` in `packages/api/tests/domain/entities/church.test.ts` — construction, all getters accessible
- [x] T021 [P] [US2] Write unit tests for `Ministry` in `packages/api/tests/domain/entities/ministry.test.ts` — construction, `deletedAt` defaults to undefined, `softDelete()` sets `deletedAt` to current UTC
- [x] T021b [P] [US2] Write unit tests for `Volunteer` in `packages/api/tests/domain/entities/volunteer.test.ts` — construction, `activate()`, `deactivate()`, `putOnHold()` mutations
- [x] T021c [P] [US2] Write unit tests for `MinistryVolunteer` in `packages/api/tests/domain/entities/ministry-volunteer.test.ts` — construction, `promote(role)`, `assignTeam(teamId)`, `removeTeam()` mutations
- [x] T022 [US2] Run `bun test` in `packages/api` — all US2 entity tests pass

**Checkpoint**: All 6 organizational entities compile and pass tests. US2 acceptance scenarios verified.

---

## Phase 5: User Story 3 - Scheduling Entities (Priority: P1)

**Goal**: Define Event, TimeSlot, and SlotRequirement entities with date range invariants.

**Independent Test**: Construct each entity, verify date invariant enforcement, assert domain errors are thrown.

### Implementation for User Story 3

- [x] T023 [P] [US3] Implement `Event` entity in `packages/api/src/domain/entities/event.ts` — `EventProps` interface, getters: `churchId`, `ministryId`, `title`, `description`, `location`, `startDate`, `endDate`, `status`; mutations: `publish()`, `cancel()`; invariant: throws `InvalidDateRangeError` if `startDate >= endDate`
- [x] T024 [P] [US3] Implement `TimeSlot` entity in `packages/api/src/domain/entities/time-slot.ts` — `TimeSlotProps` interface, getters: `churchId`, `eventId`, `startTime`, `endTime`, `label`; invariant: throws `InvalidDateRangeError` if `startTime >= endTime`
- [x] T025 [P] [US3] Implement `SlotRequirement` entity in `packages/api/src/domain/entities/slot-requirement.ts` — `SlotRequirementProps` interface, getters: `churchId`, `slotId`, `roleId`, `teamId`, `requiredCount`, `notes`; invariant: throws `InvalidRequiredCountError` if `requiredCount < 1`

### Tests for User Story 3

- [x] T026 [P] [US3] Write unit tests for `Event` in `packages/api/tests/domain/entities/event.test.ts` — valid construction, date invariant rejection, `publish()` and `cancel()` mutations
- [x] T027 [P] [US3] Write unit tests for `TimeSlot` in `packages/api/tests/domain/entities/time-slot.test.ts` — valid construction, date invariant rejection
- [x] T028 [P] [US3] Write unit tests for `SlotRequirement` in `packages/api/tests/domain/entities/slot-requirement.test.ts` — valid construction, `requiredCount < 1` rejection
- [x] T029 [US3] Run `bun test` in `packages/api` — all US3 entity tests pass

**Checkpoint**: All 3 scheduling entities compile, invariants enforced, tests pass. US3 acceptance scenarios verified.

---

## Phase 6: User Story 4 - Assignment & Audit Entities (Priority: P1)

**Goal**: Define Assignment, AssignmentAudit, and Availability entities with status enums and date invariants.

**Independent Test**: Construct each entity, verify status enum types, assert audit immutability, confirm date invariant on Availability.

### Implementation for User Story 4

- [x] T030 [P] [US4] Implement `Assignment` entity in `packages/api/src/domain/entities/assignment.ts` — `AssignmentProps` interface, getters: `churchId`, `slotId`, `volunteerId`, `roleId`, `status`, `reason`, `assignedAt`, `assignedBy`; mutations: `confirm()`, `decline(reason?)`
- [x] T031 [P] [US4] Implement `AssignmentAudit` entity in `packages/api/src/domain/entities/assignment-audit.ts` — `AssignmentAuditProps` interface, getters: `churchId`, `assignmentId`, `leaderId`, `action`, `reason`, `timestamp`; no mutations (immutable)
- [x] T032 [P] [US4] Implement `Availability` entity in `packages/api/src/domain/entities/availability.ts` — `AvailabilityProps` interface, getters: `churchId`, `volunteerId`, `type`, `startTime`, `endTime`, `isAllDay`, `reason`, `repeatRule`; invariant: throws `InvalidDateRangeError` if `startTime >= endTime`

### Tests for User Story 4

- [x] T033 [P] [US4] Write unit tests for `Assignment` in `packages/api/tests/domain/entities/assignment.test.ts` — construction, status enum, `confirm()` and `decline()` mutations
- [x] T034 [P] [US4] Write unit tests for `Availability` in `packages/api/tests/domain/entities/availability.test.ts` — construction, date invariant rejection, type enum
- [x] T035 [US4] Run `bun test` in `packages/api` — all US4 entity tests pass

**Checkpoint**: All 3 assignment/audit entities compile, invariants enforced, tests pass. US4 acceptance scenarios verified.

---

## Phase 7: User Story 5 - Entity-to-Schema Mapper Contract (Priority: P2)

**Goal**: Define the `EntityMapper<Schema, Domain, Insert>` interface and the entity barrel exports.

**Independent Test**: Verify interface compiles, a mock implementation satisfies the type constraint, barrel export includes all 12 entities.

### Implementation for User Story 5

- [x] T036 [US5] Implement `EntityMapper` interface in `packages/api/src/domain/mapper.ts` — generic `EntityMapper<SchemaRow, DomainEntity, InsertRow>` with `toDomain()` and `toPersistence()` methods
- [x] T037 [US5] Create entity barrel export in `packages/api/src/domain/entities/index.ts` — re-export all 12 entities
- [x] T038 [US5] Create domain barrel export in `packages/api/src/domain/index.ts` — re-export entities, errors, and mapper interface

### Tests for User Story 5

- [x] T039 [US5] Write contract alignment test in `packages/api/tests/contract/schema-alignment.test.ts` — compile-time test verifying domain prop interfaces align 1:1 with Drizzle `$inferSelect` types (SC-005)

**Checkpoint**: Mapper interface exported, barrel files complete, schema alignment verified. US5 acceptance scenarios verified.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, zero-dependency check, and full test run.

- [x] T040 Verify zero runtime dependencies in domain — run `grep -r "@church/db\|drizzle-orm" packages/api/src/domain/` returns no results (SC-004)
- [x] T041 Run `bunx tsc --noEmit` on both `packages/core` and `packages/api` — zero type errors (SC-001)
- [x] T042 Run full test suite `bun test` across `packages/core` and `packages/api` — all tests pass
- [x] T043 [P] Verify Biome compliance — `bunx biome check packages/core/src packages/api/src/domain`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all entity creation
- **US1 (Phase 3)**: Depends on Phase 2 — tests for Entity base class
- **US2 (Phase 4)**: Depends on Phase 2 — can run in parallel with US3, US4
- **US3 (Phase 5)**: Depends on Phase 2 — can run in parallel with US2, US4
- **US4 (Phase 6)**: Depends on Phase 2 — can run in parallel with US2, US3
- **US5 (Phase 7)**: Depends on US2, US3, US4 (needs all entities to barrel-export)
- **Polish (Phase 8)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: Standalone — only tests the base class from Phase 2
- **US2 (P1)**: Standalone — no dependency on other stories
- **US3 (P1)**: Standalone — no dependency on other stories
- **US4 (P1)**: Standalone — no dependency on other stories
- **US5 (P2)**: Depends on US2 + US3 + US4 (needs all entities for barrel + contract test)

### Within Each User Story

- Implementation tasks marked [P] can run in parallel (different files)
- Test tasks marked [P] can run in parallel (different files)
- Tests should be written first for invariant-heavy entities (Event, TimeSlot, Availability)

### Parallel Opportunities

- T014–T019 (all US2 entities) — 6 files in parallel
- T023–T025 (all US3 entities) — 3 files in parallel
- T030–T032 (all US4 entities) — 3 files in parallel
- US2, US3, US4 can execute in parallel after Phase 2

---

## Parallel Example: User Story 2

```bash
# Launch all 6 organizational entities in parallel:
Task: T014 "Implement Church entity in packages/api/src/domain/entities/church.ts"
Task: T015 "Implement Ministry entity in packages/api/src/domain/entities/ministry.ts"
Task: T016 "Implement Team entity in packages/api/src/domain/entities/team.ts"
Task: T017 "Implement Role entity in packages/api/src/domain/entities/role.ts"
Task: T018 "Implement Volunteer entity in packages/api/src/domain/entities/volunteer.ts"
Task: T019 "Implement MinistryVolunteer entity in packages/api/src/domain/entities/ministry-volunteer.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (Entity base + errors)
3. Complete Phase 3: US1 (base class tests — 100% coverage)
4. **STOP and VALIDATE**: Entity base class is bulletproof
5. Proceed to US2–US4

### Incremental Delivery

1. Setup + Foundational → Base ready
2. US1 → Base class proven → MVP foundation ✅
3. US2 → Organizational entities → Can start repository layer
4. US3 → Scheduling entities → Can start availability engine
5. US4 → Assignment entities → Can start conflict service
6. US5 → Mapper contract + barrel → Spec R2 unblocked

### Sequential Execution (Single Developer)

1. Phase 1 → Phase 2 → Phase 3 (US1)
2. Phase 4 (US2) → Phase 5 (US3) → Phase 6 (US4)
3. Phase 7 (US5) → Phase 8 (Polish)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Tests are included because spec mandates SC-002 (100% base class coverage) and SC-005 (contract alignment)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently

## Phase 9: Code Review & Type Safety Refactor [STORY-US-REF]

- [x] Refactor all domain entities to address Pattern 7 & 8 violations (T038)
  - [x] Extract inline union types to exported `const` arrays (Pattern 7)
  - [x] Eliminate unsafe `as Type` casting in optional property getters (Pattern 8)
  - [x] Verify strict type safety with `bun run check-types`
  - [x] Verify domain integrity with `bun test packages/api/tests/domain/`
  - [x] Update project walkthrough with refactor details
