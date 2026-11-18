# Feature Specification: Admin & Leader API (Spec A1)

**Feature Branch**: `011-admin-leader-api`

**Created**: 2026-06-25

**Status**: Draft

**Input**: User description: "Expose management functionality for Ministry Leaders and Admins."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fetch Schedule Builder Data (Priority: P1)

As a Ministry Leader, I want to retrieve all slots, requirements, and volunteer availability for an event, so that I can see the complete scheduling grid and make informed assignments.

**Why this priority**: Ministry Leaders cannot schedule anyone without a visual representation of who is available and what positions are unfilled. This is the read-foundation of the scheduling builder.

**Independent Test**: Can be tested by requesting builder data for a specific event and verifying it returns the correct structure: event details, time slots, slot requirements, assigned volunteers, and availability data for all qualified volunteers.

**Acceptance Scenarios**:

1. **Given** a Ministry Leader of Kids Ministry, **When** they request builder data for a Kids Ministry event, **Then** the system returns all time slots, requirements, assignments, and volunteer availabilities for that event.
2. **Given** a Volunteer of the church who is not a leader, **When** they attempt to read this data, **Then** the request is rejected with an authorization error.
3. **Given** a Ministry Leader, **When** they request data for an event belonging to a different Church, **Then** the request is rejected with a not found or access denied error, preventing cross-church data leakage.

---

### User Story 2 - Add or Update Staffing Needs (Priority: P1)

As a Ministry Leader, I want to add or update staffing needs (SlotRequirements) for a specific time slot, so that I can adjust the volunteer roles required for an upcoming service.

**Why this priority**: Staffing needs change dynamically. Leaders must be able to add extra roles (e.g., need 2 Vocalists instead of 1) or remove roles before and during scheduling.

**Independent Test**: Can be tested by upserting a requirement and verifying the staffing count is updated and visible on subsequent queries.

**Acceptance Scenarios**:

1. **Given** a Ministry Leader, **When** they update a slot requirement (e.g., set Vocalist count to 2 on Sunday 9AM), **Then** the requirement is saved and returns the updated requirement details.
2. **Given** a Ministry Leader, **When** they attempt to update a requirement for an event belonging to a different Church, **Then** the update fails and no data changes.
3. **Given** a Ministry Leader, **When** they reduce the requirement count (e.g., 2 -> 1) but 2 active assignments exist, **Then** the requirement is updated, a warning is returned indicating the slot is "overstaffed", and both existing assignments remain intact.

---

### User Story 3 - Assign a Volunteer with Conflict Check (Priority: P1)

As a Ministry Leader, I want to assign a volunteer to a specific role in a time slot, so that they are booked to serve, with the system warning me of any conflicts.

**Why this priority**: The core of the scheduling builder is assigning people to roles. This operation must check availability, qualifications, and double-bookings.

**Independent Test**: Can be tested by creating an assignment and verifying that:
- A valid assignment is created.
- Assigning a non-qualified volunteer or double-booking returns validation failures or triggers authorization/override rules.

**Acceptance Scenarios**:

1. **Given** a qualified, available volunteer, **When** a leader assigns them to a slot, **Then** the assignment is created and saved.
2. **Given** a volunteer who is already assigned to a conflicting slot, **When** a leader assigns them, **Then** the system rejects the assignment with a conflict error, unless the leader explicitly requests an override with a non-empty override reason.
3. **Given** a volunteer who is not qualified for the role, **When** a leader assigns them with override enabled, **Then** the request is still rejected with a qualification validation error (hard constraints cannot be bypassed).
4. **Given** a published event, **When** a leader assigns a volunteer, **Then** the assignment status defaults to `pending` unless the leader explicitly requests creating it as `draft`.

---

### User Story 4 - Remove Volunteer Assignment (Priority: P1)

As a Ministry Leader, I want to remove a volunteer assignment from a time slot, so that they are released from duty.

**Why this priority**: Leaders must be able to undo assignments when plans change or when a volunteer indicates they cannot serve.

**Independent Test**: Can be tested by deleting an assignment and verifying the volunteer is removed and slot status is updated.

**Acceptance Scenarios**:

1. **Given** an assignment in `draft` status, **When** the leader removes it, **Then** the assignment row is deleted completely from the database.
2. **Given** an assignment in `pending` or `confirmed` status, **When** the leader removes it, **Then** the assignment status transitions to `cancelled` and is kept in the database (not deleted) for auditing and notifications.

---

### User Story 5 - Publish Event Schedule (Priority: P2)

As a Ministry Leader, I want to publish the drafted schedule for an event, so that assignments are finalized, notifications are triggered, and volunteers can see their schedules.

**Why this priority**: Assignments are created in a draft state so the leader can build the schedule incrementally without notifying volunteers until it is complete. Publishing finalizes this work.

**Independent Test**: Can be tested by publishing the schedule and verifying that all assignments change status from draft to pending and that the notification system is triggered.

**Acceptance Scenarios**:

1. **Given** an event schedule with multiple draft assignments where all pass hard constraints, **When** the leader publishes the event, **Then** the event becomes `published` and all draft assignments transition to `pending`.
2. **Given** an event schedule where one draft assignment fails a hard constraint (e.g., volunteer lost qualification), **When** the leader publishes the event, **Then** the publish operation is rolled back entirely (atomic), no assignments transition, and the validation errors are returned.

---

### Edge Cases

