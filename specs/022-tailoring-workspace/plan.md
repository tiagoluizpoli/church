# Implementation Plan: Tailoring Workspace Reorganization

**Branch**: `022-tailoring-workspace` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/022-tailoring-workspace/spec.md`

## Summary

Replace the flat, single-page, desktop-only `participation-tailoring.tsx` with a three-level, URL-addressable flow — ministry list → cycle list (scoped to that ministry, auto-advancing when only one cycle is open, R7) → tailoring workspace (ministry+cycle) — matching the existing `planning-cycles` nested-route convention. The tailoring workspace adds a bounded calendar built on the shadcn range-picker variant, using three distinct visual layers (fixed cycle-bounds band, event-day dot markers, and a ring/outline day-filter — never the solid "committed date" fill used elsewhere, R3), plus client-side name/time-of-day filters, on top of a flat, day-grouped slot list (`tailoring-slot-list.tsx`, which fully replaces the old nested-card `ParticipationEventCard` rendering, R2) for slot-inclusion, shift-split, and headcount editing. The workspace also guards unsaved edits with a navigation-blocking confirm (R8). No backend changes: existing mutation shapes (`setParticipationInclusions`, `splitParticipationShifts`, headcount upsert, `fireAvailability`) are reused verbatim; the "one notification per save" requirement is already satisfied server-side via the `(planningCycleId, ministryVolunteerId)` uniqueness on `AvailabilityCheck` (see research.md R4) — the fix is frontend orchestration (one user-facing save action calling `fireAvailability` per touched participation), not a new bulk endpoint. This feature also fixes a pre-existing, unrelated design-system bug (`surface-panel`'s resting box-shadow, R9) so new cards don't inherit it. One data-model note (not a migration) is recorded for a future feature: distinguishing "self-reported unavailable" from "claimed by another ministry" does not exist in the domain today and should be derived at query time, not stored (research.md R6).

**Design critique**: This plan went through an `/impeccable` pre-build critique (`.impeccable/critique/2026-07-11T21-00-35Z__kspace-tailoring-workspace-redesign-plan-pre-build.md`, score 19/40 pre-fixes) before implementation. All 2 P0s, both P1s, and the actionable P2 were resolved into R3/R2/R7/R8/R9 above per explicit user decisions; see that file for the full report.

**Iteration 2 (2026-07-12)**: A post-build `/impeccable critique` of the shipped workspace (`.impeccable/critique/2026-07-12T22-24-28Z__apps-web-src-routes-scheduling-tailoring.md`, score 20/40) drove a first polish pass (per-row pending-state scoping, collapsible slot rows, button-color restraint — already shipped, not part of this amendment). Separately, direct user feedback then requested further changes to the *shape* of the workspace, decided and recorded in [`iteration-2-filters-and-row-save.md`](./iteration-2-filters-and-row-save.md) and then corrected/expanded during `/speckit-clarify` (2026-07-12, see spec.md's `## Clarifications`): (1) replace the R3 month-grid calendar with a horizontally-scrollable day strip supporting drag/swipe/chevron/keyboard-arrow navigation, and move the filter row from a vertical sidebar to a horizontal row beneath it (R11); (2) split the current three per-slot mutations into **three independent tiers, not one combined save** — Serving still autosaves instantly, split persists via its own dirty-gated "Save split" action, and headcounts persist via one "Save headcounts" action per slot covering every role across every shift (not per-shift as today), with per-call partial-failure isolation and a validation gate blocking the headcount save alone (R12/R12a); (3) the split and headcount fields adopt `@tanstack/react-form` + `zod`, already-used dependencies, reusing existing validation logic as the schema (R14). See research.md R11–R14 for the mechanism-level decisions and data-model.md's frontend-only-aggregates section for the corrected per-slot dirty-state shapes. Not yet implemented — see tasks.md Phase 8.

