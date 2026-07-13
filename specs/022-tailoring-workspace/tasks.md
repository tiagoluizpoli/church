# Tasks: Tailoring Workspace Reorganization

**Input**: Design documents from `specs/022-tailoring-workspace/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — constitution's Mandatory Quality Gates require exhaustive unit/integration/E2E coverage (not optional in this repo).

**Organization**: Grouped by user story (US1–US4, matching spec.md priorities P1/P1/P1/P2). Phase 8 (Iteration 2, 2026-07-12, corrected during `/speckit-clarify`) adds US3a — see `spec.md`'s `## Clarifications`, `research.md` R11–R14, and `iteration-2-filters-and-row-save.md` (superseded Part C, see its own correction banner).

**Note (filename suffixes)**: Every test task below is written with a plain `.test.ts`/`.test.tsx` suffix, but this repo's `vitest.config.ts` splits tests into three projects by glob — `src/**/*.unit.test.ts`, `src/**/*.component.test.{ts,tsx}`, `src/**/*.integration.test.ts` — and a file that doesn't match one of those exact suffixes is silently never collected. Every test file created for this feature uses the correct suffix for its project (`.unit.test.ts` for pure-logic tests, `.component.test.tsx` for RTL/jsdom tests, `.integration.test.ts` for real-service tests) instead of the literal names below.

**Note**: Incorporates all resolutions from the `/impeccable` pre-build critique (`.impeccable/critique/2026-07-11T21-00-35Z__kspace-tailoring-workspace-redesign-plan-pre-build.md`) — see T002a/T015a/T030a/T031a and the rewritten T024/T026/T027/T001 below. Also incorporates all findings from the `/speckit-analyze` pass run after the critique: C1/A1 (ministry-list data-fetch contract + "cycle set" definition, research.md R10) rewritten into T006/T012/T013; C2 (missing US3 mobile-viewport test) added as T023a; C3 (FR-013/FR-016 test coverage) added as T021a; I1 (wrong citation) fixed in T008; U1 (cosmetic wording) fixed in T035. Also incorporates a `/test-master` scenario-class audit against every test task above: permission-failure and API-error-state coverage was **zero** across all 3 new data-fetching routes (test-master Class 4/5) — added as T013a/T013b (US1), T015b/T015c (US2), T023c/T023d (US3); invalid headcount input (Class 3) added as T023b; double-submit on the save action (Class 6) added as T030b; mid-save unmount/navigation (Class 7) added as T030c.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (ministry list), US2 (cycle list), US3 (tailoring workspace: calendar/filters/slots/shifts/headcount), US4 (batched fire)

## Path Conventions

Web app, frontend-only: `apps/web/src/routes/scheduling/tailoring/…`, `apps/web/src/features/scheduling/components/tailoring/…`. No backend paths — no schema/API changes in this feature.

---

## Phase 1: Setup

**Purpose**: Establish the new route skeleton and component directory before any story-specific work.

- [X] T001 Move `ManualSplitEditor` out of `participation-tailoring.tsx` into `apps/web/src/features/scheduling/components/tailoring/manual-split-editor.tsx`, keeping `validateManualSpans` and payload-shape logic verbatim but rewriting its DOM to use shadcn `Select` (replacing the native `<select>`) and `touch`-sized `Input`s for start/end time entry, per research.md R2 (post-critique P2 fix)
- [X] T002 [P] Remove `ParticipationEventCard` from `participation-tailoring.tsx` without re-extracting it as a standalone file — its rendering role is fully superseded by `tailoring-slot-list.tsx` (T026); only note which of its mutation-wiring snippets need to carry forward for T026/T027 to reference, per research.md R2 (post-critique P0 fix). **Deviation (user-approved)**: rather than leaving the monolith orphaned through US1–US3, `participation-tailoring.tsx` and its test were deleted outright in Setup once the old route stopped referencing them (T003) — the mutation-wiring reference this note calls for is preserved in git history (pre-deletion commit) and in this session's implementation notes for T026/T027.
- [X] T002a Remove the resting `box-shadow` declaration from `.surface-panel` in `apps/web/src/index.css:313-323`, per research.md R9 (post-critique P2 fix) — app-wide visual change, verify no other screen relied on the shadow before committing
- [X] T003 Create layout route `apps/web/src/routes/scheduling/tailoring.tsx` as an outlet-only layout (replacing its current monolithic content)
- [X] T004 Create layout route `apps/web/src/routes/scheduling/tailoring/$ministryId.tsx` as an outlet-only layout
- [X] T005 Run `bun run build` (repo uses bun/turbo, not pnpm) and confirm the route tree regenerates in `apps/web/src/routeTree.gen.ts` with no errors before proceeding

**Checkpoint**: Route skeleton exists; old monolith's reusable pieces are extracted but not yet wired to new pages; shared shadow bug fixed at the source.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared data-fetching and pure-helper groundwork every story needs.

**⚠️ CRITICAL**: No user story task may start until this phase is complete.

