# Phase 1 Data Model: Scheduling Reshape

Entities follow the existing DDD conventions: a domain `Entity<Props, Id>` per aggregate, a `BrandedId`, a Drizzle table (`church_id` FK, cascade, range `CHECK`s), a mapper, a repo interface + drizzle impl. Definitions are canonical in [CONTEXT.md](../../CONTEXT.md); this file records fields, invariants, relationships, and state machines for implementation.

## Relationships overview

```text
Church ─┬─ PlanningCycle ──< Event ──< TimeSlot
        │                                  │  (sourceTemplateBlockId ─ EventTemplate.TimeBlock)
        ├─ EventTemplate ──< TimeBlock
        ├─ Ministry ─┬─ MinistryServingProfile ──< (serve/split/headcount per TimeBlock)
        │            └─ defaultDirection
        └─ Ministry × Event = MinistryParticipation
                                   ├─< ParticipationSlotInclusion ─ TimeSlot
                                   ├─< Shift ─ TimeSlot
                                   │     ├─< SlotRequirement (Role, Team)
                                   │     └─< Assignment (Volunteer, Role)
                                   └─ lifecycle

AvailabilityCheck ─ (PlanningCycle, MinistryVolunteer membership)
                        └─< Availability (unavailability mark ─ Shift)
```

## New aggregates & entities

### PlanningCycle

- **Fields**: `churchId`, `name`, `startDate: Date`, `endDate: Date` (date-only semantics), `state: 'draft' | 'locked' | 'archived'`.
- **Invariants**: `startDate < endDate`; range must not overlap another cycle of the same church (evaluated date-only in church tz — R2); locked cycle is append-only (new events allowed, edit/remove of a locked event requires explicit reopen); auto-archive after `endDate` passes.
- **State machine**: `draft → locked → archived`. `draft` visible to ChurchAdmin only; `locked` visible to ministry leaders; volunteers never see the cycle directly (only published slices). Archive is **lazy** (CL-006): resolved on read when past `endDate`, no scheduler.
- **Methods** (named-object inputs): `lock()`, `reopenEvent({ eventId })`, `archive()`.

### EventTemplate + TimeBlock

- **EventTemplate fields**: `churchId`, `name`, `weekday: 0..6`, `blocks: TimeBlock[]` (ordered).
- **TimeBlock fields**: `templateId`, `label`, `startTime` / `endTime` (time-of-day within the day), stable `id` (used as `sourceTemplateBlockId`), `order`.
- **Invariants**: each block `startTime < endTime`; blocks ordered; template targets exactly one weekday. Single-day only (multi-day events are manual).

### MinistryServingProfile

- **Fields**: `churchId`, `ministryId`, entries keyed by `sourceTemplateBlockId` — each records `{ serves: boolean, shiftSplit: ShiftSplitSpec, headcounts: Array<{ roleId, teamId?, count }> }`.
- **Purpose**: standing pre-fill helper. On cycle generation, for each generated `TimeSlot` whose `sourceTemplateBlockId` matches an entry with `serves = true`, seed an inclusion + shifts + requirements into that ministry's participation.
- **Orthogonal to** `Ministry.defaultDirection`.

### MinistryParticipation

- **Fields**: `churchId`, `ministryId`, `eventId`, `state: 'tailoring' | 'availability_fired' | 'rostering' | 'published'`.
- **Owns**: `ParticipationSlotInclusion[]`, `Shift[]`, `SlotRequirement[]` (via shifts), `Assignment[]` (via shifts).
- **Created lazily** (one per `(ministryId, eventId)`).
- **State machine**: `tailoring → availability_fired → rostering → published`. `availability_fired` spawns `AvailabilityCheck`s. `published` reveals this ministry's slice to its volunteers only; below-100% publish allowed with explicit confirmation. Publishing one participation never changes another's state.
- **Completion %**: assigned headcount ÷ total required headcount, computed per participation. Zero total required = **100%** (CL-022).

### ParticipationSlotInclusion

- **Fields**: `churchId`, `participationId`, `timeSlotId`.
- **Semantics**: presence = ministry serves this slot; absence = not serving (R3).

### Shift

- **Fields**: `churchId`, `participationId`, `timeSlotId`, `startTime`, `endTime`, `label?`.
- **Invariant** (domain + DB `CHECK` + form): `slot.startTime <= startTime < endTime <= slot.endTime`.
- **Default**: one shift equal to the whole slot when no explicit split.
- **Creation**: equal-division-into-N or manual (unequal allowed). Carries `SlotRequirement`s, `Assignment`s, `Availability` marks.

### AvailabilityCheck

- **Fields**: `churchId`, `planningCycleId`, `ministryVolunteerId` (membership), `state: 'pending' | 'confirmed'`, `confirmedAt?: Date`.
- **Uniqueness**: one per `(planningCycleId, ministryVolunteerId)`.
- **State machine**: `pending → confirmed` (confirm gate; sets `confirmedAt` even with zero marks).

## Reshaped entities (deltas)

### Event