**Iteration 3 (2026-07-13)**: User Story 2's cycle list (`ministry-cycle-list.tsx`) gets real Name/Window/Events/Slots/Status columns, a leader-facing tailoring-progress status (`Not started`/`In progress`/`Published`, aggregated from `MinistryParticipation.state`/new `touchedAt` field — R15/R16, resolving a real domain-model contradiction found while drafting this iteration, not just a UI gap), date-range/involvement/status filters, filter-aware Events/Slots header pills, a padding-token fix bringing the cycle-list `Card` onto the same `workspace-panel-lg` token the page header already uses, and row-level Tailoring/Builder-Events navigation buttons (the latter disabled until availability has fired for every participation in the cycle). Full decision record: [`iteration-3-cycle-list-status-nav.md`](./iteration-3-cycle-list-status-nav.md) and research.md R15–R16. **Unlike Iterations 1–2, this is not frontend-only**: it adds a nullable `touchedAt` column to `ministry_participation` (one migration) and one new batched aggregation endpoint on `LeaderController` (see data-model.md's "New in Iteration 3" section) so the cycle list's per-cycle status/slot data is fetched in one request per page load rather than one per visible row. **Post-`/speckit-analyze` correction (2026-07-13, findings I1/I2)**: the endpoint returns *every* locked cycle church-wide (not only cycles the ministry already participates in), each row carrying an explicit `isPartOf` boolean — this is what actually makes the Ministry Involvement filter's "Not part of" value possible, which the first draft of this iteration could not support (its endpoint only ever returned ministry-inclusive rows). The endpoint also now carries `name`/`startDate`/`endDate`, becoming the *sole* data source for this route — it fully replaces the existing `listEvents`/`listPlanningCycles` calls this route made before Iteration 3, closing the gap where FR-032's "one batched request" guarantee didn't actually cover FR-028's data. Not yet implemented — see tasks.md Phase 9.

## Technical Context

**Language/Version**: TypeScript, React 19

**Primary Dependencies**: TanStack Router (file-based routing), shadcn/ui + Tailwind CSS v4, `react-day-picker` (via existing `components/ui/calendar.tsx`), TanStack Query, orval-generated `adminApi` client

**Storage**: PostgreSQL via Drizzle ORM (`packages/db`) — no schema changes for Iterations 1–2; Iteration 3 adds one nullable column (`ministry_participation.touched_at`, see data-model.md)

**Testing**: Vitest + React Testing Library (component/interaction), Playwright (E2E), per constitution Quality Gates

**Target Platform**: Web (responsive: desktop table / mobile card parity, per existing `cycle-list-card.tsx` pattern)

