# Data Model: Database Schema (Phase 1)

## 1. Domain Entities

### `church`
- `id`: uuid, primary key, default `gen_random_uuid()`
- `name`: varchar, not null
- `slug`: varchar, not null, unique
- `settings`: jsonb, default `{}`
- `created_at`: timestamp, default `now()`
- `updated_at`: timestamp, default `now()`

### `ministry`
- `id`: uuid, primary key
- `church_id`: uuid, foreign key to `church.id`, cascade delete
- `name`: varchar, not null
- `description`: text
- `enforcement_type`: varchar, default `"soft"`
- `deleted_at`: timestamp, nullable
- `created_at`: timestamp
- `updated_at`: timestamp

### `team`
- `id`: uuid, primary key
- `church_id`: uuid, foreign key to `church.id`, cascade delete
- `ministry_id`: uuid, foreign key to `ministry.id`, cascade delete
- `name`: varchar, not null
- `leader_id`: uuid, foreign key to `volunteer.id` (nullable)

### `volunteer`
- `id`: uuid, primary key
- `user_id`: text, foreign key to `user.id`, not null, unique
- `church_id`: uuid, foreign key to `church.id`, cascade delete
- `status`: varchar (active, inactive, on_hold), default `active`
- `notes`: text

### `ministry_volunteer` (Join Table)
- `id`: uuid, primary key
- `church_id`: uuid, foreign key to `church.id`, cascade delete
- `volunteer_id`: uuid, foreign key to `volunteer.id`, cascade delete
- `ministry_id`: uuid, foreign key to `ministry.id`, cascade delete
- `team_id`: uuid, foreign key to `team.id`, set null on delete
- `system_role`: varchar (LEADER, SUB_LEADER, VOLUNTEER), default `VOLUNTEER`
- `status`: varchar (active, inactive), default `active`
- `joined_at`: timestamp, default `now()`

### `role`
- `id`: uuid, primary key
- `church_id`: uuid, foreign key to `church.id`, cascade delete
- `ministry_id`: uuid, foreign key to `ministry.id` (nullable if global)
- `name`: varchar, not null
- `is_global`: boolean, default `false`

### `event`
- `id`: uuid, primary key
- `church_id`: uuid, foreign key to `church.id`, cascade delete
- `ministry_id`: uuid, foreign key to `ministry.id`, cascade delete
- `title`: varchar, not null
- `description`: text
- `location`: varchar
- `start_date`: timestamp, not null
- `end_date`: timestamp, not null
- `status`: varchar (draft, published, cancelled), default `draft`
- `created_at`: timestamp
- `updated_at`: timestamp

### `time_slot`
- `id`: uuid, primary key
- `church_id`: uuid, foreign key to `church.id`, cascade delete
- `event_id`: uuid, foreign key to `event.id`, cascade delete
- `start_time`: timestamp, not null
- `end_time`: timestamp, not null
- `label`: varchar
- `created_at`: timestamp

### `slot_requirement`
- `id`: uuid, primary key
- `church_id`: uuid, foreign key to `church.id`, cascade delete
- `slot_id`: uuid, foreign key to `time_slot.id`, cascade delete
- `role_id`: uuid, foreign key to `role.id`, cascade delete
- `team_id`: uuid, foreign key to `team.id` (nullable)
- `required_count`: integer, default `1`
- `notes`: text

### `assignment`
- `id`: uuid, primary key
- `church_id`: uuid, foreign key to `church.id`, cascade delete
- `slot_id`: uuid, foreign key to `time_slot.id`, cascade delete
- `volunteer_id`: uuid, foreign key to `volunteer.id`, cascade delete
- `role_id`: uuid, foreign key to `role.id`, cascade delete
- `status`: varchar (pending, confirmed, declined), default `pending`
- `reason`: text
- `assigned_at`: timestamp
- `assigned_by`: text, foreign key to `user.id`

### `availability`
- `id`: uuid, primary key
- `church_id`: uuid, foreign key to `church.id`, cascade delete
- `volunteer_id`: uuid, foreign key to `volunteer.id`, cascade delete
- `type`: varchar (available, unavailable), default `unavailable`
- `start_time`: timestamp, not null
- `end_time`: timestamp, not null
- `is_all_day`: boolean, default `false`
- `reason`: varchar
- `repeat_rule`: varchar

### `assignment_audit`
- `id`: uuid, primary key
- `church_id`: uuid, foreign key to `church.id`, cascade delete
- `assignment_id`: uuid, foreign key to `assignment.id`, cascade delete
- `leader_id`: text, foreign key to `user.id`
- `reason`: text
- `timestamp`: timestamp, default `now()`

### `ministry_invitation`
- `id`: uuid, primary key
- `church_id`: uuid, foreign key to `church.id`, cascade delete
- `ministry_id`: uuid, foreign key to `ministry.id`, cascade delete
- `team_id`: uuid, foreign key to `team.id` (nullable)
- `token`: varchar, unique, not null
- `type`: varchar (one-time, multi-use)
- `status`: varchar (active, used, expired)
- `expires_at`: timestamp, not null

## 2. Validation Rules
- `TimeSlot` `start_time` and `end_time` must fall within its parent `Event` date bounds.
- `SlotRequirement` `required_count` must be >= 1.
- `Assignment` transitions: pending -> confirmed, pending -> declined, confirmed -> declined. Confirmed assignments cannot revert to pending.
