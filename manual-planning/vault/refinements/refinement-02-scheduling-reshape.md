# Refinement 02: Scheduling Reshape (Church-Owned Events, Planning Cycles, Shifts)

> Date: 2026-07-02 · Supersedes parts of the original `0001-volunteer-scheduling` model.
> Authoritative sources for this reshape: [`CONTEXT.md`](../../CONTEXT.md) (glossary),
> [`docs/adr/0001-church-owned-events-and-planning-cycles.md`](../../docs/adr/0001-church-owned-events-and-planning-cycles.md),
> [`docs/adr/0002-church-timeslots-ministry-shifts.md`](../../docs/adr/0002-church-timeslots-ministry-shifts.md),
> and the deferral log in [`BACKLOG.md`](./BACKLOG.md) (BL-008…BL-010 + the 017 reconciliation section).

## Context & Architectural Decision

The original model treated scheduling as **singular and ministry-owned**: each `Event` belonged to exactly one `Ministry` (`Event.ministryId`), things were planned one event at a time, and availability/publish were per-event. In practice a church plans a whole **period** at once; a single dated gathering (a Sunday service) is served by **many** ministries at once; and each ministry needs different slots and headcounts on that same shared date. The old model could not represent "one locked church date, many ministries tailoring it" as an invariant, and had no notion of recurring generation or a monthly package.

This refinement re-centres the model on a **church-owned calendar planned in cycles**, generated from **templates**, and **tailored per ministry**. It was produced by a grilling session on 2026-07-02 (questions Q1–Q11 + A/B/C). The 016 clean-architecture reshape is **complete** (94/94 tasks, tRPC removed, Fastify + DDD layers live), so this ships as a **new spec, 017**, built natively on that architecture. No production data exists — **greenfield schema reset**, no migration.

**Decisions:**