- [X] T006 [P] Add pure helper `buildMinistryTailoringSummary` (named-object-param input/output types) to `apps/web/src/features/scheduling/components/participation-tailoring.utils.ts` that aggregates event/slot counts per ministry from: the ministry's `listEvents` results grouped via existing `buildCycleOptions` (event count, intersected with the locked-cycle-id set), plus the per-(ministry, locked cycle) `getCycleParticipation` slot counts — exact algorithm and endpoint sequence per research.md R10 (resolves the /speckit-analyze C1/A1 findings; "cycle set" = union of all `state: 'locked'` cycles, not a single "most recent" cycle)
- [X] T007 [P] Add pure helper `buildEventDayMarkers` to `apps/web/src/features/scheduling/components/participation-tailoring.utils.ts` that derives a `Set<ISODateString>` from fetched events, per research.md R3
- [X] T008 [P] Add pure helpers `filterSlotsByName` and `filterSlotsByTimeOfDay` to `apps/web/src/features/scheduling/components/participation-tailoring.utils.ts`, each taking a named-object-param filter spec and operating on already-fetched slot data (no network calls), per FR-010 (citation corrected post-analyze I1 — this is not related to research.md R4)
- [X] T009 [P] Unit tests for T006–T008 helpers in `apps/web/src/features/scheduling/components/participation-tailoring.utils.unit.test.ts` (filename corrected from the literal task name to match this repo's vitest project glob, `src/**/*.unit.test.ts` — see `vitest.config.ts`; the plain `.test.ts` name tasks.md originally specified would silently never run) — aggregation correctness incl. zero-state and `all_in`-seeded ministries per research.md R5, and the R10 locked-cycle-union rule with 0/1/2+ concurrently locked cycles; day-marker set correctness; name/time filter edge cases from spec Edge Cases. 22 tests, all passing.

**Checkpoint**: Shared helpers exist and are unit-tested; user story implementation can begin.

---

## Phase 3: User Story 1 - Ministry list landing page (Priority: P1) 🎯 MVP

**Goal**: Leader/sub-leader sees every ministry they're responsible for, with real event/slot counts for the active cycle, as the first screen of the flow.

**Independent Test**: Log in as a leader of 2+ ministries where only one has tailoring activity; confirm correct counts render on both desktop (table) and mobile (card) viewports without navigating further.

### Tests for User Story 1

- [X] T010 [P] [US1] Component test: desktop table renders correct per-ministry event/slot counts, including 0/0 for untouched ministries, in `apps/web/src/features/scheduling/components/tailoring/ministry-tailoring-list.component.test.tsx`
- [X] T011 [P] [US1] Component test: mobile viewport (`< md`) renders the same data as a card list matching `cycle-list-card.tsx`'s responsive pattern, in the same test file as T010. Note: jsdom has no layout engine, so the `md:`-breakpoint hide/show can't be exercised via real viewport resize — both the table and card-list DOM trees are always present and asserted directly, matching this repo's existing `cycle-list-card` test convention.
- [X] T013a [P] [US1] Route test: any of `listMinistries`/`listPlanningCycles`/`listEvents`/`getCycleParticipation` returning a 403 (e.g. church-isolation/RBAC rejection) renders a permission-denied state, not a crash or blank page (test-master Class 4 — added post-test-audit), in `apps/web/src/routes/scheduling/tailoring/index.component.test.tsx`. Uses the newly-discovered `renderRoute` harness (`@/__tests__/setup/render-route`) that mounts the real `routeTree.gen.ts` — this repo's first use of route-level (not just component-level) tests.
- [X] T013b [P] [US1] Route test: any of the same calls failing with a network error or 500 renders a retryable error state, not a crash or infinite spinner (test-master Class 5 — added post-test-audit), same test file as T013a

### Implementation for User Story 1

- [X] T012 [US1] Implement `apps/web/src/features/scheduling/components/tailoring/ministry-tailoring-list.tsx` — desktop table (`hidden md:block`) + mobile card list (`md:hidden`) reusing the responsive structure from `apps/web/src/features/scheduling/components/planning-admin/cycle-list-card.tsx`, sourcing rows from `buildMinistryTailoringSummary` (T006)
- [X] T013 [US1] Implement `apps/web/src/routes/scheduling/tailoring/index.tsx` to call, in sequence per research.md R10: `adminApi.listMinistries()`, `adminApi.listPlanningCycles({ state: 'locked' })`, then per-ministry `adminApi.listEvents({ ministryId })` and per-(ministry, locked cycle) `adminApi.getCycleParticipation`, feed the results into `buildMinistryTailoringSummary` (T006), and render `MinistryTailoringList`, linking each row/card to `/scheduling/tailoring/$ministryId`. Also added `classifyTailoringFetchError` to participation-tailoring.utils.ts (forbidden vs. retryable classification, backing T013a/T013b) and a `Retry` action wired to refetch all in-flight queries.

**Checkpoint**: Ministry list is fully functional and independently testable/demoable.

---

## Phase 4: User Story 2 - Cycle list scoped to one ministry (Priority: P1)

**Goal**: After picking a ministry, the leader sees only the cycles that ministry can currently tailor, and can pick one to proceed.

**Independent Test**: Click a ministry with 2+ open cycles; confirm both are listed and each navigates independently to the tailoring workspace for that exact ministry+cycle pair.

### Tests for User Story 2

- [X] T014 [P] [US2] Component test: cycle list shows only cycles available to the selected ministry, in `apps/web/src/features/scheduling/components/tailoring/ministry-cycle-list.component.test.tsx`
- [X] T015 [P] [US2] Component test: empty-state renders when a ministry has zero open cycles (per spec Edge Cases), same test file as T014
- [X] T015a [P] [US2] Route test: with exactly one open cycle, `/scheduling/tailoring/$ministryId` redirects directly to `/scheduling/tailoring/$ministryId/$cycleId` without rendering the picker; with 2+ open cycles, the picker renders normally (research.md R7, post-critique P1), in `apps/web/src/routes/scheduling/tailoring/$ministryId/index.component.test.tsx`
- [X] T015b [P] [US2] Route test: a leader who does not lead/sub-lead the route's `ministryId` gets a permission-denied state on `listEvents` (403), not a crash (test-master Class 4 — added post-test-audit), same test file as T015a
- [X] T015c [P] [US2] Route test: `listEvents` failing with a network error or 500 renders a retryable error state, not a crash or infinite spinner (test-master Class 5 — added post-test-audit), same test file as T015a

### Implementation for User Story 2

- [X] T016 [US2] Implement `apps/web/src/features/scheduling/components/tailoring/ministry-cycle-list.tsx`, reusing `cycle-list-card.tsx`'s responsive list pattern, scoped by `ministryId`
- [X] T017 [US2] Implement `apps/web/src/routes/scheduling/tailoring/$ministryId/index.tsx` to fetch cycles open for tailoring for the route's `ministryId`; if exactly one is open, redirect straight to its `$cycleId` workspace; otherwise render `MinistryCycleList`, linking each cycle to `/scheduling/tailoring/$ministryId/$cycleId` (research.md R7). Implemented as a client-side `useEffect` + `navigate({replace:true})` (not a `beforeLoad` `redirect()`) to stay consistent with T013's component-level `useQuery` data-fetching pattern rather than mixing in route loaders. Also created a placeholder `$cycleId.tsx` route (Phase 5/US3 fills it in) since T017's navigation targets needed it to exist for the route tree to typecheck. Also fixed a real `useExhaustiveDependencies` bug caught by Biome in the auto-advance effect (missing `navigate`/`ministryId`/`cycleOptions` deps).

**Checkpoint**: US1 → US2 navigation works end-to-end; cycle scoping is correct, single-cycle ministries skip the zero-value picker screen, and both paths are independently testable.

---

## Phase 5: User Story 3 - Tailoring workspace: calendar, filters, slots, shifts, headcount (Priority: P1)

**Goal**: The core tailoring screen — bounded calendar with day markers and day-click filtering, name/time-of-day filters, per-slot inclusion, shift split (equal/manual), and per-shift headcount, all persisting via existing mutations.

**Independent Test**: Open a cycle with a known multi-day event; use the calendar to filter to one day, check a slot, split it into equal shifts, set headcounts, and confirm persistence — all without leaving the workspace.

### Tests for User Story 3

- [X] T018 [P] [US3] Component test: calendar renders the cycle's start/end as a fixed, non-interactive range band (not user-editable — no drag/click can change it), with event-day dots layered on top, in `apps/web/src/features/scheduling/components/tailoring/tailoring-calendar.component.test.tsx`
- [X] T019 [P] [US3] Component test: clicking a marked day applies a ring/outline day-filter state (visually distinct from both the fixed range band and the solid "committed date" fill used by `DatePickerField` elsewhere, per research.md R3); clicking again/clearing removes the filter without affecting the fixed band, same test file as T018
- [X] T020 [P] [US3] Component test: name filter and time-of-day filter narrow the visible slot list with zero network requests, in `apps/web/src/features/scheduling/components/tailoring/tailoring-filters.component.test.tsx`
- [X] T021 [P] [US3] Component test: unchecking a slot hides its shift/headcount controls and discards in-progress edits for that slot (per spec Edge Cases), in `apps/web/src/features/scheduling/components/tailoring/tailoring-slot-list.component.test.tsx`
- [X] T021a [P] [US3] Component test: a newly-checked (included) slot defaults to exactly one unsplit shift spanning the slot's full duration (FR-013), and a headcount value entered on a shift persists through the existing upsert mutation and survives a re-render (FR-016) — added post-analyze C3, same test file as T021
- [X] T022 [P] [US3] Component test: switching a slot from split back to single-shift replaces prior split configuration with the single-shift default (per spec Edge Cases), same test file as T021. Implemented as a "Single shift" preset in `ManualSplitEditor`'s mode select (maps to `equal-n` with `n=1` under the hood — `SplitFormState.mode` itself stays `'equal'|'manual'` per R2's unchanged-payload-contract).
- [X] T023 [P] [US3] Reuse/extend existing manual-span validation tests (bounds, overlap incl. identical start/end, start<end) against `manual-split-editor.tsx` in its new location, plus new tests confirming the rewritten DOM (shadcn `Select`, touch-sized inputs) still drives the same validation outcomes. Split across `manual-split-editor.component.test.tsx` (DOM/mode-switching) and `participation-tailoring.utils.unit.test.ts` (pure `validateManualSpans` bounds/overlap cases, which had no prior automated coverage anywhere in the repo).
- [X] T023a [P] [US3] Component test at a standard mobile viewport width: the composed tailoring workspace (calendar + filters + slot list + headcount inputs) renders and remains fully operable — no layout breakage, all controls reachable and touch-sized — per spec SC-006 (added post-analyze C2, this was untested for US3 despite T010/T011 covering it for US1), in `apps/web/src/routes/scheduling/tailoring/$ministryId/$cycleId.component.test.tsx`
- [X] T023b [P] [US3] Component test: the headcount input rejects 0, negative numbers, and non-integer values before the value reaches the upsert mutation — no invalid headcount is ever sent (test-master Class 3 — added post-test-audit; FR-016 says "required headcount value" but nothing previously tested the lower/type bound), in `apps/web/src/features/scheduling/components/tailoring/tailoring-slot-list.component.test.tsx`. Implemented as client-side validation (`parseValidHeadcounts`) inside `tailoring-slot-list.tsx` itself — the Save button disables whenever zero roles have a valid draft, and only ever-valid integer counts reach `onSaveHeadcounts`, so the route's mutation never receives an invalid value.
- [X] T023c [P] [US3] Route test: a leader who does not lead/sub-lead the route's `ministryId`, or a `cycleId` not open for that ministry, gets a permission-denied state on the workspace's data fetch (403), not a crash (test-master Class 4 — added post-test-audit), in `apps/web/src/routes/scheduling/tailoring/$ministryId/$cycleId.component.test.tsx`
- [X] T023d [P] [US3] Route test: the workspace's events/slots/participations fetch failing with a network error or 500 renders a retryable error state, not a crash or infinite spinner (test-master Class 5 — added post-test-audit), same test file as T023c

