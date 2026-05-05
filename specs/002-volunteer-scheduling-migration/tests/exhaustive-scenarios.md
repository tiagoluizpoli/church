# Exhaustive Test Scenarios: Volunteer Scheduling Migration

## 1. Happy Paths
- `[ ]` **BT-001**: Run `init-system` with valid `seed-data.json`. Expect Church and "Administration" ministry created, Admin user linked as LEADER. → **INTEGRATION**
- `[ ]` **BT-002**: First login of a new user. Expect `Volunteer` record created with status `active` and linked to System Church. → **INTEGRATION**

## 2. Permission Matrix
- `[ ]` **BT-003**: Soft registration triggered by a user who is already a volunteer. Expect no duplicate record and existing record remains unchanged. → **INTEGRATION**

## 3. Edge Cases & Validation
- `[ ]` **BT-004**: `seed-data.json` is missing or malformed. Expect clear validation error and script termination. → **UNIT/INTEGRATION**
- `[ ]` **BT-005**: `adminEmail` from `seed-data.json` does not exist in `user` table. Expect script to fail with error and no data created (Atomic check). → **INTEGRATION**
- `[ ]` **BT-006**: Church slug in `seed-data.json` already exists. Expect script to use the existing church and continue with admin promotion. → **INTEGRATION**
- `[ ]` **BT-007**: Concurrent logins for a new user. Expect idempotency (only one `Volunteer` record created). → **INTEGRATION**

## 4. Catastrophic Failures
- `[ ]` **BT-008**: Database connection lost during initialization. Expect no partial data in Church or Ministry tables. → **INTEGRATION**
- `[ ]` **BT-009**: Database error during `Volunteer` creation in login hook. Expect session to still be created but error logged for observability. → **INTEGRATION**
