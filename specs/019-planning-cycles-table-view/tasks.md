---

description: "Task list for Planning Cycles Table View (Desktop, Expandable Rows) (019)"

---

# Tasks: Planning Cycles Table View (Desktop, Expandable Rows)

**Input**: Design documents from `/specs/019-planning-cycles-table-view/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`)

**Tests**: Included. This repo's established convention (spec 018) is TDD for touched surfaces, and `plan.md`'s Technical Context commits to Vitest component tests + Playwright E2E for this feature — tests are written first per task, confirmed red, then made green by the paired implementation task.

**Organization**: Tasks are grouped by user story (US1–US3, priority order from `spec.md`). All paths are relative to `apps/web/` unless stated otherwise.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3, per `spec.md`

---

## Phase 1: Setup

**Purpose**: Get the one new dependency (Intent UI's table primitive) installed and confirmed working before any screen is touched.

- [ ] T001 Run `npx shadcn@latest add @intentui/table` from `apps/web`. If it fails or prompts for a registry, add the required entry to `apps/web/components.json`'s `registries` field first (currently `{}`), per `research.md` R1/R2. Confirm `src/components/ui/table.tsx` (and any composed sub-parts the CLI emits) is generated.
- [ ] T002 Read the generated `src/components/ui/table.tsx` (and sub-parts) source directly to learn the real expandable-row API (props/pattern) — do not rely on Intent UI's public docs, which render code examples client-side and were unreadable via static fetch (`research.md` R1). Note the actual API here or in a short comment for T017 to consume.
- [ ] T003 [P] Run `bunx biome check --write` on the newly generated table component file(s) to match this repo's formatting convention, same as spec 018's `tabs`/`breadcrumb` installs required (`research.md` R1).
- [ ] T004 [P] If `npx shadcn@latest add @intentui/table` did not already add `react-aria-components` to `apps/web/package.json`, add it explicitly as a direct dependency (`research.md` R3). `tailwind-merge` is already present — no action needed for it.
- [ ] T005 Run `bun run check-types` on `apps/web` to confirm the new component compiles cleanly against this repo's strict TypeScript config before any screen consumes it.

**Checkpoint**: Intent UI's table is installed, formatted, type-checks, and its real expandable-row API is known.

---

## Phase 2: Foundational

**Purpose**: None of the three user stories share a blocking prerequisite beyond Phase 1 (the table primitive itself) — each modifies a distinct component file (`cycle-list-card.tsx` / `template-manager-card.tsx` / `cycle-review-card.tsx`). US1's two screens and US2's one screen do share `planning-admin.types.ts` and `planning-admin.utils.ts` as files, so within-file edits are sequenced (not `[P]`) where they land in the same file, but this does not block stories from starting.

**Checkpoint**: No shared setup beyond Phase 1 — proceed directly to Phase 3 (US1).

---

## Phase 3: User Story 1 — Scan cycles and templates at a glance on desktop (Priority: P1) 🎯 MVP

**Goal**: On a desktop-width viewport, the Planning cycles index and Template library render as flat tables (name/window/status and name/weekday/block-count columns respectively) instead of stacked cards, with existing row actions and empty states preserved.

**Independent Test**: On a desktop-width viewport, open the Planning cycles index and confirm cycles render as table rows with visible columns; open the Template library and confirm the same for templates. Fully verifiable without US2's nested table.

### Tests for User Story 1 (write first, confirm red)

- [ ] T006 [P] [US1] Component test: extend `src/features/scheduling/components/planning-admin/cycle-list-card.component.test.tsx` (create if it does not exist) — at a simulated desktop width, asserts cycles render as table rows with name/window/status columns visible, row click still calls `handleSelectCycle`/`onSelectCycle`, and the existing empty-state message renders when `cycles` is empty. Confirm RED against today's card-only markup.
- [ ] T007 [P] [US1] Component test: extend `src/features/scheduling/components/planning-admin/template-manager-card.component.test.tsx` (create if it does not exist) — at a simulated desktop width, asserts templates render as table rows with name/weekday/block-count columns, Edit/Delete buttons remain reachable per row (`open-edit-template-dialog-button`/`delete-template-button` testids preserved), and the empty-state message renders when `templates` is empty. Confirm RED.
- [ ] T008 [US1] New E2E: `apps/web/tests/scheduling/planning-cycles-table-view.spec.ts` — as ChurchAdmin at desktop viewport width, visit `/scheduling/planning-cycles`, assert cycle rows render inside a `role="table"` (or Intent UI's equivalent semantic role) with visible column headers, and that clicking a row still selects it (existing `planning-cycle-option` selection behavior preserved). Confirm RED.
- [ ] T009 [P] [US1] Extend the same new spec — from the cycles index, open "Template library" at desktop viewport width, assert templates render as table rows with visible columns, and that Edit/Delete still work end-to-end. Confirm RED.

### Implementation for User Story 1

- [ ] T010 [US1] Add `PlanningCyclesTableRow` and `TemplateLibraryTableRow` types to `src/features/scheduling/components/planning-admin/planning-admin.types.ts` (`data-model.md`).
- [ ] T011 [US1] Add row-mapping helpers (single named object parameter, per Constitution VII — matching the existing `formatCycleDate({ date })`/`describeTemplate({ template })` convention) to `src/features/scheduling/components/planning-admin/planning-admin.utils.ts` for `PlanningCyclesTableRow` and `TemplateLibraryTableRow`. Depends on T010.
- [ ] T012 [US1] Modify `src/features/scheduling/components/planning-admin/cycle-list-card.tsx` — add a `md:`-gated table-rendering branch (`hidden md:block`) using Intent UI's `Table` (T001/T002) alongside the existing card markup, now wrapped `md:hidden` (`research.md` R6). Makes T006, T008 pass. Preserve `data-testid="planning-cycle-option"`-equivalent selection behavior and the existing empty-state branch.
- [ ] T013 [US1] Modify `src/features/scheduling/components/planning-admin/template-manager-card.tsx` — same `md:`-gated pattern: table branch `hidden md:block`, existing card markup `md:hidden`. Makes T007, T009 pass. Preserve the Edit/Delete action buttons per row (as an actions column) and the empty-state branch.
- [ ] T014 [US1] Run `bun run check-types && bunx biome check .` on all files touched in this phase; fix violations. Run the full `bun run test` and the new `planning-cycles-table-view.spec.ts` Playwright spec; confirm green.

**Checkpoint**: User Story 1 fully functional and independently testable — both flat-table screens work on desktop, unchanged below the breakpoint (verified fully once US3 lands, but not blocked on it).

---

## Phase 4: User Story 2 — Drill into a cycle's calendar without leaving the row (Priority: P2)

**Goal**: On a desktop-width viewport, a selected cycle's Calendar review section renders each weekday/date entry as a collapsed table row (window + slot count); expanding a row reveals its individual time-slot rows nested beneath it, independently of other rows' expand state, and a locked cycle's table stays read-only.

**Independent Test**: Select a cycle with multiple weekday entries at desktop width; confirm each renders as one collapsed row; expand one and confirm its slots appear nested beneath it while other rows are unaffected; collapse it again and confirm the slots disappear. Independently testable of US1's two flat tables (reuses the same table primitive from Phase 1, but a distinct component file).

### Tests for User Story 2 (write first, confirm red)

- [ ] T015 [P] [US2] Component test: extend `src/features/scheduling/components/planning-admin/cycle-review-card.component.test.tsx` (create if it does not exist) — at desktop width, with a `selectedCycle` whose `cycleEvents` has 2+ entries each with slots: asserts each entry renders as one collapsed row showing its window + slot count; expanding one row reveals its slot rows (each slot's own start/end time, falling back to `'Slot'` label when null, per `data-model.md`); expanding a second row does not collapse the first; collapsing a row hides its slot rows again. Confirm RED against today's always-expanded `PlanningEventCard` markup.
- [ ] T016 [P] [US2] Extend the same component test file — with `isReadOnly: true` (locked cycle), asserts the table renders with no new editing affordance (no create/edit/delete control introduced by the table format itself), matching today's locked-review read-only guarantee. Confirm RED (file/test doesn't exist yet).
- [ ] T016a [P] [US2] Extend the same component test file — with `cycleEvents` empty (`[]`), asserts the existing "No events in this cycle yet…" empty-state message renders in place of the table (FR-008, Edge Cases: "cycle has zero weekday entries"), not an empty table shell with no rows. Confirm RED.
- [ ] T017 [US2] Extend `apps/web/tests/scheduling/planning-cycles-table-view.spec.ts` (T008) — as ChurchAdmin at desktop viewport width, select a cycle with events, assert weekday/date rows render collapsed, expand one and assert its slot rows become visible, expand a second row and assert the first remains expanded, collapse the first and assert only its slots disappear. Confirm RED.
- [ ] T018 [US2] Extend the same E2E spec — select a locked cycle, assert its Calendar review table still renders (read-only), consistent with existing locked-cycle assertions in `us1-admin-plan.spec.ts`. Confirm RED.

### Implementation for User Story 2

- [ ] T019 [US2] Add `CycleCalendarTableRow`, `CycleCalendarSlotRow`, and `ExpandedCalendarRowsState` types to `planning-admin.types.ts` (`data-model.md`). Depends on T010 (same file as US1's additions — sequence after T010, not parallel).
- [ ] T020 [US2] Add a row-mapping helper (named object parameter) in `planning-admin.utils.ts` that derives a `CycleCalendarTableRow[]` from `cycleEvents: PlanningCycleEventGroup[]`, matching `planning-event-card.tsx`'s existing slot-label fallback (`slot.label ?? 'Slot'`) and date-formatting (`formatEventDateTime`) behavior. Depends on T019 and T011 (same file as US1's addition).
- [ ] T021 [US2] Modify `src/features/scheduling/components/planning-admin/cycle-review-card.tsx` — add a `md:`-gated expandable-row table branch (`hidden md:block`) for the "Calendar review" section using Intent UI's `Table` expandable-row API (T002), reusing the existing `isReadOnly` prop so the table stays read-only on a locked cycle (FR-009); wrap today's `PlanningEventCard`-mapped markup `md:hidden`. Local `useState<ExpandedCalendarRowsState>` (or Intent UI's own controlled-state prop, per T002's findings) tracks per-row expand state, defaulting to all-collapsed. Preserve the existing `cycleEvents.length === 0` branch ("No events in this cycle yet…") unchanged in the table-rendering path — do not replace it with an empty table shell (FR-008). Makes T015, T016, T016a, T017, T018 pass. Depends on T020, T001/T002.
- [ ] T022 [US2] Run `bun run check-types && bunx biome check .` on all files touched in this phase; fix violations. Run `bun run test` and the extended `planning-cycles-table-view.spec.ts`; confirm green.

**Checkpoint**: User Stories 1 AND 2 both work independently — all three screens' desktop table presentation is complete.

---

## Phase 5: User Story 3 — Mobile users see no regression (Priority: P3)

**Goal**: Below the desktop breakpoint, all three screens render exactly their pre-change card/list layout; crossing the breakpoint switches presentation without losing the current selection.

**Independent Test**: On a narrower-than-desktop viewport, open all three screens and confirm each renders identically to its pre-change layout, with no table markup present. Verifiable once US1/US2 land, by resizing the viewport.

### Tests for User Story 3 (write first, confirm red — will likely already pass if US1/US2 correctly gated their table branches, converting this into a confirmation pass rather than a red→green cycle)

- [ ] T023 [P] [US3] Extend `apps/web/tests/scheduling/planning-cycles-table-view.spec.ts` — at a narrow (sub-768px) viewport width, visit all three screens (`/scheduling/planning-cycles`, its Template library, and a selected cycle's review) and assert each renders its existing card/list markup (e.g. `planning-cycle-option` buttons, `saved-template-row` divs, `planning-event-card` divs) with no table-role element present.
- [ ] T024 [US3] Extend the same spec — with a cycle selected on the Planning cycles index at desktop width, resize the viewport across the 768px boundary (`page.setViewportSize`) and assert the layout switches between table and card while the selected cycle remains selected (FR-006's non-loss-of-selection requirement).

### Implementation for User Story 3

- [ ] T025 [US3] If T023/T024 surface any gap in the `md:hidden`/`hidden md:block` gating added in T012, T013, T021 (e.g. both branches rendering simultaneously, or selection state reset on breakpoint cross), fix it in the corresponding component file. Expected to be a no-op if US1/US2 were implemented correctly per `research.md` R6's pattern — this task exists to close the loop, not to introduce new behavior.

**Checkpoint**: All three user stories independently functional — full desktop-table pass complete, mobile unchanged.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T026 Run `bun run check-types && bunx biome check .` repo-wide; confirm zero errors outside pre-existing, unrelated tooling paths (consistent with spec 018's own findings under `.github/skills/impeccable/scripts/**`).
- [ ] T027 Run the full `bun run test` (Vitest) and `bunx playwright test` (full suite, not just `tests/scheduling/`) to confirm no regression outside this feature's touched files.
- [ ] T028 Run `quickstart.md` manually end-to-end (all 9 steps), including its Step 9 scope check (Availability, Tailoring, Builder events, Dashboard unchanged).
- [ ] T029 Confirm no other list-bearing screen changed: `git diff` scoped to files outside `apps/web/src/features/scheduling/components/planning-admin/`, `apps/web/src/components/ui/table.tsx`, and `apps/web/tests/scheduling/planning-cycles-table-view.spec.ts` should show nothing (FR-010, SC-005).
- [ ] T030 Update the `<!-- SPECKIT START/END -->` pointer in `CLAUDE.md` if a subsequent feature has started since this plan was written (no-op if 019 is still current).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — must complete before any user story (the table primitive is a hard prerequisite for all three).
- **Foundational (Phase 2)**: Empty by design — proceed directly to US1 once Phase 1 completes.
- **US1 (Phase 3)**: Depends on Phase 1 only. Ships first (P1/MVP).
- **US2 (Phase 4)**: Depends on Phase 1 only; not blocked on US1, but T019/T020 share `planning-admin.types.ts`/`planning-admin.utils.ts` with T010/T011, so sequence those file edits rather than running them concurrently.
- **US3 (Phase 5)**: Depends on US1 (Phase 3) and US2 (Phase 4) being implemented, since it verifies their breakpoint-gating rather than adding new rendering paths of its own.

### Parallel Opportunities

- T003 and T004 (Phase 1) can run in parallel.
- T006 and T007 (US1 tests, different files) can run in parallel; T008/T009 are sequential (same new spec file).
- T012 and T013 (US1 implementation, different component files) can run in parallel once T010/T011 land.
- T015 and T016 (US2 tests, same file — NOT parallel; listed with `[P]` relative to US1's tests in a different file, but sequence within US2 itself).
- US1 (Phase 3) and US2 (Phase 4) can be worked in parallel by different people once Phase 1 completes, coordinating only around the shared `planning-admin.types.ts`/`planning-admin.utils.ts` edits (T010/T011 vs. T019/T020).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Intent UI table installed and understood).
2. Complete Phase 3 (US1 — both flat tables).
3. **STOP and VALIDATE**: desktop-width tables work on the two flat-list screens; mobile is presumably still fine since US1's branches are already `md:`-gated.
4. Ship if the expandable-row screen (US2) isn't ready yet — US1 alone is a complete, valuable increment.

### Incremental Delivery

1. Phase 1 → Phase 3 (US1) → validate → ship.
2. Phase 4 (US2) → validate → ship.
3. Phase 5 (US3) → confirms no regression across both prior phases → ship final polish (Phase 6).
