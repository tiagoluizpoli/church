---

description: "Task list for Mobile Parity & Table Bulk-Expand for Cycles (021)"

---

# Tasks: Mobile Parity & Table Bulk-Expand for Cycles

**Input**: Design documents from `/specs/021-mobile-parity-cycles/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`)

**Tests**: Included, per this repo's established convention (specs 018/019/020) and `agents.local.md`'s phase-by-phase verification loop — written first, confirmed red, then made green by the paired implementation task.

**Organization**: Tasks are grouped by user story (US1-US5, priority order from `spec.md`). All paths are relative to `apps/web/` unless stated otherwise. No backend files are touched by this feature.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 / US4 / US5, per `spec.md`

---

## Phase 1: Setup

**Purpose**: Confirm the reused seams this feature depends on are actually present as researched, before any story starts.

- [X] T001 [P] Query the shadcn registry (`mcp__shadcn__search_items_in_registries`/`view_items_in_registries`, or `bunx shadcn@latest view @shadcn`) to reconfirm `drawer` (registry:ui) and the `drawer-dialog` example are still present and unchanged from research.md R1's findings; note the exact `add` command (`bunx shadcn@latest add @shadcn/drawer`) for T008.
- [X] T002 [P] Confirm `apps/web/src/components/ui/dialog.tsx`'s `Dialog`/`DialogContent` prop shape used by `quick-create-event-modal.tsx`/`edit-event-dialog.tsx`/`edit-slot-dialog.tsx`/`create-slot-dialog.tsx`; note it for T009's `ResponsiveFormSurface` desktop branch.
- [X] T003 [P] Confirm `apps/web/src/components/ui/dropdown-menu.tsx`'s `DropdownMenuContent` z-index class (`z-50`) and `mobile-drawer.tsx`'s (nav drawer, unrelated to T008/T009) overlay/content z-index (`z-50`), per research.md R2, so T024's fix targets the exact classes.

**Checkpoint**: Reused seams confirmed present; no new dependency needed.

---

## Phase 2: Foundational

**Purpose**: None of the five user stories share a hard blocking prerequisite beyond Phase 1. US1's `ResponsiveFormSurface`/`Drawer` install-and-build work is scoped inside US1's own phase since no other story depends on it. Proceed directly to story phases.

**Checkpoint**: No shared setup beyond Phase 1.

---

## Phase 3: User Story 1 — Manage a draft cycle's events and slots from a phone (Priority: P1)

**Goal**: A mobile viewport supports add/edit/delete for a draft cycle's day-events and time slots, via a mobile-appropriate surface; locked cycles stay fully read-only.

**Independent Test**: On a mobile viewport, add/edit/delete a day-event and a slot on a draft cycle; confirm a day's last slot can't be deleted; repeat on a locked cycle and confirm no controls render.

### Tests for User Story 1

- [X] T004 [P] [US1] Component test: new `apps/web/src/components/responsive-form-surface.component.test.tsx` — asserts the `Dialog` shell renders at a mocked desktop viewport and the `Drawer` shell renders at a mocked mobile viewport, with identical `children` content either way. Confirm RED (component doesn't exist yet).
- [X] T005 [P] [US1] Component test: new `apps/web/src/hooks/use-media-query.test.ts` — asserts the hook returns `true`/`false` matching a mocked `window.matchMedia` result for a given query, and updates when the mocked media-query-list's change handler fires. Confirm RED (hook doesn't exist yet).
- [X] T006 [P] [US1] Component test: extend/create `apps/web/src/features/scheduling/components/planning-admin/planning-event-card.component.test.tsx` — with `isReadOnly: false`, asserts add/edit/delete affordances render for a day-event and its slots (slot delete disabled when `isOnlySlotInEvent`); with `isReadOnly: true`, asserts none render. Confirm RED.
- [X] T007 [P] [US1] Component test: extend `cycle-review-card.component.test.tsx` — asserts the mobile "Add day-event" trigger opens `QuickCreateEventModal` through its `ResponsiveFormSurface` shell. Confirm RED.

### Implementation for User Story 1

