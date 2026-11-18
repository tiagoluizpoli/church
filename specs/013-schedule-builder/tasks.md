# Tasks: Schedule Builder (Desktop)

**Input**: Design documents from `specs/013-schedule-builder/`

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable — different files, no unmet dependencies
- **[Story]**: User story label [US1]–[US6]
- **[TEST]**: Test task — Vitest unit/integration/component or Playwright E2E

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install missing dependencies and add shadcn components not yet in `@church/ui`.

- [x] T001 Install `@dnd-kit/core` and `@dnd-kit/utilities` in `apps/web` — run `bun add @dnd-kit/core @dnd-kit/utilities` from `apps/web/`
- [x] T002 [P] Add missing shadcn components to `packages/ui` — run `bunx shadcn add dialog popover badge tooltip progress separator scroll-area alert` from `packages/ui/`
- [x] T003 [P] Export all newly added shadcn components from `packages/ui/src/index.ts` — N/A in this repo: `@church/ui` has no `src/index.ts` barrel; it uses subpath exports (`./components/*`). All 8 components present and importable directly (verified by `check-types`).
- [x] T125 [P] Install and configure test dev deps in `apps/web` — deps installed (`vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom msw msw-trpc jsdom @vitest/ui`); `apps/web/vitest.config.ts` defines three projects (`unit` node, `component` jsdom + RTL setup, `integration` node); MSW server setup at `apps/web/src/__tests__/setup/msw.ts`; infra self-tests green (3 files / 4 tests pass via `bun run test`).
- [x] T126 [P] Install Playwright + axe-core for E2E in `apps/web` — DONE: `@playwright/test@1.61.1` + `@axe-core/playwright@4.12.1` installed; chromium present (v1228); `apps/web/playwright.config.ts` (testDir `./tests`, baseURL 4001, webServer auto-start, pt-BR); 5/5 specs green; turbo `test:e2e` task + root `test:e2e` → `turbo test:e2e`; `apps/web/test:e2e` + `test:e2e:ui` scripts. DONE: `@axe-core/playwright` + Playwright installed; chromium present. Seed lives SERVER-SIDE (no DB deps in frontend): `apps/server/src/test-support/e2e-seed.ts` + `seed:e2e` script (church/ministry/roles/leader+pool volunteers/event/slot/requirement/availability, linked to the Better Auth leader). Web `tests/global-setup.ts` signs in/up the leader → shells the seed → saves `tests/.auth/leader.json`; `global-teardown.ts` cleans up; wired in `playwright.config.ts`. Auth-aware fixtures in `tests/fixtures/` (`test.use({ storageState: LEADER_STORAGE_STATE })`). Validated end-to-end: authenticated leader loads the seeded builder (6/6 e2e green incl. auth smoke). `tests/.auth/`, `test-results/`, `playwright-report/` gitignored.

**Checkpoint**: `@dnd-kit/core`, `dialog`, `popover`, `badge`, `tooltip`, `progress`, `separator`, `scroll-area`, `alert` importable in `apps/web`. Vitest (unit/component/integration), RTL, MSW, Playwright, and axe-core configured and runnable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema changes, repo extensions, new backend procedures, and routing skeleton. Must be complete before any user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### 2a — Schema & Migration

- [x] T004 Add `event_type_enum` (`'hourly' | 'day_based'`) to `packages/db/src/schema/enums.ts` and add `eventType` column (default `'hourly'`) to the `event` table in `packages/db/src/schema/scheduling.ts`
- [x] T005 Create `packages/db/src/schema/role-templates.ts` with `roleTemplate` and `roleTemplateItem` tables as specified in `specs/013-schedule-builder/data-model.md`
- [x] T006 Export `roleTemplate` and `roleTemplateItem` from `packages/db/src/schema/index.ts`
- [x] T007 Generate and run DB migration: `bun run db:generate && bun run db:migrate` from `packages/db/`

### 2b — Domain Entities (apps/server)

- [x] T008 Add `EventType = 'hourly' | 'day_based'` type and `eventType: EventType` field to `apps/server/src/domain/entities/event.ts`
- [x] T009 [P] Create `apps/server/src/domain/entities/role-template.ts` with `RoleTemplateId`, `RoleTemplateItemId`, `RoleTemplateItem`, and `RoleTemplate` interfaces as per `data-model.md`

### 2c — Repository Contracts (apps/server)

- [x] T010 Extend `apps/server/src/domain/repositories/event.repository.ts` with `CreateEventInput` (add `eventType`), `UpdateEventInput`, and `update()` method signature
- [x] T011 [P] Extend `apps/server/src/domain/repositories/time-slot.repository.ts` with `create()`, `update()`, `deleteById()`, and `findOverlapping()` method signatures and input types as per `data-model.md`
- [x] T012 [P] Extend `apps/server/src/domain/repositories/assignment-audit.repository.ts` with `listByEvent()` method signature
- [x] T013 [P] Create `apps/server/src/domain/repositories/role-template.repository.ts` with full `RoleTemplateRepository` interface as per `data-model.md`

### 2d — Repository Implementations (apps/server)

- [x] T014 Add `eventType` field to `mapEvent` mapper in `apps/server/src/infrastructure/repositories/drizzle-event.repository.ts` and implement `update()` method
- [x] T015 Add `create()`, `update()`, `deleteById()`, and `findOverlapping()` methods to `apps/server/src/infrastructure/repositories/drizzle-time-slot.repository.ts`
- [x] T016 [P] Add `listByEvent()` method to `apps/server/src/infrastructure/repositories/drizzle-assignment-audit.repository.ts`
- [x] T017 [P] Create `apps/server/src/infrastructure/repositories/drizzle-role-template.repository.ts` implementing `RoleTemplateRepository`
- [x] T018 Register `roleTemplates` repository in `apps/server/src/infrastructure/repositories/registry.ts`

### 2e — Core Backend Procedures (apps/server)

