# Spec A2: Volunteer API (tRPC)

## Purpose
Expose service and availability management for Volunteers.

## 1. Endpoints
- `getMyAssignments`: List all past and future assignments for the current user. Paginated (page, pageSize). Excludes drafts. Returns list, totalCount, and pageCount. Sorted by `startTime` descending.
- `confirmAssignment`: Set status to `confirmed`. Only allowed if current status is `pending`.
- `declineAssignment`: Set status to `declined` (requires `reason` string, min 3 chars, max 255).
- `upsertAvailability`: Add or update blockout dates. Accepts optional `id`. If no `id`, inserts. If `id`, updates. Enforces `startTime < endTime`.
- `deleteAvailability`: Delete a blockout date by `id`.
- `getMyAvailability`: List all blockout dates for the current user. Accepts optional date range (`startDate`, `endDate`).

## 2. Input Validation & Policies
- Use **Zod** for all input schemas.
- **Timezone**: Dates must be received as absolute UTC.
- Enforce that a user can only perform actions for their resolved `volunteerId` and `churchId`.

## 3. Security
- Use `protectedProcedure`.
- Ownership check: A volunteer can ONLY view/modify their own assignments and availability.

## 4. Testing Requirements (Mandatory)
- **Integration**: Verify that a user cannot confirm or decline an assignment belonging to someone else.
- **Integration**: Verify that `upsertAvailability` and `deleteAvailability` correctly enforce ownership and block isolation breaches.
- **Integration**: Verify that `getMyAssignments` excludes draft assignments.

## 🔗 References
- [Spec 10: Scheduling API](./10-scheduling-api.md)
- [Spec S4: Timezone & Date Policy](./S4-timezone-policy.md)