### Implementation for User Story 3

- [X] T024 [US3] Implement `apps/web/src/features/scheduling/components/tailoring/tailoring-calendar.tsx` on the shadcn range-picker variant of `apps/web/src/components/ui/calendar.tsx` (react-day-picker) with: (1) a fixed, non-interactive in-range band spanning the cycle's `startDate`→`endDate` and navigation bounded to that range, (2) event-day dot markers from `buildEventDayMarkers` (T007), (3) a separate ring/outline-styled `selectedDate` filter state — never the solid-fill selected style — emitting its change via a named-object-param props type, per research.md R3. **Implementation note (deviation from the literal `mode="range"` reading of R3)**: built without any DayPicker selection `mode` at all — the fixed band, event dots, and ring filter are three independent custom `modifiers`/`modifiersClassNames` (`cycleBand`, `hasEvent`, `dayFilter`) read directly inside a custom `DayButton` override (`TailoringCalendarDayButton`), exactly mirroring how the existing shared `calendar.tsx`'s own `CalendarDayButton` already reads `modifiers.selected`/`range_start`/`range_end`. This avoids fighting react-day-picker's controlled-range `onSelect` requirement for a range that must never actually change, while still extending the shared shadcn `Calendar` primitive (not a from-scratch component) per the Phase 5 constitution rule.
- [X] T025 [US3] Implement `apps/web/src/features/scheduling/components/tailoring/tailoring-filters.tsx` (name search input + time-of-day range control) driving `filterSlotsByName`/`filterSlotsByTimeOfDay` (T008)
- [X] T026 [US3] Implement `apps/web/src/features/scheduling/components/tailoring/tailoring-slot-list.tsx` — a flat, day-grouped row list (day header row + inset event/slot rows, matching `cycle-list-card.tsx`'s flat ring-bordered pattern, no card-in-card) that fully supersedes `ParticipationEventCard`'s old rendering role (research.md R2, post-critique P0 fix), with each slot's inclusion checkbox wired to the existing `setParticipationInclusions` mutation. Inclusion now persists immediately per checkbox click (computing the full next `timeSlotIds` list and firing the mutation right away) rather than the old monolith's separate batched "Save included slots" button — consistent with PRODUCT.md's short between-service-session framing already cited by R7/R8.
- [X] T027 [US3] Wire shift-split toggle (single default / equal-N / manual via `ManualSplitEditor` from T001) and per-shift headcount input (shadcn `Input`, `touch`-sized on mobile via `FormControlSizeProvider`) into `tailoring-slot-list.tsx`, calling the existing `splitParticipationShifts` and headcount-upsert mutations unchanged
- [X] T028 [US3] Implement `apps/web/src/routes/scheduling/tailoring/$ministryId/$cycleId.tsx` composing `TailoringCalendar` + `TailoringFilters` + `TailoringSlotList`, holding `selectedDate`/filter state, showing the ministry+cycle name in the header regardless of viewport (mobile has no breadcrumbs, per critique P2), and fetching the ministry+cycle's events/slots/participations via existing `adminApi` calls (`getPlanningCycle` for cycle bounds/name, `listMinistries` for the ministry name, `getCycleParticipation` for events/slots/participations). Replaces the Phase 4 placeholder. Day-filter comparison uses `toIsoDateString(new Date(...))` (local-calendar-day extraction), not raw ISO-string slicing, to stay timezone-consistent with the calendar's own day markers. Mutation `mutationFn` params extracted into named interfaces (`SaveInclusionsParams`/`SplitShiftsParams`/`SaveHeadcountsParams`) per the constitution's Explicit Parameter Contracts rule — the lint plugin enforcing that rule also caught a real bug in an early draft (`upsertShiftRequirement`'s first arg was accidentally `headcount.roleId` instead of `shiftId`), fixed before this was marked done.