- [x] T019 Create `apps/server/src/routers/admin-leader/create-event.ts` — inputs: `{ ministryId, title, startDate, endDate, eventType }`, calls `EventRepository.create`, returns new event
- [x] T020 [P] Create `apps/server/src/routers/admin-leader/list-events.ts` — input: `{ ministryId }`, calls `EventRepository.listByMinistry`, returns sorted array
- [x] T021 Register `createEvent` and `listEvents` procedures in `apps/server/src/routers/admin-leader.ts`

### 2f — Frontend Routing Skeleton (apps/web)

- [x] T022 Create `apps/web/src/routes/scheduling.tsx` — layout route with `<Outlet />`, wraps scheduling section
- [x] T023 Create `apps/web/src/routes/scheduling/index.tsx` — event list page component (can render loading state initially)
- [x] T024 Create directory `apps/web/src/routes/scheduling/events/$eventId/` and file `builder.tsx` — schedule builder page shell (renders "Builder for {eventId}" placeholder initially)
- [x] T025 Regenerate TanStack Router route tree: `bun run generate:routes` from `apps/web/` (or equivalent script in `package.json`)
- [x] T026 Add route guard in `apps/web/src/routes/scheduling/events/$eventId/builder.tsx` — `beforeLoad`: redirect non-leaders to `/scheduling` with toast "You don't have access to the schedule builder"

### 2g — Event List Page (apps/web)

- [x] T027 Update `apps/web/src/features/scheduling/components/event-list.tsx` — connect to `trpc.adminLeader.listEvents.useQuery({ ministryId })`, replace mock data; show loading skeleton while fetching
- [x] T028 Create `apps/web/src/features/scheduling/components/quick-create-event-modal.tsx` — dialog with fields: title (text), startDate, endDate (date pickers), eventType (radio: hourly/day-based); on submit calls `trpc.adminLeader.createEvent.useMutation()`, redirects to builder on success
- [x] T029 Add "New Event" button to `apps/web/src/features/scheduling/components/event-list.tsx` that opens `QuickCreateEventModal`; event cards link to `/scheduling/events/{id}/builder`
- [x] T030 Wire event list into `apps/web/src/routes/scheduling/index.tsx`

### 2h — Tests: Foundational Backend

- [x] T091 [TEST] Integration test: `DrizzleTimeSlotRepository.findOverlapping` — returns `[]` when no overlap, returns matching slot when time ranges intersect — `apps/server/src/__tests__/infrastructure/repositories/drizzle-time-slot-repository.test.ts`
- [x] T092 [TEST][P] Integration test: `createEvent` rejects with 400 when `startDate >= endDate`; on success returns `{ id, status: 'draft', eventType }` — `apps/server/src/__tests__/routers/admin-leader/create-event.test.ts`
- [x] T093 [TEST][P] Integration test: `listEvents` returns events sorted by `startDate` descending; scoped to provided `ministryId` only — `apps/server/src/__tests__/routers/admin-leader/list-events.test.ts`

> Slot-procedure integration tests (createSlot, deleteSlot, generateSlots) live in Phase 6h — their implementations are in Phase 6, so TDD RED→GREEN happens there, not here.

**Checkpoint**: Foundation ready. Can create events, see event list, navigate to builder URL. All user story implementation can begin.

---

## Phase 3: User Story 1 — Build and Publish a Schedule (Priority: P1) 🎯 MVP

**Goal**: Leader creates an event, lands in builder, sees grid with slots and roles, assigns volunteers, and publishes. Volunteers are notified.

**Independent Test**: Create a new event via quick-create modal → auto-redirect to builder → add 2 slots → assign 1 volunteer per slot → click Publish → verify event status becomes `published`.

### 3a — Builder Container & Data Hooks (apps/web)

- [x] T088b [P] Create shared utility `apps/web/src/utils/format-volunteer-name.ts` — `formatVolunteerName(name)` returns `"First L."` from a full-name string; handles single-token names and empty input gracefully. Consumed by all name-rendering components (chip, card, picker, suggestions, substitution) and tested by T097
- [x] T031 Create `apps/web/src/features/scheduling/hooks/use-schedule-builder.ts` — wraps `trpc.adminLeader.getScheduleBuilderData.useQuery`, exposes `createAssignment`, `deleteAssignment`, `publishEvent` mutations with optimistic updates on `createAssignment`/`deleteAssignment`
- [x] T032 Create `apps/web/src/features/scheduling/hooks/use-auto-save.ts` — derives `saveStatus: 'idle' | 'saving' | 'saved' | 'error'` from mutation `isPending`/`isSuccess`/`isError` state; resets `'saved'` to `'idle'` after 2s

### 3b — Builder Header (apps/web)

- [x] T033 Create `apps/web/src/features/scheduling/components/builder/builder-header.tsx` — renders event title (links to detail page), date range, ministry name, status badge, save status indicator, staffing meter (event-level), "Publish" button (disabled when `!canPublish`), "Send Reminder" button, and ⋯ overflow menu (`DropdownMenu`) with "Print / Export" and "View Audit Log" items; auto-save error banner (`Alert`) shown when `saveStatus === 'error'` with retry button
- [x] T034 Create `apps/web/src/features/scheduling/components/builder/staffing-meter.tsx` — accepts `fillRatio: number` and `variant: 'event' | 'slot'`; event variant renders labeled `Progress` bar; slot variant renders compact percentage badge; color: red < 0.5, yellow 0.5–0.99, green 1.0

### 3c — Grid Derivation & Rendering (apps/web)

