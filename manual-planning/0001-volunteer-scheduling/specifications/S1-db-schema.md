# Spec S1: Database Schema

## Purpose
Define the complete Drizzle ORM schema for the Volunteer Scheduling system. All tables include `church_id` for multi-tenancy isolation.

## 1. Domain Entities

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

### III. Volunteer Table (Contextual User)
- `id`: `text` (Primary Key - references `user.id`)
- `church_id`: `text`.references(() => church.id)
- `status`: `text` ("active" | "inactive")

### IV. Ministry_Volunteer (Join Table)
- `volunteer_id`, `ministry_id`, `team_id`, `system_role` ("LEADER" | "SUB_LEADER" | "VOLUNTEER").

### V. Event & Slots
- **Event**: `church_id`, `ministry_id`, `title`, `start_date`, `end_date`, `status` ("draft" | "published").
- **TimeSlot**: `church_id`, `event_id`, `start_time`, `end_time`, `label`.
- **SlotRequirement**: `church_id`, `slot_id`, `role_id`, `team_id`, `required_count`.

### VI. Assignments & Availability
- **Availability**: `church_id`, `volunteer_id`, `type` ("available" | "unavailable"), `start_time`, `end_time`, `is_all_day`.
- **Assignment**: `church_id`, `slot_id`, `volunteer_id`, `role_id`, `status` ("pending" | "confirmed" | "declined").
- **AssignmentAudit**: `church_id`, `assignment_id`, `who` (User ID), `reason`.

### VII. Onboarding & Invites
- **MinistryInvitation**: `id`, `church_id`, `ministry_id`, `token` (unique index), `type` ("one-time" | "multi"), `status` ("active" | "used" | "expired"), `expires_at`.

## 2. Relationships
- One-to-Many: Church -> Ministry, Ministry -> Event, Event -> TimeSlot.
- Many-to-Many: Ministry <-> Volunteer (via Join), Slot <-> Role (via Requirement).

## 3. Testing Requirements (Mandatory)
- **Unit**: Verify that `church_id` is present on all new tables.
- **Integration**: Verify that `Assignment` cannot be created without a valid `church_id`.
- **Security**: Verify that a user cannot query `Availability` of a volunteer from a different church.

## 🔗 References
- [Spec 01: Core Entities](./01-core-entities.md)
- [Spec 02: Event & Time Slot](./02-event-slots.md)
- [Spec 03: Assignments & Availability](./03-assignments-availability.md)
- [Spec 05: Onboarding Links](./05-onboarding-links.md)
