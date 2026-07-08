# Phase 0 Research: Cycle Review Header Consolidation, Timezone Formatting & Draft Editing

## R1 — Timezone-aware formatting mechanism

**Decision**: Reuse `useTimezone()` (`apps/web/src/shared/hooks/use-timezone.ts`) directly inside `cycle-review-card.tsx` and `planning-cycle-header.tsx`. Call `format(isoString, 'PP')` for a day row's date-only display and `format(isoString, 'p')` for a slot row's time-only display. The hook already resolves `effectiveTimezone` (church vs. local, per the existing avatar-menu toggle) and re-renders consumers automatically on toggle via React context, so no new subscription plumbing is needed.

**Rationale**: This is an already-established, already-tested pattern in three other feature components (`builder-header.tsx`, `slot-row.tsx`, `event-list.tsx`). Introducing a second timezone utility would violate the spec's own Assumptions section and create a second source of truth for "what timezone is active."

**Alternatives considered**: Writing a bespoke formatter for this screen — rejected, duplicates existing hook. Moving formatting into `planning-admin.utils.ts` as plain functions that accept `format` as a parameter — rejected as unnecessary indirection; the existing repo convention (see R2) is for feature components to call the hook directly where JSX renders the value, not to thread a formatter function through utils.

## R2 — Where the date/time formatting call site lives

**Decision**: `formatCycleDate`/`formatEventDateTime`/`toCycleCalendarTableRow` in `planning-admin.utils.ts` stop producing final display strings. `toCycleCalendarTableRow` keeps mapping raw ISO date strings (`event.startDate`, `slot.startTime`/`endTime`) onto the row view-model type unchanged, plus labels/status/ids. The component (`cycle-review-card.tsx`) calls `useTimezone().format(...)` at render time for each row's date/time cell. Same for the header: `planning-cycle-header.tsx` calls `useTimezone().format(...)` on `period.startDate`/`period.endDate` instead of `formatCycleDate`.

**Rationale**: `useTimezone()` is a React hook — it cannot be called from a plain utility function outside a component's render. The existing three call sites all follow this same shape (hook called in the component, not threaded into a `.utils.ts` file).

**Alternatives considered**: Passing `format` as a parameter into `toCycleCalendarTableRow({ eventGroup, format })` — rejected; this repo's Parameter Contract Rule would require yet another named input type for a formatting function reference, and it fights the grain of the existing pattern. Simpler to keep the row-mapper emitting raw ISO strings and let the component format them at the leaf.

## R3 — Header event/slot count chips