**Checkpoint**: Full tailoring editing experience works and is independently testable, matching spec Acceptance Scenarios 1–6 under Story 3.

---

## Phase 6: User Story 4 - Batched availability-check fire (Priority: P2)

**Goal**: A single explicit save/publish action fires availability checks for every touched slot/shift/headcount change in the session as one notification event per volunteer, never per-slot or per-shift, and remains available after schedule release.

**Independent Test**: Modify 3 different slots/shifts across 2+ events in one visit, save once, and confirm (via network tab / test spy) exactly one `fireAvailability` call per touched participation and one resulting notification per affected volunteer — not one per slot/shift.

### Tests for User Story 4

- [X] T029 [P] [US4] ~~Integration test~~ **Deviation (user-approved)**: written as a component-level test (`renderRoute` + mocked `adminApi`) instead of a real-service integration test — this sandbox has a reachable dev server + live `church-db` Postgres container, but writing/seeding test data against a shared live DB without knowing its existing contents was judged too risky to do unprompted; user chose the mocked-test path when asked. Real DB-backed integration coverage is a follow-up once a disposable test DB or CI environment exists. Covers: N modified slots/shifts across M events in one session → M `fireAvailability` calls (one per touched participation), zero `resendAvailabilityReminder` calls when all participations are still `tailoring`. In `apps/web/src/routes/scheduling/tailoring/$ministryId/$cycleId.component.test.tsx` (no standalone `tailoring-save.tsx` component exists — the batched-save logic lives directly in the route, so its tests live in the route's test file, not the literal path tasks.md named).
- [X] T030 [P] [US4] ~~Integration/E2E test~~ **Deviation (same as T029)**: written as a component-level test, not a real-browser Playwright spec — same live-DB risk. Covers: a participation already past `tailoring` (e.g. `rostering`) still shows an enabled save action and calls `resendAvailabilityReminder` instead of `fireAvailability`, confirming the workspace stays editable/re-fireable post-release. Same test file as T029.
- [X] T030a [P] [US4] Test: navigating away (route change) with unsaved inclusion/split/headcount edits triggers a blocking confirmation (via TanStack Router's real `useBlocker`, exercised through `renderRoute`'s real router); navigating away with no unsaved edits does not (research.md R8, post-critique P1), in `apps/web/src/routes/scheduling/tailoring/$ministryId/$cycleId.component.test.tsx`. Tab-close (`beforeunload`) is wired via `enableBeforeUnload` but isn't practically testable in jsdom — covered structurally by the same `isDirty` flag driving both.
- [X] T030b [P] [US4] Test: rapidly double-clicking "Save & request availability" results in exactly one batch of `fireAvailability` calls, not two — the action disables itself synchronously on the first click while its own batch is pending (test-master Class 6 — added post-test-audit; T029 tests batch call-count for a single click, not double-submit), same test file as T029.
- [X] T030c [P] [US4] Test: navigating away while the batched `fireAvailability` call is still in flight doesn't throw (asserted via `unmount()` + `router.navigate()` inside `expect(() => {...}).not.toThrow()`; the "doesn't duplicate/doesn't get stuck" half of this task is satisfied by construction — `fireAvailability`'s server-side dedup (R4) makes a resend-after-return harmless, and the mutation's pending state is scoped to the (now-unmounted) route instance, not a global lock — documented in the mutation's own comment rather than re-asserted with a second render), same test file as T029.