- [x] T035 Create `apps/web/src/features/scheduling/components/builder/builder-grid.tsx` — derives `GridCell[]` from `getScheduleBuilderData` response (one cell per fill slot: `slotId × roleId × fillIndex`); renders slot rows grouped by slot, role columns from requirements; passes cell props down to `RequirementCell`; includes sticky day-header rows for multi-day events
- [x] T036 Create `apps/web/src/features/scheduling/components/builder/slot-row.tsx` — renders one row per time slot; shows time range (hourly events) or "Day N" label (day-based events); renders per-slot `StaffingMeter`; renders role column headers with +/− controls (placeholder — wired in US4); applies green background tint when all cells in row are filled with no hard conflicts
- [x] T037 Create `apps/web/src/features/scheduling/components/builder/requirement-cell.tsx` — single droppable cell; renders `AssignmentChip` when assigned, `SuggestionList` when empty; accepts drop events from dnd-kit (`useDroppable`); `isReadOnly` prop disables all interactions; opens `AssignmentPicker` on click when not read-only

### 3d — Assignment Chip (apps/web)

- [x] T038 Create `apps/web/src/features/scheduling/components/builder/assignment-chip.tsx` — displays volunteer first name + last initial; conflict badge (`Badge`) colored orange (double_booked) or red (unavailable); confirmation badge (✓/×/clock `Badge`) shown only when `isPublished`; entire chip is clickable to open picker

### 3e — Volunteer Pool Sidebar (apps/web)

- [x] T039 Create `apps/web/src/features/scheduling/hooks/use-volunteer-pool.ts` — accepts `volunteers: VolunteerWithAvailability[]` and `assignments: Assignment[]`; exposes `nameFilter`, `roleFilter`, `setNameFilter`, `setRoleFilter`, and `sortedFilteredVolunteers` (applies sort: available → partial → unavailable → no_response, then least-assigned, then alpha); computes `workloadCount` per volunteer from assignments
- [x] T040 Create `apps/web/src/features/scheduling/components/builder/volunteer-card.tsx` — renders volunteer name, color `Badge` for availability status (green/yellow/red/gray), workload count chip; `Tooltip` on hover shows availability detail; wraps with `useDraggable` from dnd-kit exposing `volunteerId` as drag data
- [x] T041 Create `apps/web/src/features/scheduling/components/builder/volunteer-pool-sidebar.tsx` — `ScrollArea` wrapping sorted volunteer cards; name search `Input` + role `Select` filter (both active simultaneously, AND logic); renders `VolunteerCard` list; shows "No volunteers match" empty state when filters yield zero results

### 3f — Assignment Picker (apps/web)

- [x] T042 Create `apps/web/src/features/scheduling/components/builder/assignment-picker.tsx` — `Popover` containing search `Input` and volunteer list filtered to available-first for the target slot; shows "Already assigned (N slots)" badge on fully-assigned volunteers; "Remove" option at list top when cell is already assigned (mode = 'assign'); call `onSelect(volunteerId)` or `onRemove()` on action

### 3g — Builder Assembly (apps/web)

- [x] T043 Create `apps/web/src/features/scheduling/components/builder/schedule-builder.tsx` — top-level component; wraps grid in `DndContext` from dnd-kit; handles `onDragEnd` to call `createAssignment`; handles `onClickAssign` → opens picker; handles `onAssign` → calls `createAssignment`; handles `onUnassign` → calls `deleteAssignment`; handles publish → calls `publishEvent`; renders `BuilderHeader`, `VolunteerPoolSidebar`, `BuilderGrid` side by side; renders `MobileInterstitial` when mobile detected
- [x] T044 Wire `ScheduleBuilder` into `apps/web/src/routes/scheduling/events/$eventId/builder.tsx` — extracts `eventId` from route params, passes to component

### 3h — Tests: US1 — Build and Publish

- [x] T097 [TEST] Unit test: `formatVolunteerName(name)` returns `"First L."` from a full-name string; handles single-token name and empty string gracefully — `apps/web/src/__tests__/utils/format-volunteer-name.test.ts`
- [x] T098 [TEST][P] Unit test: `use-volunteer-pool` sorting — available ranks before partial, before unavailable, before no_response; within tier sorts by `workloadCount` ascending then alpha — `apps/web/src/__tests__/features/scheduling/hooks/use-volunteer-pool.test.ts`
- [x] T099 [TEST][P] Component test: `StaffingMeter` renders red `Progress` when `fillRatio < 0.5`, yellow at `0.5–0.99`, green at `1.0`; slot variant renders compact badge not full bar; **fill-ratio derivation (FR-050): a conflicted assignment increments the fill count identically to a clean assignment** — `apps/web/src/__tests__/features/scheduling/components/builder/staffing-meter.test.tsx`
- [x] T100 [TEST][P] Component test: `AssignmentChip` renders first name + last initial; orange `Badge` for `conflictStatus='double_booked'`, red for `'unavailable'`; confirmation badges (✓/×/clock) visible only when `isPublished` — `apps/web/src/__tests__/features/scheduling/components/builder/assignment-chip.test.tsx`
- [x] T101 [TEST][P] Component test: `RequirementCell` in empty state renders `SuggestionList`; in assigned state renders `AssignmentChip`; `isReadOnly=true` suppresses click handler and `useDroppable` — `apps/web/src/__tests__/features/scheduling/components/builder/requirement-cell.test.tsx`
- [x] T102 [TEST][P] Component test: `VolunteerPoolSidebar` name filter shows only matching volunteers; role filter shows only role match; combined filters use AND logic; empty result shows "No volunteers match" — `apps/web/src/__tests__/features/scheduling/components/builder/volunteer-pool-sidebar.test.tsx`
- [x] T103 [TEST] E2E (Playwright): US1 full journey — create event via quick-create modal → auto-redirect to builder → builder grid renders → click cell to open picker → assign volunteer → publish → verify event status badge shows "Published" — `apps/web/tests/scheduling/us1-build-and-publish.spec.ts`

**Checkpoint US1**: Leader can create event, open builder, see grid, drag/click to assign volunteers, and publish. Publish button sends notifications.

---

## Phase 4: User Story 2 — Handle Conflicts and Overrides (Priority: P2)

**Goal**: Leader assigns a volunteer with a conflict → sees colored conflict badge → clicks Override → enters 10+ char reason → assignment saved with audit entry → audit log accessible from header.

