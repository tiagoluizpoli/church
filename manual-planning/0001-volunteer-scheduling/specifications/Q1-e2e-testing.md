# Spec Q1: End-to-End Testing (Playwright)

## Purpose
Define the primary user journeys to be verified via Playwright.

## 1. Primary Scenarios
- **The Leader Journey**: Create event -> Split into slots -> Assign volunteers -> Resolve conflict -> Publish.
- **The Volunteer Journey**: Receive invitation link -> Register -> Confirm assignment -> Add blockout date.
- **The Conflict Journey**: Assign a volunteer to two overlapping slots -> Verify "Double Booking" warning appears.

## 2. Environment
- Use a dedicated test database (Postgres in Docker).
- Mock the Email/Push notification delivery to verify the "Trigger" happened without actually sending external requests.

## 3. Testing Requirements (Mandatory)
- **Coverage**: Verify that the entire "Ground-Up" path is exercised by at least one E2E test.
- **CI/CD**: Ensure tests run on every push to the `main` branch.
