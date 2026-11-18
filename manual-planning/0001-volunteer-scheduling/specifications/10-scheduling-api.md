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
- `getVolunteerDashboard(input?: DashboardQuery)` -> Returns volunteer dashboard snapshot and summary counts.
- `getMyUpcomingAssignments(input?: AssignmentWindowQuery)` -> Returns current/upcoming published assignments for the current volunteer.
- `respondToAssignment(assignmentId, status)` -> Confirms or declines one assignment owned by the current volunteer.
- `submitAvailability(input: AvailabilitySchema)` -> Saves event-scoped availability and may return overlap warnings.
- `getMyAvailability(input?: AvailabilityQuery)`
- `getMyNotifications(input?: NotificationCursorQuery)`
- `markNotificationRead(notificationId)`
- `markAllNotificationsRead()`
- `getMinistrySchedule(ministryId, range?)`

---

## 3. Public Procedures
- `validateInviteToken(token: string)`

---

## 4. Testing Requirements (Mandatory)
- **Integration**: Verify that `assignVolunteer` returns a `409` conflict when the volunteer is double-booked.
- **Integration**: Verify that `publishSchedule` is idempotent (calling it twice doesn't send duplicate notifications).
- **Security**: Verify that all `Leader` procedures use the RBAC middleware to check for `LEADER` or `SUB_LEADER` status.
- **Security**: Verify that volunteer procedures never expose another volunteer's assignments, availability, notifications, or ministry schedule data beyond published volunteer-facing fields.