**Independent Test**: Assign same volunteer to two overlapping slots → orange badge appears → override dialog opens → enter reason < 10 chars (button stays disabled) → enter ≥ 10 chars → confirm → audit log shows entry.

### 4a — Backend: Audit Log Procedure (apps/server)

- [x] T045 Create `apps/server/src/routers/admin-leader/list-audit-log.ts` — input: `{ eventId }`; calls `repositories.assignmentAudits.listByEvent`; joins volunteerName, slotLabel, roleName; returns only entries where `reason` is not null (override actions); returns array sorted by timestamp desc
- [x] T046 Register `listAuditLog` in `apps/server/src/routers/admin-leader.ts`

### 4b — Frontend: Conflict UI (apps/web)

- [x] T047 [US2] Update `apps/web/src/features/scheduling/components/builder/requirement-cell.tsx` — map `conflictReport` from `createAssignment` response to `conflictStatus` prop on `AssignmentChip`; show orange border + badge for `double_booked`, red for `unavailable`; show "Override" button inside chip or as cell overlay when conflict present
- [x] T048 [US2] Create `apps/web/src/features/scheduling/components/builder/override-dialog.tsx` — `Dialog` with `conflictType` display (e.g., "João P. is double-booked"), `Textarea` for reason, character counter (N/10), "Confirm Override" `Button` disabled until `reason.length >= 10`, `isPending` spinner; calls `onConfirm(reason)` which calls `createAssignment` with `allowOverride: true, overrideReason: reason`
- [x] T049 [US2] Wire override flow in `schedule-builder.tsx`: when `createAssignment` returns `conflictReport` (no `assignment`), open `OverrideDialog` with conflict details; on confirm, re-call `createAssignment` with override params

### 4c — Frontend: Hard Violation Publish Gate (apps/web)

- [x] T050 [US2] In `use-schedule-builder.ts`, compute `hasHardViolations` — true when any cell has `conflictStatus === 'unavailable'` AND ministry enforcement is `hard`; expose in hook result; pass as `canPublish = !hasHardViolations` to `BuilderHeader`

### 4d — Frontend: Audit Log Panel (apps/web)

- [x] T051 [US2] Create `apps/web/src/features/scheduling/components/builder/audit-log-panel.tsx` — `Dialog` opened from ⋯ overflow "View Audit Log"; calls `trpc.adminLeader.listAuditLog.useQuery({ eventId })`; renders table of override entries (volunteer, slot, role, reason, actor, timestamp in ministry timezone); shows "No overrides recorded" when empty
- [x] T052 [US2] Wire `onOpenAuditLog` in `schedule-builder.tsx` → toggle audit log panel open state

### 4e — Tests: US2 — Conflicts and Overrides

- [x] T104 [TEST] Component test: `OverrideDialog` — "Confirm Override" button disabled when `reason.length < 10`; enabled at `>= 10`; character counter shows current count — `apps/web/src/__tests__/features/scheduling/components/builder/override-dialog.test.tsx`
- [x] T105 [TEST][P] Integration test: `listAuditLog` returns only entries with non-null `reason`; joins `volunteerName`, `slotLabel`, `roleName`; sorted by `timestamp` desc — `apps/server/src/__tests__/routers/admin-leader/list-audit-log.test.ts`
- [x] T106 [TEST][P] Component test: `RequirementCell` shows orange border + badge when `conflictStatus='double_booked'`; red border + badge when `'unavailable'`; no badge when no conflict — `apps/web/src/__tests__/features/scheduling/components/builder/requirement-cell-conflict.test.tsx`
- [x] T107 [TEST] E2E: US2 override journey — assign volunteer with known conflict (same volunteer in two slots) → conflict badge appears → click Override → enter `<10` chars (button disabled) → enter `>=10` chars → confirm → audit log entry visible in ⋯ menu — `apps/web/tests/scheduling/us2-conflict-override.spec.ts`; also asserts SC-002 (conflict badge < 1s)

**Checkpoint US2**: Conflict badges visible on assignment. Override dialog works with 10-char minimum. Audit log accessible from overflow menu.

---

## Phase 5: User Story 3 — Respond to Volunteer Decline (Priority: P2)

**Goal**: Volunteer declines → leader gets in-app notification → declined cell shows × badge → clicking opens substitution picker pre-filtered to available volunteers.

**Independent Test**: Manually update an assignment status to `declined` in DB → open builder → verify × badge on cell → click cell → substitution picker shows declined volunteer pinned at top → select replacement → assignment updated.

### 5a — Backend: Decline Notification Trigger + Send Reminder (apps/server)

- [x] T127 Wire leader notification on volunteer decline (FR-027) — in the volunteer-facing assignment status-update procedure (locate existing `respond-to-assignment` / `update-assignment-status` under `apps/server/src/routers/volunteer/`; if absent, create it), when an assignment transitions to `declined` on a `published` event, call `notificationService` to notify the event's leader(s) with volunteer + slot + role detail. This is the trigger that produces the in-app notification US3 consumes
- [x] T053 Create `apps/server/src/routers/admin-leader/send-reminder.ts` — input: `{ eventId }`; fetches event + ministry volunteers; filters to those with no `availability` record overlapping event's time range; calls `notificationService` for each; returns `{ notifiedCount }`
- [x] T054 Register `sendReminder` in `apps/server/src/routers/admin-leader.ts`

### 5b — Frontend: Declined Badge & Substitution (apps/web)

- [x] T055 [US3] Update `apps/web/src/features/scheduling/components/builder/assignment-chip.tsx` — ensure × badge renders when `confirmationStatus === 'declined'` and event is published; style distinctly (red ×) from conflict badge
- [x] T056 [US3] Create `apps/web/src/features/scheduling/components/builder/substitution-picker.tsx` — variant of `AssignmentPicker` for `mode='substitution'`; header shows "Find replacement for [declined volunteer name]"; declined volunteer pinned at top of list labeled "Declined — find replacement"; rest of list pre-filtered to `status === 'available'`; selecting calls `onSelect(newVolunteerId)` → deletes declined assignment → creates new assignment
- [x] T057 [US3] In `requirement-cell.tsx`, detect `assignment.confirmationStatus === 'declined'` → open `SubstitutionPicker` instead of standard `AssignmentPicker` on click

