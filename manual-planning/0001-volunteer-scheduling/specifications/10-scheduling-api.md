# Spec 10: Application — Scheduling API Endpoints

## Purpose
Expose the system functionality via type-safe tRPC procedures.

---

## 1. Leader Procedures (Protected)
- `createEvent(input: CreateEventSchema)`
- `generateSlots(input: GenerateSlotsSchema)`
- `upsertRequirement(input: RequirementSchema)`
- `assignVolunteer(input: AssignmentSchema)` -> Calls Conflict Validation.
- `publishSchedule(eventId: UUID)` -> Triggers Notifications.

---

## 2. Volunteer Procedures (Protected)
- `submitAvailability(input: AvailabilitySchema)`
- `getMySchedule(range: DateRange)`
- `respondToAssignment(assignmentId, status, reason)`

---

## 3. Public Procedures
- `validateInviteToken(token: string)`

---

## 4. Testing Requirements (Mandatory)
- **Integration**: Verify that `assignVolunteer` returns a `409` conflict when the volunteer is double-booked.
- **Integration**: Verify that `publishSchedule` is idempotent (calling it twice doesn't send duplicate notifications).
- **Security**: Verify that all `Leader` procedures use the RBAC middleware to check for `LEADER` or `SUB_LEADER` status.
