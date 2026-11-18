# Phase 1 Data Model: Tailoring Workspace Reorganization

No schema migration ships with this feature (presentation-layer reorganization over existing entities, per spec Assumptions and constitution's Domain-First principle — the domain already models everything this feature needs except the FR-019 note in §6). Existing entities below are as-built in `packages/db/src/schema/`; this document records how the new UI reads/writes them, not new columns.

**Iteration 3 exception (2026-07-13)**: this "no migration" framing holds for Iterations 1–2 only. Iteration 3 adds one nullable column (§5 below) and one new backend endpoint (see "New in Iteration 3" section at the end of this document) — see research.md R15/R16 and `iteration-3-cycle-list-status-nav.md` for why.

## 1. Ministry (existing — `core.ts`)
- Fields relevant here: `id`, `name`, `defaultDirection` ('all_in' | 'all_out', default 'all_out'), `deletedAt`.
- New read: ministry-list screen aggregates, per ministry, the count of `MinistryParticipation` rows (events) and `ParticipationSlotInclusion` rows (slots) scoped to the active/relevant cycle(s). No new fields.

## 2. PlanningCycle (existing — `planning.ts`)
- Fields relevant here: `id`, `name`, `startDate`, `endDate`, `state`.
- Used to bound the calendar (R3) to `[startDate, endDate]` and to scope the cycle-list screen to cycles in a state the ministry may currently tailor.

## 3. Event (existing — `scheduling.ts`)
- Fields relevant here: `id`, `planningCycleId`, `title`, dates, `status`.
- Source of calendar day markers (any date with ≥1 `Event`) and the day-grouping in the slot list.

## 4. TimeSlot (existing — `scheduling.ts`)
- Fields relevant here: `id`, `eventId`, `startTime`, `endTime`, `label`.
- Church-level, identical across ministries (ADR 0002). Filtered by name/time-of-day (client-side) and by calendar day-click.

## 5. MinistryParticipation (existing — `participation.ts`; `touchedAt` new in Iteration 3)
- Fields relevant here: `id`, `ministryId`, `eventId`, `state` (`tailoring | availability_fired | rostering | published`).
- One per (Ministry, Event). The tailoring workspace's unit of "fire availability" (R4) — the workspace batches one `fireAvailability(participationId)` call per touched participation in the session, not one per slot/shift.
- **New in Iteration 3**: `touchedAt` — nullable `timestamp with time zone`, added to `packages/db/src/schema/participation.ts`'s `ministryParticipation` table. Set once, the first time any of `setInclusions`/`splitShifts`/`upsertRequirement` writes to this participation; never overwritten afterward. Backs the cycle-list "Not started" vs. "In progress" boundary (research.md R16). Domain entity (`apps/server/src/domain/entities/ministry-participation.ts`) gains a corresponding `touchedAt` prop/getter and a `touch()`-style method, called from the application-layer manager methods that already handle those three writes — no change to their existing external contracts/payload shapes.

## 6. ParticipationSlotInclusion (existing — `participation.ts`)
- Fields relevant here: `participationId`, `timeSlotId`.
- Presence of a row = ministry opted in to that slot for that event. Read for slot-count aggregation (Story 1) and inclusion-checkbox state (Story 3); written via existing `setParticipationInclusions` mutation — unchanged shape.

## 7. Shift (existing — `scheduling.ts`)
- Fields relevant here: `participationId`, `timeSlotId`, `startTime`, `endTime`, `label`.
- Default: one Shift spanning the full parent TimeSlot. Split via existing `splitParticipationShifts` mutation (`equal-n` or `manual` strategy) — unchanged shape and validation (`validateManualSpans`).

## 8. SlotRequirement (existing — `scheduling.ts`)
- Fields relevant here: `participationId`, `shiftId`, `roleId`, `teamId`, `requiredCount`.
- The per-shift headcount (FR-016). Written via the existing headcount-upsert mutation — unchanged shape.

## 9. AvailabilityCheck (existing — `availability-checks.ts`)
- Fields relevant here: `planningCycleId`, `ministryVolunteerId`, `state`, `confirmedAt`. Unique on `(planningCycleId, ministryVolunteerId)`.
- Not written directly by this feature's UI; created as a side effect of `fireAvailability` calls, deduplicated server-side (R4). No change.

## 10. Availability (existing — `availability-checks.ts`)
- An unavailability mark hanging off an `AvailabilityCheck`, atomic to a `Shift`.
- **Notes-only addition for this feature (no migration, no consuming UI)**: distinguishing "volunteer self-reported unavailable" from "unavailable because claimed by another ministry's published Assignment" is **not** representable today and is **not** added as a stored field by this feature (see research.md R6). Recommended direction for the future assignment screen: derive "claimed elsewhere" at query time by joining the volunteer's `Assignment` rows across other `MinistryParticipation`s for overlapping `Shift` times, rather than persisting a static reason column that could go stale. Flagged here so the future assignment-screen spec starts from this recommendation instead of rediscovering the question.

## Frontend-only aggregates (no persistence)

- **Ministry list row/card view-model**: `{ ministryId, ministryName, eventCount, slotCount }` — computed client-side per research.md R10's resolved fetch algorithm: `listMinistries()` + `listPlanningCycles({ state: 'locked' })` (the authoritative "cycle set") + per-ministry `listEvents({ ministryId })` grouped via `buildCycleOptions` for `eventCount`, + per (ministry, locked cycle) `getCycleParticipation` for `slotCount`. No new endpoint; not a new stored entity.
- **Day-strip marker set**: `Set<ISODateString>` derived from fetched `Event` dates within the selected cycle's bounds. Recomputed client-side on data load, not persisted. *(Renamed from "Calendar day-marker set" in Iteration 2 — same derivation, now feeding a horizontal strip instead of a month grid; see research.md R11.)*
- **Client-side slot filters**: name substring match and start-time-of-day window, applied to already-fetched `TimeSlot`/`Event` data. No backend query parameters added by this feature (spec explicitly allows backend support to lag).

### Added in Iteration 2 — per-slot edit state (no persistence), corrected during `/speckit-clarify`

**Correction note**: This section originally described one combined per-slot dirty flag feeding one combined row save. That was corrected during clarification (spec.md `## Clarifications`, first entry) — split and headcount are independent, each with their own pending state and their own save action. The shapes below reflect the corrected model.

- **Per-slot pending split state**: `{ timeSlotId, splitForm: SplitFormState | undefined }` — local component state holding a slot's uncommitted split-mode/shift-count selection. Already exists today as `splitForms` state in `$cycleId.tsx` (T027); Iteration 2 does not introduce a new state shape here, only changes *when* it's flushed to the server — via its own dirty-gated "Save split" action (research.md R12), not on every field change.
- **Per-slot pending headcount state**: `{ timeSlotId, headcountDrafts: Record<HeadcountKey, string> }` — local component state holding uncommitted per-role, per-shift headcount draft values, spanning *all* shifts in the slot (not one shift at a time). Already exists today as `headcountDrafts` state in `$cycleId.tsx` (T027); Iteration 2 changes *when* it's flushed — via one combined "Save headcounts" action per slot (research.md R12) covering every shift/role at once, replacing today's per-shift save button.
- **Per-slot split-dirty flag** and **per-slot headcount-dirty flag**: two independent `Set<TimeSlotId>` (or equivalent boolean-per-slot maps), tracking which slots have pending split state and which have pending headcount state differing from their last-saved values, respectively. New in Iteration 2, corrected to be two flags, not one. Session-scoped only, per iteration-2-filters-and-row-save.md Decision 2 (intent preserved by the correction) — explicitly not persisted to local storage or the server; lost on navigation/refresh by design, same as the existing `touchedParticipationIds` tracker's persistence boundary (R8). Each flag drives its own FR-023 unsaved-changes indicator and, via research.md R13, the extended navigation-blocking guard's `shouldBlockFn` (which now checks both flags across all slots, not one).
- **Per-call headcount-save result state**: *(new, added during clarification, backs FR-022b)* since the headcount save fires one persist call per (shift, role) pair with a changed value, the UI needs to track each call's outcome independently — e.g. `Record<HeadcountKey, 'pending' | 'saved' | 'error'>` — so a partial batch failure leaves only the failed keys retryable, without discarding or re-flagging keys that already succeeded. Session-scoped, not persisted, same boundary as the flags above.
- **No change** to `ParticipationSlotInclusion` (§6), `Shift` (§7), or `SlotRequirement` (§8) — Iteration 2 changes *when* these are written via their existing mutations, not their shape, not their meaning, and not the entities themselves. The Serving/Not-serving toggle (research.md R12a) still maps directly onto `ParticipationSlotInclusion` row presence/absence, exactly as the inclusion checkbox did.
- **Form-state library note** *(added during clarification, backs FR-027/research.md R14)*: the `splitForm` and `headcountDrafts` shapes above are the *data* this iteration touches; `@tanstack/react-form` + `zod` (research.md R14) governs how those fields are edited, validated, and marked dirty in `ManualSplitEditor` and `tailoring-slot-list.tsx` — it does not change the shapes themselves or introduce a new persisted entity.

## New in Iteration 3 — batched cycle-list summary endpoint (backend)

**Corrected 2026-07-13, post-`/speckit-analyze` (findings I1/I2)**: the first draft of this endpoint scoped its rows to "cycles the ministry has ≥1 event in," which made FR-033's "Not part of" filter value undata-backed (such cycles would never be returned) and left FR-028's Name/Window optionally un-batched (undermining FR-032). Both are corrected below by widening the query's scope and folding in the remaining columns — this is now the **sole** data source for the cycle-list route; it replaces the route's previous `listEvents`/`listPlanningCycles` calls entirely rather than supplementing them.

**New endpoint** (exact route/operationId decided during implementation, following the existing `LeaderController` pattern in `apps/server/src/api/controllers/leader-controller.ts` — e.g. `GET /leader/ministries/:ministryId/cycles-summary`): given a `ministryId` (and the caller's RBAC-checked church context, same guard pattern as `getCycleParticipation`), returns one row per **locked `PlanningCycle` church-wide** — not filtered to ministry-inclusive ones — each annotated with this ministry's participation data:

```
{
  cycleId,
  name,                 // PlanningCycle.name (folds in FR-028)
  startDate,
  endDate,               // PlanningCycle's own date span (folds in FR-028)
  isPartOf,              // boolean — eventCount > 0. Backs FR-033's
                          // Ministry Involvement filter, all three values
                          // (All / Part of / Not part of).
  eventCount,             // events the ministry participates in, this cycle
                          // — 0 when isPartOf is false
  slotCount,              // count of ParticipationSlotInclusion rows across
                          // every MinistryParticipation this ministry has
                          // in this cycle — not the event's total slot count;
                          // 0 when isPartOf is false
  status,                 // 'not_started' | 'in_progress' | 'published'
                          // (research.md R15/R16 aggregation rule);
                          // 'not_started' when isPartOf is false
  availabilityFiredForAll,  // boolean — every participation in this cycle
                             // has state !== 'tailoring'; explicitly FALSE
                             // (not vacuously true) when isPartOf is false
                             // or eventCount is 0 — see research.md R16's
                             // correction note. Backs FR-035's Builder
                             // Events unlock; NOT the same boundary as
                             // `status === 'published'`.
}
```

Computed server-side by a new application-layer method (proposed: `IParticipationManager.listMinistryCycleSummaries` or a small dedicated read-model service, decided during implementation) that starts from **every** `planning_cycle` row with `state = 'locked'` for the caller's church, `LEFT JOIN`s `event` (filtered to the given `ministryId`'s participation), `ministry_participation`, and `participation_slot_inclusion`, grouped per cycle, aggregating `state`/`touchedAt` per the R16 rule — with the `eventCount === 0` special case (`availabilityFiredForAll = false`, `status = 'not_started'`) applied explicitly before the "every participation" reduction, not left as an implicit vacuous-truth result over an empty array. Every query in this method carries the same `churchId`-scoping (`withChurchIsolation` helper) already used throughout `DrizzleMinistryParticipationRepository`, per constitution Principle VI / Spec R2's "Implicit Isolation" rule (confirmed via traversal, 2026-07-13). This is a new read path; it does not write anything and does not change any existing mutation's shape. No `db.transaction()` is needed (Spec R2 mandates transactions for complex *writes* only).

**Frontend consumption**: fully replaces `buildCycleOptions`'s current events-only derivation (`participation-tailoring.utils.ts`) and the route's existing `listEvents`/`listPlanningCycles` calls — this endpoint alone now sources every column in the cycle-list table (Name/Window/Events/Slots/Status) plus the Ministry Involvement filter and the Builder Events unlock signal. The single-cycle auto-redirect check (`$ministryId/index.tsx`, originally implemented in Phase 4/T017 against `listPlanningCycles`) is recomputed from this response as `rows.filter((row) => row.isPartOf).length === 1`.