### 5c — Frontend: Send Reminder (apps/web)

- [x] T058 [US3] Wire "Send Reminder" button in `builder-header.tsx` — on click, calls `trpc.adminLeader.sendReminder.useMutation({ eventId })`; shows toast on success: "Reminder sent to {notifiedCount} volunteers"; shows toast on error

### 5d — Tests: US3 — Volunteer Decline

- [x] T128 [TEST] Integration test: declining a published assignment triggers a `notificationService` call to the event leader with volunteer/slot/role detail (FR-027); no notification fired for declines on draft events — `apps/server/src/__tests__/routers/volunteer/decline-notifies-leader.test.ts`
- [x] T108 [TEST] Integration test: `sendReminder` returns `notifiedCount=0` when all volunteers have availability records; counts and notifies only those without overlapping availability — `apps/server/src/__tests__/routers/admin-leader/send-reminder.test.ts`
- [x] T109 [TEST][P] Component test: `SubstitutionPicker` — declined volunteer pinned at top labeled "Declined — find replacement"; volunteer list pre-filtered to `status='available'`; selecting calls `onSelect` with correct volunteerId — `apps/web/src/__tests__/features/scheduling/components/builder/substitution-picker.test.tsx`
- [x] T110 [TEST] E2E: US3 decline flow — seed assignment with `status=declined` → open builder → verify × badge on cell → click cell → substitution picker opens with declined volunteer pinned → select replacement → cell updates to new assignment — `apps/web/tests/scheduling/us3-volunteer-decline.spec.ts`

**Checkpoint US3**: Declined assignments visible with × badge. Substitution picker opens on click. Send Reminder button notifies non-responders.

---

## Phase 6: User Story 4 — Manage Slot Structure (Priority: P3)

**Goal**: Leader can add/edit/remove slots in builder; auto-generation wizard creates slots from duration/count; role count adjustable via +/−; role templates apply requirements to all slots at once.

**Independent Test**: Open builder with no slots → click "Auto-generate slots" → pick duration-based (60 min) → confirm preview → template step → apply template → grid shows generated rows with role columns; edit a slot time via modal; delete slot with no assignments; verify overlap error when adding overlapping slot.

### 6a — Backend: Slot CRUD + Generation (apps/server)

- [x] T059 Create `apps/server/src/routers/admin-leader/create-slot.ts` — input: `{ eventId, startTime, endTime, label?, copyRequirementsFromSlotId? }`; blocks if event is Published; calls `findOverlapping` first (400 if overlap); calls `TimeSlotRepository.create`; if `copyRequirementsFromSlotId` provided, fetches source slot's requirements and upserts them on new slot; returns new slot with requirements
- [x] T060 [P] Create `apps/server/src/routers/admin-leader/update-slot.ts` — input: `{ slotId, startTime?, endTime?, label? }`; blocks if event is Published; validates no overlap (excluding self) via `findOverlapping`; calls `TimeSlotRepository.update`; returns updated slot
- [x] T061 [P] Create `apps/server/src/routers/admin-leader/delete-slot.ts` — input: `{ slotId }`; blocks if event is Published; counts active assignments (`countActiveAssignments`); returns `{ success, assignmentCount }` without deleting if `assignmentCount > 0` (client shows confirmation); deletes on second call with `{ slotId, force: true }`
- [x] T062 Create `apps/server/src/routers/admin-leader/generate-slots.ts` — input: `{ eventId, strategy, value, confirm }`; computes slot time ranges from event start/end + strategy; if `confirm=false` returns preview array; if `confirm=true` calls `TimeSlotRepository.bulkCreate`; blocks if event is Published
- [x] T063 Register `createSlot`, `updateSlot`, `deleteSlot`, `generateSlots` in `apps/server/src/routers/admin-leader.ts`

### 6b — Backend: Role Templates (apps/server)

- [x] T064 Create `apps/server/src/routers/admin-leader/list-role-templates.ts` — input: `{ ministryId }`; calls `RoleTemplateRepository.listByMinistry`; returns array with items including `roleName`
- [x] T065 [P] Create `apps/server/src/routers/admin-leader/upsert-role-template.ts` — input: `{ templateId?, ministryId, name, items[] }`; create or update template; validates all `roleId`s belong to ministry or are global; returns template. NOTE: builder only reads (T064) + applies (T066) templates; template authoring UI belongs to the future Ministry Settings spec. This backend procedure is scaffolded here so the apply flow has data to consume — no builder-side frontend caller in this spec
- [x] T066 [P] Create `apps/server/src/routers/admin-leader/apply-role-template.ts` — input: `{ eventId, templateId }`; fetches all slots for event; upserts (not replaces) slot requirements for each slot per template items; returns `{ updatedSlotCount, requirementsCreated }`
- [x] T067 [P] Create `apps/server/src/routers/admin-leader/delete-role-template.ts` — input: `{ templateId }`; calls `RoleTemplateRepository.deleteById`. NOTE: same as T065 — no builder-side frontend caller; consumed by future Ministry Settings UI
- [x] T068 Register `listRoleTemplates`, `upsertRoleTemplate`, `applyRoleTemplate`, `deleteRoleTemplate` in `apps/server/src/routers/admin-leader.ts`

### 6c — Frontend: Empty Builder State (apps/web)

- [x] T069 [US4] Create `apps/web/src/features/scheduling/components/builder/empty-builder-state.tsx` — centered empty state shown when event has zero slots; two CTA buttons: "Auto-generate slots" (opens `SlotGenerateWizard`) and "Add slot manually" (opens `SlotEditModal` for a new slot)
- [x] T070 [US4] In `schedule-builder.tsx`, render `EmptyBuilderState` when `slots.length === 0`

