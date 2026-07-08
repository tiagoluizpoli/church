---

description: "Task list for Cycle Review Header Consolidation, Timezone Formatting & Draft Editing (020)"

---

# Tasks: Cycle Review Header Consolidation, Timezone Formatting & Draft Editing

**Input**: Design documents from `/specs/020-cycle-review-editing/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`)

**Tests**: Included, per this repo's established convention (specs 018/019) and `agents.local.md`'s phase-by-phase verification loop — written first, confirmed red, then made green by the paired implementation task.

**Organization**: Tasks are grouped by user story (US1-US4, priority order from `spec.md`). Frontend paths are relative to `apps/web/`, backend paths relative to `apps/server/`, unless stated otherwise.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 / US4, per `spec.md`

---

## Phase 1: Setup

**Purpose**: Confirm the reused backend/frontend seams this feature depends on are actually present as researched, before any story starts.

- [ ] T001 Confirm `ITimeSlotRepository` is registered in the DI container (`apps/server/src/main/**/injections.ts` or equivalent) under token `'ITimeSlotRepository'`, and note its exact token string for T020's `DbPlanningEventManager` injection.
- [ ] T002 [P] Confirm `updateSlotBodySchema`/`timeSlotResponseSchema`/`timeSlotMapper` exports in `apps/server/src/api/dtos/time-slot.dto.ts` match `data-model.md`'s expected shape (`startTime?`, `endTime?`, `label?`); note any drift for T022.
- [ ] T003 [P] Confirm the orval regeneration command (check root `package.json`/`apps/web/package.json` scripts, e.g. `bun run generate:api` or similar, as used by specs 018/019) so T024 can run it.

**Checkpoint**: Reused seams confirmed present; no new dependency needed.

---

## Phase 2: Foundational

**Purpose**: None of the four user stories share a hard blocking prerequisite beyond Phase 1. US1/US2 touch the same frontend files as each other but not as US3/US4's backend work; US3's backend addition is independent of all frontend work. Proceed directly to story phases.

**Checkpoint**: No shared setup beyond Phase 1.

---

## Phase 3: User Story 1 — See cycle status at a glance without repeated chips (Priority: P1)

**Goal**: The page header shows name/status/window/event-count/slot-count exactly once; the Calendar review card body no longer repeats any of it.

**Independent Test**: Open a selected cycle's review page and confirm each piece of summary information appears exactly once, in the header.

### Tests for User Story 1

- [ ] T004 [P] [US1] Component test: extend `apps/web/src/features/scheduling/components/planning-admin/planning-cycle-header.component.test.tsx` — asserts the header renders an event-count chip and a slot-count chip alongside the existing name/status/window chips, sourced from a `selectedCycle` fixture with known `cycleEvents`/`totalSlots`. Confirm RED against today's markup (no count chips).
- [ ] T005 [P] [US1] Component test: extend `apps/web/src/features/scheduling/components/planning-admin/cycle-review-card.component.test.tsx` — asserts the review body no longer renders a `selected-cycle-summary` testid, no duplicate cycle name, no duplicate window text, and no "Selected cycle review" card title, while the inner "Calendar review" heading remains. Confirm RED.

### Implementation for User Story 1

- [ ] T006 [US1] Extend `PlanningCycleHeaderModel` in `apps/web/src/features/scheduling/components/planning-admin/planning-admin-context.tsx` (~line 219) with a `counts: { eventCount: number; slotCount: number } | null` field (per `data-model.md`); populate it in `usePlanningCycleHeader()` (~line 232) from the same `cycleEvents`/`totalSlots` context values `useCycleReviewCard()` reads.
- [ ] T007 [US1] Modify `apps/web/src/features/scheduling/components/planning-admin/planning-cycle-header.tsx` — render two new chips (event count, slot count) from `counts`, matching the existing chip markup style (`radius-surface` div pattern) used for status/window. Makes T004 pass.
- [ ] T008 [US1] Modify `apps/web/src/features/scheduling/components/planning-admin/cycle-review-card.tsx` — remove the `selected-cycle-summary` div (name/window/event-slot-count block, ~lines 147-163) and the outer `CardTitle`/`CardDescription` ("Selected cycle review" + blurb, ~lines 129-135); keep the inner "Calendar review" heading and its lock-cycle button row unchanged. Makes T005 pass.
- [ ] T009 [US1] Run `bun run check-types && bunx biome check .` on files touched in this phase; fix violations. Run the Vitest files from T004/T005; confirm green.