**Decision**: Extend `PlanningCycleHeaderModel` (`planning-admin-context.tsx`) with `eventCount: number` and `slotCount: number`, sourced from the same `cycleEvents`/`totalSlots` values `useCycleReviewCard()` already exposes (both already computed in `usePlanningAdminContext()`'s underlying `usePlanningAdmin()` hook — `totalSlots` via `calculateTotalSlots({ events })` in `planning-admin.utils.ts`). `usePlanningCycleHeader()` reads the same context fields; no new query, no new computation.

**Rationale**: Both counts are already computed once per render for the review card; reusing them for the header avoids a second computation path and keeps a single source of truth (consistent with the existing comment in `planning-cycle-header.tsx` calling itself "the only place the selected cycle's status renders").

**Alternatives considered**: Recomputing counts in the header component from raw `cycleEvents` — rejected, redundant with existing context values.

## R4 — Slot-level backend addition: manager-level indirection

**Decision**: `DbPlanningEventManager` gets a new constructor-injected dependency, `ITimeSlotRepository` (`@inject('ITimeSlotRepository')`), alongside its existing `IPlanningEventRepository` injection. `updateSlot`/`deleteSlot` on `IPlanningEventManager` are implemented as: (1) load the cycle via `cycleRepository.getById`, (2) run the existing `ensurePlanningCycleWritable` guard (same as `updateEvent`/`cancelEvent`), (3) delegate the actual mutation to `this.timeSlotRepository.update(...)`/`.deleteById(...)` — the exact methods `DrizzleTimeSlotRepository` already implements (`drizzle-time-slot.repository.ts:195-225`). No new method is added to `PlanningEventRepository`/`DrizzlePlanningEventRepository` — this avoids duplicating query logic that already exists and is already tested via `TimeSlotRepository`'s own contract tests.

**Rationale**: `ITimeSlotRepository` already has `update()`/`deleteById()` with `withChurchIsolation` and `NotFoundError` handling built in (verified this session). Injecting it directly into `DbPlanningEventManager` is the smallest change that satisfies Constitution I/VII without duplicating persistence code across two repositories for the same table.

**Alternatives considered**: Adding `updateTimeSlot`/`deleteTimeSlot` to `PlanningEventRepository`/`DrizzlePlanningEventRepository` that internally re-implement the same Drizzle query against `timeSlot` — rejected as needless duplication of already-shipped, already-tested code (spec 013's `DrizzleTimeSlotRepository`). The manager layer is the correct seam to compose two repositories that both legitimately touch the same table for different feature slices (Builder events vs. Planning-cycle events).

**Guard detail**: Because `DrizzleTimeSlotRepository.update`/`deleteById` take `churchId`/`slotId` directly (not `eventId`/`cycleId`), the new manager methods must independently verify the target slot belongs to the given `eventId` (which itself must belong to the given `cycleId`) before delegating — e.g. by calling `eventRepository.getEvent({ churchId, eventId, tx })` first (already used by `updateEvent`/`cancelEvent`) and checking the slot's `eventId` matches, to prevent a caller passing a mismatched `cycleId`/`eventId`/`slotId` triple from mutating an unrelated slot. `TimeSlotRepository.getById` (also existing) can supply the slot for this check.

## R5 — New route contract shape

**Decision**: Mirror the already-shipped sibling routes almost exactly: `PATCH /planning-cycles/:cycleId/events/:eventId/slots/:slotId` (operationId `updatePlanningEventSlot`) and `DELETE /planning-cycles/:cycleId/events/:eventId/slots/:slotId` (operationId `deletePlanningEventSlot`) on `ChurchAdminController`, reusing `updateSlotBodySchema`/`timeSlotResponseSchema`/`timeSlotMapper` already exported from `apps/server/src/api/dtos/time-slot.dto.ts`. Distinct operationIds from the existing `admin-leader-controller.ts` pair (`updateSlot`/`deleteSlot`) are required since orval generates one function per operationId and both would otherwise collide.

**Rationale**: Consistent OpenAPI-first, orval-generated-client pattern already used everywhere else in this codebase (Constitution II). Reusing the DTO schemas avoids a second, divergent slot-response shape between the Builder-events and Planning-cycle-events features.

**Alternatives considered**: A single generic slot-route module shared by both controllers — rejected as out of scope for this feature; the existing `admin-leader-controller.ts` route is owned by a different feature slice and touching it risks regressing spec 013, which this feature must not do (FR/SC scope is limited to Planning Cycles per this feature's spec, mirroring 019's own FR-010-style scoping discipline).

## R6 — Cascading a day/event's date edit onto its slots (FR-007a)

**Decision**: `DbPlanningEventManager.updateEvent` gains cascade behavior: when `input.startDate` is provided and differs from the event's current `startDate`, compute `delta = input.startDate.getTime() - currentEvent.startDate.getTime()` inside the same `unitOfWork.run(tx)` block already used for the event update, then load the event's slots (`timeSlotRepository` — the same injection added for T020's `updateSlot`/`deleteSlot`, per R4) and call `timeSlotRepository.update({ startTime: slot.startTime + delta, endTime: slot.endTime + delta })` for each one, all inside the same transaction as the event row update (so a failure partway through rolls back the whole edit, not a partially-shifted day). No new repository method needed — `update()` already exists.

**Rationale**: User confirmed (this session) that day-level date edits must cascade to child slots rather than leaving them orphaned at the old date, or restricting date editing out of the UI entirely. Applying a uniform delta preserves each slot's duration and its time-of-day offset from the event's own start — the only thing that changes is which calendar day it falls on. This reuses the exact `ITimeSlotRepository` injection already planned for R4/T020, so it adds behavior, not a new dependency or seam.

**Alternatives considered**: Restricting the day-edit UI to non-date fields only (title/description/location) — rejected per explicit user direction (cascade chosen over this option). Recomputing slot times from scratch against the event's template (if `sourceTemplateBlockId` is present) instead of a flat delta shift — rejected as unnecessarily complex and inconsistent for manually-added (non-templated) events, which have no template block to recompute from; a flat delta works uniformly for both templated and manual slots. Leaving the mismatch unresolved and requiring the admin to manually fix each slot — rejected per explicit user direction.

**Scope note**: This cascade only fires when `startDate` changes. If only `endDate`, `title`, `description`, or `location` change, no slot mutation occurs — an event's `endDate` is its own field (the overall day-event's window end) and is not assumed to individually gate any slot's timing beyond what the `startDate` delta already captures.
