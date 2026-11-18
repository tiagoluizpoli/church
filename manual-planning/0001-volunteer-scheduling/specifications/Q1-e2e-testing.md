# Spec Q1: End-to-End Testing (Playwright)

## Purpose
Define the primary user journeys to be verified via Playwright to ensure system integrity.

## 1. Primary Scenarios
- **The Full Cycle (Leader)**: Create event -> Split into slots -> Assign volunteers -> Resolve conflict -> Publish -> Verify notifications triggered.
- **The Newcomer (Volunteer)**: Receive invitation link -> Clinical registration flow -> Submit availability -> Confirm first assigned shift.
- **The Conflict Guard**: Attempt to assign a volunteer to overlapping slots -> Verify "Double Booking" warning blocks the action or triggers audit.

## 2. Environment
- Use a dedicated test database (Postgres in Docker).
- Mock Email/Push notification delivery to verify triggers without external side effects.

## 3. Testing Requirements (Mandatory)
- **Coverage**: 100% of critical paths (Assignment, Confirmation, Onboarding).
- **CI/CD**: Tests must pass before any merge to `main`.
- **Performance Baseline**: E2E tests should also verify that initial page load stays within the targets defined in Spec Q2.
