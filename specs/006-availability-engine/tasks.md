---
description: "Task list for Availability Engine (Spec L1)"
---

# Tasks: Availability Engine (Spec L1)

**Input**: Design documents from `specs/006-availability-engine/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Initialize availability engine folder structure in `src/api/domain/availability/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Create Domain Model types and interfaces from `data-model.md` in `src/api/domain/availability/types.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Resolve Volunteer Availability (Priority: P1) 🎯 MVP

**Goal**: As the scheduling system, I need to reliably determine if a volunteer is available for a specific time range.

**Independent Test**: Can be fully tested by providing a `volunteer_id` and `time_range` and asserting the output against mock blockouts and assignments.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T003 [P] [US1] Create unit tests for basic availability, blockout conflicts, assignment conflicts, partial overlaps, back-to-back shifts, crossing midnight, and pre-calculated all-day boundaries in `src/api/domain/availability/AvailabilityEngine.test.ts`

### Implementation for User Story 1

- [x] T004 [US1] Implement `AvailabilityEngine` class with `checkAvailability` core interval overlap algorithm in `src/api/domain/availability/AvailabilityEngine.ts`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Editing Existing Assignments (Priority: P2)

**Goal**: As a ministry leader editing an existing assignment, I need the availability engine to ignore the volunteer's current assignment for that slot.

**Independent Test**: Can be tested by passing an `excludeAssignmentId` to the engine.

### Tests for User Story 2

- [x] T005 [P] [US2] Update unit tests to include `excludeAssignmentId` ignore logic scenarios in `src/api/domain/availability/AvailabilityEngine.test.ts`

### Implementation for User Story 2

- [x] T006 [US2] Update `checkAvailability` method to filter out the `excludeAssignmentId` from the conflict check loop in `src/api/domain/availability/AvailabilityEngine.ts`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T007 Run the example code from `quickstart.md` to ensure the engine behaves correctly
- [x] T008 Code cleanup, linting, and Biome formatting check

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - Sequential in priority order (P1 → P2)

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2)
- **User Story 2 (P2)**: Integrates with US1 logic, enhances the `checkAvailability` method.

### Parallel Opportunities

- Tests (T003, T005) can be defined alongside or before the implementation (T004, T006).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently

### Incremental Delivery

1. Complete Setup + Foundational
2. Add User Story 1 → Test independently
3. Add User Story 2 → Test independently
