# Tasks: Tailoring Workspace Reorganization

**Input**: Design documents from `specs/022-tailoring-workspace/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — constitution's Mandatory Quality Gates require exhaustive unit/integration/E2E coverage (not optional in this repo).

**Organization**: Grouped by user story (US1–US4, matching spec.md priorities P1/P1/P1/P2).

**Note**: Incorporates all resolutions from the `/impeccable` pre-build critique (`.impeccable/critique/2026-07-11T21-00-35Z__kspace-tailoring-workspace-redesign-plan-pre-build.md`) — see T002a/T015a/T030a/T031a and the rewritten T024/T026/T027/T001 below. Also incorporates all findings from the `/speckit-analyze` pass run after the critique: C1/A1 (ministry-list data-fetch contract + "cycle set" definition, research.md R10) rewritten into T006/T012/T013; C2 (missing US3 mobile-viewport test) added as T023a; C3 (FR-013/FR-016 test coverage) added as T021a; I1 (wrong citation) fixed in T008; U1 (cosmetic wording) fixed in T035. Also incorporates a `/test-master` scenario-class audit against every test task above: permission-failure and API-error-state coverage was **zero** across all 3 new data-fetching routes (test-master Class 4/5) — added as T013a/T013b (US1), T015b/T015c (US2), T023c/T023d (US3); invalid headcount input (Class 3) added as T023b; double-submit on the save action (Class 6) added as T030b; mid-save unmount/navigation (Class 7) added as T030c.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (ministry list), US2 (cycle list), US3 (tailoring workspace: calendar/filters/slots/shifts/headcount), US4 (batched fire)

## Path Conventions

Web app, frontend-only: `apps/web/src/routes/scheduling/tailoring/…`, `apps/web/src/features/scheduling/components/tailoring/…`. No backend paths — no schema/API changes in this feature.

---

## Phase 1: Setup

**Purpose**: Establish the new route skeleton and component directory before any story-specific work.

- [ ] T001 Move `ManualSplitEditor` out of `participation-tailoring.tsx` into `apps/web/src/features/scheduling/components/tailoring/manual-split-editor.tsx`, keeping `validateManualSpans` and payload-shape logic verbatim but rewriting its DOM to use shadcn `Select` (replacing the native `<select>`) and `touch`-sized `Input`s for start/end time entry, per research.md R2 (post-critique P2 fix)
- [ ] T002 [P] Remove `ParticipationEventCard` from `participation-tailoring.tsx` without re-extracting it as a standalone file — its rendering role is fully superseded by `tailoring-slot-list.tsx` (T026); only note which of its mutation-wiring snippets need to carry forward for T026/T027 to reference, per research.md R2 (post-critique P0 fix)
- [ ] T002a Remove the resting `box-shadow` declaration from `.surface-panel` in `apps/web/src/index.css:313-323`, per research.md R9 (post-critique P2 fix) — app-wide visual change, verify no other screen relied on the shadow before committing
- [ ] T003 Create layout route `apps/web/src/routes/scheduling/tailoring.tsx` as an outlet-only layout (replacing its current monolithic content)
- [ ] T004 Create layout route `apps/web/src/routes/scheduling/tailoring/$ministryId.tsx` as an outlet-only layout
- [ ] T005 Run `pnpm --filter web dev` (or equivalent) and confirm the route tree regenerates in `apps/web/src/routeTree.gen.ts` with no errors before proceeding

**Checkpoint**: Route skeleton exists; old monolith's reusable pieces are extracted but not yet wired to new pages; shared shadow bug fixed at the source.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared data-fetching and pure-helper groundwork every story needs.

**⚠️ CRITICAL**: No user story task may start until this phase is complete.

- [ ] T006 [P] Add pure helper `buildMinistryTailoringSummary` (named-object-param input/output types) to `apps/web/src/features/scheduling/components/participation-tailoring.utils.ts` that aggregates event/slot counts per ministry from: the ministry's `listEvents` results grouped via existing `buildCycleOptions` (event count, intersected with the locked-cycle-id set), plus the per-(ministry, locked cycle) `getCycleParticipation` slot counts — exact algorithm and endpoint sequence per research.md R10 (resolves the /speckit-analyze C1/A1 findings; "cycle set" = union of all `state: 'locked'` cycles, not a single "most recent" cycle)
- [ ] T007 [P] Add pure helper `buildEventDayMarkers` to `apps/web/src/features/scheduling/components/participation-tailoring.utils.ts` that derives a `Set<ISODateString>` from fetched events, per research.md R3
- [ ] T008 [P] Add pure helpers `filterSlotsByName` and `filterSlotsByTimeOfDay` to `apps/web/src/features/scheduling/components/participation-tailoring.utils.ts`, each taking a named-object-param filter spec and operating on already-fetched slot data (no network calls), per FR-010 (citation corrected post-analyze I1 — this is not related to research.md R4)
- [ ] T009 [P] Unit tests for T006–T008 helpers in `apps/web/src/features/scheduling/components/participation-tailoring.utils.test.ts` (aggregation correctness incl. zero-state and `all_in`-seeded ministries per research.md R5, and the R10 locked-cycle-union rule with 0/1/2+ concurrently locked cycles; day-marker set correctness; name/time filter edge cases from spec Edge Cases)

**Checkpoint**: Shared helpers exist and are unit-tested; user story implementation can begin.

---

## Phase 3: User Story 1 - Ministry list landing page (Priority: P1) 🎯 MVP

**Goal**: Leader/sub-leader sees every ministry they're responsible for, with real event/slot counts for the active cycle, as the first screen of the flow.

**Independent Test**: Log in as a leader of 2+ ministries where only one has tailoring activity; confirm correct counts render on both desktop (table) and mobile (card) viewports without navigating further.

### Tests for User Story 1

- [ ] T010 [P] [US1] Component test: desktop table renders correct per-ministry event/slot counts, including 0/0 for untouched ministries, in `apps/web/src/features/scheduling/components/tailoring/ministry-tailoring-list.test.tsx`
- [ ] T011 [P] [US1] Component test: mobile viewport (`< md`) renders the same data as a card list matching `cycle-list-card.tsx`'s responsive pattern, in the same test file as T010
- [ ] T013a [P] [US1] Route test: any of `listMinistries`/`listPlanningCycles`/`listEvents`/`getCycleParticipation` returning a 403 (e.g. church-isolation/RBAC rejection) renders a permission-denied state, not a crash or blank page (test-master Class 4 — added post-test-audit), in `apps/web/src/routes/scheduling/tailoring/index.test.tsx`
- [ ] T013b [P] [US1] Route test: any of the same calls failing with a network error or 500 renders a retryable error state, not a crash or infinite spinner (test-master Class 5 — added post-test-audit), same test file as T013a

### Implementation for User Story 1

- [ ] T012 [US1] Implement `apps/web/src/features/scheduling/components/tailoring/ministry-tailoring-list.tsx` — desktop table (`hidden md:block`) + mobile card list (`md:hidden`) reusing the responsive structure from `apps/web/src/features/scheduling/components/planning-admin/cycle-list-card.tsx`, sourcing rows from `buildMinistryTailoringSummary` (T006)
- [ ] T013 [US1] Implement `apps/web/src/routes/scheduling/tailoring/index.tsx` to call, in sequence per research.md R10: `adminApi.listMinistries()`, `adminApi.listPlanningCycles({ state: 'locked' })`, then per-ministry `adminApi.listEvents({ ministryId })` and per-(ministry, locked cycle) `adminApi.getCycleParticipation`, feed the results into `buildMinistryTailoringSummary` (T006), and render `MinistryTailoringList`, linking each row/card to `/scheduling/tailoring/$ministryId`

**Checkpoint**: Ministry list is fully functional and independently testable/demoable.

---

## Phase 4: User Story 2 - Cycle list scoped to one ministry (Priority: P1)

**Goal**: After picking a ministry, the leader sees only the cycles that ministry can currently tailor, and can pick one to proceed.

**Independent Test**: Click a ministry with 2+ open cycles; confirm both are listed and each navigates independently to the tailoring workspace for that exact ministry+cycle pair.

### Tests for User Story 2

- [ ] T014 [P] [US2] Component test: cycle list shows only cycles available to the selected ministry, in `apps/web/src/features/scheduling/components/tailoring/ministry-cycle-list.test.tsx`
- [ ] T015 [P] [US2] Component test: empty-state renders when a ministry has zero open cycles (per spec Edge Cases), same test file as T014
- [ ] T015a [P] [US2] Route test: with exactly one open cycle, `/scheduling/tailoring/$ministryId` redirects directly to `/scheduling/tailoring/$ministryId/$cycleId` without rendering the picker; with 2+ open cycles, the picker renders normally (research.md R7, post-critique P1), in `apps/web/src/routes/scheduling/tailoring/$ministryId/index.test.tsx`
- [ ] T015b [P] [US2] Route test: a leader who does not lead/sub-lead the route's `ministryId` gets a permission-denied state on `listEvents` (403), not a crash (test-master Class 4 — added post-test-audit), same test file as T015a
- [ ] T015c [P] [US2] Route test: `listEvents` failing with a network error or 500 renders a retryable error state, not a crash or infinite spinner (test-master Class 5 — added post-test-audit), same test file as T015a

### Implementation for User Story 2

- [ ] T016 [US2] Implement `apps/web/src/features/scheduling/components/tailoring/ministry-cycle-list.tsx`, reusing `cycle-list-card.tsx`'s responsive list pattern, scoped by `ministryId`
- [ ] T017 [US2] Implement `apps/web/src/routes/scheduling/tailoring/$ministryId/index.tsx` to fetch cycles open for tailoring for the route's `ministryId`; if exactly one is open, `redirect` (TanStack Router) straight to its `$cycleId` workspace; otherwise render `MinistryCycleList`, linking each cycle to `/scheduling/tailoring/$ministryId/$cycleId` (research.md R7)

**Checkpoint**: US1 → US2 navigation works end-to-end; cycle scoping is correct, single-cycle ministries skip the zero-value picker screen, and both paths are independently testable.

---

## Phase 5: User Story 3 - Tailoring workspace: calendar, filters, slots, shifts, headcount (Priority: P1)

**Goal**: The core tailoring screen — bounded calendar with day markers and day-click filtering, name/time-of-day filters, per-slot inclusion, shift split (equal/manual), and per-shift headcount, all persisting via existing mutations.

**Independent Test**: Open a cycle with a known multi-day event; use the calendar to filter to one day, check a slot, split it into equal shifts, set headcounts, and confirm persistence — all without leaving the workspace.

### Tests for User Story 3

- [ ] T018 [P] [US3] Component test: calendar renders the cycle's start/end as a fixed, non-interactive range band (not user-editable — no drag/click can change it), with event-day dots layered on top, in `apps/web/src/features/scheduling/components/tailoring/tailoring-calendar.test.tsx`
- [ ] T019 [P] [US3] Component test: clicking a marked day applies a ring/outline day-filter state (visually distinct from both the fixed range band and the solid "committed date" fill used by `DatePickerField` elsewhere, per research.md R3); clicking again/clearing removes the filter without affecting the fixed band, same test file as T018
- [ ] T020 [P] [US3] Component test: name filter and time-of-day filter narrow the visible slot list with zero network requests, in `apps/web/src/features/scheduling/components/tailoring/tailoring-filters.test.tsx`
- [ ] T021 [P] [US3] Component test: unchecking a slot hides its shift/headcount controls and discards in-progress edits for that slot (per spec Edge Cases), in `apps/web/src/features/scheduling/components/tailoring/tailoring-slot-list.test.tsx`
- [ ] T021a [P] [US3] Component test: a newly-checked (included) slot defaults to exactly one unsplit shift spanning the slot's full duration (FR-013), and a headcount value entered on a shift persists through the existing upsert mutation and survives a re-render (FR-016) — added post-analyze C3, same test file as T021
- [ ] T022 [P] [US3] Component test: switching a slot from split back to single-shift replaces prior split configuration with the single-shift default (per spec Edge Cases), same test file as T021
- [ ] T023 [P] [US3] Reuse/extend existing manual-span validation tests (bounds, overlap incl. identical start/end, start<end) against `manual-split-editor.tsx` in its new location, plus new tests confirming the rewritten DOM (shadcn `Select`, touch-sized inputs) still drives the same validation outcomes, in `apps/web/src/features/scheduling/components/tailoring/manual-split-editor.test.tsx`
- [ ] T023a [P] [US3] Component test at a standard mobile viewport width: the composed tailoring workspace (calendar + filters + slot list + headcount inputs) renders and remains fully operable — no layout breakage, all controls reachable and touch-sized — per spec SC-006 (added post-analyze C2, this was untested for US3 despite T010/T011 covering it for US1), in `apps/web/src/routes/scheduling/tailoring/$ministryId/$cycleId.test.tsx`
- [ ] T023b [P] [US3] Component test: the headcount input rejects 0, negative numbers, and non-integer values before the value reaches the upsert mutation — no invalid headcount is ever sent (test-master Class 3 — added post-test-audit; FR-016 says "required headcount value" but nothing previously tested the lower/type bound), in `apps/web/src/features/scheduling/components/tailoring/tailoring-slot-list.test.tsx`
- [ ] T023c [P] [US3] Route test: a leader who does not lead/sub-lead the route's `ministryId`, or a `cycleId` not open for that ministry, gets a permission-denied state on the workspace's data fetch (403), not a crash (test-master Class 4 — added post-test-audit), in `apps/web/src/routes/scheduling/tailoring/$ministryId/$cycleId.test.tsx`
- [ ] T023d [P] [US3] Route test: the workspace's events/slots/participations fetch failing with a network error or 500 renders a retryable error state, not a crash or infinite spinner (test-master Class 5 — added post-test-audit), same test file as T023c

### Implementation for User Story 3

- [ ] T024 [US3] Implement `apps/web/src/features/scheduling/components/tailoring/tailoring-calendar.tsx` on the shadcn range-picker variant of `apps/web/src/components/ui/calendar.tsx` (react-day-picker) with: (1) a fixed, non-interactive in-range band spanning the cycle's `startDate`→`endDate` and navigation bounded to that range, (2) event-day dot markers from `buildEventDayMarkers` (T007), (3) a separate ring/outline-styled `selectedDate` filter state — never the solid-fill selected style — emitting its change via a named-object-param props type, per research.md R3
- [ ] T025 [US3] Implement `apps/web/src/features/scheduling/components/tailoring/tailoring-filters.tsx` (name search input + time-of-day range control) driving `filterSlotsByName`/`filterSlotsByTimeOfDay` (T008)
- [ ] T026 [US3] Implement `apps/web/src/features/scheduling/components/tailoring/tailoring-slot-list.tsx` — a flat, day-grouped row list (day header row + inset event/slot rows, matching `cycle-list-card.tsx`'s flat ring-bordered pattern, no card-in-card) that fully supersedes `ParticipationEventCard`'s old rendering role (research.md R2, post-critique P0 fix), with each slot's inclusion checkbox wired to the existing `setParticipationInclusions` mutation
- [ ] T027 [US3] Wire shift-split toggle (single default / equal-N / manual via `ManualSplitEditor` from T001) and per-shift headcount input (shadcn `Input`, `touch`-sized on mobile via `FormControlSizeProvider`) into `tailoring-slot-list.tsx`, calling the existing `splitParticipationShifts` and headcount-upsert mutations unchanged
- [ ] T028 [US3] Implement `apps/web/src/routes/scheduling/tailoring/$ministryId/$cycleId.tsx` composing `TailoringCalendar` + `TailoringFilters` + `TailoringSlotList`, holding `selectedDate`/filter state, showing the ministry+cycle name in the header regardless of viewport (mobile has no breadcrumbs, per critique P2), and fetching the ministry+cycle's events/slots/participations via existing `adminApi` calls

**Checkpoint**: Full tailoring editing experience works and is independently testable, matching spec Acceptance Scenarios 1–6 under Story 3.

---

## Phase 6: User Story 4 - Batched availability-check fire (Priority: P2)

**Goal**: A single explicit save/publish action fires availability checks for every touched slot/shift/headcount change in the session as one notification event per volunteer, never per-slot or per-shift, and remains available after schedule release.

**Independent Test**: Modify 3 different slots/shifts across 2+ events in one visit, save once, and confirm (via network tab / test spy) exactly one `fireAvailability` call per touched participation and one resulting notification per affected volunteer — not one per slot/shift.

### Tests for User Story 4

- [ ] T029 [P] [US4] Integration test: N modified slots/shifts across M events in one session → M `fireAvailability` calls (one per touched participation), zero duplicate `AvailabilityCheck` creation, in `apps/web/src/features/scheduling/components/tailoring/tailoring-save.test.tsx`
- [ ] T030 [P] [US4] Integration/E2E test: workspace remains editable and re-fireable after the cycle's schedule has been released (per spec Acceptance Scenario 2 under Story 4), in `apps/web/e2e/tailoring-post-release-edit.spec.ts`
- [ ] T030a [P] [US4] Test: navigating away (route change or tab close) with unsaved inclusion/split/headcount edits triggers a blocking confirmation; navigating away with no unsaved edits does not (research.md R8, post-critique P1), in `apps/web/src/routes/scheduling/tailoring/$ministryId/$cycleId.test.tsx`
- [ ] T030b [P] [US4] Test: rapidly double-clicking "Save & request availability" results in exactly one batch of `fireAvailability` calls, not two — the action disables/debounces itself while its own batch is pending (test-master Class 6 — added post-test-audit; T029 tests batch call-count for a single click, not double-submit), in `apps/web/src/features/scheduling/components/tailoring/tailoring-save.test.tsx`
- [ ] T030c [P] [US4] Test: navigating away or unmounting the workspace while the batched `fireAvailability` calls are still in flight doesn't throw, doesn't duplicate calls if the leader returns and re-saves, and doesn't leave the save action stuck in a permanent pending state (test-master Class 7 — added post-test-audit; T030a only covers pre-save unsaved-edits, not an in-flight save), in `apps/web/src/routes/scheduling/tailoring/$ministryId/$cycleId.test.tsx`

### Implementation for User Story 4

- [ ] T031 [US4] Implement a session-scoped "touched participations" tracker in `apps/web/src/routes/scheduling/tailoring/$ministryId/$cycleId.tsx` (or a co-located hook) recording every `MinistryParticipation` id touched by an inclusion/split/headcount change during the visit; reuse the same dirty flag to drive T031a
- [ ] T031a [US4] Wire a navigation-blocking confirmation (TanStack Router `useBlocker` or equivalent) on `$ministryId/$cycleId.tsx` that fires whenever the dirty flag from T031 is true and the leader attempts to navigate away or close the tab, per research.md R8 (post-critique P1) — no local-draft persistence, confirmation only
- [ ] T032 [US4] Implement the single "Save & request availability" action that calls the existing `fireAvailability` mutation once per tracked participation id (sequential or `Promise.all`), surfacing one aggregate pending/success/error state to the leader, per research.md R4
- [ ] T033 [US4] Ensure the save action remains available and re-invocable when the cycle/participation state is already past `tailoring` (FR-017), reusing `resendAvailabilityReminder` where a participation has already had availability fired, without blocking further edits

**Checkpoint**: All four user stories are independently functional; MVP (US1–US3) plus the notification-batching guarantee and unsaved-changes guard (US4) are complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Repo-wide gates and the documented data-model note that has no consuming UI this feature.

- [ ] T034 Record the FR-019 "claimed elsewhere vs self-reported unavailable" derivation recommendation (research.md R6 / data-model.md §10) as a short note in `manual-planning/0001-volunteer-scheduling/flowcharts/ministry-tailoring-flow.md` or a new ADR stub, so the future assignment-screen feature starts from this decision instead of rediscovering it — no schema/migration change
- [ ] T035 Delete the now-empty/obsolete parts of `apps/web/src/features/scheduling/components/participation-tailoring.tsx` once every Setup, US1, US2, and US3 task above is complete and wired (not a literal ID range — includes lettered sub-tasks like T002a); keep only re-exports if any external import still references the old path, otherwise remove the file entirely
- [ ] T036 [P] Run `/impeccable polish` over `ministry-tailoring-list.tsx`, `ministry-cycle-list.tsx`, `tailoring-calendar.tsx`, `tailoring-filters.tsx`, `tailoring-slot-list.tsx` for visual/UX findings (compact day/slot distinction per spec's open design point) — required session step per user request
- [ ] T037 Execute `quickstart.md`'s manual verification path end-to-end on both desktop and mobile viewports
- [ ] T038 Run full repo quality gate (`pnpm guard` or repo-equivalent: Biome lint + typecheck + unit/component/E2E suites) and fix any failures before marking the feature done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 (T001 extraction and T002's removal must land before helpers are tested against real component shapes) — BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Foundational. No dependency on US2/US3/US4.
- **US2 (Phase 4)**: Depends on Foundational. Independently testable from US1, though the demoable flow chains US1 → US2.
- **US3 (Phase 5)**: Depends on Foundational; depends on T001 (`ManualSplitEditor` extraction) and T002 (`ParticipationEventCard` removal, since T026 replaces its role outright) from Phase 1. Independently testable given a direct URL to `$ministryId/$cycleId`.
- **US4 (Phase 6)**: Depends on US3 (needs the slot/shift/headcount editing surface to have something to batch-save). Not required for US1–US3 to be independently demoable.
- **Polish (Phase 7)**: Depends on all four stories being complete.

### Parallel Opportunities

- T002 can run in parallel with T001 (different files).
- T006, T007, T008 can run in parallel (same file but additive, non-overlapping named exports — sequence commits, not necessarily blocking).
- T009 depends on T006–T008.
- Within US1: T010/T011 (tests) in parallel; T012 before T013.
- Within US3: T018–T023, T021a, T023a (tests) can all run in parallel with each other, though T023a depends on T024–T028 existing to have something to render at a mobile viewport — treat it as the last test written even though it's listed here; T024–T027 depend on their respective Foundational helpers but can proceed in parallel across different files before T028 composes them.
- US1 and US2 implementation can proceed in parallel by different developers once Foundational is done; US3 can also start in parallel but US4 must wait on US3.

---

## Implementation Strategy

### MVP First

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1).
2. **STOP and VALIDATE**: ministry list alone is demoable per spec SC-001.
3. Add Phase 4 (US2) and Phase 5 (US3) — together these complete the full tailoring editing path (SC-002, SC-003, SC-005, SC-006).
4. Add Phase 6 (US4) to close the notification-batching guarantee (SC-004).
5. Phase 7 (Polish) — run `/impeccable polish` (user's explicit next step) and the full quality gate before calling the feature done.
