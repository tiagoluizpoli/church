# Spec S1: Database Schema

## Purpose
Define the complete Drizzle ORM schema for the Volunteer Scheduling system. All tables include `church_id` for multi-tenancy isolation.

## 1. Data Models (Persistence)
*Note: These tables persist the Domain Entities defined in [Spec D1: Domain Entities](./D1-domain-entities.md).*

### I. Church Table
- `id`: `text` (Primary Key)
- `name`: `text`.notNull()
- `slug`: `text`.unique().notNull()
- `settings`: `jsonb`

### II. Ministry Table
- `id`: `text` (Primary Key)
- `church_id`: `text`.references(() => church.id)
- `name`: `text`.notNull()
- `enforcement_type`: `text` ("soft" | "hard")

**Refined (017, 2026-07-02):** Add `default_direction`: `text` ("all_in" | "all_out") — the ministry-wide participation default. (see ADR 0001 / CONTEXT.md)

### III. Volunteer Table (Contextual User)
- `id`: `text` (Primary Key - references `user.id`)
- `church_id`: `text`.references(() => church.id)
- `status`: `text` ("active" | "inactive")

### IV. Ministry_Volunteer (Join Table)
- `volunteer_id`, `ministry_id`, `team_id`, `system_role` ("leader" | "sub_leader" | "volunteer").
  > *Leadership is determined by `system_role`. A volunteer with role `leader` or `sub_leader` in a given ministry/team membership is the leader for that context. One volunteer can hold different roles across different ministries.*

### V. Event & Slots
- **Event**: `church_id`, `ministry_id`, `title`, `start_date`, `end_date`, `status` ("draft" | "published").
- **TimeSlot**: `church_id`, `event_id`, `start_time`, `end_time`, `label`.
- **SlotRequirement**: `church_id`, `slot_id`, `role_id`, `team_id`, `required_count`.

**Refined (017, 2026-07-02):** §V changes:

- **Event**: drop `ministry_id`; add `planning_cycle_id` (FK → `planning_cycle`); `status` becomes ("draft" | "scheduled" | "cancelled" | "past").
- **new `shift` table**: `church_id`, `time_slot_id` (FK → `time_slot`), `participation_id` (FK → `ministry_participation`), `start_time`, `end_time`, with a check constraint that the shift bounds lie **within** the parent TimeSlot.
- **SlotRequirement** and **Assignment** (§VI) re-FK from `slot_id` to `shift_id`; both also carry `participation_id`.

New tables (greenfield): `planning_cycle` (`church_id`, `start_date`, `end_date`, `status`), `event_template` (`church_id`, `weekday`, …), `time_block` (`event_template_id`, `label`, `start_time`, `end_time`), `ministry_serving_profile` (`ministry_id`, `source_template_block_id`, …), `ministry_participation` (`church_id`, `ministry_id`, `event_id`, `status`), `participation_slot_inclusion` (`participation_id`, `time_slot_id`), `availability_check` (`church_id`, `planning_cycle_id`, `membership_id`/`volunteer_id`, `status`, `confirmed_at`). No `role_template` table — removed for MVP (BL-009). **Greenfield reset: no migration** (no production data) — coordinate with S2. (see ADR 0001 / ADR 0002 / CONTEXT.md)

### VI. Assignments & Availability
- **Availability**: `church_id`, `volunteer_id`, `type` ("available" | "unavailable"), `start_time`, `end_time`, `is_all_day`.
- **Assignment**: `church_id`, `slot_id`, `volunteer_id`, `role_id`, `status` ("pending" | "confirmed" | "declined").
- **AssignmentAudit**: `church_id`, `assignment_id`, `who` (User ID), `reason`.

### VII. Onboarding & Invites
- **MinistryInvitation**: `id`, `church_id`, `ministry_id`, `token` (unique index), `type` ("one-time" | "multi"), `status` ("active" | "used" | "expired"), `expires_at`.

## 2. Relationships
- One-to-Many: Church -> Ministry, Ministry -> Event, Event -> TimeSlot.
- Many-to-Many: Ministry <-> Volunteer (via Join), Slot <-> Role (via Requirement).

**Refined (017, 2026-07-02):** The `Ministry -> Event` chain is removed (Events are Church-owned). New chains: `Church -> PlanningCycle -> Event -> TimeSlot`; `MinistryParticipation -> Shift -> (SlotRequirement, Assignment)`; `EventTemplate -> TimeBlock`; `MinistryServingProfile -> TimeBlock` (via `sourceTemplateBlockId`); `AvailabilityCheck -> (PlanningCycle, MinistryVolunteer)`. (see ADR 0001 / ADR 0002 / CONTEXT.md)

## 3. Testing Requirements (Mandatory)
- **Unit**: Verify that `church_id` is present on all new tables.
- **Integration**: Verify that `Assignment` cannot be created without a valid `church_id`.
- **Integration**: Verify that Team leadership queries rely on the join table (`Ministry_Volunteer`), not on a team column.
- **Security**: Verify that a user cannot query `Availability` of a volunteer from a different church.

## 🔗 References
- [Spec D1: Domain Entities](./D1-domain-entities.md)
- [Spec 01: Core Entities](./01-core-entities.md)
- [Spec 02: Event & Time Slot](./02-event-slots.md)
- [Spec 03: Assignments & Availability](./03-assignments-availability.md)
- [Spec 05: Onboarding Links](./05-onboarding-links.md)
