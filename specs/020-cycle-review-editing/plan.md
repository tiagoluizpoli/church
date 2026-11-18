# Implementation Plan: Cycle Review Header Consolidation, Timezone Formatting & Draft Editing

**Branch**: `develop` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-cycle-review-editing/spec.md`

## Summary

Four related changes to the selected-cycle review screen shipped by spec 019: (1) fold the review body's redundant name/window/status/count block into the page header as two new count chips; (2) make every date/time in the Calendar review table and header render through the existing `useTimezone()` hook instead of raw ISO-with-`Z` slicing, splitting parent rows to date-only and slot rows to time-only; (3) let ChurchAdmins delete/edit whole day-events (already backed by existing `updatePlanningEvent`/`cancelPlanningEvent`) and individual time slots (new: two small backend additions reusing the already-shipped `TimeSlot` CRUD repository) while a cycle is still draft; (4) demote the "manual exceptions" panel to a normal, equally-prominent "Add manual event" action beside "Apply template". No new domain entities, no new DB tables/migrations — the slot-level backend work is two new manager methods plus two new routes wrapping infrastructure (`ITimeSlotRepository`) that already exists and is already used by the sibling Builder-events feature (spec 013).

## Technical Context

**Language/Version**: TypeScript (repo-wide strict mode), React 19 (frontend), Node/Bun + Fastify (backend)

**Primary Dependencies**: Frontend — TanStack Router/Query (existing), Intent UI `Table` (existing, spec 019), `date-fns`/`date-fns-tz` via the existing `useTimezone()` hook (`apps/web/src/shared/hooks/use-timezone.ts`, `apps/web/src/shared/components/timezone-provider.tsx`) — no new frontend dependency. Backend — Fastify, Zod, Drizzle ORM, tsyringe DI (all existing); reuses the existing `ITimeSlotRepository`/`DrizzleTimeSlotRepository` and `time-slot.dto.ts` Zod schemas already shipped for the Builder-events path (spec 013) — no new dependency.

**Storage**: No schema or migration change. Slot mutations write to the already-existing `time_slot` table (`packages/db/src/schema/scheduling.ts`) via the already-existing `ITimeSlotRepository`, now also reached from the planning-cycle path.

**Testing**: Vitest (component tests for `cycle-review-card.tsx`/`planning-cycle-header.tsx` new chip/format/edit-delete branches; manager-level integration tests for `DbPlanningEventManager.updateSlot`/`deleteSlot` and `updateEvent`'s slot-cascade behavior against a real test DB, following `planning-phase3.managers.test.ts`'s existing pattern; HTTP-level controller tests for the two new routes, following `church-admin.http.test.ts`'s existing pattern), Playwright (extend `apps/web/tests/scheduling/planning-cycles-table-view.spec.ts` and/or `us1-admin-plan.spec.ts` for header chips, timezone-toggle-driven re-render, and draft-cycle delete/edit flows).

**Target Platform**: Responsive web, desktop breakpoint (`md:`, existing convention) for the table view; the header chip and manual-entry-button changes apply at all breakpoints. `apps/web` + `apps/server`.

**Project Type**: Web application — full-stack change within the existing monorepo (frontend presentation + new backend mutation endpoints), no new routes/pages, no new top-level directories.

**Performance Goals**: No explicit new performance target; slot mutations are single-row Drizzle operations consistent with existing event mutations' cost profile.

**Constraints**: Must not introduce a new timezone utility — consume the existing `useTimezone()`/`formatInTZ` stack unchanged (per spec.md Assumptions). Must preserve locked-cycle read-only guarantee (FR-010) — no new editing affordance may render when `isReadOnly`. Must preserve multi-tenant `church_id` isolation (`withChurchIsolation`) in any new repository/query code. Must follow the Parameter Contract Rule (Constitution VII) in every touched file, frontend and backend — no inline object types, single named-object parameters. Day-level delete stays a soft delete via the existing `cancelPlanningEvent` (no new hard-delete route). A day's last remaining slot must not be independently deletable (FR-008) — its delete control is disabled/hidden; the day must be deleted instead. Day-level date edits MUST cascade onto child slots (FR-007a) — a date change on `updateEvent` shifts every slot's `startTime`/`endTime` by the same delta, inside the same transaction as the event update, so no slot is left pointing at the day's previous date.

**Scale/Scope**: 7 frontend files (`cycle-review-card.tsx`, `planning-cycle-header.tsx`, `planning-admin.tsx`, `planning-admin.types.ts`, `planning-admin.utils.ts`, `planning-admin-context.tsx`, `use-planning-admin-mutations.ts`) + 3 backend files (`planning-event-manager.ts` contract, `db-planning-event-manager.ts`, `church-admin-controller.ts`) + 1 new backend error file (`last-remaining-slot-error.ts`) + orval regen. Per research.md R4, `planning-event.repository.ts`/`drizzle-planning-event.repository.ts` are NOT touched — the manager injects the already-existing `ITimeSlotRepository` directly rather than adding a parallel repository method. No new routes/pages, no new top-level directories, no new DB migration, no DI-registration file change (both classes already register their full dependency lists via existing `@injectable()`/`@inject()` decorators).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Domain-First Architecture** — PASS. No new domain entity; slot mutation reuses the already-modeled `TimeSlot` entity (spec 013) through its existing repository contract.
- **II. Full-Stack Type Safety** — PASS. New routes declare Zod schemas (`updateSlotBodySchema`, reused from `time-slot.dto.ts`) and typed responses (`timeSlotResponseSchema`/`timeSlotMapper`, also reused); orval regenerates typed frontend client functions from the updated OpenAPI document. No `any`.
- **III. Container-Ready Infrastructure** — N/A. No infrastructure change.
- **IV. Environment Discipline** — N/A. No new environment variables.
- **V. Automated Code Standards** — PASS (gate re-checked at implementation time via Biome + Lefthook, same as specs 018/019).
- **VI. Maximum Context Specification** — PASS. Traversed `manual-planning/0001-volunteer-scheduling/specifications-list.md` before writing this plan; confirmed S4 (Timezone & Date Policy) and the Mandatory Frontend Rule (strict shadcn/ui adherence) already govern this area and are both honored here (timezone formatting reuses the existing policy's implementation; no new UI primitive is hand-rolled — delete confirmation uses existing `AlertDialog`/`Dialog`, edit forms reuse existing form patterns).
- **VII. Explicit Parameter Contracts** — APPLIES. New manager methods (`updateSlot`, `deleteSlot` on `IPlanningEventManager`) each take one named input interface (`UpdatePlanningEventSlotManagerInput`, `DeletePlanningEventSlotManagerInput`, mirroring the existing `UpdatePlanningEventManagerInput`/`CancelPlanningEventManagerInput` naming convention already in `planning-event-manager.ts`). No new repository methods are added — per research.md R4, `DbPlanningEventManager` injects the already-existing `ITimeSlotRepository` directly rather than extending `PlanningEventRepository`. New frontend row-mapping/mutation helpers follow the existing `formatCycleDate({ date })`-style named-object-parameter convention in `planning-admin.utils.ts`/`use-planning-admin-mutations.ts`.

No violations requiring the Complexity Tracking table — this plan adds zero new dependencies and reuses an already-shipped repository/entity pair (spec 013's `TimeSlot`/`ITimeSlotRepository`) rather than building new persistence.

## Project Structure

### Documentation (this feature)

```text
specs/020-cycle-review-editing/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — R1-R5
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── planning-cycle-slots.md   # Phase 1 output — new route contracts
└── tasks.md              # Phase 2 output (/speckit-tasks command — not created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/web/src/features/scheduling/components/planning-admin/
├── cycle-review-card.tsx        # US1/US2/US3/US4: remove duplicate summary + manual-exceptions panel,
│                                  add useTimezone()-driven date/time split, add day/slot delete+edit row actions
├── planning-cycle-header.tsx    # US1/US2: add event/slot count chips, timezone-aware window chip
├── planning-admin.types.ts      # US2/US3: adjust CycleCalendarTableRow/SlotRow shape (raw ISO in, not
│                                  pre-formatted window strings), add PlanningCycleHeaderModel counts
├── planning-admin.utils.ts      # US2: formatCycleDate/formatEventDateTime/toCycleCalendarTableRow stop
│                                  producing display strings; keep structuring raw ISO + labels/status
├── planning-admin-context.tsx   # US1/US3: usePlanningCycleHeader() returns counts; useCycleReviewCard()
│                                  exposes new slot/event mutation handlers
└── use-planning-admin-mutations.ts  # US3: add updateEvent/cancelEvent (day-level, wraps existing
                                       adminApi calls) and updateSlot/deleteSlot (new orval calls)
                                       mutations, following the existing deleteTemplate-mutation pattern

