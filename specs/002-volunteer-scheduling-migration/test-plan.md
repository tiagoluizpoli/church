# Test Plan: Volunteer Scheduling Migration

## 1. Test Scenarios

### Backend Integration (Vitest)

| ID | Description | Expected Outcome |
|----|-------------|------------------|
| BT-001 | Run `init-system` on empty DB | Church record created, User promoted to Volunteer/Leader |
| BT-002 | Run `init-system` twice | No duplicate Church or Volunteer records created (Idempotency) |
| BT-003 | Simulate Better Auth `sessionCreate` | New Volunteer record created for the user in the system church |
| BT-004 | Simulate login for existing Volunteer | No new record created, existing one remains unchanged |

<!-- E2E Journeys (Playwright) deferred to a future phase when the frontend is ready -->

## 2. Coverage Targets

- **Logic Coverage**: 100% of migration script branches.
- **Hook Coverage**: 100% of session creation paths.
- **Overall Feature Coverage**: 90%+ for the migration package.

## 3. Guardrails

- `pnpm guard`: Ensure no migration script is committed without corresponding tests in `packages/database/tests/scripts/`.
- Schema Check: Verify that all new `Volunteer` records have a valid `church_id` not-null constraint.