### 6d — Frontend: Slot Generation Wizard (apps/web)

- [x] T071 [US4] Create `apps/web/src/features/scheduling/components/builder/slot-generate-wizard.tsx` — multi-step `Dialog`: Step 1 (strategy picker: duration vs count + value input), Step 2 (preview list from `generateSlots` preview call — time ranges as readonly list), Step 3 (optional template select from `listRoleTemplates`); "Generate" final button calls `generateSlots` with `confirm: true`, then optionally `applyRoleTemplate`; invalidates builder query on success

### 6e — Frontend: Slot Edit Modal (apps/web)

- [x] T072 [US4] Create `apps/web/src/features/scheduling/components/builder/slot-edit-modal.tsx` — `Dialog` with time pickers for `startTime` / `endTime` (hidden for day-based events) and optional `label` text input; submit calls `createSlot` (new slot mode) or `updateSlot` (edit mode); shows inline error from API (overlap 400) below time fields stating the overlap (FR-032; next-valid-time suggestion is post-MVP — inline error only)

### 6f — Frontend: Slot Management Controls (apps/web)

- [x] T073 [US4] Create `apps/web/src/features/scheduling/components/builder/role-count-control.tsx` — + and − `Button` pair; clicking + calls `upsertSlotRequirement` with `count + 1`; clicking − calls `upsertSlotRequirement` with `count - 1` (min 1, disabled at 1); positioned in role column header within each slot row in `slot-row.tsx`
- [x] T074 [US4] Add slot management actions to `slot-row.tsx` row header: edit icon (opens `SlotEditModal`) and delete icon (calls `deleteSlot`; if `assignmentCount > 0` shows shadcn `AlertDialog` confirmation warning); wire `onEditSlot` and `onDeleteSlot` callbacks from `BuilderGrid`
- [x] T075 [US4] Add "Add slot" button at bottom of `builder-grid.tsx` — opens `SlotEditModal` in new-slot mode with prompt to copy requirements; hidden when event is Published

### 6g — Frontend: Post-Publish Slot Lock (apps/web)

- [x] T076 [US4] In `slot-row.tsx` and `builder-grid.tsx`, disable all slot management controls (add/edit/delete slot, +/- count buttons) when `event.status === 'published'`; show `Tooltip` "Slot structure is locked after publishing"

### 6h — Tests: US4 — Slot Management

- [x] T094 [TEST][P] Integration test: `createSlot` rejects 400 when event is `published`; rejects 400 when slot time overlaps existing slot; succeeds for valid non-overlapping input — `apps/server/src/__tests__/routers/admin-leader/create-slot.test.ts`
- [x] T095 [TEST][P] Integration test: `deleteSlot` returns `assignmentCount > 0` without deleting when active assignments exist; hard-deletes on `force: true` with no assignments — `apps/server/src/__tests__/routers/admin-leader/delete-slot.test.ts`
- [x] T096 [TEST][P] Integration test: `generateSlots` with `confirm=false` returns preview without writing DB rows; with `confirm=true` persists slots and returns IDs — `apps/server/src/__tests__/routers/admin-leader/generate-slots.test.ts`
- [x] T111 [TEST][P] Integration test: `updateSlot` — rejects when new time overlaps other slots (excludes self); succeeds for valid time change on draft event; rejects 400 on published event — `apps/server/src/__tests__/routers/admin-leader/update-slot.test.ts`
- [x] T112 [TEST][P] Integration test: `applyRoleTemplate` upserts requirements on all event slots; preserves existing requirements for roles not in template — `apps/server/src/__tests__/routers/admin-leader/apply-role-template.test.ts`
- [x] T113 [TEST][P] Component test: `SlotEditModal` — shows inline error below time fields when API returns 400 overlap error; time pickers hidden when `eventType='day_based'`; save button shows spinner while `isPending` — `apps/web/src/__tests__/features/scheduling/components/builder/slot-edit-modal.test.tsx`
- [x] T114 [TEST][P] Component test: `SlotGenerateWizard` — step 1 → 2 navigation shows preview from API; step 3 shows template select; Generate button disabled while `isPending`; calling generate invalidates builder query — `apps/web/src/__tests__/features/scheduling/components/builder/slot-generate-wizard.test.tsx`
- [x] T115 [TEST][P] Component test: `RoleCountControl` — `+` button calls `upsertSlotRequirement` with `count + 1`; `−` button disabled when `count === 1`; `−` button calls with `count - 1` when `count > 1` — `apps/web/src/__tests__/features/scheduling/components/builder/role-count-control.test.tsx`
- [x] T116 [TEST] E2E: US4 slot management — open empty builder → "Auto-generate slots" → complete wizard (duration 60 min) → grid shows generated slots → edit one slot time → verify updated time in grid → add slot manually → verify overlap error on duplicate time — `apps/web/tests/scheduling/us4-slot-management.spec.ts`

**Checkpoint US4**: Slot auto-generation wizard works (both strategies). Slot edit/delete with confirmation. Role count +/- updates requirements. Role templates apply to all slots. Published events lock slot structure.

---

## Phase 7: User Story 5 — Use Auto-Suggestions (Priority: P4)

**Goal**: Every empty cell passively shows top 3 suggested volunteers ranked by availability + least-assigned. Accepting a suggestion assigns the volunteer.

**Independent Test**: Open builder for event where volunteers have submitted availability → verify each empty cell shows up to 3 volunteer suggestions → click "Accept" on one → cell fills and becomes assigned chip.

