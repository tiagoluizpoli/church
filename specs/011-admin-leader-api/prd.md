# Product Requirement Document: Admin & Leader API (Spec A1)

## Problem Statement

Ministry leaders and administrators need a secure, type-safe API to construct schedules, assign volunteers, manage staffing requirements, and publish or cancel events within their church and ministry context. Without this API, they cannot view volunteer availability, manage schedule grids, or ensure assignments do not violate qualification and availability constraints.

## Solution

Implement the Admin & Leader API exposing endpoints for schedule builder reads, slot requirement updates, volunteer assignments, assignment removals, and event publication/cancellation. The API enforces strict multi-tenant isolation (`churchId`) and contextual role-based access control (RBAC), verifying that the caller is a global Church Admin or a Leader of the ministry owning the event.

## User Stories

1. As a Ministry Leader, I want to retrieve all slots, requirements, and volunteer availability for an event, so that I can see the complete scheduling grid and make informed assignments.
2. As a Ministry Leader, I want to add or update staffing needs (SlotRequirements) for a specific time slot, so that I can adjust the volunteer roles required for an upcoming service.
3. As a Ministry Leader, I want to assign a volunteer to a specific role in a time slot, so that they are booked to serve, with the system warning me of any availability or scheduling conflicts.
4. As a Ministry Leader, I want to remove a volunteer assignment from a time slot, so that they are released from duty.
5. As a Ministry Leader, I want to publish the drafted schedule for an event, so that assignments are finalized, notifications are triggered, and volunteers can see their schedules.
6. As a Ministry Leader, I want to cancel an event schedule, so that all slots and assignments are cancelled and volunteers are notified.

## Implementation Decisions

### Modules & Interfaces
- **Admin & Leader tRPC Router**: Exposes endpoints under a unified router.
- **Contextual RBAC Middleware**: Intercepts requests to verify the caller has `CHURCH_ADMIN` or contextual `MINISTRY_LEADER` role for the ministry owning the event.
- **Tenancy Validation**: Automatically filters all queries and mutations by the caller's session `churchId`.

### API Contracts
- `getScheduleBuilderData(eventId)`: Returns event details, slots, requirements, assignments, and availability for all volunteers who are members of the ministry owning the event.
- `upsertSlotRequirement(timeSlotId, roleId, count)`: Adds or updates required staffing count. Rejects if role does not belong to the ministry or is not global.
- `createAssignment(timeSlotId, volunteerId, roleId, allowOverride, overrideReason, status)`: Creates an assignment. Status defaults to `pending` on published events, but supports hybrid `draft` status if explicitly requested.
- `deleteAssignment(assignmentId)`: Removes an assignment.
- `publishEvent(eventId)`: Publishes the event.
- `cancelEvent(eventId)`: Cancels the event.

### Key Grilling Decisions & Business Rules
- **Publishing Atomicity**: Publishing is atomic at the event level. If any assignment fails a hard constraint validation at publish time, the entire operation rolls back.
- **Overstaffing Warning**: If a leader reduces a requirement count below the number of active assignments, the system allows the update but returns a warning, leaving the excess assignments intact.
- **Hard Constraints**: Qualification, ministry membership, duplicate assignment, and past event checks are non-overridable. Overrides only apply to soft constraints (unavailable, double-booked, overworked).
- **Override Reason Validation**: If `allowOverride` is true and soft conflicts exist, the API requires a non-empty `overrideReason` string parameter.
- **Assignment Removal Lifecycle**: Removing a `draft` assignment deletes the database row completely. Removing a `pending` or `confirmed` assignment transitions its status to `cancelled` for auditing and notifications.
- **Availability Scope**: The schedule builder only returns availability details for volunteers registered as members of the ministry owning the event, preventing large payload sizes.
- **Audit Logs**: Every assignment state change (create, transition, delete) writes a record to the `AssignmentAudit` trail, capturing the actor ID and override reasons.

## Testing Decisions

- **Access Control Tests**: Verify that regular volunteers and leaders from other ministries are blocked from all endpoints.
- **Multi-Tenancy Tests**: Verify that cross-church requests fail with appropriate authorization or not-found errors.
- **Validation Tests**: Verify that hard constraint failures cannot be bypassed by the override parameter. Verify that soft conflicts are rejected when `allowOverride` is false or when `overrideReason` is empty.
- **Lifecycle Cascade Tests**: Verify that cancelling a draft event deletes its draft assignments, while cancelling a published event transitions them to `cancelled`. Verify that publishing rolls back atomically if any assignment fails hard constraint validation.

## Out of Scope

- **Notifications Engine**: The API emits asynchronous domain events (`EventPublished`, `EventCancelled`); sending emails/SMS/push notifications is handled out-of-scope by an async event subscriber.
- **Individual Slot Deletion/Creation**: Managing slots and event metadata is handled by the Event Setup API.

## Further Notes

- All timestamps are received, processed, and persisted in UTC format.
