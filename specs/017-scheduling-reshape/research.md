# Phase 0 Research: Scheduling Reshape

All major architectural decisions were pre-agreed in [ADR 0001](../../docs/adr/0001-church-owned-events-and-planning-cycles.md), [ADR 0002](../../docs/adr/0002-church-timeslots-ministry-shifts.md), [CONTEXT.md](../../CONTEXT.md), and the 2026-07-02 grilling captured in [refinement-02-scheduling-reshape.md](../../manual-planning/0001-volunteer-scheduling/refinement-02-scheduling-reshape.md). This file resolves the residual `NEEDS CLARIFICATION` items and records the deltas from the existing 016 code.

## Resolved decisions

### R1 — Cycle boundary evaluation is date-only in church timezone

- **Decision**: Store `PlanningCycle.startDate`/`endDate` and `Event.startDate` as timestamps but evaluate cycle membership and overlap on the **date part only**, resolved in the church's single timezone. An event's owning cycle is the one whose date range contains the event's **start date** (hour ignored); a multi-day event may leak past the cycle's end.
- **Rationale**: FR-003, edge cases in spec (`23:00 last-day` event still belongs to the period). Church has one timezone (Assumption).
- **Alternatives rejected**: UTC-only comparison (breaks near midnight for non-UTC churches); per-event timezone (no requirement, adds complexity).
- **Reuse**: existing `DateRange` VO (`contains`, `overlaps`) already models this; feed it date-truncated values.

### R2 — Cycle non-overlap enforced at two levels

- **Decision**: Enforce "no overlapping cycles per church" as (a) a domain check in `PlanningCycleManager.createCycle` querying existing ranges via `DateRange.overlaps`, and (b) a DB-level guard. Postgres exclusion constraints on date ranges are the robust option (`EXCLUDE USING gist (church_id WITH =, daterange(start,end) WITH &&)`), but require the `btree_gist` extension.
- **Rationale**: FR-002, SC-005 ("No two Planning Cycles ever overlap"). Domain check gives friendly errors; DB constraint is the last line of defence against races.
- **Open for tasks**: if `btree_gist` is undesirable, fall back to a serialized transaction + domain check only. Default: attempt the exclusion constraint; document the extension in the migration.

### R3 — Slot involvement stored as inclusions (opt-in rows), not a flag on TimeSlot

- **Decision**: A `participation_slot_inclusion` row (participationId, timeSlotId) means "this ministry serves this slot". Absence = not serving. Seeded at cycle generation from the `MinistryServingProfile`; leader confirms/adds/removes.
- **Rationale**: FR-012, ADR 0001. Keeps `TimeSlot` church-level and identical for all ministries; per-ministry state never mutates the shared slot.
- **Alternatives rejected**: boolean on a per-ministry copy of the slot (duplicates church data, breaks single-source-of-truth for times).

### R4 — Shift is always present; default = whole slot

- **Decision**: Every included `TimeSlot` has ≥1 `Shift` within a participation. No explicit split ⇒ one `Shift` equal to the slot bounds. `SlotRequirement`, `Assignment`, and `Availability` marks attach to a `Shift` only — never a bare `TimeSlot`.
- **Rationale**: ADR 0002, FR-014/FR-015. Removes the "requirement on slot vs shift" ambiguity; two ministries split the same slot independently.
- **Invariant**: `slot.startTime <= shift.startTime < shift.endTime <= slot.endTime` — domain guard + DB `CHECK` + form guard.
- **Creation strategies**: equal-division-into-N (span/N) and manual (unequal allowed). The richer manual UX (timeline drag / fine picker) is **BL-010**, deferred; MVP ships equal-N + manual-times form.

### R5 — AvailabilityCheck keyed to (cycle, membership); Availability = unavailability mark

- **Decision**: Firing availability (participation `tailoring → availability_fired`) spawns one `AvailabilityCheck` per active `(PlanningCycle, MinistryVolunteer membership)` in `pending`. Volunteer is **available by default**; an `Availability` record is now an **unavailability** exception hung off a check, atom = one `Shift` (whole-day helper marks every shift on a date). A confirm gate flips `pending → confirmed` with `confirmedAt` even with zero marks.
- **Rationale**: FR-017/018/019, CONTEXT.md. A volunteer in two ministries gets two checks.
- **Delta from 016**: existing `Availability` is a free-span `available|unavailable` record keyed to `eventId` with `isAllDay`/`repeatRule`. Reshape: drop `eventId`/`type`/`repeatRule` free-span framing; add `availabilityCheckId` + `shiftId`; the record's existence means "unavailable for this shift".

### R6 — Two independent overlap controls