- [x] T077 [US5] Create `apps/web/src/features/scheduling/components/builder/suggestion-list.tsx` — renders up to 3 `VolunteerCard`-style rows inside an empty cell; each row shows volunteer name, availability badge, workload count, and "Accept" button; suggestions ranked: fully-available + least-assigned first; partial-conflict suggestions shown with de-prioritized styling (opacity/italics) but include "Accept"; clicking "Accept" calls `onAssign`
- [x] T078 [US5] In `builder-grid.tsx`, derive `suggestions` per empty cell from `volunteerAvailability` sorted by: `status === 'available'` first → `status === 'partial'` second; within group sort by `workloadCount` ascending; take first 3; pass to `RequirementCell` as `suggestions` prop
- [x] T079 [US5] In `requirement-cell.tsx`, render `SuggestionList` when `!assignment && suggestions.length > 0`; hide suggestion list once assignment exists

### Phase 7 Tests: US5 — Auto-Suggestions

- [x] T117 [TEST] Unit test: suggestion derivation in `builder-grid.tsx` — available volunteers rank above partial; within tier, lower `workloadCount` ranks first; result capped at 3 — `apps/web/src/__tests__/features/scheduling/components/builder/builder-grid-suggestions.test.ts`
- [x] T118 [TEST][P] Component test: `SuggestionList` renders up to 3 suggestions; "Accept" calls `onAssign` with correct `volunteerId`; partial-status suggestions render with de-prioritized styling — `apps/web/src/__tests__/features/scheduling/components/builder/suggestion-list.test.tsx`
- [x] T119 [TEST] E2E: US5 suggestions — open builder with volunteers having known availability seeded → verify empty cells show up to 3 suggestions → click "Accept" on first → cell fills with assignment chip — `apps/web/tests/scheduling/us5-auto-suggestions.spec.ts`

**Checkpoint US5**: All empty cells show ranked suggestions. Accepting fills the cell.

---

## Phase 8: User Story 6 — Sub-Leader Manages Their Team (Priority: P3)

**Goal**: Sub-leader opens builder; sidebar shows only own-team volunteers; can assign only to own-team cells; other teams' cells are visible but read-only.

**Independent Test**: Log in as sub-leader → open builder → verify sidebar shows only own team volunteers → verify cells from other teams have no picker/drag targets → verify can assign to own team's cells.

- [x] T080 [US6] Update `apps/server/src/routers/admin-leader/get-schedule-builder-data.ts` — when caller's `systemRole === 'sub_leader'`, filter `volunteerAvailability` to only volunteers in caller's team; add `callerTeamId: string | null` to response so frontend knows which cells belong to the caller's team. Added `VolunteerRepository.listMinistryMemberships` + `authorizeScheduleBuilderAccess` (admits sub_leaders, resolves teamId) since `authorizeLeaderOrAdmin` previously locked sub_leaders out entirely.
- [x] T081 [US6] In `use-schedule-builder.ts`, expose `callerTeamId` from builder data response
- [x] T082 [US6] In `builder-grid.tsx`, derive `isReadOnly` per cell: `true` when `callerTeamId` is set AND `requirement.teamId !== callerTeamId`; pass `isReadOnly` to `RequirementCell`. Implemented as `GridRoleColumn.isReadOnly` (per slot+role) flowing through `SlotRow` → `RequirementCell`; removed the old empty `readOnlyRoleIds` placeholder.
- [x] T083 [US6] In `volunteer-pool-sidebar.tsx`, when `callerTeamId` is set, filter pool to show only volunteers whose team matches `callerTeamId` before passing to `use-volunteer-pool.ts` — SATISFIED BY T080: the server already scopes `volunteerAvailability` to the sub-leader's team (single source of truth), and per-volunteer `teamId` is intentionally not leaked to the client, so the sidebar already receives only own-team volunteers. A client re-filter would be redundant.
- [x] T084 [US6] In `requirement-cell.tsx`, when `isReadOnly === true`: disable `useDroppable`, suppress picker on click, apply read-only visual style (muted background, cursor-not-allowed)

### Phase 8 Tests: US6 — Sub-Leader Scope

- [x] T120 [TEST] Integration test: `getScheduleBuilderData` when `systemRole='sub_leader'` — `volunteerAvailability` scoped to caller's team only; `callerTeamId` in response matches caller's team — `apps/server/src/__tests__/routers/admin-leader/get-schedule-builder-data-sub-leader.test.ts`
- [x] T121 [TEST][P] Component test: `RequirementCell` with `isReadOnly=true` — click does not open picker, drag drop disabled, muted background applied via CSS class — `apps/web/src/__tests__/features/scheduling/components/builder/requirement-cell-readonly.test.tsx`
- [x] T122 [P] [TEST] E2E: US6 sub-leader — login as sub-leader → open builder → sidebar shows only own team → click own-team cell → picker opens → click other-team cell → no picker appears — `apps/web/tests/scheduling/us6-sub-leader.spec.ts`

**Checkpoint US6**: Sub-leaders see scoped pool. Own-team cells interactive. Other-team cells locked.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Finishing touches across all user stories.

- [x] T085 [P] Create `apps/web/src/features/scheduling/components/builder/mobile-interstitial.tsx` — renders full-screen warning page when `window.innerWidth < 1024 || navigator.maxTouchPoints > 0`; "Continue anyway" button sets `localStorage.setItem('builder-mobile-override', 'true')` and dismisses; check localStorage flag on mount to skip interstitial for returning users
- [x] T086 [P] Add manual refresh button to `builder-header.tsx` — icon button calls `refetch()` from `getScheduleBuilderData` query; shows `Skeleton` loader on refetch; `Tooltip` label "Refresh availability data"
- [x] T087 Add navigation link to "Scheduling" in app sidebar/navigation (`apps/web/src/components/app-shell.tsx` or equivalent navigation config) pointing to `/scheduling`
- [x] T088 [P] Verify all slot times display in ministry timezone — audit `builder-grid.tsx`, `slot-row.tsx`, `slot-edit-modal.tsx`, `slot-generate-wizard.tsx` for any `new Date()` display calls; ensure all use the timezone utility from `@church/env` / `useTimezone` hook (consistent with existing `apps/web/src/shared/hooks/use-timezone.ts`)
- [x] T089 [P] Audit-only: confirm every volunteer name display (`assignment-chip.tsx`, `volunteer-card.tsx`, `assignment-picker.tsx`, `suggestion-list.tsx`, `substitution-picker.tsx`) imports `formatVolunteerName` from `apps/web/src/utils/format-volunteer-name.ts` (created in T088b) — fix any inline formatting found
- [x] T090 Review and ensure all new `adminLeader` tRPC procedures return typed errors (not raw `Error`) — verify Zod schemas are tight on all inputs; verify `churchId` isolation on all new procedures