**Project Type**: Web application (monorepo: `apps/web` frontend, `apps/server` backend, `packages/db` shared schema) — Iterations 1–2 touch `apps/web` only; Iteration 3 additionally touches `apps/server` and `packages/db` (see data-model.md's "New in Iteration 3" section)

**Performance Goals**: Calendar/filter interactions must feel instant — no network round-trip for day-click, name, or time-of-day filtering (SC-002); all filtering operates on already-fetched data

**Constraints**: Reuse existing mutation payload shapes and validation (`validateManualSpans`) unchanged; route structure must follow the `planning-cycles` layout+index+`$id` nesting convention. *Iterations 1–2*: no new backend endpoints. *Iteration 3*: exactly one new backend endpoint permitted (the batched cycle-summary read, data-model.md), scoped to a read-only aggregation — no new endpoint may be added beyond it without a further amendment.

**Scale/Scope**: 3 new/restructured route levels, ~6 extracted/new components, 0 schema migrations, 1 documented (not implemented) future data-model note. *Iteration 2 adds*: 0 new route levels, 3 modified components (`tailoring-calendar.tsx`, `tailoring-filters.tsx`, `tailoring-slot-list.tsx`) + the `$cycleId.tsx` route's mutation-orchestration logic, 0 schema migrations, 0 new backend endpoints. *Iteration 3 adds*: 0 new route levels, 1 modified component (`ministry-cycle-list.tsx`) + the `$ministryId/index.tsx` route's data-fetch/filter logic, 1 schema migration (1 nullable column), 1 new backend endpoint, corresponding domain/application/infrastructure-layer changes in `apps/server` (see data-model.md).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Domain-First Architecture | Feature reuses the already-specified Spec 017 domain (`MinistryParticipation`, `TimeSlot`, `Shift`, `AvailabilityCheck`); traversed `manual-planning/0001-volunteer-scheduling/specifications-list.md`, `ministry-tailoring-flow.md`, ADR 0001/0002, and `CONTEXT.md` glossary before writing this plan, per Principle VI (Maximum Context) | PASS |
| II. Full-Stack Type Safety | No new API surface; continues using orval-generated `adminApi` types. No `any`/`unknown` introduced | PASS |
| III. Container-Ready Infrastructure | No infra changes | PASS (N/A) |
| IV. Environment Discipline | No env var changes | PASS (N/A) |
| V. Automated Code Standards | Biome/Lefthook gates apply as normal; no exemptions requested | PASS |
| VI. Maximum Context Specification | See row I — traversed linked docs before finalizing spec/plan. *Re-checked for Iteration 3, see "Iteration 3 re-check" below* | PASS |
| VII. Explicit Parameter Contracts | New components/hooks introduced by this feature (calendar day-marker builder, client-side filter predicates, ministry-list aggregate view-model) will use named `interface`/`type` object parameters, no inline object typing, per constitution | PASS (enforced during implementation, verified at `/speckit-implement` + review) |
| Phase 5 Mandatory Frontend Rule (Strict shadcn/ui Adherence) | Calendar built on the shadcn range-picker variant of `components/ui/calendar.tsx` (react-day-picker), not a from-scratch component (research.md R3, revised post-critique); `ManualSplitEditor`'s rewritten DOM uses shadcn `Select`; all other controls (checkboxes, inputs, cards, tables) reuse existing shadcn primitives | PASS |

No violations — Complexity Tracking section omitted.

**Iteration 2 re-check**: The day strip (R11) has no existing shadcn/registry component to extend — checked `@shadcn`/`@intentui` registries during shape/planning; no first-party "horizontal date strip with drag-scroll" primitive exists. This is not a Phase 5 rule violation (the rule requires reusing an existing component *where one exists* and making minimal modifications, not inventing one where none does), but it must still compose existing shadcn primitives (e.g., `Button` for the chevrons) rather than being built as an opaque one-off — **resolved via `/impeccable shape` (2026-07-12)**: hand-rolled pointer events (no new dependency), free momentum scroll (no snap), day strip + filters sticky at the workspace top; see research.md R11 for the full decision. The strip's keyboard arrow-key navigation (FR-020a, added during clarification) should follow the same roving-tabindex pattern `react-day-picker` already uses in the calendar it replaces, not a novel focus-management approach. The Serving/Not-serving toggle (R12a) MUST use the existing shadcn `Checkbox` or a `Button`-group two-state pattern already in the design system, not a new raw control — this directly fixes a previously-flagged accessibility gap (raw `<input type="checkbox">`), so reintroducing a non-shadcn control here would be a regression, not just a missed opportunity. **Form library (R14, added during clarification)**: the split and headcount fields use `@tanstack/react-form` + `zod`, both already project dependencies (`sign-in-form.tsx`/`sign-up-form.tsx` are the existing precedent) — this satisfies "reuse what's there" the same way the shadcn checks above do; it is not a new dependency decision and does not need a separate approval. Principle VII (Explicit Parameter Contracts) applies to all new/modified functions in this iteration the same as row I/VII above — in particular the corrected per-slot dirty-state tracking (two independent flags, not one) and the split/headcount save orchestration (two independent actions, not one combined row save — see R12's correction note).

**Iteration 3 re-check**: Unlike Iterations 1–2, this iteration adds real backend surface, so Principle II (Full-Stack Type Safety) is re-checked, not just assumed N/A: the new endpoint follows the existing `LeaderController`/Fastify/Zod-schema pattern (`leader-controller.ts`'s `getCycleParticipation` is the direct precedent — RBAC guard via `SchedulingRbacGuard.canManageMinistry`, typed request/response schemas, no `any`), and the frontend consumes it through the same orval-generated-client regeneration flow every other endpoint in this app already goes through — no hand-maintained type duplication. Principle I (Domain-First Architecture) is also re-checked: the new `touchedAt` field and its `touch()`-style method live on the existing `MinistryParticipation` domain entity, not bolted on at the infrastructure layer, and the new aggregation query is an application-layer manager method, not a raw query embedded in the controller. Principle VII (Explicit Parameter Contracts) applies across all four backend layers this iteration touches (domain, application, infrastructure, API), the same as every other principle-VII row in this table — named input/output types, no inline object typing, for every new/modified function including the repository's new aggregation query, the manager method, and the controller route handler. **Principle VI (Maximum Context Specification) — re-checked (2026-07-13, post-`/speckit-analyze`, finding C1)**: traversed `manual-planning/0001-volunteer-scheduling/specifications-list.md`'s linked `specifications/R2-drizzle-repos.md` before finalizing this iteration's backend design. Real, applicable rules found and folded into Phase 9's tasks: (1) every new query MUST include `withChurchIsolation`-style church-scoping (already this repo's established helper, reused, not reinvented — see T076); (2) prefer Drizzle's relational query API for readability where it fits, though the new aggregation's multi-table grouped-count shape needs explicit `db.select()`/joins, which R2 permits ("where possible", not absolute); (3) `db.transaction()` is required only for complex *write* operations — not applicable, this endpoint is read-only; (4) **Testing Requirements are mandatory, not optional**: integration tests against a real PostgreSQL instance (via Docker), including a two-church (A/B) isolation test verifying church A's repository call cannot see church B's rows — this is a real, previously-uncaptured gap, now T063a (see tasks.md). This supersedes the earlier Iteration 1 precedent (T029/T030's deviation note) of using mocked tests instead of live-DB integration tests — that deviation was specifically about not wanting to seed/mutate the *shared dev* database; R2's mandate is a *dedicated* Dockerized test Postgres instance, a different, lower-risk target, and this is the feature's first backend code, where R2's constitution mandate actually applies for the first time. No violations identified during planning; the "one new endpoint only" boundary in Technical Context's Constraints exists specifically so this doesn't expand into a second backend change unrelated to the cycle-list summary.

## Project Structure

### Documentation (this feature)

```text
specs/022-tailoring-workspace/
├── plan.md              # This file
├── research.md           # Phase 0 output (R1-R10 original; R11-R14 Iteration 2, R12 corrected + R14 added during /speckit-clarify)
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── tasks.md              # Phase 2 output (Phase 8 = Iteration 2 tasks, not yet started; Phase 9 = Iteration 3 tasks, not yet started)
├── iteration-2-filters-and-row-save.md  # Iteration 2 decision record (2026-07-12)
└── iteration-3-cycle-list-status-nav.md # Iteration 3 decision record (2026-07-13)
```

No `contracts/` directory for Iterations 1–2: those introduce no new API contracts (all mutations reuse existing orval-generated `adminApi` functions unchanged). **Iteration 3 introduces exactly one new API contract** (the batched cycle-summary endpoint, data-model.md's "New in Iteration 3" section) — its request/response Zod schemas live in `apps/server/src/api/dtos/participation.dto.ts` alongside the existing tailoring DTOs, following that file's existing pattern rather than a new `contracts/` directory.

### Source Code (repository root)

```text
apps/web/src/
├── routes/scheduling/
│   ├── tailoring.tsx                          # CHANGED: becomes a layout route (outlet only)
│   └── tailoring/
│       ├── index.tsx                          # NEW: Story 1 — ministry list
│       └── $ministryId.tsx                    # NEW: layout route (outlet only)
│           └── $ministryId/
│               ├── index.tsx                  # NEW: Story 2 — cycle list for one ministry
│               └── $cycleId.tsx                # NEW: Story 3+4 — tailoring workspace
│
├── features/scheduling/components/
│   ├── participation-tailoring.tsx             # CHANGED: reduced to orchestration only, or removed once split
│   ├── participation-tailoring.utils.ts        # CHANGED: extended with calendar/filter pure helpers, existing exports untouched
│   ├── tailoring/
│   │   ├── ministry-tailoring-list.tsx         # NEW: Story 1 table/card list
│   │   ├── ministry-cycle-list.tsx             # NEW: Story 2 cycle picker (route auto-advances past this when only 1 cycle open, R7)
│   │   ├── tailoring-calendar.tsx              # SHIPPED as range-picker-based month grid (R3); ITERATION 2: rebuilt as a horizontally-scrollable day strip with drag/swipe/chevron/keyboard-arrow navigation (R11, FR-020a)  — same fixed cycle-bounds band + event-day dots + ring-style day-filter signifiers, new container/interaction only
│   │   ├── tailoring-filters.tsx               # SHIPPED as a vertical-sidebar-column control group; ITERATION 2: moved to a horizontal row directly beneath the day strip (R11), same name/time-of-day filter logic
│   │   ├── tailoring-slot-list.tsx             # SHIPPED as flat, day-grouped slot list, fully replacing ParticipationEventCard's rendering role (R2), no card-in-card; ITERATION 2: inclusion checkbox becomes an explicit Serving/Not-serving toggle (R12a); per-shift "Save headcounts" buttons collapse into ONE per-slot headcount save spanning all shifts, with per-call partial-failure isolation (R12, FR-022b); headcount fields migrate to @tanstack/react-form + zod (R14) — split saving itself does NOT move here, it stays with ManualSplitEditor below
│   │   └── manual-split-editor.tsx             # EXTRACTED from participation-tailoring.tsx: validation/payload logic unchanged, DOM rewritten to shadcn Select + touch-sized inputs (R2); ITERATION 2: its own "Save split" action becomes dirty-gated (disabled until the form differs from last-saved) instead of always-enabled, and its fields migrate to @tanstack/react-form + zod reusing validateManualSpans as the schema's validation logic (R14) — stays fully independent from the headcount save in tailoring-slot-list.tsx
│   └── planning-admin/cycle-list-card.tsx      # REFERENCE ONLY: responsive pattern reused, not modified (also the visual/column reference for Iteration 3's ministry-cycle-list.tsx rework)
│
├── components/ui/calendar.tsx                  # REFERENCE ONLY: range-picker variant extended, not modified
└── index.css                                   # CHANGED: remove resting box-shadow from `.surface-panel` (R9)
```

**Iteration 3 additions** (frontend):

```text
apps/web/src/
├── routes/scheduling/tailoring/$ministryId/
│   └── index.tsx                               # CHANGED: the new batched cycle-summary endpoint REPLACES the existing listEvents/listPlanningCycles calls entirely (post-analyze correction I1/I2 — one request, full data, including isPartOf=false rows); the single-cycle auto-redirect check (T017, Phase 4) is recomputed as `rows.filter(r => r.isPartOf).length === 1`; add date-range/involvement/status filter state; header pills become filter-aware
├── features/scheduling/components/
│   ├── participation-tailoring.utils.ts        # CHANGED: buildCycleOptions's events-derived shape is replaced outright (not extended) by the new endpoint's per-cycle response — no more client-side join against separately-fetched events/cycles for this route (data-model.md "New in Iteration 3")
│   └── tailoring/ministry-cycle-list.tsx        # CHANGED: Status column sources the new aggregated status (not PlanningCycle.state); new Slots column; new filter controls; new Events/Slots header pills; Card padding moves onto workspace-panel-lg; new per-row Tailoring/Builder-Events action column
└── infrastructure/api/                          # CHANGED: orval-regenerated client picks up the new endpoint — do not hand-edit generated files
```

**Iteration 3 additions** (backend — new for this feature; `apps/server`/`packages/db` were untouched by Iterations 1–2):

```text
packages/db/src/schema/participation.ts          # CHANGED: ministryParticipation gains touchedAt (nullable timestamp)
packages/db/src/migrations/                      # NEW: one migration file (drizzle-kit generate)

apps/server/src/
├── domain/entities/ministry-participation.ts    # CHANGED: touchedAt prop/getter + touch()-style method
├── domain/contracts/
│   ├── infrastructure/ministry-participation.repository.ts  # CHANGED: new aggregation query input/output types
│   └── application/participation-manager.ts     # CHANGED: new manager method signature (cycle-summary read)
├── infrastructure/
│   ├── mappers/ministry-participation.mapper.ts  # CHANGED: map touchedAt
│   └── repositories/drizzle-ministry-participation.repository.ts  # CHANGED: set touchedAt on first write; new aggregation query starting from ALL church-locked planning_cycle rows, LEFT JOIN event/ministry_participation/participation_slot_inclusion scoped to the given ministryId (so cycles the ministry has zero events in still appear, with isPartOf=false — post-analyze correction I1), church-isolated per R2
├── application/db-participation-manager.ts       # CHANGED: setInclusions/splitShifts/upsertRequirement call touch() once; new listMinistryCycleSummaries-style method
└── api/
    ├── dtos/participation.dto.ts                 # CHANGED: new response schema for the batch endpoint
    └── controllers/leader-controller.ts           # CHANGED: new route, following getCycleParticipation's existing RBAC/schema pattern
```

**Structure Decision**: Iterations 1–2 are a frontend-only change inside `apps/web`. Route tree follows the existing `planning-cycles` nested layout+index+`$id` convention one directory over (`scheduling/planning-cycles.tsx` → mirrored here as `scheduling/tailoring.tsx`). Components move from one monolithic file into a dedicated `features/scheduling/components/tailoring/` directory, consistent with how other multi-component scheduling sub-features (`planning-admin/`) are already organized. **Iteration 3 is the first exception**: it touches `apps/server` and `packages/db` as detailed above, following each layer's existing pattern (Drizzle schema/migration, domain entity, application manager, infrastructure repository/mapper, Fastify controller) rather than introducing a new architectural shape.

## Complexity Tracking

*No Constitution Check violations — section not applicable.*
