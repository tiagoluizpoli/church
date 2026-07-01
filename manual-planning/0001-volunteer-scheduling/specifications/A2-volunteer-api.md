# Spec A2: Volunteer API (tRPC)

## Purpose
Expose service and availability management for Volunteers.

## 1. Endpoints
- `getVolunteerDashboard`: Returns the volunteer dashboard snapshot: availability-needed tasks, current/upcoming published assignments, notification summary, and the default ministry schedule context.
- `getMyUpcomingAssignments`: Returns the volunteer's current and future published assignments across all ministries, grouped client-side by Event. Excludes drafts and removed assignments. Supports in-progress assignments until the TimeSlot ends.
- `respondToAssignment`: Transitional assignment-action endpoint. Today it still accepts `confirmed` or `declined`, but the intended volunteer-facing product direction is: confirmed assignments appear as already scheduled, and the primary post-publication action is an explicit unable-to-serve signal. Ownership required. Decline reason is not required for MVP.
- `upsertAvailability`: Add or update event-scoped slot answers for the current volunteer. The API now maps volunteer answers onto leader-defined Event slots instead of free-form volunteer-authored spans. May return an overlap warning if the submission conflicts with a published Assignment.
- `deleteAvailability`: Delete an availability entry by `id`.
- `getMyAvailability`: Return the Event slots plus any current volunteer answers for the current volunteer. Supports filtering by `eventId`.
- `getMyNotifications`: Returns scheduling notifications for the current volunteer, newest first, with cursor-based progressive loading and read/unread state.
- `markNotificationRead`: Marks a single scheduling notification as read.
- `markAllNotificationsRead`: Marks all visible scheduling notifications as read for the current volunteer.
- `getMinistrySchedule`: Returns current and upcoming published schedule data for one selected Ministry, read-only, with pagination or progressive expansion support as needed.

## 2. Input Validation & Policies
- Use **Zod** for all input schemas.
- **Timezone**: Dates must be received as absolute UTC.
- Enforce that a user can only perform actions for their resolved `volunteerId` and `churchId`.
- `respondToAssignment` must reject writes when offline support is unavailable on the client; the server remains the source of truth for assignment status.
- Availability overlap warnings should be explicit but non-blocking in MVP.

## 3. Security
- Use `protectedProcedure`.
- Ownership check: A volunteer can ONLY view/modify their own assignments and availability.
- Notification ownership check: a volunteer can ONLY view and mutate their own scheduling notifications.
- Ministry schedule reads must expose only published volunteer-facing data and never leak leader-only conflict, override, or audit detail.

## 4. Testing Requirements (Mandatory)
- **Integration**: Verify that a user cannot mutate an assignment belonging to someone else.
- **Integration**: Verify that a volunteer can change a previously confirmed assignment to declined / unable-to-serve before Event start.
- **Integration**: Verify that `upsertAvailability` and `deleteAvailability` correctly enforce ownership and block isolation breaches.
- **Integration**: Verify that volunteer-facing assignment queries exclude draft assignments.
- **Integration**: Verify that availability saves can return published-assignment overlap warnings.
- **Integration**: Verify that notification reads and mark-all-as-read enforce ownership and persist state correctly.

## 🔗 References
- [Spec 10: Scheduling API](./10-scheduling-api.md)
- [Spec S4: Timezone & Date Policy](./S4-timezone-policy.md)