### Phase 9 Tests: E2E Full System

- [x] T123 [TEST] E2E: Full system smoke test — create event → auto-generate slots → assign volunteer to each slot (click flow) → override one conflict with reason → publish event → verify event card on list page shows "Published" status — `apps/web/tests/scheduling/full-journey.spec.ts`
- [x] T124 [TEST] E2E: Accessibility smoke (depends on full builder UI + T126 axe-core install) — open builder → run axe-core scan on builder view → verify no critical WCAG 2.1 AA violations on grid, sidebar, and header — `apps/web/tests/scheduling/a11y-builder.spec.ts`
- [x] T127 [TEST] E2E: SC-006 timing — accept volunteer suggestion → verify `[data-testid="save-status"]` shows "Saved" within 2 000 ms of the action — added to `apps/web/tests/scheduling/us1-build-and-publish.spec.ts`
- [x] T128 [TEST] E2E: SC-002 timing — assign unavailable volunteer in override event → verify conflict badge appears within 1 000 ms of assignment — added to `apps/web/tests/scheduling/us2-conflict-override.spec.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1; **blocks all user stories**
- **Phase 3 (US1)**: Depends on Phase 2 — first user story, builds core builder
- **Phase 4 (US2)**: Depends on Phase 3 (uses builder + `createAssignment` conflict flow)
- **Phase 5 (US3)**: Depends on Phase 3 (uses builder + assignment chip); independent of Phase 4
- **Phase 6 (US4)**: Depends on Phase 3 (extends builder with slot management); independent of US2/US3
- **Phase 7 (US5)**: Depends on Phase 3 (extends empty cell rendering)
- **Phase 8 (US6)**: Depends on Phase 3 (extends sidebar + cell read-only logic)
- **Phase 9 (Polish)**: Depends on all phases complete

### User Story Dependencies

| Story | Depends on | Notes |
|-------|-----------|-------|
| US1 (P1) | Phase 2 complete | Core builder — all others depend on it |
| US2 (P2) | US1 complete | Uses `createAssignment` conflict report already in API |
| US3 (P2) | US1 complete | Can run in parallel with US2 |
| US4 (P3) | US1 complete | Can run in parallel with US2/US3 |
| US5 (P4) | US1 complete | Small — can run in parallel with any other US |
| US6 (P3) | US1 complete | Backend change (T080) should not break existing behavior |

### Parallel Opportunities Within Phases

**Phase 1**: T001/T002/T003/T125/T126 all parallel (independent installs/config)

**Phase 2**: T008/T009 parallel; T010/T011/T012/T013 parallel; T014/T015/T016/T017 parallel; T019/T020 parallel; T022/T023/T024 parallel after T021; T091/T092/T093 parallel after their impls

**Phase 6 Backend**: T059 first (overlap logic needed); T060/T061 parallel after T059; T064/T065/T066/T067 parallel. Tests T094/T095/T096/T111/T112 parallel after respective impls

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup)
2. Complete Phase 2 (Foundational — CRITICAL)
3. Complete Phase 3 (US1 — Build & Publish)
4. **STOP AND VALIDATE**: Create event → build schedule → publish → verify volunteer notification
5. Ship US1 as MVP — fully functional end-to-end scheduling

### Incremental Delivery

1. Phase 1 + Phase 2 → Infrastructure ready
2. Phase 3 (US1) → MVP schedule builder ships
3. Phase 4 (US2) + Phase 5 (US3) → Conflict management + decline flow (can be parallel)
4. Phase 6 (US4) + Phase 7 (US5) + Phase 8 (US6) → Full feature set (can be parallel)
5. Phase 9 → Polish

---

## Notes

- `[P]` = parallelizable, different files, no unmet dependencies
- `[TEST]` = test task; test tool noted in description (Vitest unit/integration/component or Playwright E2E)
- Story labels map directly to spec.md user story numbers
- Backend procedures in Phase 2 (createEvent, listEvents) are foundational — all US phases need events to exist
- Slot management procedures (createSlot, updateSlot, deleteSlot, generateSlots) are in Phase 6 because only US4 requires them; US1 uses pre-existing slots from seed data for MVP test
- Role template procedures parallel slot CRUD in Phase 6 — no dependency between them
- Integration tests hit real DB (Vitest + testcontainers or local dev DB) — do NOT mock repository layer
- Component tests use `@testing-library/react` + Vitest; mock only tRPC at the network boundary (MSW or tRPC's `createCallerFactory`)
- E2E tests use Playwright; seed data via API or direct DB fixture scripts in `apps/web/tests/fixtures/`
- TDD order per phase: write test (RED) → minimal implementation (GREEN) → refactor; do NOT batch all tests before all code
- Slot-procedure tests (T094/T095/T096) live in Phase 6h next to their Phase 6 implementations — keeps RED→GREEN local, not split across phases
- FR-027 decline → leader notification is fired by the volunteer-side status-update procedure (T127), not by any builder procedure; US3 builder tasks only consume the resulting notification
- SC-007 (leader notified of decline within 1 min) is governed by the notification service delivery SLA — verified at the service layer, not re-tested per builder task; T128 verifies the trigger fires
- Task IDs are stable: T091–T124 are tests interleaved into their phases; T125–T128 were added during `/speckit-analyze` remediation (test infra, Playwright/axe install, decline-notification trigger + its test)
