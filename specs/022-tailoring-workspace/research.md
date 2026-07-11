# Phase 0 Research: Tailoring Workspace Reorganization

## R1: Route structure for ministry → cycle → tailoring

**Decision**: Replace flat `apps/web/src/routes/scheduling/tailoring.tsx` with a nested layout tree mirroring the existing `planning-cycles` convention:

```
routes/scheduling/tailoring.tsx                                  # layout route (outlet only)
routes/scheduling/tailoring/index.tsx                             # Story 1: ministry list
routes/scheduling/tailoring/$ministryId.tsx                       # layout route (outlet only)
routes/scheduling/tailoring/$ministryId/index.tsx                 # Story 2: cycle list for that ministry
routes/scheduling/tailoring/$ministryId/$cycleId.tsx               # Story 3+4: tailoring workspace
```

**Rationale**: Matches `routes/scheduling/planning-cycles.tsx` + `planning-cycles/index.tsx` + `planning-cycles/$cycleId.tsx` exactly — same TanStack Router file-based nesting pattern already used one level away in the same feature area. Keeps URL state (ministryId, cycleId) as route params, which the existing `participation-tailoring.tsx` currently holds as component state instead — this is the mechanical fix for "revisit this screen at any time" (FR-017): a bookmarkable/shareable URL replaces in-memory selection.

