# Data Model: Local Development Seeding

## Overview
The seeder does not introduce new entities or schema changes. It consumes the existing Phase 1 schema (Spec S1) and populates it. This document defines the *Data Generation Strategy* for those entities to ensure referential integrity.

## Generation Sequence

Data MUST be generated in the following strict order to respect foreign key constraints:

1. **Churches** (Root tenant entity)
2. **Ministries** (Depends on `church_id`)
3. **Roles** (Depends on `church_id` and optionally `ministry_id`)
4. **Volunteers** (Depends on `church_id`)
5. **Teams** (Depends on `church_id` and `ministry_id`)
6. **Events** (Depends on `church_id`)
7. **Slots** (Depends on `event_id`, `role_id`)
8. **Assignments / Requirements** (Depends on `slot_id`, `volunteer_id`)

## Factory Definitions

### Church Factory
- Generates 3 baseline churches (e.g., "Grace Community", "Hope City", "First Baptist").

### Ministry Factory
- Generates 2-4 ministries per church (e.g., "Worship", "Kids", "Tech").

### Role Factory
- Generates standard roles within ministries (e.g., "Guitarist" for Worship, "Teacher" for Kids).

### Volunteer Factory
- Generates 10-20 users per church using realistic names and emails.
- Links them to 1-3 ministries/teams they serve in.
- Assigns contextual leadership roles (`system_role`) instead of just `volunteer`:
  - 1 `leader` per Ministry.
  - 1 `sub_leader` per Team.
  - The rest as `volunteer`.
- Links them to 1-3 roles they are qualified for.

### Schedule Factory (Events & Slots)
- Generates events spanning from 2 weeks in the past to 4 weeks in the future.
- Generates slots corresponding to the roles defined.
- Randomly assigns qualified volunteers to some slots, leaving others empty to simulate real scheduling gaps.
