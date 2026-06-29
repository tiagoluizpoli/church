# Tasks: Volunteer Dashboard

**Input**: Design documents from `specs/014-volunteer-dashboard/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Included by design. This feature explicitly requires TDD-style backend, component, and E2E coverage in the specification and planning artifacts.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently after the foundational phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependencies)
- **[Story]**: User story label `[US1]`–`[US5]`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare shared config, fixtures, and UI primitives used by the volunteer dashboard implementation.

- [ ] T001 Update dashboard-related environment examples in `apps/server/.env.example` and `apps/web/.env.example`
- [ ] T002 [P] Prepare reusable volunteer-dashboard test fixtures in `apps/server/tests/integration/repositories/setup.ts` and `apps/web/tests/fixtures/index.ts`
- [ ] T003 [P] Verify shared dashboard UI primitives are present, importable, and sufficient for the planned dashboard interactions in `packages/ui/src/components/alert.tsx`, `packages/ui/src/components/alert-dialog.tsx`, `packages/ui/src/components/badge.tsx`, `packages/ui/src/components/dialog.tsx`, `packages/ui/src/components/popover.tsx`, `packages/ui/src/components/progress.tsx`, `packages/ui/src/components/radio-group.tsx`, `packages/ui/src/components/scroll-area.tsx`, `packages/ui/src/components/select.tsx`, `packages/ui/src/components/textarea.tsx`, and `packages/ui/src/components/tooltip.tsx`

**Checkpoint**: Shared config and fixtures are ready for dashboard implementation work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core schema, repository, and route scaffolding that blocks all user stories.

**⚠️ CRITICAL**: No user story work should start before this phase is complete.

- [ ] T004 Extend event-scoped availability persistence in `packages/db/src/schema/assignments.ts`
- [ ] T005 [P] Add volunteer notification enum and table exports in `packages/db/src/schema/enums.ts`, `packages/db/src/schema/volunteer-notifications.ts`, and `packages/db/src/schema/index.ts`
- [ ] T006 [P] Add dashboard overlap-rollout env parsing in `packages/env/src/server.ts` and document it in `apps/server/.env.example`
- [ ] T007 Update domain entities for dashboard persistence in `apps/server/src/domain/entities/availability.ts`, `apps/server/src/domain/entities/volunteer-notification.ts`, and `apps/server/src/domain/entities/index.ts`
- [ ] T008 [P] Create notification repository contracts in `apps/server/src/domain/repositories/volunteer-notification.repository.ts` and `apps/server/src/domain/repositories/index.ts`
- [ ] T009 [P] Implement notification repository wiring in `apps/server/src/infrastructure/repositories/drizzle-volunteer-notification.repository.ts`, `apps/server/src/infrastructure/repositories/index.ts`, and `apps/server/src/infrastructure/repositories/registry.ts`
- [ ] T010 Update event-scoped availability repository behavior in `apps/server/src/infrastructure/repositories/drizzle-availability.repository.ts`
- [ ] T011 [P] Create dashboard service scaffolding in `apps/server/src/services/volunteer-dashboard/build-dashboard-snapshot.ts`, `apps/server/src/services/volunteer-dashboard/compute-availability-task.ts`, and `apps/server/src/services/volunteer-dashboard/map-notification-link.ts`
- [ ] T012 [P] Create volunteer dashboard route and container scaffolding in `apps/web/src/routes/dashboard.tsx` and `apps/web/src/features/volunteers/components/volunteer-dashboard.tsx`
- [ ] T013 Expand volunteer router registration in `apps/server/src/routers/volunteer.ts`

**Checkpoint**: Schema, repositories, and route/service scaffolding are in place. User stories can now be built independently on top of the foundation.

---

## Phase 3: User Story 1 - Submit Availability For An Event (Priority: P1) 🎯 MVP

**Goal**: A volunteer sees `Availability needed`, opens an event-scoped availability editor, saves hourly or day-span availability, and clears the task only after full event coverage.

**Independent Test**: A volunteer with no complete availability for an upcoming event opens `/dashboard`, sees the task, saves event-scoped availability, and the task transitions correctly from missing/partial to complete.

### Tests for User Story 1

- [ ] T014 [P] [US1] Extend dashboard availability integration coverage in `apps/server/tests/integration/routers/get-volunteer-dashboard.test.ts`
- [ ] T015 [P] [US1] Add event-scoped availability mutation coverage in `apps/server/tests/integration/routers/volunteer-availability.test.ts`
- [ ] T016 [P] [US1] Add availability form component coverage in `apps/web/src/__tests__/volunteer-dashboard/availability-form.test.tsx`, including online-only save blocking while offline
- [ ] T017 [P] [US1] Add volunteer availability E2E journey in `apps/web/tests/volunteer-dashboard/us1-availability.spec.ts`, including validation of SC-001's 10-second task-discovery target

### Implementation for User Story 1

- [ ] T018 [US1] Implement availability-task derivation in `apps/server/src/services/volunteer-dashboard/compute-availability-task.ts` and `apps/server/src/services/volunteer-dashboard/build-dashboard-snapshot.ts`
- [ ] T019 [US1] Implement `getVolunteerDashboard` query in `apps/server/src/routers/volunteer/get-volunteer-dashboard.ts`
- [ ] T020 [US1] Implement event-scoped availability procedures in `apps/server/src/routers/volunteer/get-my-availability.ts`, `apps/server/src/routers/volunteer/upsert-availability.ts`, and `apps/server/src/routers/volunteer/delete-availability.ts`
- [ ] T021 [US1] Build event-scoped availability editor behavior in `apps/web/src/features/volunteers/components/availability-form.tsx`, including explicit save confirmation and online-only write blocking while offline
- [ ] T022 [US1] Create `Availability needed` presentation in `apps/web/src/features/volunteers/components/availability-needed-section.tsx` and wire it in `apps/web/src/features/volunteers/components/volunteer-dashboard.tsx`
- [ ] T023 [US1] Make the dashboard the canonical availability entry point in `apps/web/src/routes/dashboard.tsx` and `apps/web/src/routes/availability.tsx`

**Checkpoint**: User Story 1 is functional and independently testable as the MVP slice.

---

## Phase 4: User Story 2 - Review And Respond To Published Assignments (Priority: P1)

**Goal**: A volunteer sees grouped published assignments, notices which responses are pending, confirms or declines per assignment, and cannot respond once a timeslot is already in progress.

**Independent Test**: A volunteer opens the dashboard, sees the first pending event group expanded, responds to a pending assignment, and sees in-progress assignments remain visible with disabled controls.

### Tests for User Story 2

- [ ] T024 [P] [US2] Extend assignment response integration coverage in `apps/server/tests/integration/routers/respond-to-assignment.test.ts`
- [ ] T025 [P] [US2] Add grouped assignment snapshot integration coverage in `apps/server/tests/integration/routers/volunteer-upcoming-assignments.test.ts`
- [ ] T026 [P] [US2] Add upcoming assignments component coverage in `apps/web/src/__tests__/volunteer-dashboard/upcoming-assignments-section.test.tsx`, including in-progress disablement and offline response blocking states
- [ ] T027 [P] [US2] Add volunteer assignment response E2E journey in `apps/web/tests/volunteer-dashboard/us2-assignments.spec.ts`, including validation of SC-002's 30-second response target

### Implementation for User Story 2

- [ ] T028 [US2] Implement current/upcoming assignment grouping in `apps/server/src/routers/volunteer/get-my-upcoming-assignments.ts` and `apps/server/src/services/volunteer-dashboard/build-dashboard-snapshot.ts`
- [ ] T029 [US2] Enforce in-progress response restrictions and clean error responses for stale/offline-sensitive assignment writes in `apps/server/src/routers/volunteer/respond-to-assignment.ts`
- [ ] T030 [US2] Add assignment grouping helpers in `apps/web/src/features/volunteers/lib/assignment-grouping.ts` and `apps/web/src/features/volunteers/lib/dashboard-mappers.ts`
- [ ] T031 [US2] Create the assignments UI in `apps/web/src/features/volunteers/components/upcoming-assignments-section.tsx`, including explicit empty-state messaging when no upcoming assignments exist
- [ ] T032 [US2] Wire assignment response, first-pending expansion behavior, and client-side online guards for assignment writes in `apps/web/src/features/volunteers/hooks/use-volunteer-dashboard.ts` and `apps/web/src/features/volunteers/components/volunteer-dashboard.tsx`

**Checkpoint**: User Story 2 works independently and does not depend on later inbox/schedule/offline work.

---

## Phase 5: User Story 3 - Stay Informed About Schedule Changes (Priority: P1)

**Goal**: A volunteer uses a durable notifications inbox with read/unread state, load-more history, meaningful scheduling copy, and deep-links into current dashboard context.

**Independent Test**: A volunteer opens the inbox, sees unread historical notifications, marks items as read, loads older pages, and follows a notification to the relevant current section.

### Tests for User Story 3

- [ ] T033 [P] [US3] Add notification repository contract coverage in `apps/server/tests/contract/repositories/volunteer-notification.repository.test.ts`
- [ ] T034 [P] [US3] Add inbox procedure integration coverage in `apps/server/tests/integration/routers/volunteer-notifications.test.ts`, including explicit changed-assignment and removed-assignment notification copy expectations
- [ ] T035 [P] [US3] Add notifications inbox component coverage in `apps/web/src/__tests__/volunteer-dashboard/notifications-inbox-section.test.tsx`
- [ ] T036 [P] [US3] Add volunteer notifications E2E journey in `apps/web/tests/volunteer-dashboard/us3-notifications.spec.ts`

### Implementation for User Story 3

- [ ] T037 [US3] Persist volunteer notification records with typed title/body/deep-link metadata in `apps/server/src/infrastructure/services/local-notification-service.ts` and `apps/server/src/domain/services/notification-service.ts`
- [ ] T038 [US3] Wire scheduling notification creation, including explicit assignment-changed and assignment-removed wording, into `apps/server/src/routers/admin-leader/publish-event.ts`, `apps/server/src/routers/admin-leader/send-reminder.ts`, and `apps/server/src/routers/volunteer/respond-to-assignment.ts`
- [ ] T039 [US3] Implement inbox procedures in `apps/server/src/routers/volunteer/get-my-notifications.ts`, `apps/server/src/routers/volunteer/mark-notification-read.ts`, and `apps/server/src/routers/volunteer/mark-all-notifications-read.ts`
- [ ] T040 [US3] Implement notification deep-link mapping in `apps/server/src/services/volunteer-dashboard/map-notification-link.ts` and `apps/server/src/services/volunteer-dashboard/build-dashboard-snapshot.ts`
- [ ] T041 [US3] Create inbox UI in `apps/web/src/features/volunteers/components/notifications-inbox-section.tsx` and `apps/web/src/features/volunteers/components/notification-detail-sheet.tsx`
- [ ] T042 [US3] Wire inbox paging and read-state behavior in `apps/web/src/features/volunteers/hooks/use-notification-inbox.ts` and `apps/web/src/features/volunteers/components/volunteer-dashboard.tsx`

**Checkpoint**: User Story 3 is independently testable with real historical inbox behavior.

---

## Phase 6: User Story 4 - Browse The Read-Only Ministry Schedule (Priority: P2)

**Goal**: A volunteer sees one selected ministry’s current/upcoming published schedule, can switch ministries when applicable, and never sees leader-only conflict or audit details.

**Independent Test**: A volunteer opens Ministry Schedule, sees the default ministry chosen correctly, manually switches when multiple ministries exist, and views published assignment rows with only volunteer-facing fields.

### Tests for User Story 4

- [ ] T043 [P] [US4] Add ministry schedule integration coverage in `apps/server/tests/integration/routers/get-ministry-schedule.test.ts`, including default-ministry selection and published-only filtering
- [ ] T044 [P] [US4] Add ministry schedule component coverage in `apps/web/src/__tests__/volunteer-dashboard/ministry-schedule-section.test.tsx`, including hidden-selector behavior for single-ministry volunteers and `First L.` volunteer name formatting
- [ ] T045 [P] [US4] Add ministry schedule E2E journey in `apps/web/tests/volunteer-dashboard/us4-ministry-schedule.spec.ts`

### Implementation for User Story 4

- [ ] T046 [US4] Implement default ministry selection and published schedule reads in `apps/server/src/routers/volunteer/get-ministry-schedule.ts` and `apps/server/src/services/volunteer-dashboard/build-dashboard-snapshot.ts`
- [ ] T047 [US4] Create read-only ministry schedule UI in `apps/web/src/features/volunteers/components/ministry-schedule-section.tsx`, including explicit empty-state messaging and `First L.` volunteer name presentation
- [ ] T048 [US4] Wire multi-ministry selection behavior in `apps/web/src/features/volunteers/hooks/use-volunteer-dashboard.ts` and `apps/web/src/features/volunteers/components/volunteer-dashboard.tsx`, hiding the selector entirely when only one ministry exists

**Checkpoint**: User Story 4 works independently from offline/refresh concerns.

---

## Phase 7: User Story 5 - Use The Dashboard Reliably With Unstable Connectivity (Priority: P2)

**Goal**: A volunteer can keep reading last-known dashboard data when offline, understands stale-data state, manually refreshes the whole dashboard, and receives a subtle signal when background refresh changes data.

**Independent Test**: After one successful online load, a volunteer opens the dashboard offline, still reads cached data, sees stale-data messaging, and later sees a subtle update indicator when connectivity returns and data changes.

### Tests for User Story 5

- [ ] T049 [P] [US5] Add dashboard refresh/offline hook coverage in `apps/web/src/__tests__/volunteer-dashboard/use-dashboard-refresh.test.ts`, including unchanged-data silence and changed-data indicator behavior
- [ ] T050 [P] [US5] Add offline banner and background-indicator component coverage in `apps/web/src/__tests__/volunteer-dashboard/offline-and-refresh-ui.test.tsx`, including disabled write affordances while offline
- [ ] T051 [P] [US5] Add offline dashboard E2E journey in `apps/web/tests/volunteer-dashboard/us5-offline.spec.ts`

### Implementation for User Story 5

- [ ] T052 [US5] Create dashboard query orchestration in `apps/web/src/features/volunteers/lib/dashboard-query-options.ts`
- [ ] T053 [US5] Implement whole-dashboard refresh and reconnect behavior in `apps/web/src/features/volunteers/hooks/use-dashboard-refresh.ts`
- [ ] T054 [US5] Create stale/offline and background-update UI in `apps/web/src/features/volunteers/components/dashboard-offline-banner.tsx` and `apps/web/src/features/volunteers/components/background-refresh-indicator.tsx`
- [ ] T055 [US5] Wire offline/read-only states, disabled write affordances, and manual refresh into `apps/web/src/features/volunteers/components/volunteer-dashboard.tsx`

**Checkpoint**: User Story 5 is independently testable and completes the planned dashboard experience.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story cleanup, consistency, and final validation.

- [ ] T056 [P] Add changed-target deep-link fallback coverage in `apps/server/tests/integration/routers/volunteer-notification-deeplink.test.ts` and cross-section empty-state regression coverage in `apps/web/src/__tests__/volunteer-dashboard/volunteer-dashboard-empty-states.test.tsx`
- [ ] T057 Harmonize dashboard copy, success/error toasts, and section ordering in `apps/web/src/features/volunteers/components/volunteer-dashboard.tsx`, `apps/web/src/features/volunteers/components/availability-needed-section.tsx`, `apps/web/src/features/volunteers/components/upcoming-assignments-section.tsx`, `apps/web/src/features/volunteers/components/notifications-inbox-section.tsx`, and `apps/web/src/features/volunteers/components/ministry-schedule-section.tsx`
- [ ] T058 Validate the implemented feature against `specs/014-volunteer-dashboard/quickstart.md` and update any mismatched feature notes in `specs/014-volunteer-dashboard/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1: Setup** → no dependencies
- **Phase 2: Foundational** → depends on Phase 1 and blocks all stories
- **Phase 3: US1** → depends on Phase 2 only
- **Phase 4: US2** → depends on Phase 2 and can run independently of US3–US5
- **Phase 5: US3** → depends on Phase 2 and reuses the notification persistence created there
- **Phase 6: US4** → depends on Phase 2 and can run independently of US3 and US5
- **Phase 7: US5** → depends on US1–US4 because it wraps the already-built dashboard data surfaces
- **Phase 8: Polish** → depends on all desired stories being complete

