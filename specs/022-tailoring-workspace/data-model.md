# Phase 1 Data Model: Tailoring Workspace Reorganization

No schema migration ships with this feature (presentation-layer reorganization over existing entities, per spec Assumptions and constitution's Domain-First principle — the domain already models everything this feature needs except the FR-019 note in §6). Existing entities below are as-built in `packages/db/src/schema/`; this document records how the new UI reads/writes them, not new columns.

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

## 5. MinistryParticipation (existing — `participation.ts`)
- Fields relevant here: `id`, `ministryId`, `eventId`, `state` (`tailoring | availability_fired | rostering | published`).
- One per (Ministry, Event). The tailoring workspace's unit of "fire availability" (R4) — the workspace batches one `fireAvailability(participationId)` call per touched participation in the session, not one per slot/shift.

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
- **Calendar day-marker set**: `Set<ISODateString>` derived from fetched `Event` dates within the selected cycle's bounds. Recomputed client-side on data load, not persisted.
- **Client-side slot filters**: name substring match and start-time-of-day window, applied to already-fetched `TimeSlot`/`Event` data. No backend query parameters added by this feature (spec explicitly allows backend support to lag).