apps/web/src/features/scheduling/components/planning-admin.tsx
                                 # US4: PlanningCyclesActions gains "Add manual event" button + moved
                                   QuickCreateEventModal instance, beside "Apply template"

apps/server/src/domain/contracts/application/planning-event-manager.ts
                                 # US3: add UpdatePlanningEventSlotManagerInput/DeletePlanningEventSlotManagerInput,
                                   IPlanningEventManager.updateSlot/deleteSlot
apps/server/src/application/db-planning-event-manager.ts
                                 # US3: DbPlanningEventManager.updateSlot/deleteSlot, guarded by the
                                   existing ensurePlanningCycleWritable, delegating to ITimeSlotRepository;
                                   also extends the EXISTING updateEvent method to cascade a startDate
                                   change onto every child slot by the same delta, same transaction (FR-007a/R6)
apps/server/src/domain/errors/last-remaining-slot-error.ts
                                 # US3: new domain error, thrown by deleteSlot when the target slot is
                                   the event's only remaining slot (FR-008)
apps/server/src/api/controllers/church-admin-controller.ts
                                 # US3: PATCH/DELETE /planning-cycles/:cycleId/events/:eventId/slots/:slotId,
                                   reusing updateSlotBodySchema/timeSlotResponseSchema/timeSlotMapper

apps/web/tests/scheduling/
└── (extend planning-cycles-table-view.spec.ts and/or us1-admin-plan.spec.ts)  # header chips, timezone
                                   toggle re-render, draft-cycle delete/edit, locked-cycle no-affordance
```

**Structure Decision**: Full-stack change entirely inside already-established directories from specs 013/017/018/019 — `apps/web/src/features/scheduling/components/planning-admin/` (frontend) and `apps/server/src/{domain,application,api}/` (backend). No new route files, no new top-level directories, no new package. The backend addition is deliberately the smallest indirection needed: it reuses spec 013's already-shipped `TimeSlot` entity and `ITimeSlotRepository` rather than building a parallel persistence path.

## Complexity Tracking

*No violations — table not needed.*