**Checkpoint**: Header shows counts once; body no longer duplicates cycle summary info.

---

## Phase 4: User Story 2 — Read every planning-cycle date and time in the church's own clock (Priority: P1)

**Goal**: Every date/time in the Calendar review table and header window chip renders through `useTimezone()`, with day rows date-only and slot rows time-only, no raw ISO/"Z" anywhere.

**Independent Test**: Toggle church-time/local-time and confirm every visible date/time in the table and header updates; confirm day rows show only a date and slot rows only a time span.

### Tests for User Story 2

- [ ] T010 [P] [US2] Component test: extend `cycle-review-card.component.test.tsx` — mock `useTimezone()` (or wrap in the app's real `TimezoneProvider` test harness) with a known `effectiveTimezone`; assert a day row's cell shows a date-only string (e.g. matches `/^\w{3} \d{1,2}, \d{4}$/` for `'PP'` tokens) with no "Z" and no "→"; assert an expanded slot row's cell shows a time-only string (e.g. matches `/^\d{1,2}:\d{2}\s?(AM|PM)/` for `'p'` tokens) with no date and no "Z". Confirm RED against today's `formatEventDateTime` output.
- [ ] T011 [P] [US2] Extend the same test file — switch the timezone-provider fixture's mode from church to local (or vice versa) between two renders; assert the displayed date/time strings change accordingly. Confirm RED (today's formatting ignores the toggle entirely).
- [ ] T012 [P] [US2] Component test: extend `planning-cycle-header.component.test.tsx` — assert the window chip's dates also change when the timezone-provider fixture's mode changes. Confirm RED.

### Implementation for User Story 2

- [ ] T013 [US2] Modify `apps/web/src/features/scheduling/components/planning-admin/planning-admin.types.ts` — per `data-model.md`: rename `CycleCalendarTableRow.window` to `startDate: string` (raw ISO); replace `CycleCalendarSlotRow.window` with `startTime: string`/`endTime: string` (raw ISO) plus new `isOnlySlotInEvent: boolean`.
- [ ] T014 [US2] Modify `apps/web/src/features/scheduling/components/planning-admin/planning-admin.utils.ts` — update `toCycleCalendarTableRow` to emit the new raw-ISO fields (`startDate`, `startTime`/`endTime`, `isOnlySlotInEvent` computed from `eventGroup.slots.length === 1`) instead of calling `formatEventDateTime`; remove `formatEventDateTime` if no longer used elsewhere (grep first). Leave `formatCycleDate` in place only if still used outside this component's new hook-based path (check `cycle-list-card.tsx`/`template-manager-card.tsx` usage from spec 019 before removing).
- [ ] T015 [US2] Modify `apps/web/src/features/scheduling/components/planning-admin/cycle-review-card.tsx` — call `const { format } = useTimezone()`; render each day row's date cell via `format(row.startDate, 'PP')` (no window arrow); render each slot row's time cell via `${format(slot.startTime, 'p')} – ${format(slot.endTime, 'p')}` (no date). Makes T010, T011 pass.
- [ ] T016 [US2] Modify `apps/web/src/features/scheduling/components/planning-admin/planning-cycle-header.tsx` — call `useTimezone()` and format `period.startDate`/`period.endDate` via `format(..., 'PP')` instead of `formatCycleDate`. Makes T012 pass.
- [ ] T017 [US2] Run `bun run check-types && bunx biome check .` on files touched in this phase; fix violations. Run the Vitest files from T010-T012; confirm green.

**Checkpoint**: All dates/times in the table and header are timezone-toggle-aware; day rows date-only, slot rows time-only.

---

## Phase 5: User Story 3 — Fix a mistake in a draft cycle without starting over (Priority: P2)

**Goal**: Draft cycles support deleting/editing whole day-events and individual time slots from the Calendar review table; locked cycles show none of these controls.

**Independent Test**: On a draft cycle, delete a day, edit a day, delete a non-last slot, confirm a day's last slot can't be deleted, edit a slot; repeat on a locked cycle and confirm no controls appear.

### Backend: slot-level mutation support