**Alternatives considered**: Keep the flat route and add ministry/cycle as query params — rejected because it breaks from the established nested-route precedent in the same codebase area and makes deep-linking to a specific ministry+cycle awkward (query params don't compose with router loaders/breadcrumbs as cleanly as path params here).

## R2: Extraction strategy for `participation-tailoring.tsx`

**Decision**: Split the current ~1000-line monolith by responsibility, preserving all existing mutation call sites and payload shapes verbatim:

- `ministry-tailoring-list.tsx` — Story 1 (table/card list), built on the responsive pattern in `cycle-list-card.tsx`.
- `ministry-cycle-list.tsx` — Story 2 (cycle picker scoped to one ministry).
- `tailoring-calendar.tsx` — new month-grid calendar with day markers and day-click filtering (see R3).
- `tailoring-filters.tsx` — name + time-of-day filter controls, operating client-side over already-fetched data.
- `tailoring-slot-list.tsx` — the compact, flat, day-grouped per-slot list. **Post-critique decision**: this component fully **replaces** `ParticipationEventCard`'s rendering role — it does not sit alongside it. The original plan named both a new compact list and an "extracted, unchanged" event card without saying which owned rendering; left unresolved, the current triple-nested-card structure (`Card` → `surface-subtle` slot row → `surface-panel` shift panel) would have survived underneath a cosmetically-compact wrapper. `ParticipationEventCard` is **not** extracted as a standalone file; its per-slot/per-shift *markup* is superseded by `tailoring-slot-list.tsx`'s flat, ring-bordered row structure (matching `cycle-list-card.tsx`'s pattern — no card-in-card). Only its non-visual logic (mutation call shapes, prop wiring to `setParticipationInclusions`/`splitParticipationShifts`) carries forward into the new component.
- `manual-split-editor.tsx` — extracted verbatim from its current inline definition at the bottom of `participation-tailoring.tsx` into its own file; internal logic (`validateManualSpans`, equal/manual strategy payloads) is **not** rewritten. Its DOM structure (native `<select>`, unsized number inputs) **is** rewritten to use shadcn `Select` and `touch`-sized inputs — only the validation/payload logic is verbatim, not the markup, per the pre-build critique's P2 finding that "reuse logic unchanged" was ambiguous about DOM structure too.
- `participation-tailoring.utils.ts` — kept as-is; extended only with pure helpers needed for calendar day-marker computation and client-side filtering (no changes to existing exports' signatures).

**Rationale**: The constitution's Domain-First / separation-of-concerns rule and the spec's own reuse constraint both push toward extraction-not-rewrite. Every existing mutation (`setParticipationInclusions`, `splitParticipationShifts`, `upsertShiftRequirement`, `fireAvailability`, `resendAvailabilityReminder`) keeps its current orval-generated signature; only the components calling them move.

**Alternatives considered**: Rewrite the tailoring form logic against a new state shape — rejected per explicit spec assumption ("existing slot-inclusion, shift-split, and headcount data and persistence behavior are reused as-is").

## R3: Month calendar with day markers — three-layer visual state (post-critique decision)

**Decision**: Build on `react-day-picker`'s **range** mode (already available via the shadcn range-picker block referenced by the user — https://ui.shadcn.com/docs/components/base/date-picker#range-picker), rendered inline/always-open (not inside a `Popover` trigger, unlike `DatePickerField`), with three visually distinct, simultaneous states so the calendar never overloads one signifier with two meanings:

1. **Cycle bounds (fixed, non-interactive)**: the cycle's `startDate`→`endDate` renders as the range-picker's soft "in-range" band (the muted background tint range-picker already uses for days between the two selected endpoints), applied permanently via a `disabled`-outside-range + always-on `modifiers.range_middle`/`range_start`/`range_end`-equivalent styling. The leader cannot drag or edit this — it is not a selection, it is a fixed structural marker of the cycle. Month navigation is bounded so the leader can never scroll outside `[startDate, endDate]`.
2. **Event-day marker (dot)**: unchanged from the original plan — a small dot on any day present in the `Set<ISODateString>` from `buildEventDayMarkers`, layered on top of the band.
3. **Active day-filter (interactive)**: clicking a marked day sets `selectedDate`; rendered as a **ring/outline** treatment, not a solid fill. Clicking again (or a "Clear filter" affordance) resets it. This is deliberately *not* the solid-primary-fill "committed date" style used by `DatePickerField`/event-creation elsewhere in the app — that signifier means "I have chosen and saved this date" system-wide, and reusing it here for a transient, reversible filter would mistrain leaders about what that fill means the next time they see a real date-picker (flagged as a P0 in the pre-build critique, `.impeccable/critique/2026-07-11T21-00-35Z__kspace-tailoring-workspace-redesign-plan-pre-build.md`).

**Rationale**: `react-day-picker`'s range mode already ships the two-tier "endpoint vs. in-range" visual vocabulary needed to separate "structural cycle boundary" from "user's active filter" without inventing new CSS from scratch — extending the existing shadcn range-picker block satisfies both the constitution's "Strict shadcn/ui Adherence" rule and the critique's consistency concern in one move. Building a bespoke calendar would have violated the "DO NOT CREATE IT FROM SCRATCH" rule; reusing a *different existing shadcn variant* (range vs. single) than originally planned is still "using what's there."

**Alternatives considered**: Single-day `modifiers.selected` styling (original plan) — rejected post-critique because it collides with the solid-fill "committed date" meaning used elsewhere. A completely custom `<table>`-based month grid — rejected as unnecessary reinvention. A third-party full calendar library — rejected, out of proportion and not an existing dependency.

## R4: "Fire once per save" — reconciling with the existing per-participation API

**Decision**: No backend change is required. Server-side dedup already exists: `AvailabilityCheck` rows are unique per `(planningCycleId, ministryVolunteerId)` (`packages/db/src/schema/availability-checks.ts`, unique index `availability_check_cycle_membership_idx`), and `DbAvailabilityCheckManager.fireAvailability` (`apps/server/src/application/db-availability-check-manager.ts:46-124`) only creates checks and sends notifications for memberships that don't already have one for that cycle. Calling `fireAvailability(participationId)` once per touched `MinistryParticipation` in the cycle therefore produces **exactly one** notification per volunteer for that cycle, regardless of how many events/participations are involved — the current per-participation API already satisfies the spec's notification-count requirement at the data layer.

The gap is purely in the frontend: today the leader must open each event's participation individually and click "fire" per event. The new tailoring workspace instead exposes **one** explicit "Save & request availability" action per ministry+cycle visit, which internally calls `fireAvailability` for every `MinistryParticipation` touched in that session (sequentially or in parallel), while presenting a single pending/success state to the leader. Each individual call still performs its own `tailoring → availability_fired` state transition (a real per-participation state machine step, per `ministry-participation.ts`), but the volunteer-facing effect is the single batched notification the spec requires.

**Rationale**: Avoids inventing a new bulk backend endpoint for a guarantee the system already provides; keeps the change scoped to presentation, matching Spec 018's precedent of shipping IA/workflow changes without new backend contracts where the domain already supports the desired behavior.

**Alternatives considered**: Add a new `POST /cycles/:cycleId/ministries/:ministryId/fire-availability` bulk endpoint — deferred; would be a nice-to-have simplification of the frontend orchestration but is not required to meet SC-004, and the spec's governance explicitly scopes backend enforcement work as something that "can lag frontend." Revisit only if per-call overhead becomes a measured problem.

## R5: Ministry-list zero-state vs. `defaultDirection: 'all_in'` ministries

**Decision**: Display actual counts always — do not special-case a forced "0" for any ministry. Most ministries default to `defaultDirection: 'all_out'` (schema default, `packages/db/src/schema/core.ts`), which is why the spec's "starts at zero" framing holds for the common case. But a ministry configured `all_in`, or one with an applicable `MinistryServingProfile` standing rule, will have inclusions **pre-seeded** the moment a cycle's events are generated (per `CONTEXT.md`'s `MinistryParticipation` and `MinistryServingProfile` glossary entries) — before the leader has manually touched anything. In that case the ministry list correctly shows non-zero counts on first visit, which is accurate, not a bug.

**Rationale**: The spec's own event/slot counts (FR-002, FR-003) are defined as reflecting real participation state, not "has the leader manually acted." Silently forcing zero for untouched-but-pre-seeded ministries would misrepresent already-committed standing coverage.

**Note for spec**: This refines (does not contradict) spec Assumption 1 — recorded here rather than as a spec edit since it's a clarification of "actual counts," not a new requirement.

## R6: Claimed-elsewhere vs. self-reported-unavailable (FR-019)

**Decision**: This distinction does not exist anywhere in the current domain model, ADRs, or `manual-planning` refinement docs — confirmed by search across `CONTEXT.md`, ADR 0001/0002, and `refinement-02-scheduling-reshape.md`. It is genuinely new domain surface, not a rediscovery of existing behavior.

Minimal schema note (no implementation this feature, per spec's explicit deferral): the existing `Availability` entity (an unavailability mark hanging off an `AvailabilityCheck`, atomic to a `Shift` — `packages/db/src/schema/availability-checks.ts`) has no field capturing *why* a shift is unavailable to a given ministry beyond the volunteer's own mark. Representing "claimed by another ministry's published Assignment" requires either (a) a computed/derived state at query time (join against `Assignment` rows for the same volunteer at overlapping `Shift` times across other `MinistryParticipation`s) rather than a stored column, or (b) a new enum/state on a per-(ministry, volunteer, shift) view. Recommend (a) — derived, not stored — as the default direction for the future assignment-screen work, since "claimed" is inherently a function of the current state of *other* ministries' assignments and would go stale immediately if persisted as a static flag. This is documented in `data-model.md` as a **notes-only** entry; no migration is part of this feature's task list.

**Alternatives considered**: Add a stored `unavailability_reason` enum column now — rejected for this feature; write-now-for-later columns with no consuming code violate the "minimum code" / no-speculative-abstraction guidance, and the derived-vs-stored decision genuinely depends on the future assignment screen's query patterns, which aren't designed yet.

## R7: Single-cycle auto-advance (post-critique P1)

**Decision**: When a ministry has exactly one cycle currently open for tailoring, `routes/scheduling/tailoring/$ministryId/index.tsx` redirects directly to that cycle's `$cycleId` workspace instead of rendering a one-item picker. The cycle-list URL remains directly reachable (e.g. via back navigation) and renders normally whenever 2+ cycles are open.

**Rationale**: The pre-build critique (P1) flagged that FR-005/006 as originally written force every leader through a full-screen "choice" between zero real options, contradicting PRODUCT.md's framing of leaders working in short, repeat, between-service sessions. Auto-advancing removes a zero-value screen for the common case (most leaders manage few concurrently-open cycles per ministry) without removing the screen for the case where it's actually useful.

**Alternatives considered**: Always show the cycle list regardless of count — rejected, it's the exact friction the critique flagged; skip the cycle-list route entirely — rejected, it's still needed for the multi-cycle case and for deep-linking.

## R8: Unsaved-changes protection (post-critique P1)

**Decision**: The tailoring workspace route (`$ministryId/$cycleId.tsx`) tracks a dirty flag whenever any inclusion/split/headcount edit is made and not yet saved, and registers a navigation-blocking confirmation (TanStack Router's `useBlocker` or equivalent) so leaving the route — including closing the tab — prompts a "you have unsaved changes" confirmation before discarding. This is presentation-only; no local-storage draft persistence is added in this feature (that would be a larger, separate offline-drafts feature).

**Rationale**: The pre-build critique (P1) noted PRODUCT.md's own description of leaders working "in short sessions between other tasks" — an interruption (a call, a service starting) with zero unsaved-changes warning silently loses real work. A navigation-blocking confirm is the minimum viable fix; full draft persistence is out of scope for this feature per the "minimum code" guidance — it's a real but separable improvement to revisit if the confirm-on-exit proves insufficient in practice.

**Alternatives considered**: Full local-draft autosave — deferred, meaningfully larger scope (storage schema, conflict resolution with server state, staleness handling) than this feature's budget; no protection at all — rejected per the critique.

## R9: Fixing the pre-existing `.surface-panel` shadow (post-critique P2)

**Decision**: Remove the resting `box-shadow` from `.surface-panel` in `apps/web/src/index.css` (currently contradicts the design system's own documented "cards/panels never get a resting shadow, only a ring/border" rule) as part of this feature's implementation, since every new tailoring-workspace card is built on this primitive and would otherwise silently inherit the bug.

**Rationale**: This is a shared, app-wide primitive — fixing it here benefits every existing screen that uses `surface-panel`, not just the tailoring workspace, and removes the inheritance risk at its source rather than working around it locally. The change is a single CSS property removal, low risk, and directly enforces the design system's own written rule.

**Scope note**: Because `.surface-panel` is used outside this feature's screens too (any existing `Card` with `className="surface-panel"`), this fix has a blast radius slightly wider than specs/022's own surfaces. It is still a one-line, purely visual (shadow-removal) change with no behavioral risk — flagged here explicitly so it isn't a silent side effect buried in an unrelated task.

**Alternatives considered**: Leave it and let new tailoring cards inherit the same (buggy) look for pixel-consistency with the rest of the app today — rejected per explicit user decision; the design system's own rule is unambiguous and the fix is trivial.

## R10: Ministry-list data-fetch contract and "cycle set" definition (post-analyze C1/A1)

**Decision**: No new backend endpoint. Confirmed via codebase check: `listMinistries()` returns no counts (`apps/server/src/api/dtos/ministry.dto.ts:4-19`), and `getCycleParticipation` is single-cycle/single-ministry with no aggregate field (`apps/server/src/api/dtos/participation.dto.ts:52-60`) — so the /speckit-analyze report's C1 finding is real: no single call returns this. The resolved fetch algorithm, using only existing endpoints:

1. `adminApi.listMinistries()` → ministries the current leader leads/sub-leads.
2. `adminApi.listPlanningCycles({ state: 'locked' })` → **this is the authoritative "cycle set"**, resolving the A1 ambiguity between spec's singular "relevant cycle" (FR-002) and plural "concurrently open cycles" (Assumption 1): it is the **union of every church-wide cycle currently in `locked` state** (not "most recent"), matching `ministry-tailoring-flow.md`'s "Cycle locked → visible to leader" transition — a cycle stops being tailorable once `archived`, and `draft` cycles have no events yet regardless.
3. Per ministry: `adminApi.listEvents({ ministryId })` → events; group by `planningCycleId` via the existing `buildCycleOptions` helper (`participation-tailoring.utils.ts`), then intersect with the locked-cycle-id set from step 2. `eventCount` per (ministry, locked cycle) falls out of this grouping for free — no extra call.
4. Per (ministry, locked cycle) pair that has ≥1 event: `adminApi.getCycleParticipation(cycleId, { ministryId })` → sum `events[i].slots.length` for the slot-inclusion count.

**Call volume**: `1 + 1 + ministries + Σ(ministries × their locked-cycle count)`. For the realistic case (a leader manages a handful of ministries, and per `ministry-tailoring-flow.md` typically one cycle is locked/actively tailored at a time), this is a small, bounded number of calls for a landing page — acceptable without a new aggregate endpoint. If a future church regularly runs many concurrent locked cycles, revisit with a dedicated backend aggregate.

**Rationale**: Keeps the feature's "no backend changes" plan decision intact while giving C1 and A1 concrete, implementable answers instead of leaving both as open hedges that would have blocked T006/T012/T013.

**Alternatives considered**: A new `GET /admin/ministries/tailoring-summary`-style aggregate endpoint — would reduce call count to 2, but is out of scope for a frontend-reorganization feature per the plan's explicit "no new API surface" decision; revisit only if the N+1 pattern proves to be a real measured problem.