- **Drop**: `ministryId`.
- **Add**: `planningCycleId`, `sourceTemplateId?` (nullable — null for dynamic/manual events).
- **Status enum**: `draft | scheduled | cancelled | past` (remove `published`; `hourly`/`day_based` `eventType` retained).
- **Method changes**: remove `publish()`; add `markScheduled()` (driven by cycle-lock); keep `cancel()`, `markAsPast()`.

### TimeSlot

- **Add**: `sourceTemplateBlockId?` (nullable — set on template-generated slots, null on manual). Stays church-level; no per-ministry fields.

### SlotRequirement

- **Re-key**: `slotId → shiftId`; **add** `participationId`. Keeps `roleId`, `teamId?`, `requiredCount >= 1`, `notes?`.

### Assignment

- **Re-key**: attach to `shiftId`; **add** `participationId` (native team attribution — closes BL-006). One assignment per volunteer per shift.

### Availability (now an unavailability mark)

- **Reshape**: keyed to `availabilityCheckId` + `shiftId`; existence = unavailable for that shift. **Drop** the free-span `type`/`eventId`/`repeatRule`/`isAllDay` framing (whole-day is a helper that writes one mark per shift on the date). Default state of a volunteer is *available* (no marks).

### Ministry

- **Add**: `defaultDirection: 'all_in' | 'all_out'` (three-tier seeding — R10).

### VolunteerNotification

- **Add**: `planningCycleId?` scope on `volunteer_notification` so reminders/published notices attach to a cycle (FR-027). Existing `eventId`/`assignmentId`/`ministryId` columns and the 014 notification kinds are **retained** (dashboard still consumes them) — this is additive, not a replacement.
- **Add**: leader-resend path for the `availability_reminder` kind (cooldown deferred — BL-005).

## Removed

- **RoleTemplate / RoleTemplateItem** — entity, schema (`role-templates.ts`), repo, mapper, `IRoleManager` template methods, DTOs, route. (R9 / BL-009.)

## New branded IDs

`PlanningCycleId`, `EventTemplateId`, `TimeBlockId`, `MinistryServingProfileId`, `MinistryParticipationId`, `ParticipationSlotInclusionId`, `ShiftId`, `AvailabilityCheckId` — each `BrandedId<'…'>` + `namespace { from() }`.

## New / changed enums (`packages/db/src/schema/enums.ts`)

| Enum | Values |
|---|---|
| `event_status` (change) | `draft`, `scheduled`, `cancelled`, `past` |
| `planning_cycle_state` (new) | `draft`, `locked`, `archived` |
| `participation_state` (new) | `tailoring`, `availability_fired`, `rostering`, `published` |
| `availability_check_state` (new) | `pending`, `confirmed` |
| `default_direction` (new) | `all_in`, `all_out` |
| `enforcement_type` (keep) | `soft`, `hard` |
| `volunteer_notification_type` (keep + extend) | **retain** all existing 014 kinds (still consumed by the volunteer dashboard: `assignment_added/changed/removed`, `assignment_reminder`); keep `schedule_published`, `availability_reminder`. Do **not** drop values (would break 014 inbox/DTOs). |

## Domain services

- **CycleEventGenerator**: input `{ churchId, planningCycleId, templateIds }` → creates one `Event` (status `draft`) per matching weekday date in the cycle range, one `TimeSlot` per `TimeBlock` (recording `sourceTemplateBlockId`), then invokes `ProfileSeeder` for each ministry with a matching serving profile. **Idempotent** (CL-008): generation keyed by (date, `sourceTemplateBlockId`) — re-apply creates only missing slots, preserves existing tailoring.
- **ProfileSeeder**: input `{ participationId, servingProfile, generatedSlots }` → seeds inclusions + shifts + requirements; also applies the three-tier default direction for ministries without a profile entry.
- **ShiftSplitter**: input `{ timeSlot, strategy: { kind: 'equal-n', n } | { kind: 'manual', spans } }` → `Shift[]`, enforcing the bounds invariant. Equal-N: final shift absorbs remainder → exact tiling (CL-014). Manual: gaps allowed, overlapping spans rejected (CL-014).
- **AvailabilityOverlap**: input `{ volunteerId, shifts }` → detects cross-ministry shift **timestamp** intersections (CL-020: absolute start/end, not date-truncated — handles midnight-crossing shifts) at the availability-confirm moment.

## Validation rules (from FRs)

- Cycle ranges per church non-overlapping; gaps allowed (FR-002).
- Boundaries date-only, church tz (FR-003).
- Locked cycle append-only; edit/remove locked event ⇒ explicit reopen + re-notify downstream fired participations (FR-005, edge case).
- Template application: one event per matching date, one slot per block, each slot records its block id (FR-008).
- Shift ⊆ parent slot (FR-014); requirements/assignments/availability attach to shift only (FR-015).
- One `AvailabilityCheck` per `(cycle, membership)` (FR-017); available-by-default, confirm gate mandatory (FR-018/019).
- Publish per participation, below-100% allowed with confirmation, isolates other ministries (FR-024/025).
- Volunteer cancels only own shifts; reopens slot + notifies leader (FR-028).
