# Spec 02: Core Entities — Event & Time Slot

## Purpose
Define the entities responsible for holding the time structure of the scheduling system. These entities define *when* and *where* service happens.

---

## 1. Event Entity
A scheduled occurrence (e.g., "Sunday Service", "Youth Conference").

### Fields
- **id**: UUID (Primary Key)
- **church_id**: UUID (Foreign Key to Church)
- **ministry_id**: UUID (Foreign Key to Ministry - the owner)
- **title**: String
- **description**: Text (Optional)
- **location**: String (Optional)
- **start_date**: Date (Start of the event)
- **end_date**: Date (End of the event - same as start for single day)
- **status**: "draft" | "published" | "cancelled"
- **created_at / updated_at**: Timestamps

**Refined (017, 2026-07-02):** Events are now Church-owned, not Ministry-owned. Remove `ministry_id` (the "owner" FK) and add `planning_cycle_id` (FK to the `PlanningCycle` the Event belongs to, resolved by its start date). The `status` enum becomes `draft | scheduled | cancelled | past` — "published" leaves the Event entirely (publishing is now per `MinistryParticipation`). Ministries participate in an Event via `MinistryParticipation`, not ownership. (see ADR 0001 / CONTEXT.md)

---

## 2. Time Slot Entity
A specific time subdivision of an Event.

### Fields
- **id**: UUID (Primary Key)
- **church_id**: UUID (Foreign Key to Church)
- **event_id**: UUID (Foreign Key to Event)
- **start_time**: Timestamp (Includes date for multi-day support)
- **end_time**: Timestamp
- **label**: String (Optional, e.g., "Morning Shift", "Setup")
- **created_at**: Timestamp

**Refined (017, 2026-07-02):** `TimeSlot` is now a **church-level** shared block that ministries opt into or out of. TimeSlots are generated from an `EventTemplate`'s `TimeBlock`s (each generated slot records `sourceTemplateBlockId`) or created manually for dynamic events. A ministry does not staff a bare `TimeSlot`; inside its `MinistryParticipation` it subdivides the slot into `Shift`s (default = one `Shift` = the whole `TimeSlot`). (see ADR 0002 / CONTEXT.md)

---

## 3. Slot Requirement Entity
Defines the staffing needs for a specific role within a Time Slot.

### Fields
- **id**: UUID (Primary Key)
- **church_id**: UUID (Foreign Key to Church)
- **slot_id**: UUID (Foreign Key to Time Slot)
- **role_id**: UUID (Foreign Key to Role)
- **team_id**: UUID (Optional - Foreign Key to Team)
- **required_count**: Integer (Default: 1)
- **notes**: Text (Optional)

**Refined (017, 2026-07-02):** `SlotRequirement` now keys to **`shift_id`** (a `Shift`) instead of `slot_id`, and is owned by a `MinistryParticipation`. Requirements live per-ministry under the participation, not on the shared TimeSlot. (see ADR 0002 / CONTEXT.md)

---

## 4. Testing Requirements (Mandatory)
- **Unit**: Verify `TimeSlot` start/end times fall within `Event` range.
- **Unit**: Verify `required_count` is always >= 1.
- **Integration**: Verify that creating an `Event` with `TimeSlots` is atomic.
- **RBAC**: Verify that a `Sub-leader` can only see/edit `SlotRequirements` linked to their `team_id`.
