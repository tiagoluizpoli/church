# Tasks: Timezone & Date Policy

**Input**: Design documents from `/specs/004-timezone-date-policy/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

## 🛡️ Governance: Task-by-Task Protocol
Every task in this list MUST be developed and validated strictly one at a time following the **AGENTS.md Core Agent Protocol**:

1.  **Plan & Present**: Present the specific task and a micro-plan.
2.  **Wait for Approval**: STOP and wait for the user to approve the micro-plan.
3.  **Implement**: Implement the code ONLY after explicit approval.
4.  **Review & Validate**: Present changes for user code review.
5.  **Proceed**: Move to the next task ONLY when the user is satisfied.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 [P] Install `date-fns` and `date-fns-tz` in `packages/db`, `packages/api`, and `apps/web`
- [x] T002 [P] Configure global date validation in `packages/api/src/trpc.ts` using Zod

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T003 [P] Add `timezone` field to `Church` table in `packages/db/src/schema/church.ts`
- [x] T004 [P] Update all `timestamp` columns to `timestamptz` in `packages/db/src/schema/auth.ts`
- [x] T005 [P] Update all `timestamp` columns to `timestamptz` in `packages/db/src/schema/scheduling.ts`
- [x] T006 [P] Update all `timestamp` columns to `timestamptz` in `packages/db/src/schema/core.ts`
- [x] T007 [P] Update all `timestamp` columns to `timestamptz` in `packages/db/src/schema/assignments.ts`
- [x] T008 [P] Update all `timestamp` columns to `timestamptz` in `packages/db/src/schema/onboarding.ts`
- [x] T009 Generate and run database migrations for `timestamptz` conversion via `bun run db:generate` and `bun run db:migrate`
- [x] T010 Implement UTC-enforcing tRPC middleware in `packages/api/src/trpc.ts` to coerce date strings to UTC

**Checkpoint**: Foundation ready - database and API now strictly follow UTC-first policy.

## Phase 3: User Story 1 - Deterministic Schedule Display (Priority: P1) 🎯 MVP

**Goal**: Ensure events are displayed in Church-local time or User-local time based on preference.

**Independent Test**: Schedule an event in "America/New_York" and verify it displays as 9:00 AM for a user in "Europe/London" when "Church Time" is selected.

### Implementation for User Story 1

- [ ] T011 [P] [US1] Create date utility functions for timezone conversion in `apps/web/src/shared/utils/date.ts`
- [ ] T012 [P] [US1] Implement `TimezoneProvider` in `apps/web/src/shared/components/TimezoneProvider.tsx`
- [ ] T013 [P] [US1] Implement `useTimezone` hook in `apps/web/src/shared/hooks/useTimezone.ts`
- [ ] T014 [US1] Update Event list components to use `useTimezone` for rendering timestamps in `apps/web/src/features/scheduling/components/EventList.tsx`
- [ ] T015 [US1] Implement "User/Church Time" toggle component in `apps/web/src/shared/components/TimezoneToggle.tsx`

**Checkpoint**: User Story 1 functional - display layer handles timezone contextualization.

## Phase 4: User Story 2 - Accurate Availability Matching (Priority: P1)

**Goal**: Availability matching logic handles DST transitions correctly by using absolute UTC intervals.

**Independent Test**: Create a volunteer availability slot crossing a DST boundary and verify matching logic identifies overlaps correctly.

### Implementation for User Story 2

- [ ] T016 [P] [US2] Implement `AvailabilityService` logic for UTC-based overlap checks in `packages/api/src/services/availability.ts`
- [ ] T017 [US2] Update availability input components to display prominent timezone indicator in `apps/web/src/features/volunteers/components/AvailabilityForm.tsx`
- [ ] T018 [P] [US2] Integration test for DST boundary matching in `packages/api/tests/integration/availability.test.ts`

**Checkpoint**: User Story 2 functional - scheduling engine is immune to DST shifts.

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T019 Update `README.md` and `quickstart.md` with the new Timezone & Date Policy details
- [ ] T020 Run full Playwright E2E suite to verify cross-browser timezone consistency
- [ ] T021 Code cleanup and removal of any legacy `timestamp` (non-tz) usages

## Dependencies & Execution Order

- **Phase 1 & 2**: Mandatory sequence (Setup → Schema Migration → Middleware).
- **Phase 3 & 4**: Can be worked on in parallel after Phase 2 is complete.
- **Phase 5**: Final verification.

## Parallel Execution Examples

```bash
# Parallel Schema Updates (Phase 2)
# T004, T005, T006, T007, T008 can all be updated simultaneously as they affect different schema files.

# Parallel Frontend Foundational (Phase 3)
# T011, T012, T013 can be implemented in parallel as they are independent modules.
```

## Implementation Strategy

### MVP First
1. Complete Schema Migration (Phase 2).
2. Complete `TimezoneProvider` and `EventList` updates (Phase 3).
3. Validate deterministic display.
