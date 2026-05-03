# Spec A1: Admin & Leader API (tRPC)

## Purpose
Expose management functionality for Ministry Leaders and Admins.

## 1. Endpoints
- `getScheduleBuilderData`: Returns all slots, requirements, and volunteer availability for an event.
- `upsertSlotRequirement`: Add or update staffing needs.
- `createAssignment`: Assign a volunteer (calls `ConflictService`).
- `publishEvent`: Finalize the schedule (calls `AssignmentManager`).

## 2. Input Validation
- Use **Zod** for all schemas.
- Ensure `churchId` is present in all inputs (or extracted from the session).

## 3. Security
- Use `protectedProcedure` middleware.
- Contextual check: Ensure the user is a `LEADER` in the ministry owning the event.

## 4. Testing Requirements (Mandatory)
- **Integration**: Verify that a non-leader receives an `UNAUTHORIZED` error when calling `publishEvent`.
- **Integration**: Verify that `churchId` from the session matches the `church_id` of the resources being modified.

## 🔗 References
- [Spec 05: Onboarding Links](./05-onboarding-links.md)
- [Spec 10: Scheduling API](./10-scheduling-api.md)