- **Cross-Church Security**: A user tries to query or mutate an event/slot belonging to another Church. The API MUST reject this immediately before executing any domain logic.
- **Concurrent Assignment**: Two leaders try to assign the same volunteer to different slots at the same time. The scheduling system must ensure only one succeeds if double-booking is not allowed.
- **Cancelled Draft Event**: When a draft event is cancelled, the event status is updated to `cancelled` (kept for audit trail), but all its draft assignments are deleted completely (as they were never visible to volunteers).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose API endpoints for:
  - Retrieving schedule builder data (`getScheduleBuilderData`)
  - Upserting slot staffing requirements (`upsertSlotRequirement`)
  - Assigning a volunteer (`createAssignment`)
  - Removing an assignment (`deleteAssignment`)
  - Publishing the event schedule (`publishEvent`)
  - Cancelling the event schedule (`cancelEvent`)
- **FR-002**: The system MUST validate all API input parameters.
- **FR-003**: The system MUST enforce authentication and contextual authorization. Only users with global Church Admin or contextual Ministry Leader role in the ministry owning the event can invoke these endpoints.
- **FR-004**: The system MUST automatically filter and validate all inputs against the current user's Church context extracted from their authenticated session. Cross-church queries or mutations MUST result in access denial.
- **FR-005**: Retrieving schedule builder data (`getScheduleBuilderData`) MUST require a valid event identifier and return:
  - Event details (title, start, end, ministry)
  - List of TimeSlots for the event
  - List of staffing requirements for each slot
  - List of assignments for each slot (including Volunteer details and lifecycle status)
  - Availability state list for all qualified volunteers who are members of the ministry owning the event (excluding volunteers outside the ministry).
- **FR-006**: Upserting slot staffing requirements (`upsertSlotRequirement`) MUST:
  - Accept a slot identifier (`timeSlotId`), role identifier, and required count (minimum 1).
  - Validate that the role is associated with the event's ministry or is a global role.
  - Return a warning if the requested count is less than the current number of active assignments, leaving the assignments untouched.
- **FR-007**: Assigning a volunteer (`createAssignment`) MUST:
  - Accept a slot identifier (`timeSlotId`), volunteer identifier, role identifier, an optional status override flag (`allowOverride`), and an optional `overrideReason`.
  - Accept a hybrid `asDraft` flag that defaults to `pending` on published events but allows creating assignments in `draft` status if explicitly set to `true`.
  - Prevent race conditions by performing a row lock (`SELECT ... FOR UPDATE` on the `volunteer` table row) inside the transaction during conflict checks.
  - Run hard constraints check first. If any hard constraint fails (e.g. volunteer status is inactive), throw a human-friendly validation error (cannot be overridden). All user-facing error messages MUST be written in plain, clear, non-technical language (e.g., "Volunteer [Name] is currently marked as inactive. Please activate their profile or choose a different volunteer.") to keep scheduling operations straightforward for non-technical users.
  - Run soft constraints check next. If soft conflicts exist, require `allowOverride: true` and a non-empty `overrideReason` to save, otherwise reject with a `ConflictReport`.
  - Create an `AssignmentAudit` record for the assignment.
- **FR-008**: Removing an assignment (`deleteAssignment`) MUST:
  - Accept an assignment identifier.
  - Delete the assignment row entirely if status is `draft`.
  - Transition status to `cancelled` if status is `pending` or `confirmed`.
  - Create an `AssignmentAudit` record.
- **FR-009**: Publishing the event schedule (`publishEvent`) MUST:
  - Accept an event identifier.
  - Target ONLY draft assignments (`status = 'draft'`). Existing `pending`, `confirmed`, `declined`, or `cancelled` assignments MUST NOT be modified or reset.
  - Validate all draft assignments against hard constraints. If any fail, fail the entire operation atomically (rollback) and return the failure details.
  - Transition event status to `published` and all draft assignments to `pending`.
  - Dispatch notifications via a local app event emitter stubbing the `NotificationService` interface. The `NotificationService` interface must be loosely coupled to facilitate switching to a database outbox table queue without editing the main router.
- **FR-010**: Cancelling the event schedule (`cancelEvent`) MUST:
  - Accept an event identifier.
  - Update the event status to `cancelled`.
  - Transition all non-draft assignments to `cancelled` and delete all draft assignments.
  - Dispatch notifications via `NotificationService` using the same app-level event structure.
- **FR-011**: Every single assignment state change (create, status transition, delete) MUST write an `AssignmentAudit` record, including the actor ID and any override details/reasons.
- **FR-012**: All endpoints MUST return type-safe, domain-aligned structures.

### Key Entities

- **ScheduleBuilderData**: A projection containing the unified scheduling grid data for an event.
- **Assignment**: The record mapping a volunteer to a slot and role, with a lifecycle status (`draft`, `pending`, `confirmed`, `declined`, `cancelled`).
- **SlotRequirement**: The staffing count required for a role inside a slot.
- **ConflictReport**: The structure returned when validation fails, containing details of scheduling conflicts (e.g., double-booking, missing qualifications).
- **AssignmentAudit**: Immutable record capturing state changes and overrides.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All endpoint schemas compile successfully with strict type safety.
- **SC-002**: Contextual role check blocks access to non-authorized users (verified by integration tests returning authorization error codes).
- **SC-003**: Cross-church requests are intercepted and fail with proper authorization/not-found codes.
- **SC-004**: Creating assignments successfully integrates with the conflict checking engine, returning formatted conflict reports when validation fails, and allowing overrides only with non-empty override reasons.
- **SC-005**: All assignment modifications produce a valid audit log trail in `AssignmentAudit`.
- **SC-006**: Cancelling a draft event changes its status to `cancelled` but deletes its draft assignments completely.
- **SC-007**: The test suite covers 100% of happy path and access violation path scenarios.

## Assumptions

- The authentication system successfully extracts user identity and tenant Church context.
- The Ministry-to-Volunteer role mapping is populated and accessible to verify leader permissions.
- Domain services for conflict validation and assignment lifecycle management exist and are exposed to the API layer.
- All times are handled in UTC timezone format.
