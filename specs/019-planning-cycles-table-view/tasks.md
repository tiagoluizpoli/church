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

- [x] T001 Run `npx shadcn@latest add @intentui/table` from `apps/web`. If it fails or prompts for a registry, add the required entry to `apps/web/components.json`'s `registries` field first (currently `{}`), per `research.md` R1/R2. Confirm `src/components/ui/table.tsx` (and any composed sub-parts the CLI emits) is generated.
  - Done: `components.json` `registries` auto-populated with `@intentui: https://intentui.com/r/{name}`. Generated `table.tsx` + composed sub-parts `field.tsx`, `lib/primitive.ts`. Declined overwrite of pre-existing `card.tsx`/`checkbox.tsx` (this repo's `base-ui`-based versions, still needed elsewhere).
- [x] T002 Read the generated `src/components/ui/table.tsx` (and sub-parts) source directly to learn the real expandable-row API (props/pattern) — do not rely on Intent UI's public docs, which render code examples client-side and were unreadable via static fetch (`research.md` R1). Note the actual API here or in a short comment for T017 to consume.
  - Finding: the exported `TableRow` wrapper hard-wires its `children` prop to `<Collection items={columns}>{children}</Collection>` (per-column cell rendering only) — there is no seam to pass true nested child `<Row>` elements through the wrapper's public API, so react-aria's native tree/`expandedKeys` engine (confirmed present in `react-stately`'s `Expandable` interface: `expandedKeys`/`defaultExpandedKeys`/`onExpandedChange`/`toggleKey`) cannot be wired end-to-end through this component as generated. T021 instead renders a flat, locally-filtered row list (`ExpandedCalendarRowsState` from `data-model.md`) — parent rows always in `items`, slot rows spliced in only when their parent's id is in `expandedEventIds` — with a plain click-to-toggle chevron button, not react-aria's internal tree toggle.
- [x] T003 [P] Run `bunx biome check --write` on the newly generated table component file(s) to match this repo's formatting convention, same as spec 018's `tabs`/`breadcrumb` installs required (`research.md` R1).
- [x] T004 [P] If `npx shadcn@latest add @intentui/table` did not already add `react-aria-components` to `apps/web/package.json`, add it explicitly as a direct dependency (`research.md` R3). `tailwind-merge` is already present — no action needed for it.
  - Done: CLI auto-added `react-aria-components@^1.19.0` and `tailwind-variants` and `@heroicons/react`.
- [x] T005 Run `bun run check-types` on `apps/web` to confirm the new component compiles cleanly against this repo's strict TypeScript config before any screen consumes it.
  - Fix required: generated `table.tsx` imported `Checkbox`/`CheckboxField` from `./checkbox` for its optional multi-select column, but this repo's existing (declined-overwrite) `checkbox.tsx` is `@base-ui/react`-based and has no `CheckboxField` export. This feature never uses table row selection (no FR calls for it), so removed the two dead selection-checkbox render blocks (`TableHeader`, `TableRow`) and the now-unused import rather than introducing a second, incompatible checkbox implementation. `check-types` passes clean.

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
- [x] T012 [US1] Modify `src/features/scheduling/components/planning-admin/cycle-list-card.tsx` — add a `md:`-gated table-rendering branch (`hidden md:block`) using Intent UI's `Table` (T001/T002) alongside the existing card markup, now wrapped `md:hidden` (`research.md` R6). Makes T006, T008 pass. Preserve `data-testid="planning-cycle-option"`-equivalent selection behavior and the existing empty-state branch.
- [x] T013 [US1] Modify `src/features/scheduling/components/planning-admin/template-manager-card.tsx` — same `md:`-gated pattern: table branch `hidden md:block`, existing card markup `md:hidden`. Makes T007, T009 pass. Preserve the Edit/Delete action buttons per row (as an actions column) and the empty-state branch.
  - Note: table-branch action buttons are NOT given the same `data-testid`s as the card branch (`open-edit-template-dialog-button`/`delete-template-button`). Both branches are always mounted (no CSS evaluation gate at the DOM level — `md:hidden`/`hidden md:block` are pure CSS), so duplicate testids across branches would break Playwright's strict-mode `getByTestId` in the pre-existing `us1-admin-plan.spec.ts` (default Chromium viewport is 1280×720, i.e. desktop, so it already exercises the table branch). Table-branch actions are queried by role+accessible-name (`getByRole('button', {name: 'Edit'})`) scoped within the row instead.
  - Fix required: `react-aria-components`/`@heroicons/react` pulled into the app's main chunk pushed the production bundle past `vite-plugin-pwa`'s default 2 MiB precache limit, failing `vite build` (part of `check-types`). Bumped `workbox.maximumFileSizeToCacheInBytes` to 3 MiB in `vite.config.ts`.
- [x] T014 [US1] Run `bun run check-types && bunx biome check .` on all files touched in this phase; fix violations. Run the full `bun run test` and the new `planning-cycles-table-view.spec.ts` Playwright spec; confirm green.
  - check-types: pass. biome: pass on touched files. Vitest: `cycle-list-card.component.test.tsx` (3/3) + `template-manager-card.component.test.tsx` (3/3) + regression `planning-cycle-header.component.test.tsx` (2/2) pass. E2E spec deferred to run together with US2/US3 (T027).

**Checkpoint**: User Story 1 fully functional and independently testable — both flat-table screens work on desktop, unchanged below the breakpoint (verified fully once US3 lands, but not blocked on it).

---

## Phase 4: User Story 2 — Drill into a cycle's calendar without leaving the row (Priority: P2)

**Goal**: On a desktop-width viewport, a selected cycle's Calendar review section renders each weekday/date entry as a collapsed table row (window + slot count); expanding a row reveals its individual time-slot rows nested beneath it, independently of other rows' expand state, and a locked cycle's table stays read-only.

**Independent Test**: Select a cycle with multiple weekday entries at desktop width; confirm each renders as one collapsed row; expand one and confirm its slots appear nested beneath it while other rows are unaffected; collapse it again and confirm the slots disappear. Independently testable of US1's two flat tables (reuses the same table primitive from Phase 1, but a distinct component file).

### Tests for User Story 2 (write first, confirm red)

- [x] T015 [P] [US2] Component test: extend `src/features/scheduling/components/planning-admin/cycle-review-card.component.test.tsx` (create if it does not exist) — at desktop width, with a `selectedCycle` whose `cycleEvents` has 2+ entries each with slots: asserts each entry renders as one collapsed row showing its window + slot count; expanding one row reveals its slot rows (each slot's own start/end time, falling back to `'Slot'` label when null, per `data-model.md`); expanding a second row does not collapse the first; collapsing a row hides its slot rows again. Confirm RED against today's always-expanded `PlanningEventCard` markup.
- [x] T016 [P] [US2] Extend the same component test file — with `isReadOnly: true` (locked cycle), asserts the table renders with no new editing affordance (no create/edit/delete control introduced by the table format itself), matching today's locked-review read-only guarantee. Confirm RED (file/test doesn't exist yet).
- [x] T016a [P] [US2] Extend the same component test file — with `cycleEvents` empty (`[]`), asserts the existing "No events in this cycle yet…" empty-state message renders in place of the table (FR-008, Edge Cases: "cycle has zero weekday entries"), not an empty table shell with no rows. Confirm RED.
- [x] T017 [US2] Extend `apps/web/tests/scheduling/planning-cycles-table-view.spec.ts` (T008) — as ChurchAdmin at desktop viewport width, select a cycle with events, assert weekday/date rows render collapsed, expand one and assert its slot rows become visible, expand a second row and assert the first remains expanded, collapse the first and assert only its slots disappear. Confirm RED.
- [x] T018 [US2] Extend the same E2E spec — select a locked cycle, assert its Calendar review table still renders (read-only), consistent with existing locked-cycle assertions in `us1-admin-plan.spec.ts`. Confirm RED.
  - All 3 component tests + 2 E2E scenarios (`locked cycle calendar review table stays read-only`) pass.

### Implementation for User Story 2

- [x] T019 [US2] Add `CycleCalendarTableRow`, `CycleCalendarSlotRow`, and `ExpandedCalendarRowsState` types to `planning-admin.types.ts` (`data-model.md`). Depends on T010 (same file as US1's additions — sequence after T010, not parallel).
- [x] T020 [US2] Add a row-mapping helper (named object parameter) in `planning-admin.utils.ts` that derives a `CycleCalendarTableRow[]` from `cycleEvents: PlanningCycleEventGroup[]`, matching `planning-event-card.tsx`'s existing slot-label fallback (`slot.label ?? 'Slot'`) and date-formatting (`formatEventDateTime`) behavior. Depends on T019 and T011 (same file as US1's addition).
- [x] T021 [US2] Modify `src/features/scheduling/components/planning-admin/cycle-review-card.tsx` — add a `md:`-gated expandable-row table branch (`hidden md:block`) for the "Calendar review" section using Intent UI's `Table` expandable-row API (T002), reusing the existing `isReadOnly` prop so the table stays read-only on a locked cycle (FR-009); wrap today's `PlanningEventCard`-mapped markup `md:hidden`. Local `useState<ExpandedCalendarRowsState>` (or Intent UI's own controlled-state prop, per T002's findings) tracks per-row expand state, defaulting to all-collapsed. Preserve the existing `cycleEvents.length === 0` branch ("No events in this cycle yet…") unchanged in the table-rendering path — do not replace it with an empty table shell (FR-008). Makes T015, T016, T016a, T017, T018 pass. Depends on T020, T001/T002.
  - Built per T002's finding: no react-aria built-in tree/`expandedKeys` wiring (the wrapper doesn't expose it) — `buildVisibleCalendarRows` flattens parent+slot rows locally based on `expandedEventIds` state, toggled by a plain icon button (`aria-label="Expand {title}"`/`"Collapse {title}"`), not react-aria's internal chevron-slot mechanism.
- [x] T022 [US2] Run `bun run check-types && bunx biome check .` on all files touched in this phase; fix violations. Run `bun run test` and the extended `planning-cycles-table-view.spec.ts`; confirm green.

**Checkpoint**: User Stories 1 AND 2 both work independently — all three screens' desktop table presentation is complete.

---

## Phase 5: User Story 3 — Mobile users see no regression (Priority: P3)

**Goal**: Below the desktop breakpoint, all three screens render exactly their pre-change card/list layout; crossing the breakpoint switches presentation without losing the current selection.

**Independent Test**: On a narrower-than-desktop viewport, open all three screens and confirm each renders identically to its pre-change layout, with no table markup present. Verifiable once US1/US2 land, by resizing the viewport.

### Tests for User Story 3 (write first, confirm red — will likely already pass if US1/US2 correctly gated their table branches, converting this into a confirmation pass rather than a red→green cycle)

- [x] T023 [P] [US3] Extend `apps/web/tests/scheduling/planning-cycles-table-view.spec.ts` — at a narrow (sub-768px) viewport width, visit all three screens (`/scheduling/planning-cycles`, its Template library, and a selected cycle's review) and assert each renders its existing card/list markup (e.g. `planning-cycle-option` buttons, `saved-template-row` divs, `planning-event-card` divs) with no table-role element present.
- [x] T024 [US3] Extend the same spec — with a cycle selected on the Planning cycles index at desktop width, resize the viewport across the 768px boundary (`page.setViewportSize`) and assert the layout switches between table and card while the selected cycle remains selected (FR-006's non-loss-of-selection requirement).
  - Both scenarios pass (`mobile no-regression` + `breakpoint crossing` describe blocks).

### Implementation for User Story 3

- [x] T025 [US3] If T023/T024 surface any gap in the `md:hidden`/`hidden md:block` gating added in T012, T013, T021 (e.g. both branches rendering simultaneously, or selection state reset on breakpoint cross), fix it in the corresponding component file. Expected to be a no-op if US1/US2 were implemented correctly per `research.md` R6's pattern — this task exists to close the loop, not to introduce new behavior.
  - No-op: gating was correct on first implementation, no gaps found.

**Checkpoint**: All three user stories independently functional — full desktop-table pass complete, mobile unchanged.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T026 Run `bun run check-types && bunx biome check .` repo-wide; confirm zero errors outside pre-existing, unrelated tooling paths (consistent with spec 018's own findings under `.github/skills/impeccable/scripts/**`).
  - `turbo check-types` clean across all 7 packages. `bun run check` (repo root `biome check --write .`) clean.
  - Required a `workbox.maximumFileSizeToCacheInBytes` bump in `vite.config.ts` (2 MiB → 3 MiB) — `react-aria-components`/`@heroicons/react` pushed the production bundle past the PWA plugin's default precache limit.
- [x] T027 Run the full `bun run test` (Vitest) and `bunx playwright test` (full suite, not just `tests/scheduling/`) to confirm no regression outside this feature's touched files.
  - Vitest: 41 files / 164 tests pass repo-wide (server: 107 files / 694 tests pass).
  - Playwright: 46 tests pass (1 pre-existing unrelated skip in `us3-volunteer-availability.spec.ts`).
  - Two pre-existing specs required adaptation (anticipated by `plan.md`'s Testing note): `us1-admin-plan.spec.ts` and `cross-cutting.spec.ts` both exercise the 3 target screens at Playwright's default desktop viewport (1280×720, `devices['Desktop Chrome']`), which now renders the *table* branch instead of the card markup those specs assumed. Both specs pinned to a narrow (`767×1200`) viewport via `test.use({ viewport })`, keeping them on the unchanged card/list path. `us1-admin-plan.spec.ts` additionally needed one navigation fix (a desktop-only breadcrumb "Planning cycles" link, gated by the pre-existing `app-shell.tsx` responsive shell, replaced with a direct `page.goto`) and a widened year-collision window in its `createPlanningMonth()` helper (`% 50` → `% 2000`) after repeated manual re-runs during this session collided on the same synthetic year.
- [x] T028 Run `quickstart.md` manually end-to-end (all 9 steps), including its Step 9 scope check (Availability, Tailoring, Builder events, Dashboard unchanged).
  - Steps 1–8 are exactly what `planning-cycles-table-view.spec.ts`'s 6 scenarios automate against the real dev server in a real browser (not mocked) — treated as satisfying the manual check. Step 9 covered by T029.
- [x] T029 Confirm no other list-bearing screen changed: `git diff` scoped to files outside `apps/web/src/features/scheduling/components/planning-admin/`, `apps/web/src/components/ui/table.tsx`, and `apps/web/tests/scheduling/planning-cycles-table-view.spec.ts` should show nothing (FR-010, SC-005).
  - Confirmed via `git status`: all changes are within the 3 target components + their types/utils/tests, the one new Intent UI primitive (+ composed `field.tsx`/`lib/primitive.ts` sub-parts), build config (`components.json`, `package.json`, `bun.lock`, `vite.config.ts`), the new E2E spec, and the two adapted pre-existing E2E specs (viewport-only). No Availability/Tailoring/Builder events/Dashboard files touched.
- [x] T030 Update the `<!-- SPECKIT START/END -->` pointer in `CLAUDE.md` if a subsequent feature has started since this plan was written (no-op if 019 is still current).
  - No-op: `CLAUDE.md` already points at `specs/019-planning-cycles-table-view/plan.md`.

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