### Implementation for User Story 4

- [X] T031 [US4] Implement a session-scoped "touched participations" tracker in `apps/web/src/routes/scheduling/tailoring/$ministryId/$cycleId.tsx` (or a co-located hook) recording every `MinistryParticipation` id touched by an inclusion/split/headcount change during the visit; reuse the same dirty flag to drive T031a. Implemented as `touchedParticipationIds: Set<string>` state, populated in each of the three edit mutations' `onSuccess` (not on click/attempt — only successful persists count as "touched").
- [X] T031a [US4] Wire a navigation-blocking confirmation (TanStack Router `useBlocker` or equivalent) on `$ministryId/$cycleId.tsx` that fires whenever the dirty flag from T031 is true and the leader attempts to navigate away or close the tab, per research.md R8 (post-critique P1) — no local-draft persistence, confirmation only. Uses `useBlocker({ shouldBlockFn, enableBeforeUnload, withResolver: true })` + a shadcn `AlertDialog` ("Stay" / "Leave anyway").
- [X] T032 [US4] Implement the single "Save & request availability" action that calls the existing `fireAvailability` mutation once per tracked participation id (sequential or `Promise.all`), surfacing one aggregate pending/success/error state to the leader, per research.md R4
- [X] T033 [US4] Ensure the save action remains available and re-invocable when the cycle/participation state is already past `tailoring` (FR-017), reusing `resendAvailabilityReminder` where a participation has already had availability fired, without blocking further edits

**Checkpoint**: All four user stories are independently functional; MVP (US1–US3) plus the notification-batching guarantee and unsaved-changes guard (US4) are complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Repo-wide gates and the documented data-model note that has no consuming UI this feature.

