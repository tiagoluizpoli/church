# Data Model: Volunteer Scheduling Migration

This document describes the data structures and state transitions involved in the migration and initialization process.

## 1. Migration Entities

### System Initialization Seed (`seed-data.json`)
A local JSON file used to bootstrap the first tenant without requiring environment variables.
- `churchName`: Name of the initial church (e.g., "Abundant Life").
- `churchSlug`: Unique slug for URL routing (e.g., "abundant-life").
- `adminEmail`: Email of the first user to be promoted to Admin (defaults to `admin@dummy.com`).

## 2. State Transitions

### User -> Volunteer (Soft Registration)
- **Trigger**: Better Auth `after.sessionCreate` hook.
- **Pre-condition**: `User` table contains a record for the logged-in user.
- **Check**: Query `Volunteer` table for `user_id = <current_user_id> AND church_id = <default_church_id>`.
- **Action**: If not found, insert new record into `Volunteer`.

### Initial Admin Promotion
- **Trigger**: Manual execution of `init-system` script.
- **Pre-condition**: `User` table contains the user with `INITIAL_ADMIN_EMAIL`.
- **Action**:
     1.  Ensure `Church` exists.
     2.  Ensure `Volunteer` exists for the user.
     3.  Create the "Administration" ministry if it doesn't exist.
     4.  Create/Update `MinistryVolunteer` link for the "Administration" ministry with `system_role = 'LEADER'`.

## 3. Relationships
- `Volunteer` (1) <-> (1) `User` (Better Auth)
- `Volunteer` (N) <-> (1) `Church`
- `Volunteer` (N) <-> (N) `Ministry` (via `MinistryVolunteer`)