### User Story Dependencies

- **US1 (MVP)**: first deliverable slice, no user-story dependencies
- **US2**: no user-story dependency, but shares dashboard snapshot/query structure established in US1
- **US3**: no user-story dependency, but shares dashboard container from US1
- **US4**: no user-story dependency, but shares dashboard container from US1
- **US5**: depends on the earlier stories because it adds offline/refresh behavior across all built sections

### Within Each User Story

- Tests first
- Backend/public-interface work before frontend wiring
- Data loading before presentation components
- Story checkpoint before moving to the next priority if following strict MVP delivery

---

## Parallel Opportunities

- **Setup**: T002 and T003 can run in parallel
- **Foundational**: T005, T006, T008, T009, T011, and T012 can run in parallel after T004 where applicable
- **US1**: T014–T017 can run in parallel; T021 and T022 can run in parallel after backend contracts exist
- **US2**: T024–T027 can run in parallel
- **US3**: T033–T036 can run in parallel; T041 and T042 can run in parallel after backend procedures exist
- **US4**: T043–T045 can run in parallel
- **US5**: T049–T051 can run in parallel; T053 and T054 can run in parallel after query orchestration exists

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together:
Task: "Extend dashboard availability integration coverage in apps/server/tests/integration/routers/get-volunteer-dashboard.test.ts"
Task: "Add event-scoped availability mutation coverage in apps/server/tests/integration/routers/volunteer-availability.test.ts"
Task: "Add availability form component coverage in apps/web/src/__tests__/volunteer-dashboard/availability-form.test.tsx"
Task: "Add volunteer availability E2E journey in apps/web/tests/volunteer-dashboard/us1-availability.spec.ts"

# Then launch independent UI work together:
Task: "Build event-scoped availability editor behavior in apps/web/src/features/volunteers/components/availability-form.tsx"
Task: "Create Availability needed presentation in apps/web/src/features/volunteers/components/availability-needed-section.tsx and wire it in apps/web/src/features/volunteers/components/volunteer-dashboard.tsx"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1
2. Complete Phase 2
3. Complete Phase 3 (US1)
4. Validate US1 independently before expanding scope

### Incremental Delivery

1. Ship US1 as the canonical volunteer-dashboard MVP
2. Add US2 assignment response behavior
3. Add US3 historical notifications inbox
4. Add US4 read-only ministry schedule
5. Finish with US5 offline and refresh behavior

### Team Parallelization

After Phase 2:
- Developer A: US1
- Developer B: US2
- Developer C: US3
- Developer D: US4

Start US5 after the core sections exist.

---

## Notes

- Every task follows the required checklist format with exact file paths.
- Test tasks are included intentionally because the feature spec and planning artifacts require test-first coverage.
- `apps/server/tests/integration/routers/get-volunteer-dashboard.test.ts` remains as an implementation target for the future implementation phase, per current planning guidance.
