# Spec A2: Volunteer API (tRPC)

## Purpose
Expose service and availability management for Volunteers.

## 1. Endpoints
- `getMyAssignments`: List all past and future assignments for the current user.
- `confirmAssignment`: Set status to `confirmed`.
- `declineAssignment`: Set status to `declined` (requires reason).
- `upsertAvailability`: Add or update blockout dates.

## 2. Security
- Use `protectedProcedure`.
- Ownership check: A volunteer can ONLY modify their own assignments and availability.

## 3. Testing Requirements (Mandatory)
- **Integration**: Verify that a user cannot confirm an assignment belonging to someone else.
- **Integration**: Verify that `upsertAvailability` correctly links the record to the current user's `church_id`.

## 🔗 References
- [Spec 10: Scheduling API](./10-scheduling-api.md)
