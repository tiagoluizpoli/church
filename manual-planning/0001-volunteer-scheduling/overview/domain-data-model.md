# Domain & Data Model Planning — Multi-Slot Event Scheduling

## Purpose

Define the **core domain concepts and relationships** required to support:
- Long-duration events
- Volunteer rotation
- Role-based assignments
- Time-based availability

This document is **technology-agnostic** and should guide future schema design.

> **Refined (017, 2026-07-02):** This model has been reshaped. Events are now **church-owned** and planned in **`PlanningCycle`s** generated from **`EventTemplate`s**, then tailored per ministry via **`MinistryParticipation`** and staffed at the **`Shift`** level. The concepts below are annotated inline; new concepts are listed in the "017 Reshape — New Concepts" block at the end. Authoritative: [`CONTEXT.md`](../../CONTEXT.md), [ADR 0001](../../docs/adr/0001-church-owned-events-and-planning-cycles.md), [ADR 0002](../../docs/adr/0002-church-timeslots-ministry-shifts.md), [refinement-02](../../vault/refinements/refinement-02-scheduling-reshape.md).

---

## Core Domain Concepts

### 1. Ministry
A logical group within the church (e.g., Projection, Kids, Worship).

- Owns roles (Ministry-specific roles)
- Owns events
- Has volunteers

> **Refined (017):** A Ministry **no longer owns Events** — Events are church-owned. A Ministry *participates* in an Event via a `MinistryParticipation`. A Ministry also carries a `defaultDirection` (all-in / all-out) governing whether it starts opted into a cycle's slots.

---

### 2. Role
A function performed by a volunteer.

Examples:
- Projection Operator
- Teacher
- Assistant

Roles can be **Global** (shared across the church) or **Ministry-specific** (bound to a single ministry).

---

### 3. Volunteer
A person who can be assigned to roles.

Key characteristics:
- Has one or more roles
- Has availability constraints
- Can belong to **multiple ministries**.

---

### 4. Event
A scheduled occurrence. Can be a single service or span **multiple days** (e.g., Encounter with God taking 3 days).

Key attributes:
- Date(s)
- Start time
- End time
- Ministry ownership

> **Refined (017):** Event is **church-owned**, not ministry-owned. Drop `ministryId`; add `planningCycleId` (belongs to the cycle of its start date). Lifecycle is `draft → scheduled → cancelled → past` — an Event is **never "published"** (publishing is per `MinistryParticipation`). Events are generated from `EventTemplate`s (recurring) or created manually (dynamic / multi-day).

---

### 5. Time Slot (Critical Concept)
A subdivision of an event into smaller time ranges.

Example:
- Event: 10:00–22:00
- Slots:
  - 10:00–14:00
  - 14:00–18:00
  - 18:00–22:00

Slots are the **atomic unit of scheduling**.

> **Refined (017):** `TimeSlot` is now **church-level** (the shared service block). The **atomic staffing unit is the `Shift`** — a ministry's subdivision of a `TimeSlot` inside its `MinistryParticipation`. Default is **one `Shift` = the whole `TimeSlot`**, so everything always attaches to a `Shift`, never a bare `TimeSlot`. Two ministries may split the same slot differently; a `Shift` must lie entirely within its `TimeSlot`.

---

### 6. Slot Requirement
Defines **how many volunteers are needed** for a role within a time slot.

Example:
- Slot: 10:00–14:00
- Role: Projection
- Required: 1

---

### 7. Assignment
Links:
- Volunteer
- Role
- Time Slot

Represents an actual scheduled commitment. A volunteer **can hold multiple roles** in the same time slot (e.g., Teacher and First Aid).

---

### 8. Availability
Defines when a volunteer **can or cannot serve**.

Must support:
- Day-span availability/unavailability for day-based Events
- Time-span availability/unavailability for hourly Events

> **Refined (017):** A volunteer is **available by default**. `Availability` is now an **unavailability mark** per `Shift`, hung off an **`AvailabilityCheck`** keyed to `(PlanningCycle, MinistryVolunteer membership)`. The check has a **confirm gate** (`pending → confirmed`, `confirmedAt`) the volunteer must trigger even with zero marks.

---

## Decisions Made

1. **Multi-Ministry Volunteers**: Yes, a volunteer can belong to multiple ministries.
2. **Role Scope**: Both. There should be Global roles available to everyone, but ministries can also have their own specific roles.
3. **Multi-Day Events**: Yes. Events can span multiple days (e.g., a 3-day conference).
4. **Multiple Roles per Slot**: Yes, a volunteer can be assigned to multiple roles within the exact same time slot.
5. **Overlapping Time Slots**: No (for MVP). Slots must be sequential to keep capacity and availability calculations simple. We can evolve this later if needed.
6. **Availability Granularity**: Both, depending on the Event Type. An event can be "day-based" (e.g., multi-day retreats) or "hourly-based". Refinement for the volunteer dashboard: the persisted model may still use time bounds, but the volunteer-facing input should be leader-defined slots with volunteer answers rather than free-form day/time authoring.
7. **Constraint Strictness**: Configurable per Ministry. We will add a boolean flag on the Ministry settings to determine if it uses *Soft enforcement* (warn but allow override) or *Hard enforcement* (blocks invalid assignments).

---

## Relationships Overview

- Ministry → Roles (1:N for specific roles)
- Ministry → Events (1:N)
- Event → Time Slots (1:N)
- Time Slot → Slot Requirements (1:N)
- Slot Requirement → Role (N:1)
- Assignment → (Volunteer, Role, Time Slot)
- Volunteer → Availability (1:N)

---

## Key Behavioral Rules

### Rule 1 — Slot-Based Scheduling
All assignments must occur at the **time slot level**, never directly on events.

### Rule 2 — Capacity Enforcement
Assignments should not exceed the required number per role per slot.

### Rule 3 — Availability Respect
Assignments should align with volunteer availability.

### Rule 4 — Non-Overlapping Assignments
A volunteer should not be assigned to overlapping time slots. *(To be confirmed by D4)*

---

## Out of Scope (For Now)

- Notifications
- Recurring schedules
- Auto-assignment algorithms
- Real-time collaboration

These can be added later without breaking the core model.

---

## 🔗 Technical Specifications (Implementation)

This domain model has been formalized into concrete Drizzle ORM schemas and repository interfaces. See:
- **[Spec S1: Database Schema](./specifications/S1-db-schema.md)**: The Drizzle ORM table definitions.
- **[Spec R1: Repository Interfaces](./specifications/R1-repo-interfaces.md)**: Data access layer contracts.
