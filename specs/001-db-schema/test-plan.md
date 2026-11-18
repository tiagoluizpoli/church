# Test Plan: Database Schema (Phase 1)

## Backend Testing Strategy (Integration)

**Objective**: Verify the structural integrity of the schema, foreign key constraints, and cascading rules using a real PostgreSQL instance (via test containers or local DB).

### Coverage Target
- **Integration Coverage**: 100% of tables must be tested for creation and relationship constraints.

### Test Scenarios

- **TC-BE-001**: Verify that attempting to create a `Ministry` without a valid `church_id` throws a foreign key constraint error.
  - *FR-002, US-1*
- **TC-BE-002**: Verify that soft-deleting a `Ministry` (setting `deleted_at`) preserves all associated `Event`, `TimeSlot`, and `Assignment` records for auditing.
  - *Edge Case Resolution*
- **TC-BE-003**: Verify that `TimeSlot` `start_time` and `end_time` logic is correctly persisted without timestamp precision loss.
  - *FR-006*
- **TC-BE-004**: Verify `SlotRequirement` `required_count` enforces a minimum value (if implemented via check constraint, otherwise validated at application layer but tested here for DB defaults).
  - *FR-006*
- **TC-BE-005**: Verify `MinistryInvitation` unique constraint on `token`.
  - *FR-008*
- **TC-BE-006**: Verify that a query executed with a non-matching `church_id` returns zero results, even if the record exists in another tenant.
  - *SC-003, US-1*
- **TC-BE-007**: Verify `Assignment` state transitions: ensure valid transitions (pending -> confirmed) succeed and invalid ones are blocked.
  - *FR-007*
- **TC-BE-008**: Verify that `AssignmentAudit` correctly captures the `leader_id` and `reason` when an assignment status changes.
  - *FR-009*
- **TC-BE-009**: Verify that concurrent assignment attempts for the same volunteer/slot combination result in a unique constraint violation for the second request.
  - *FR-011*
- **TC-BE-010**: Verify that using a `MinistryInvitation` after its `expires_at` timestamp fails with an appropriate error.
  - *FR-012*
- **TC-BE-011**: Verify that a "one-time" `MinistryInvitation` cannot be used a second time.
  - *FR-012*


## Frontend Testing Strategy
*N/A - This phase is strictly persistence layer infrastructure.*

## End-to-End (E2E) Testing Strategy
*N/A - E2E tests will be defined in subsequent feature branches once the API and UI layers are constructed over this schema.*

## Guardrails
- **pnpm guard**: Must pass Drizzle Kit schema checks (`drizzle-kit check:pg`).
- Zero type errors on schema export inference.