- [ ] T018 [US3] Add `UpdatePlanningEventSlotManagerInput`/`DeletePlanningEventSlotManagerInput` types and `updateSlot`/`deleteSlot` method signatures to `IPlanningEventManager` in `apps/server/src/domain/contracts/application/planning-event-manager.ts`, per `data-model.md`.
- [ ] T019 [US3] Add a new domain error `LastRemainingSlotError` (e.g. `apps/server/src/domain/errors/last-remaining-slot-error.ts`, following the existing `IllegalStateTransitionError`/`EventOutsidePlanningCycleError` file pattern in `apps/server/src/domain/errors/`).
- [ ] T020 [US3] Modify `apps/server/src/application/db-planning-event-manager.ts` — inject `ITimeSlotRepository` (per R4's token from T001) into `DbPlanningEventManager`'s constructor; implement `updateSlot`/`deleteSlot`: load cycle via `ensurePlanningCycleWritable` (same guard as `updateEvent`), load the event via `eventRepository.getEvent`, load the slot via `timeSlotRepository.getById` and verify `slot.eventId === input.eventId`, throw `LastRemainingSlotError` in `deleteSlot` when the event's slot count is 1, otherwise delegate to `timeSlotRepository.update`/`.deleteById`. Depends on T018, T019.
- [ ] T020a [US3] Modify `updateEvent` in `apps/server/src/application/db-planning-event-manager.ts` (per R6/FR-007a) — when `input.startDate` is provided and differs from `currentEvent.startDate`, compute `delta = input.startDate.getTime() - currentEvent.startDate.getTime()` inside the same `unitOfWork.run(tx)` block as the event update, list the event's slots via `timeSlotRepository` (T020's injection), and call `timeSlotRepository.update({ startTime: slot.startTime + delta, endTime: slot.endTime + delta })` for each one in the same transaction. No cascade when only `endDate`/`title`/`description`/`location` change. Depends on T020.
- [ ] T021 [P] [US3] Backend integration test: extend or create `apps/server/tests/application/planning-phase3.managers.test.ts`-style test for `DbPlanningEventManager.updateSlot`/`deleteSlot` against a real test DB (`schedulingTestDb`) — covering: happy-path update, happy-path delete (non-last slot), reject on locked cycle, reject on archived cycle, reject deleting a day's only slot (`LastRemainingSlotError`), reject when slot/event/cycle triple mismatches, reject when the cycle locks between load and mutation (FR-013's race case — lock the cycle inside the test right before calling `updateSlot`/`deleteSlot`). Confirm RED before T020, green after.
- [ ] T021a [P] [US3] Backend integration test: extend the same test file for `updateEvent`'s cascade (T020a) — a day with 2+ slots, change `startDate` by N days/hours, assert every slot's `startTime`/`endTime` shifted by exactly the same delta and each slot's duration is unchanged; assert changing only `endDate`/`title` does NOT move any slot; assert the whole operation rolls back atomically if a mid-loop failure is simulated (same transaction). Confirm RED before T020a, green after.
- [ ] T022 [US3] Add two new routes to `apps/server/src/api/controllers/church-admin-controller.ts`: `PATCH /planning-cycles/:cycleId/events/:eventId/slots/:slotId` (operationId `updatePlanningEventSlot`, body `updateSlotBodySchema`, response `timeSlotResponseSchema`) and `DELETE` same path (operationId `deletePlanningEventSlot`, 204 response), per `contracts/planning-cycle-slots.md`. Map `LastRemainingSlotError`/`IllegalStateTransitionError` to `409`, not-found cases to `404`, duration-validation errors to `422` (reuse existing error-mapping pattern in this controller/its error-handling middleware). Depends on T020.
- [ ] T023 [P] [US3] HTTP-level controller test: extend `apps/server/tests/http/church-admin.http.test.ts` — `PATCH`/`DELETE .../slots/:slotId` happy paths, 404 (wrong slot/event/cycle), 409 (locked cycle), 409 (last remaining slot). Confirm RED before T022, green after.
- [ ] T024 [US3] Run the project's orval regeneration command (confirmed in T003) to generate `adminApi.updatePlanningEventSlot`/`adminApi.deletePlanningEventSlot` typed client functions in `apps/web/src/infrastructure/api/`. Run `bun run check-types` repo-wide to confirm the generated client compiles.