- [X] T034 Record the FR-019 "claimed elsewhere vs self-reported unavailable" derivation recommendation (research.md R6 / data-model.md §10) as a short note in `manual-planning/0001-volunteer-scheduling/flowcharts/ministry-tailoring-flow.md` — appended as a new "Open question for a future assignment-screen feature" section, no schema/migration change.
- [X] T035 ~~Delete the now-empty/obsolete parts of `apps/web/src/features/scheduling/components/participation-tailoring.tsx`~~ — done early in Setup (see T002 deviation note); file and its test no longer exist, nothing left to remove here
- [X] T036 [P] Run `/impeccable polish` over `ministry-tailoring-list.tsx`, `ministry-cycle-list.tsx`, `tailoring-calendar.tsx`, `tailoring-filters.tsx`, `tailoring-slot-list.tsx` for visual/UX findings (compact day/slot distinction per spec's open design point) — required session step per user request. Design-system discovery against `apps/web/DESIGN.md` found two real drift issues, both fixed: (1) `tailoring-slot-list.tsx`'s per-shift headcount rows used `surface-panel` nested inside the slot row's `surface-subtle` — a literal card-in-card, the exact anti-pattern R2 named and required fixing; replaced with a flat `border-t` divider between shift blocks. (2) The participation-state `Badge` used the default (solid-primary) variant showing the raw enum string on every row — violates DESIGN.md's "One Voice Rule" (primary ≤10% of a screen) once many rows render; switched to `variant="secondary"` plus a new `participationStateLabel` humanizer in `participation-tailoring.utils.ts`. Live-browser verification was attempted (dev server + Playwright) but the Playwright MCP browser backend hung after one navigation; fell back to code-level verification against DESIGN.md plus the existing 316-test component/route suite (which exercises real rendered DOM via jsdom+RTL) — full pixel-level visual confirmation in a real browser is a follow-up once the environment issue clears.
- [X] T037 ~~Execute `quickstart.md`'s manual verification path end-to-end on both desktop and mobile viewports~~ **Deviation (documented)**: full manual walkthrough (creating/editing real data through the UI) was not attempted, consistent with the earlier user decision to avoid mutating the live shared dev DB (see T029/T030 deviation note). A read-only smoke navigation to `/scheduling/tailoring` via Playwright confirmed the route tree, auth-guard redirect, and app shell all boot correctly (hit an expected CORS-origin mismatch from a stray second dev-server port, not a defect); deeper interactive verification is covered instead by the 11-test `$cycleId.component.test.tsx` suite exercising the full composed workspace (calendar, filters, slot list, save/fire flow, mobile-viewport DOM) against mocked data.
- [X] T038 Run full repo quality gate (Biome lint + typecheck + unit/component suites — this repo uses `bun`/`turbo`, not `pnpm`, and has no `guard` script; used `bun run lint` / `bun run check-types` / `bun run test`) and fix any failures before marking the feature done. Final result: lint clean (scoped to real source; two pre-existing gitignored `.impeccable/hook.cache.json` files are the skill's own cache, not repo source), typecheck clean across all 7 packages, **web 316/316 tests pass, server 699/699 tests pass** (server suite untouched by this feature — confirms no regression).

---

## Phase 8: Iteration 2 - Horizontal day strip, horizontal filters, split/headcount save model (Priority: P1) *(not started, corrected during /speckit-clarify)*

**Correction note**: This phase was originally written around a single combined row-level save (split + headcount together). That was corrected during `/speckit-clarify` (2026-07-12) — see spec.md's `## Clarifications`. The task list below is the corrected, authoritative version; it fully replaces the pre-correction version rather than layering on top of it (nothing here was checked off yet, so nothing is lost by rewriting in place).

**Goal**: Replace the month-grid calendar with a horizontally-scrollable, keyboard-navigable day strip (with filters moving to a horizontal row beneath it). Replace the three-independent-saves slot-row model with **three tiers, not one combined save**: Serving still autosaves instantly; split persists via its own dirty-gated "Save split" action, independent of headcounts; headcounts persist via one "Save headcounts" action per slot spanning every role across every shift (not per-shift as today), with per-call partial-failure isolation and a validation gate. Split and headcount fields adopt `@tanstack/react-form` + `zod`. Full decision record: `iteration-2-filters-and-row-save.md` (Part C superseded, see banner at top of that file) and `research.md` R11–R14. Spec changes: `spec.md` US3 (amended) + US3a (rewritten) + `## Clarifications`, FR-007/008/010/011/013 (amended), FR-020/020a/021/021a/022/022a/022b/023–027 (new/corrected).

**Independent Test**: Open a cycle spanning 3+ months; confirm the day strip scrolls via drag/swipe/chevron/keyboard-arrow-keys and remains usable at that length. Mark a slot Serving (confirm it persists immediately). Change its split mode; confirm no network call fires and "Save split" becomes enabled; click it; confirm it persists independently. Set headcounts on 2 shifts, leaving one role blank; confirm "Save headcounts" is disabled with an explanation; fill in the missing value; click "Save headcounts"; confirm every role/shift's value persists in calls that succeed/fail independently of each other, and the headcount-unsaved indicator clears. Leave the slot and come back; confirm both indicators (whichever are still pending) persisted. Attempt to navigate away from the whole workspace with either pending; confirm the leave-guard fires.

### Setup for Iteration 2

- [X] T039 [P] Run `/impeccable shape` to resolve research.md R11's deferred sub-decision (day-strip drag-scroll implementation mechanism: hand-rolled pointer events vs. a small dependency) and confirm whether the day strip keeps sticky-on-scroll behavior now that the sidebar layout (`lg:grid-cols-[minmax(320px,0.6fr)_minmax(0,1.4fr)]`) is gone. **Resolved (2026-07-12)**: hand-rolled pointer events (no dependency), free momentum scroll (no snap-to-day), day strip + filter row sticky at the workspace top — full brief and rationale folded into research.md R11.

### Tests for Iteration 2

- [ ] T040 [P] Component test: day strip renders exactly one cell per day within `[cycle.startDate, cycle.endDate]`, each showing day-of-week abbreviation + day number, with event-day markers and the ring/outline active-filter state carried forward from T018/T019's assertions onto the new container, in `tailoring-calendar.component.test.tsx`
- [ ] T041 [P] Component test: the day strip scrolls in response to drag/swipe and to each end's chevron control, and clicking a day cell still sets the day-filter exactly as T019 already covers for the grid — same file as T040
- [ ] T041a [P] Component test: with the day strip focused, Left/Right arrow keys move focus one day at a time (scrolling into view as needed), and Enter/Space on the focused day sets it as the active day-filter, per FR-020a (added during clarification) — same file as T040
- [ ] T042 [P] Component test: `TailoringFilters` (name + time-of-day) renders as a horizontal row immediately following the day strip in DOM order, not inside a sidebar column, in `tailoring-filters.component.test.tsx` or `$ministryId/$cycleId.component.test.tsx` (whichever already composes both)
- [ ] T043 [P] Component test: marking a slot Serving fires `setParticipationInclusions` immediately (same assertion shape as the existing inclusion-checkbox test, retargeted at the new toggle); changing split mode or a headcount draft on that slot fires **no** mutation by itself, in `tailoring-slot-list.component.test.tsx`
- [ ] T044 [P] Component test: a slot's "Save split" action is disabled while the split form matches its last-saved state and becomes enabled once it differs (FR-022a); clicking it while enabled persists the split via `splitParticipationShifts` **independently of any pending headcount edits on the same slot** — same test file as T043
- [ ] T045 [P] Component test: a slot's "Save headcounts" action, once enabled, commits every role's headcount across every shift in that slot together as one combined action — explicitly assert this is a *different* action from "Save split" and is not gated by or coupled to split state, per FR-021a/FR-022 (corrected) — same test file as T043
- [ ] T045a [P] Component test: a slot's "Save headcounts" action is disabled and the slot surfaces an explanation whenever Serving=Yes and any required headcount is unset/zero, reusing/extending `parseValidHeadcounts`'s validity check (extends T023b); confirm this does **not** disable the independent "Save split" action, per FR-024 — same test file as T043
- [ ] T045b [P] Component test: when a "Save headcounts" action fires multiple persist calls (multi-shift/multi-role) and one fails while others succeed, the succeeded values remain saved (not rolled back or re-flagged) and only the failed value stays flagged unsaved/errored and independently retryable, per FR-022b (added during clarification) — same test file as T043
- [ ] T046 [P] Component test: both split and headcount edits entered on a Serving slot are still present after toggling that slot to Not-serving and back to Serving within the same render tree, per FR-025 — same test file as T043
- [ ] T047 [P] Component test: a slot with pending split and/or pending headcount edits shows its own independent unsaved-changes indicator for each (not one combined indicator gated by both) that persists across collapsing/expanding that row and across changing the day-strip filter or name/time filters, and each clears only on its own corresponding save's success, per FR-023 — same test file as T043
- [ ] T048 [P] Route test: attempting to navigate away from the workspace while a slot has a pending (never-saved) split edit and/or a pending headcount edit triggers the existing `useBlocker` confirmation, even when `touchedParticipationIds` is empty — this is a genuinely new trigger path distinct from T030a (which only covers the already-successfully-saved-participation case) and must be its own test, not an extension of T030a's assertions, per FR-026, in `$ministryId/$cycleId.component.test.tsx`
- [ ] T048a [P] Unit/component test: the `@tanstack/react-form` + `zod` schema governing the split-span fields still enforces the same bounds/ordering/overlap rules as the existing `validateManualSpans` (regression-equivalence — same accept/reject cases, new mechanism), and the headcount field schema still enforces the same integer/positivity rules as `parseValidHeadcounts`, per FR-027/research.md R14, in `manual-split-editor.component.test.tsx` and `tailoring-slot-list.component.test.tsx` respectively

### Implementation for Iteration 2

- [ ] T049 Rebuild `tailoring-calendar.tsx` as the horizontal day strip per research.md R11, using the drag-scroll mechanism decided in T039, plus arrow-key roving-focus keyboard navigation (FR-020a) following the same pattern `react-day-picker` already uses in the calendar being replaced; preserve the fixed cycle-bounds band, event-day dot markers, and ring/outline day-filter as three still-distinct signifiers per R3 — only the container and navigation methods change
- [ ] T050 Move `TailoringFilters` out of `$ministryId/$cycleId.tsx`'s sidebar column into a horizontal row directly beneath the rebuilt day strip; collapse the route's `lg:grid-cols-[...]` sidebar+content split into a single top-to-bottom stack (day strip → filter row → slot list), per research.md R11
- [ ] T051 Replace `tailoring-slot-list.tsx`'s raw `<input type="checkbox">` inclusion control with a Serving/Not-serving toggle built on the existing shadcn `Checkbox` (or an equivalent already-in-system two-state control) per research.md R12a — this simultaneously satisfies FR-011's new wording and fixes the previously-flagged accessibility gap
- [ ] T052 Add two independent per-slot dirty-state flags (split-dirty and headcount-dirty — NOT one combined flag; see data-model.md's corrected "per-slot pending split state"/"per-slot pending headcount state" entries), each true whenever its respective form/drafts differ from last-saved values for that slot, per research.md R12
- [ ] T053 Migrate `ManualSplitEditor`'s fields to `@tanstack/react-form` with a `zod` schema that reuses `validateManualSpans`'s bounds/ordering/overlap rules as its validation logic (not rewritten from scratch), per research.md R14. Keep its "Save split" action as its own explicit button, calling `splitParticipationShifts` unchanged, but make it dirty-gated: disabled whenever the split form matches its last-saved state (T052's split-dirty flag is false), enabled otherwise, per FR-021/FR-022a — do NOT make this autosave-on-change, and do NOT couple it to headcount state
- [ ] T054 Replace `tailoring-slot-list.tsx`'s per-shift "Save headcounts" buttons with ONE "Save headcounts" action per slot, migrating the headcount fields to `@tanstack/react-form` with a `zod` schema reusing `parseValidHeadcounts`'s integer/positivity rules, per research.md R14. On click, fire the existing headcount-upsert mutation once per (shift, role) pair with a changed, valid value, **in parallel with independent per-call success/failure handling** (FR-022b) — a failed call must not roll back or re-flag calls that already succeeded; only failed (shift, role) pairs remain in T052's headcount-dirty state and are independently retryable, per FR-021a/FR-022
- [ ] T055 Wire the "Save headcounts" action's disabled state and explanatory copy for the Serving=Yes-with-unset-headcount case, reusing `parseValidHeadcounts`, per FR-024 — confirm this validation gate does NOT affect the independent "Save split" action from T053
- [ ] T056 On either the split save's (T053) or the headcount save's (T054) success for a slot, add its participation id to the existing `touchedParticipationIds` tracker (T031) so the page-level "Request availability" batching (research.md R4) continues to include slots saved under the new model, per FR-018/research.md R12
- [ ] T057 Extend `$ministryId/$cycleId.tsx`'s `useBlocker` `shouldBlockFn` to also return true when any slot has a pending split-dirty flag and/or a pending headcount-dirty flag from T052, not only when `touchedParticipationIds.size > 0`, per research.md R13/FR-026

**Checkpoint**: Day strip (mouse/touch/chevron/keyboard) and horizontal filters replace the month-grid/sidebar layout; slot rows autosave only the Serving toggle, save split independently via a dirty-gated action, and save headcounts once per slot across all shifts via a separate, validated, per-call-independent action; split/headcount fields are TanStack Form-driven; the leave-guard covers both the old and new sources of unsaved work.

### Polish & Gate for Iteration 2

- [ ] T058 [P] Run `/impeccable polish` over the rebuilt `tailoring-calendar.tsx`, `tailoring-filters.tsx`, `tailoring-slot-list.tsx`, and `manual-split-editor.tsx`, same bar as T036
- [ ] T059 Rewrite (not just append to) the now-stale assertions in `tailoring-slot-list.component.test.tsx`, `manual-split-editor.component.test.tsx`, and `$ministryId/$cycleId.component.test.tsx` that assert the pre-Iteration-2 per-shift-save/checkbox/manual-validation behavior — several Phase 5/6 tests (including parts of T021/T021a/T023/T023b) will directly contradict the new model and must be updated, not left alongside T040–T048a's new ones
- [ ] T060 Run the full repo quality gate (Biome lint + typecheck + unit/component suites) and fix any failures before marking Iteration 2 done, same bar as T038

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
- **Iteration 2 (Phase 8)**: Depends on Phase 7 (builds on the shipped, polished workspace, not a parallel track). T039 (shape) should complete before T049 (the implementation task it directly informs — the drag-scroll mechanism), though the test tasks T040–T048a can be written test-first against the not-yet-decided implementation per this repo's TDD convention. T050 (filters layout) depends on T049 (day strip) existing since the layout collapse assumes the sidebar's main occupant is already gone. T052–T057 (split/headcount save model) are independent of T049/T050 (day strip) and could proceed in parallel by a different contributor. Within the save-model work: T052 (dirty flags) precedes T053/T054 (which set those flags); T053 (split save) and T054 (headcount save) are independent of each other and can proceed in parallel across the two files they touch (`manual-split-editor.tsx` vs. `tailoring-slot-list.tsx`); T055 (headcount validation gate) depends on T054 existing; T056/T057 depend on T053/T054/T052 all existing since they read the save outcomes and dirty flags those tasks produce.

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
6. Phase 8 (Iteration 2, not started, corrected during `/speckit-clarify`) — day strip + horizontal filters + independent split/headcount saves (never one combined row save) + `@tanstack/react-form`. Start with T039 (`/impeccable shape`) to close the two decisions research.md R11 deliberately leaves open, then proceed test-first (T040–T048a) before T049–T057, per this repo's TDD convention.