1. **Events are Church-owned.** Remove `Event.ministryId`. A shared `Event` carries the canonical dates/times; many ministries participate in it. (ADR 0001)
2. **`PlanningCycle`** — new church-scoped aggregate over an **arbitrary, non-overlapping date range** (week/month/quarter are UI presets over `startDate`/`endDate`; gaps between cycles allowed). Boundaries are **dates only**, resolved in the church timezone. An `Event` belongs to the cycle of its **start date** and may leak past that cycle's end. Lifecycle `draft → locked → archived` (auto-archive after `endDate`; append-only after lock).
3. **`ChurchAdmin`** — new **church-level** role (distinct from the ministry-scoped `leader`; one person may hold both). Drafts and locks cycles; owns the church calendar.
4. **`EventTemplate` + `TimeBlock`** — ChurchAdmin-configured recurring **single-day** weekday blueprint (services *and* weekly non-service gatherings). Applying it to a cycle creates one `Event` per matching date, one `TimeSlot` per `TimeBlock`. Each generated `TimeSlot` records `sourceTemplateBlockId`. Multi-day / one-off dynamic events are created **manually** (no template).
5. **`MinistryServingProfile`** — per-ministry standing rule layered on the admin's `EventTemplate`s. Per `TimeBlock` it records: whether the ministry serves it, how it splits it into `Shift`s, and headcount per `Shift`. On cycle generation it auto-seeds inclusions + shifts + requirements into the ministry's participation; the leader confirms/tweaks. Bound to templates by `sourceTemplateBlockId`.
6. **Participation default direction (3 tiers):** global app default (Unleash flag `PARTICIPATION_DEFAULT_ALL_IN` now → church setting later) → ministry `defaultDirection` (all-in / all-out) → manual per-slot. Narrower tier wins. `defaultDirection` is a ministry setting, **not** a template concept.
7. **`MinistryParticipation`** — new aggregate, one per `(Ministry, Event)`, created lazily. Holds the ministry's opted-in slots (stored as **inclusions**), its requirements, and its own lifecycle `tailoring → availability_fired → rostering → published`. This is where all per-ministry scheduling state lives.
8. **`TimeSlot` is church-level; `Shift` is the per-ministry subdivision.** (ADR 0002) A `TimeSlot` is the shared service block; a `Shift` is a ministry's split of it inside its participation. **Default = one `Shift` = the whole `TimeSlot`** — everything always attaches to a `Shift`, never a bare `TimeSlot`. Two ministries may split the same slot differently. A `Shift` must lie **entirely within** its `TimeSlot` (domain invariant + form guard). Shifts are created by equal division into N parts or by manual (unequal) times. The manual-shift-creation UX is an **open 017 design question** (BL-010).
9. **`SlotRequirement` and `Assignment` re-scope to a `Shift` and a `MinistryParticipation`.** `SlotRequirement` gains ministry/participation scope; `Assignment` links to the participation (resolving BL-006 team attribution natively). Completion % is computed per participation. Publish may proceed **below 100 %** with a confirmation (no hard block).
10. **`AvailabilityCheck`** — new unit a volunteer answers, one per `(PlanningCycle, MinistryVolunteer membership)`. A volunteer in two ministries/teams gets two checks. Firing (the `tailoring → availability_fired` transition) spawns the checks in `pending`. Volunteer is **available by default**; an `Availability` record is now an **unavailability mark** hanging off a check, whose atom is a **`Shift`**. A **confirm gate** flips `pending → confirmed` (with `confirmedAt`) even when zero marks are set.
11. **Two publishes, not one.** Cycle-lock (ChurchAdmin: `PlanningCycle draft → locked`, hands calendar to leaders) is distinct from roster-publish (leader: `MinistryParticipation rostering → published`, reveals that ministry's slice to its volunteers). `Event.status` becomes `draft | scheduled | cancelled | past` — **"published" leaves the Event entirely.**
12. **Conflict engine: two moments, two controls.** Availability-confirm overlap (global Unleash flag `VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE`) vs assignment overlap (per-ministry `enforcementType` soft/hard + override). Independent. Overlap = `Shift` time-intersection on the same date.
13. **Notifications are per `PlanningCycle`** (the package), not per slot — base kinds: availability reminder (leader-resendable) + schedule-published.
14. **`RoleTemplate` is removed** (MVP). Recurring counts come from `MinistryServingProfile`; dynamic-event counts come from copying a profile block or manual entry. (BACKLOG BL-009)

---

## Instructions for Specification Updates

The following `manual-planning/0001-volunteer-scheduling/` files must be updated **incrementally and additively**. Do **not** rewrite files from scratch; append superseding notes that preserve the original text, using the marker `**Refined (017, 2026-07-02):**` (matching the existing `**Refined:**` / `**Added:**` inline-marker convention). Do **not** touch any code. Cross-reference ADR 0001/0002 and `CONTEXT.md` from each note.

### 1. `domain-data-model.md`
- **§1 Ministry** ("Owns events"): add a note — Ministry no longer owns Events; Events are Church-owned. Ministry now carries `defaultDirection` (all-in/all-out) and participates in Events via `MinistryParticipation`.
- **§4 Event** ("Ministry ownership"): replace ownership with **Church ownership + `planningCycleId`**; note lifecycle `draft → scheduled → cancelled → past` (no "published").
- **§5 Time Slot** ("atomic unit of scheduling"): add note — `TimeSlot` is now church-level; the **`Shift`** (per-ministry subdivision) is the atomic staffing unit; default one Shift = whole TimeSlot.
- **§6 Slot Requirement** / **§7 Assignment**: note both now attach to a `Shift` under a `MinistryParticipation`.
- **§8 Availability**: note it is now an unavailability mark per `Shift`, hung off an `AvailabilityCheck` keyed to `(PlanningCycle, membership)`, default-available, with a confirm gate.
- **"Relationships Overview"**: add the new chain — `Church → PlanningCycle → Event → TimeSlot`; `EventTemplate → TimeBlock`; `MinistryParticipation → Shift → (SlotRequirement, Assignment)`; `MinistryServingProfile → TimeBlock`; `AvailabilityCheck → (PlanningCycle, MinistryVolunteer)`.
- **"Out of Scope: Recurring schedules"**: strike/annotate — recurring generation is now **core** via `EventTemplate`.
- Add a short **"017 Reshape — New Concepts"** block listing: `PlanningCycle`, `ChurchAdmin`, `EventTemplate`, `TimeBlock`, `MinistryServingProfile`, `MinistryParticipation`, `Shift`, `AvailabilityCheck` (pointing to `CONTEXT.md` for definitions).

### 2. `specifications/02-event-slots.md`
- **§1 Event Fields:** remove `ministry_id (FK … the owner)`; add `planning_cycle_id`; change `status` to `draft | scheduled | cancelled | past`.
- **§3 Slot Requirement:** key to **`shift_id`** (not `slot_id`) and note participation ownership.
- Add note: `TimeSlot`s are generated from `EventTemplate.TimeBlock`s (with `sourceTemplateBlockId`) or created manually for dynamic events; ministries subdivide a `TimeSlot` into `Shift`s.

### 3. `specifications/03-assignments-availability.md`
- **§1 Assignment:** attach to **`shift_id`**; add `participationId` (or `ministryId`+`teamId`) scope; note BL-006 team attribution is now native.
- **§2 Availability:** reshape to a per-`Shift` **unavailability** mark hung off an `AvailabilityCheck` keyed to `(PlanningCycle, membership)`; **default-available**; add `confirmedAt` confirm gate. Remove the volunteer-global free-span default-"unavailable" framing.

### 4. `specifications/D1-domain-entities.md`
- **Event:** drop `ministryId`; add `planningCycleId`; new status enum.
- **TimeSlot / SlotRequirement / Assignment:** introduce `Shift`; re-key `SlotRequirement`/`Assignment` to `shiftId` + participation.
- **Availability:** reshape to per-`Shift` mark + `AvailabilityCheck`.
- **Add new entities:** `PlanningCycle`, `EventTemplate`, `TimeBlock`, `MinistryServingProfile`, `MinistryParticipation`, `Shift`, `AvailabilityCheck`. **Remove** any `RoleTemplate` reference.

### 5. `specifications/S1-db-schema.md`
- **§V Event & Slots:** drop `ministry_id`, add `planning_cycle_id`, new status; add `shift` table (FK `time_slot_id`, `participation_id`, `start_time`, `end_time`, bounds-within-slot constraint); re-FK `slot_requirement`/`assignment` to `shift_id`.
- **New tables:** `planning_cycle`, `event_template`, `time_block`, `ministry_serving_profile`, `ministry_participation`, `participation_slot_inclusion`, `availability_check`. Add `ministry.default_direction`.
- **§2 Relationships:** `Church → PlanningCycle → Event → TimeSlot`; `MinistryParticipation → Shift`.
- Note the **greenfield reset** (no migration) — coordinate with S2.

### 6. `specifications/12-lifecycle-rules.md`
- Split the single `Event` state machine into three: `PlanningCycle` (`draft → locked → archived`), `Event` (`draft → scheduled → cancelled/past`), `MinistryParticipation` (`tailoring → availability_fired → rostering → published`). Note the two distinct publishes.

### 7. `specifications/L3-assignment-manager.md`
- **§1 Publishing Flow** ("Change `Event.status` to `published`"): replace with **per-`MinistryParticipation` roster-publish** (flip only that ministry's draft assignments → pending; notify only that ministry's volunteers) + the separate ChurchAdmin cycle-lock. Add partial-publish (below 100 %) with confirmation.

### 8. `specifications/09-permissions-rbac.md`
- Expand **`CHURCH_ADMIN`**: owns `PlanningCycle` draft/lock, `EventTemplate` config, and the church calendar — a real church-level authority distinct from ministry `leader`. Note leaders operate only on their `MinistryParticipation` slice after cycle-lock.

### 9. `specifications/11-notifications.md`
- Re-scope triggers from per-event/per-slot to **per `PlanningCycle`**. Base kinds: availability reminder (leader-**resendable**) + schedule-published. Update the "publishSchedule only notifies volunteers assigned to a slot" test to per-participation/per-cycle semantics.

### 10. `specifications/08-slot-generator.md`
- Two generators now: (a) **cycle event generation** from `EventTemplate → TimeBlock` across matching dates; (b) **per-ministry `Shift` creation** within a `TimeSlot` (equal-by-N or manual, bounds-enforced). Per-ministry counts seed from `MinistryServingProfile`. Remove "inherit SlotRequirement from … Template" (RoleTemplate gone).

### 11. `specifications/F1-schedule-builder.md`
- Remove the **Role Templates** concept (`:124-131`) — `RoleTemplate` deleted (see BL-009).
- Update Status/Publish (`:14`, `:196`): per-participation publish + new `Event` status; builder now operates within a locked cycle on the ministry's participation.

### 12. `specifications/A2-volunteer-api.md` & `A3-rbac-middleware.md`
- **A2:** "future **published** assignments" → assignments whose `MinistryParticipation` is published; add cycle-scoped availability-check + confirm endpoints.
- **A3:** the leader-context resolver (`ministryId/eventId/slotId`) now resolves ministry via `MinistryParticipation` and staffing via `Shift`.

### 13. `specifications/R1-repo-interfaces.md`
- `listPublished(churchId, ministryId): Event[]` (`:25`) is invalid (Events aren't ministry-scoped or "published"). Replace with cycle/participation-oriented queries (e.g. `listEventsByCycle`, `getParticipation`, `listPublishedParticipations`).

### 14. `specifications/01-core-entities.md`
- Event/Assignment/Availability entity descriptions: apply the same church-owned / Shift / AvailabilityCheck changes as D1.

### 15. `business-overview.md`
- Add a **017 Reshape** note to **Core Flow** and **Decisions**: planning is now church-level in cycles by a ChurchAdmin, generated from templates, then tailored per ministry before availability is fired; per-ministry publish; notifications per cycle.

### 16. `ui-ux-flow.md` + affected flowcharts
- **`ui-ux-flow.md`:** builder/availability flows now operate on a locked cycle + participation; remove the role-template step (`:153`); reflect `Shift` creation and per-cycle availability checks.
- **`flowcharts/slot-generation-flow.md`:** replace "Apply Role Template" with template-based cycle generation + Shift split.
- **`flowcharts/scheduling-process.md`:** replace "Update Status → Published" with cycle-lock (admin) then per-participation roster-publish (leader); add the ChurchAdmin/template/cycle front of the flow.

### 17. `specifications-list.md`
- Add the **Spec 017: Scheduling Reshape** entry with a `*Refines:*` list naming every file above (see the added row).

---

## SpecKit Agent Handoff & Instructions

This file is the authoritative context for aligning the planning docs, and later for generating `specs/017-scheduling-reshape/`.

1. **Target:** Apply the amendments above **additively** to the `manual-planning/0001-volunteer-scheduling/` files. Preserve original text; append `**Refined (017, 2026-07-02):**` notes that cite ADR 0001/0002 and `CONTEXT.md`.
2. **Constraint:** Do **not** rewrite files from scratch; do **not** touch code. `CONTEXT.md`, `docs/adr/0001`, `docs/adr/0002`, and `BACKLOG.md` are already updated and are the source of truth — reconcile the specs to them, not the reverse.
3. **Scope of this refinement:** planning-doc alignment only. Generating `specs/017-*` via SpecKit and implementing code are **separate, later** steps the user will invoke explicitly.
4. **Stop Condition:** once the listed planning files carry their superseding notes and `specifications-list.md` has the 017 row, **STOP** for user review.