- **Decision**: (1) **Availability-confirm overlap** — on volunteer confirm, detect same-date shift-time intersections across the volunteer's *other* ministries; global Unleash flag `VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE` decides block-until-dropped vs allow-and-flag. (2) **Assignment overlap** — on assign, per-ministry `enforcementType` (soft warn / hard block) with an audited override (reason + authorization) reusing the existing assignment-audit trail.
- **Rationale**: FR-020, FR-023, refinement decision 12. The two moments are independent; overlap = `Shift` time-intersection on the same date.
- **Reuse**: existing conflict domain service (`domain/conflict`) and `assignment-audit` entity.

### R7 — Two publishes, Event never "published"

- **Decision**: Cycle-lock (`PlanningCycle draft → locked`, ChurchAdmin) is distinct from roster-publish (`MinistryParticipation rostering → published`, leader). `Event.status` = `draft | scheduled | cancelled | past`; on cycle-lock its events become `scheduled`. There is no `published` event status.
- **Rationale**: FR-005, FR-024/025/026, refinement decision 11.
- **Delta from 016**: current `event_status` enum is `draft | published | cancelled` (+ `past` in the entity but not the DB enum). Reshape: enum → `draft | scheduled | cancelled | past`; remove `Event.publish()`, add lock-driven `markScheduled()`. Publishing moves onto `MinistryParticipation`.

### R8 — Notifications scoped per PlanningCycle

- **Decision**: Base kinds — availability reminder (leader-**resendable**) and schedule-published — scoped to a cycle, not a slot/event. Late-dropout alert to the leader is the inverse direction.
- **Rationale**: FR-027, refinement decision 13.
- **Delta from 016**: `volunteer_notification` currently keys per event/assignment; add cycle scope and the resend action. Cooldown on resend is **BL-005**, deferred.

### R9 — RoleTemplate removed

- **Decision**: Delete `RoleTemplate`/`RoleTemplateItem` entity, schema, repo, mapper, manager methods, DTOs, and the `applyRoleTemplate` route. Recurring counts come from `MinistryServingProfile`; dynamic-event counts from copying a profile block or manual entry.
- **Rationale**: refinement decision 14, BL-009 (deferred, may return as a per-`Shift` `SlotRequirement` preset).
- **Impact**: `IRoleManager` loses `listTemplates/upsertTemplate/applyTemplate/deleteTemplate`; DI + controller routes drop; 016 migration-map role-template endpoints are retired.

### R10 — Participation default direction: three tiers

- **Decision**: Seeding opt-in is decided by global default (Unleash `PARTICIPATION_DEFAULT_ALL_IN`) → ministry `defaultDirection` (`all_in | all_out`) → leader manual per-slot. Narrowest tier wins. `defaultDirection` is a ministry setting, not a template concept; the `MinistryServingProfile` is an orthogonal pre-fill helper.
- **Rationale**: FR-013, CONTEXT.md (Ministry), refinement decision 6.
- **Delta from 016**: add `ministry.default_direction` enum column.

### R11 — Greenfield reset, no migration

- **Decision**: Ship as a fresh schema (drop/recreate scheduling tables) with updated seed factories; no data migration.
- **Rationale**: spec Assumption "Greenfield data"; refinement decision (94/94 016 tasks done, no prod scheduling data).

## Deferred / out of scope (tracked)

- **BL-008** MinistryServingProfile authoring UX polish (preview, bulk, per-team presets) — MVP ships the plain serve-toggle + counts matrix.
- **BL-009** Free-standing role-count presets (ex-RoleTemplate).
- **BL-010** Shift convenience refinements (reusable layouts, cross-ministry visibility) + manual-shift UX design question. Availability spanning partial shifts is **rejected**, not deferred.
- **BL-005** Reminder resend cooldown.
- **BL-002/003/006** re-mapped to 017 entities; BL-006 expected to close (team attribution native via participation).

## Reference implementation patterns (from existing code)

- **Branded IDs**: `type XId = BrandedId<'XId'>` + `namespace XId { from(raw) }` (see `branded-ids/event-id.ts`).
- **Entities**: extend `Entity<Props, Id>` from `@church/core`; constructor validates invariants and throws domain errors; `LooseProps` for optional-with-default fields (see `entities/event.ts`).
- **Value objects**: private ctor + static `create()` throwing domain errors (see `value-objects/date-range.ts`).
- **Managers**: interface in `domain/contracts/application`, `Db*Manager` in `application/`, single named-object inputs (see `contracts/application/event-manager.ts`).
- **Repos**: interface in `domain/contracts/infrastructure`, `drizzle-*` impl in `infrastructure/repositories`, mapper in `infrastructure/mappers`, contract test in `domain/contracts/contract-tests`.
- **Schema**: `pgTable` with `churchId` FK cascade, `check()` for range invariants, enums in `schema/enums.ts` (see `schema/scheduling.ts`).