- [X] T008 [US1] Run `bunx shadcn@latest add @shadcn/drawer` to install the standard shadcn `Drawer` component at `apps/web/src/components/ui/drawer.tsx` (per research.md R1 / Constitution VI's Mandatory Frontend Rule — supersedes an earlier draft of this task that proposed generalizing the pre-existing, non-shadcn bespoke `mobile-drawer.tsx`, which is left untouched). Confirm `vaul` in `package.json` is unchanged (already present) and the install adds no other new dependency.
- [X] T009 [US1] Create `apps/web/src/hooks/use-media-query.ts` (small `window.matchMedia`-backed hook, per shadcn's `drawer-dialog` example — makes T005 pass) and `apps/web/src/components/responsive-form-surface.tsx` implementing `ResponsiveFormSurfaceProps` (data-model.md): renders the existing `Dialog`/`DialogContent` at `md:` and up, and the newly-installed `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerFooter` (T008) below it, switching on `useMediaQuery('(min-width: 768px)')`, following shadcn's own `drawer-dialog` example pattern exactly. Makes T004 pass. Depends on T008.
- [X] T010 [US1] Modify `apps/web/src/features/scheduling/components/quick-create-event-modal.tsx` — swap the outer `Dialog`/`DialogContent` for `ResponsiveFormSurface` (T009); internal form fields/submit logic unchanged.
- [X] T011 [P] [US1] Modify `apps/web/src/features/scheduling/components/planning-admin/edit-event-dialog.tsx` — same `Dialog` → `ResponsiveFormSurface` swap.
- [X] T012 [P] [US1] Modify `apps/web/src/features/scheduling/components/planning-admin/edit-slot-dialog.tsx` — same swap.
- [X] T013 [P] [US1] Modify `apps/web/src/features/scheduling/components/planning-admin/create-slot-dialog.tsx` — same swap.
- [X] T014 [US1] Modify `apps/web/src/features/scheduling/components/planning-admin/planning-event-card.tsx` — add per-event add-slot/edit-day/delete-day affordances and per-slot edit/delete affordances (slot delete disabled when `isOnlySlotInEvent`), wired to the same `handleUpdateEvent`/`handleDeleteEvent`/`handleUpdateSlot`/`handleDeleteSlot`/`handleCreateSlot` handlers `useCycleReviewCard()` already exposes (spec 020); hide all of them when `isReadOnly`. Makes T006 pass. Depends on T009-T013.
- [X] T015 [US1] Modify `apps/web/src/features/scheduling/components/planning-admin/cycle-review-card.tsx` — wire a mobile-visible "Add day-event" trigger to open `QuickCreateEventModal` via its now-`ResponsiveFormSurface`-wrapped shell. Makes T007 pass. Depends on T010, T014.
- [X] T016 [US1] Run `bun run check-types && bunx biome check .` on files touched in this phase; fix violations. Run the Vitest files from T004-T007; confirm green.
- [X] T017 [US1] New E2E (mobile viewport): extend `apps/web/tests/scheduling/planning-cycles-table-view.spec.ts` or add a new mobile-scoped spec — using Playwright viewport/device emulation, on a draft cycle: add/edit/delete a day-event and a slot from the mobile card list; confirm a day's last slot has no working delete control; repeat on a locked cycle and confirm no controls render. Confirm RED before T014/T015, green after.
- [X] T017a [US1] New E2E (mobile viewport, FR-010): on a draft cycle, open the mobile add/edit surface for a day-event (or slot), then lock the cycle from a second session/API call before saving; confirm the save fails, the mobile `ResponsiveFormSurface` displays an error, and no change is applied — mirroring spec 020's desktop lock-transition guard (FR-013) but verified on the new mobile surface specifically, since its error-display path differs from the desktop `Dialog`. Confirm RED before T014/T015 (or green immediately if the shared backend guard + generic error toast already covers it — either outcome is acceptable, but the assertion must exist).

**Checkpoint**: Mobile CRUD parity complete for draft cycles; locked cycles remain read-only on mobile; lock-transition races surface an error on mobile.

---

## Phase 4: User Story 2 — Read every cycle date and time correctly on a phone (Priority: P1)

**Goal**: The mobile card list renders every date/time through the same `useTimezone()`-driven formatting the desktop table already uses, updating immediately when the toggle changes.

**Independent Test**: On a mobile viewport, toggle church-time/local-time and confirm every visible date/time updates, with no raw ISO/"Z" text and day-only/slot-only splitting matching desktop.

### Tests for User Story 2

- [X] T018 [P] [US2] Component test: extend `planning-event-card.component.test.tsx` — mock `useTimezone()` with a known `effectiveTimezone`; assert a day's date renders date-only (`'PP'`-token shape, no "Z", no time-of-day) and a slot's time renders time-only (`'p'`-token shape, no date), matching `calendar-row.tsx`'s existing format calls. Confirm RED against today's unformatted/static card output.
- [X] T019 [P] [US2] Extend the same test file — switch the timezone-provider fixture's mode between church/local across two renders; assert the mobile card's displayed date/time strings change accordingly. Confirm RED.

### Implementation for User Story 2

- [X] T020 [US2] Modify `apps/web/src/features/scheduling/components/planning-admin/planning-event-card.tsx` — call `useTimezone()`; render each day's date via `format(row.startDate, 'PP')` and each slot's time via `${format(slot.startTime, 'p')} – ${format(slot.endTime, 'p')}`, matching `calendar-row.tsx`'s calls exactly. Makes T018, T019 pass.
- [X] T021 [US2] Run `bun run check-types && bunx biome check .` on files touched in this phase; fix violations. Run the Vitest files from T018-T019; confirm green.
- [X] T022 [US2] Extend the mobile-viewport E2E spec (T017) — toggle church-time/local-time on mobile and confirm every visible date/time updates; confirm no raw ISO/"Z" text anywhere. Confirm RED before T020, green after.

**Checkpoint**: Mobile date/time formatting matches desktop exactly and reacts to the timezone toggle.

---

## Phase 5: User Story 3 — Trust the theme toggle on a phone (Priority: P2)

**Goal**: Selecting light/dark/system from the mobile nav drawer's theme control visibly applies, fixing the nested-portal z-index collision identified in research.md R2.

**Independent Test**: On a mobile viewport, open the nav drawer, open the theme control, select each of light/dark/system; confirm the app's appearance changes every time.

### Tests for User Story 3

- [X] T023 [P] [US3] Component test: extend/create `apps/web/src/components/mode-toggle.component.test.tsx` — render `ModeToggle` nested inside an open `MobileDrawer` (mirroring `app-shell.tsx`'s real nesting); assert `DropdownMenuContent`'s rendered z-index class is higher than `MobileDrawer`'s overlay/content z-index. Confirm RED against today's matching `z-50` values.

### Implementation for User Story 3

- [X] T024 [US3] Modify `apps/web/src/components/ui/dropdown-menu.tsx` — raise `DropdownMenuContent`'s z-index above `MobileDrawer`'s `z-50` (e.g. `z-[60]`), per research.md R2. Makes T023 pass.
- [X] T025 [US3] Run `bun run check-types && bunx biome check .` on files touched in this phase; fix violations. Run the Vitest file from T023; confirm green.
- [X] T026 [US3] New E2E (mobile viewport): open the mobile nav drawer, open the theme control, select "dark", confirm the app reflects dark mode; repeat for "light" and "system". Confirm RED before T024, green after.

**Checkpoint**: Theme toggle works on mobile from within the nav drawer.

---

## Phase 6: User Story 4 — See the mobile nav drawer's structure at a glance (Priority: P2)

**Goal**: Child nav items visually read as children of their parent section via hierarchy cues, with zero change to navigation behavior.

**Independent Test**: Open the mobile nav drawer, confirm children are visually distinguishable as belonging to their parent; confirm every item still navigates and highlights exactly as before.

### Tests for User Story 4

- [X] T027 [P] [US4] Component test: extend/create `apps/web/src/components/app-shell.component.test.tsx` — asserts a child nav item renders with the new hierarchy markup (connector element and/or distinct class), and that every item's `to` target and active-state class logic is unchanged from before this change. Confirm RED against today's `pl-10`-only markup.

### Implementation for User Story 4

- [X] T028 [US4] Modify `apps/web/src/components/app-shell.tsx` (child nav-item rendering, currently `pl-10`-only) — replace with an explicit hierarchy treatment (left connector rule, section-label styling for the parent item, tightened sibling spacing), reusing the existing `NavItem`/`children` data and `Link`/active-state logic unchanged. Makes T027 pass.
- [X] T029 [US4] Run `bun run check-types && bunx biome check .` on files touched in this phase; fix violations. Run the Vitest file from T027; confirm green.

**Checkpoint**: Mobile nav drawer hierarchy is visually legible; navigation behavior unchanged.

---

## Phase 7: User Story 5 — Expand or collapse every day row at once (Priority: P3)

**Goal**: The desktop Calendar review table gains one-shot "Expand all"/"Collapse all" controls.

**Independent Test**: On the desktop table, use "Expand all" and confirm every row shows its slots; use "Collapse all" and confirm every row collapses.

### Tests for User Story 5

- [X] T030 [P] [US5] Component test: extend `cycle-review-card.component.test.tsx` — asserts an "Expand all" button sets every day row into `expandedEventIds`, and a "Collapse all" button clears it; asserts manually re-collapsing one row after "Expand all" then clicking "Collapse all" still collapses everything (one-shot, not a synced toggle). Confirm RED.

### Implementation for User Story 5

- [X] T031 [US5] Modify `apps/web/src/features/scheduling/components/planning-admin/cycle-review-card.tsx` — add `expandAll`/`collapseAll` handlers operating on the existing `calendarRowsState.expandedEventIds` `Set` (research.md R3/data-model.md), and render "Expand all"/"Collapse all" buttons in the desktop table's toolbar area (`hidden md:block` section). Makes T030 pass.
- [X] T032 [US5] Run `bun run check-types && bunx biome check .` on files touched in this phase; fix violations. Run the Vitest file from T030; confirm green.
- [X] T033 [US5] Extend `apps/web/tests/scheduling/planning-cycles-table-view.spec.ts` — on a cycle with multiple day rows, click "Expand all", confirm every row's slots show; click "Collapse all", confirm every row collapses. Confirm RED before T031, green after.

**Checkpoint**: Desktop table bulk expand/collapse works.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T034 Run `bun run check-types && bunx biome check .` repo-wide; confirm zero errors outside pre-existing, unrelated tooling paths.
- [X] T035 Run the full `bun run test` (Vitest) and `bunx playwright test` (full suite, including the new mobile-viewport specs) to confirm no regression outside this feature's touched files, paying particular attention to specs 018/019/020's existing Planning Cycles E2E specs.
- [ ] T036 Run `quickstart.md` manually end-to-end (all 10 steps) against the local dev stack, ideally including a real mobile device over LAN — this also validates the already-completed notifications-401/cookie fix end-to-end alongside this feature's mobile UI.
- [X] T037 Confirm no other list-bearing screen or unrelated backend route changed: `git diff` scoped outside the files named in `plan.md`'s Project Structure section should show nothing besides the already-completed terminology-rename files and the `packages/auth/src/index.ts` cookie fix (both predate this feature's tasks, per `drift-log.md`'s 2026-07-09 entry) — no backend files should appear.
- [X] T038 Confirm `CLAUDE.md`'s and `agents.local.md`'s `<!-- SPECKIT START/END -->` pointers reference `specs/021-mobile-parity-cycles/plan.md` (already updated during planning) — no-op if unchanged.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — confirms reused seams before any story starts.
- **Foundational (Phase 2)**: Empty by design.
- **US1 (Phase 3)**: Depends on Phase 1 only. Installs the standard shadcn `Drawer` and builds `ResponsiveFormSurface`, the shared shell every other mobile-form change would use — sequenced first since it's the largest functional gap.
- **US2 (Phase 4)**: Depends on Phase 1 only, but touches `planning-event-card.tsx` (also touched by US1's T014) — sequence after US1 to avoid rebasing formatting work onto soon-to-change markup.
- **US3 (Phase 5)**: Depends on Phase 1 only; fully independent file (`dropdown-menu.tsx`) — can run in parallel with US1/US2 by a different work-stream.
- **US4 (Phase 6)**: Depends on Phase 1 only; fully independent file (`app-shell.tsx`) — can run in parallel with US1/US2/US3.
- **US5 (Phase 7)**: Depends on Phase 1 only; touches `cycle-review-card.tsx` (also touched by US1's T015) — sequence after US1 to avoid merge churn in the same file.

### Parallel Opportunities

- T001, T002, and T003 (Phase 1) can run in parallel.
- T004, T005, T006, T007 (US1 tests, different files) can run in parallel.
- T011, T012, T013 (US1 `Dialog` → `ResponsiveFormSurface` swaps, different files) can run in parallel once T009 lands.
- T018 and T019 (US2 tests, same file) run in parallel with each other only if written as independent test cases; otherwise sequence within the file.
- US3 (Phase 5) and US4 (Phase 6) can be worked entirely in parallel with US1/US2 (Phases 3-4) and with each other, since all touch disjoint files.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (confirm reused seams).
2. Complete Phase 3 (US1 — mobile CRUD parity).
3. **STOP and VALIDATE**: mobile users can add/edit/delete day-events and slots on draft cycles, locked cycles stay read-only. This alone closes the largest functional gap.
4. Ship if US2-US5 aren't ready yet.

### Incremental Delivery

1. Phase 1 → Phase 3 (US1) → Phase 4 (US2) → validate → ship (mobile CRUD + correct formatting).
2. Phase 5 (US3) and Phase 6 (US4) can each be worked in parallel with the above, or afterward — both are small and isolated. → validate → ship.
3. Phase 7 (US5, desktop-only, smallest) → validate → ship final polish (Phase 8).