### Frontend: day-level and slot-level delete/edit UI

- [ ] T025 [P] [US3] Component test: extend `cycle-review-card.component.test.tsx` — with `isReadOnly: false` (draft cycle), asserts each day row has a delete action (calls a `cancelPlanningEvent`-backed handler) and an edit action; asserts each slot row has a delete action (disabled/hidden when `isOnlySlotInEvent`) and an edit action. With `isReadOnly: true` (locked cycle), asserts none of these controls render. Confirm RED.
- [ ] T026 [US3] Modify `apps/web/src/features/scheduling/components/planning-admin/use-planning-admin-mutations.ts` — add `handleDeleteEvent`/`handleUpdateEvent` mutations wrapping the already-existing `adminApi.cancelPlanningEvent`/`adminApi.updatePlanningEvent` calls, and `handleUpdateSlot`/`handleDeleteSlot` mutations wrapping the new `adminApi.updatePlanningEventSlot`/`adminApi.deletePlanningEventSlot` calls (from T024) — all following the existing `deleteTemplate`-mutation shape (React Query `useMutation`, toast on settle, invalidate the selected cycle's details query). `handleUpdateEvent`'s cache invalidation is what surfaces T020a's server-side slot-time cascade in the table — no separate frontend cascade logic needed. Depends on T024, T020a.
- [ ] T027 [US3] Extend `useCycleReviewCard()` in `planning-admin-context.tsx` to expose the new handlers from T026.
- [ ] T028 [US3] Modify `apps/web/src/features/scheduling/components/planning-admin/cycle-review-card.tsx` — when `!isReadOnly`, add a per-day-row action (icon button + confirmation, using existing `AlertDialog`/`Dialog` primitives) for delete, and an edit affordance (reuse `QuickCreateEventModal`'s existing field set as an edit-mode dialog, or a comparable existing form dialog primitive) for editing a day's event; add a per-slot-row delete action (disabled when `slot.isOnlySlotInEvent`) and an edit affordance for a slot's start/end time and label. Makes T025 pass. Depends on T027.
- [ ] T029 [US3] Run `bun run check-types && bunx biome check .` on all files touched in this phase; fix violations. Run `bun run test` for the touched Vitest files (T021, T021a, T023, T025); confirm green.
- [ ] T030 [US3] New/extended E2E: extend `apps/web/tests/scheduling/planning-cycles-table-view.spec.ts` — on a draft cycle, delete a day-event and confirm it disappears with counts updating; edit a day-event's date and confirm the change persists AND its slot rows' times shift by the same amount (T020a's cascade, visible end-to-end); expand a day with 2+ slots, delete one, confirm sibling slots remain; confirm a day's last slot has no working delete control; edit a slot's time and confirm it persists. On a locked cycle, confirm none of these controls render. Confirm RED before T028, green after.

**Checkpoint**: Draft cycles support day/slot delete+edit; locked cycles remain fully read-only.

---

## Phase 6: User Story 4 — Add a one-off event as a first-class action, not an exception (Priority: P3)

**Goal**: "Add manual event" sits beside "Apply template" as a peer action; the review card body no longer has a highlighted "manual exceptions" panel.

**Independent Test**: Open a draft cycle's review page and confirm "Add manual event" appears in the top action row next to "Apply template," with no separate highlighted panel remaining in the review card body.

### Tests for User Story 4

- [ ] T031 [P] [US4] Component/route test: extend `apps/web/src/features/scheduling/components/planning-admin.component.test.tsx` (or equivalent existing test for `PlanningCyclesActions`, create if none exists) — asserts "Add manual event" and "Apply template" both render in the same action row when reviewing a draft cycle, and that clicking "Add manual event" opens the (moved) `QuickCreateEventModal`. Confirm RED.
- [ ] T032 [P] [US4] Component test: extend `cycle-review-card.component.test.tsx` — asserts no "Manual exceptions" heading/panel/testid renders in the review body regardless of `isReadOnly`. Confirm RED.

### Implementation for User Story 4

- [ ] T033 [US4] Modify `apps/web/src/features/scheduling/components/planning-admin.tsx` — in `PlanningCyclesActions` (~lines 129-190), add an "Add manual event" button (same visual weight as "Apply template", e.g. both `default` variant) guarded by the same `canApplyTemplates`-style draft/selected-cycle condition, plus its own `createEventOpen` state and the relocated `<QuickCreateEventModal target={{ kind: 'planning-cycle', cycleId: selectedCycle.id }} />` instance. Makes T031 pass.
- [ ] T034 [US4] Modify `apps/web/src/features/scheduling/components/planning-admin/cycle-review-card.tsx` — remove the "Manual exceptions" panel (the `!isReadOnly` block with its own heading/description/button/modal, ~lines 165-189) entirely, since T033 relocates its functionality. Makes T032 pass.
- [ ] T035 [US4] Run `bun run check-types && bunx biome check .` on files touched in this phase; fix violations. Run the Vitest files from T031/T032; confirm green.

**Checkpoint**: "Add manual event" is a peer top-level action; no exception-styled panel remains.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T036 Run `bun run check-types && bunx biome check .` repo-wide; confirm zero errors outside pre-existing, unrelated tooling paths.
- [ ] T037 Run the full `bun run test` (Vitest) and `bunx playwright test` (full suite) to confirm no regression outside this feature's touched files, paying particular attention to specs 018/019's existing Planning Cycles E2E specs (viewport-pinned tests from 019 must still pass).
- [ ] T038 Run `quickstart.md` manually end-to-end (all 12 steps) against the local dev stack.
- [ ] T039 Confirm no other list-bearing screen or unrelated backend route changed: `git diff` scoped outside the files named in `plan.md`'s Project Structure section should show nothing besides orval-regenerated client files and DI registration.
- [ ] T040 Confirm `CLAUDE.md`'s and `agents.local.md`'s `<!-- SPECKIT START/END -->` pointers still reference `specs/020-cycle-review-editing/plan.md` (already updated during planning) — no-op if unchanged.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — confirms reused seams before any story starts.
- **Foundational (Phase 2)**: Empty by design.
- **US1 (Phase 3)** and **US2 (Phase 4)**: Both depend on Phase 1 only; both touch `cycle-review-card.tsx`/`planning-cycle-header.tsx`/`planning-admin-context.tsx`, so sequence their edits to those shared files rather than running the two stories fully in parallel (do US1 first, then US2, since US2's row-shape changes are easier to layer onto an already-simplified body).
- **US3 (Phase 5)**: Backend sub-tasks (T018-T024 (plus T020a/T021a)) depend on Phase 1 only and can start immediately, in parallel with US1/US2. Frontend sub-tasks (T025-T030) depend on both the backend routes (T024) and US1/US2's simplified `cycle-review-card.tsx` (to avoid rebasing edit/delete UI onto soon-to-be-removed markup) — sequence US3's frontend tasks after US2.
- **US4 (Phase 6)**: Depends on US1's removal of the outer card title (T008) and, to avoid churn, is easiest sequenced after US3's day-level delete/edit UI lands in the same file. Independent of US2.

### Parallel Opportunities

- T002 and T003 (Phase 1) can run in parallel.
- T004 and T005 (US1 tests, different files) can run in parallel.
- T010, T011, T012 (US2 tests) can run in parallel (T010/T011 same file, sequence within; T012 different file, parallel to both).
- T018-T024 (plus T020a/T021a) (US3 backend) can be worked in parallel with US1/US2 (Phases 3-4) by a different work-stream, since they touch entirely separate files.
- T021, T021a, and T023 (US3 backend tests) can run in parallel (T021/T021a share a file but cover disjoint methods; T023 is a different file).
- T025 and T031/T032 (US3/US4 tests, different files) can run in parallel once their respective prerequisite phases are reached.

---

## Implementation Strategy

### MVP First (User Stories 1+2 Only)

1. Complete Phase 1 (confirm reused seams).
2. Complete Phase 3 (US1 — header consolidation) then Phase 4 (US2 — timezone formatting).
3. **STOP and VALIDATE**: header shows counts once, all dates/times are timezone-correct and correctly split. This alone fixes the two most visible correctness/clutter issues.
4. Ship if US3/US4 aren't ready yet — US1+US2 together are a complete, valuable increment.

### Incremental Delivery

1. Phase 1 → Phase 3 (US1) → Phase 4 (US2) → validate → ship.
2. Phase 5 (US3, backend can start earlier in parallel) → validate → ship.
3. Phase 6 (US4) → validate → ship final polish (Phase 7).
