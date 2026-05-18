# Feature Specification: Slot & Assignment Manager (Spec L3)

**Feature Branch**: `008-assignment-manager`

**Created**: 2026-05-17

**Status**: Draft

**Input**: User description: "Slot & Assignment Manager — Lifecycle rules (Draft vs Published), cancellations, substitutions, and slot generation strategies. Refines 08-slot-generator.md and 12-lifecycle-rules.md."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate Time Slots for an Event (Priority: P1)

As a ministry leader creating a new event, I need the system to automatically generate time slots based on either an equal-split strategy or a predefined ministry template, so that I don't have to manually create each slot one by one.

**Why this priority**: Slot generation is the foundational step of the entire scheduling workflow. Without slots, there is nothing to assign volunteers to. Every downstream feature (publishing, substitutions, cancellations) depends on slots existing.

**Independent Test**: Can be fully tested by providing an event duration and generation parameters, then asserting the correct number of slots are produced with valid, non-overlapping time ranges.

**Acceptance Scenarios**:

1. **Given** an event with a 2-hour duration and a requested slot duration of 30 minutes, **When** equal-split generation is invoked, **Then** exactly 4 sequential, non-overlapping slots are produced, each with correct start and end times.
2. **Given** an event with a 65-minute duration and a requested slot duration of 30 minutes, **When** equal-split generation is invoked, **Then** 2 full 30-minute slots and 1 trailing 5-minute slot are produced (no time is silently discarded).
3. **Given** a ministry template named "Sunday Morning" with 3 predefined periods ("Pre-service 08:00–08:30", "Service 08:30–10:00", "Cleanup 10:00–10:30"), **When** template-based generation is invoked for a matching event date, **Then** exactly 3 slots are produced matching the template's labels, times, and order.
4. **Given** a ministry template with slot requirements (e.g., "Service" needs 2 Vocalists + 1 Sound Tech), **When** template-based generation completes, **Then** each generated slot inherits the corresponding `SlotRequirement` records (role + required count).
5. **Given** a multi-day event spanning 2 days, **When** slots are generated, **Then** each slot's date label correctly reflects the day it belongs to.

---

### User Story 2 - Publish a Schedule (Priority: P1)

As a ministry leader, after I finish building a schedule (creating an event, generating slots, and assigning volunteers), I need to publish it so that all assigned volunteers are notified and can begin their confirmation flow.

**Why this priority**: Publishing is the transition from "planning mode" to "active mode." Until a schedule is published, volunteers are unaware of their assignments. This is the critical gate in the scheduling lifecycle.

**Independent Test**: Can be tested by setting up a draft event with assignments, invoking the publish action, and asserting that the event status, all assignment statuses, and notification triggers are correctly updated.

**Acceptance Scenarios**:

1. **Given** an event in `draft` status with 5 assignments in `draft` status where all volunteers still pass hard constraints, **When** the leader publishes the event, **Then** the event status transitions to `published` AND all 5 assignments transition from `draft` to `pending`.
2. **Given** an event in `draft` status with zero assignments, **When** the leader attempts to publish, **Then** the system rejects the publish with a domain error indicating "Cannot publish an event with no assignments."
3. **Given** an event already in `published` status, **When** the leader attempts to publish again, **Then** the system rejects the action with a domain error indicating the event is already published.
4. **Given** an event in `draft` status whose start date is in the past, **When** the leader attempts to publish, **Then** the system rejects the action with a domain error indicating "Cannot publish a past event."
5. **Given** an event in `draft` status with 3 assignments where 1 volunteer has since lost their role qualification, **When** the leader attempts to publish, **Then** the system rejects the action with a domain error listing the assignments that now fail hard constraints, so the leader can remove or reassign them before retrying.

---

### User Story 3 - Cancel an Event (Priority: P1)

As a ministry leader, I need to cancel an entire event when circumstances change (e.g., weather, building issue), so that all assigned volunteers are released and no one shows up unnecessarily.

**Why this priority**: Cancellation is an essential safety valve. Without it, leaders have no way to cleanly unwind a published schedule, leading to confusion and no-shows.

**Independent Test**: Can be tested by publishing an event, invoking cancellation, and asserting that the event, all slots, and all assignments transition to `cancelled` status.

**Acceptance Scenarios**:

1. **Given** a published event with 3 slots and 8 assignments across them, **When** the leader cancels the event, **Then** the event status transitions to `cancelled`, all slot statuses transition to `cancelled`, and all assignment statuses transition to `cancelled`.
2. **Given** a draft event, **When** the leader cancels it, **Then** the event transitions to `cancelled` and all draft assignments are removed (not transitioned — they were never visible to volunteers).
3. **Given** a cancelled event, **When** the leader attempts to cancel it again, **Then** the system rejects the action with a domain error.
4. **Given** a past event (status `past`), **When** the leader attempts to cancel it, **Then** the system rejects the action with a domain error indicating "Cannot cancel a past event."

---

### User Story 4 - Volunteer Declines an Assignment (Priority: P2)

As a volunteer who has received a pending assignment, I need to decline it with an optional reason, so that the ministry leader is notified and can find a replacement.

**Why this priority**: Declining is the volunteer's primary agency mechanism. Without it, volunteers have no way to communicate unavailability after a schedule is published, which degrades trust in the system.

**Independent Test**: Can be tested by creating a pending assignment, invoking the decline action with a reason, and asserting the assignment status, audit record, and leader notification trigger.

**Acceptance Scenarios**:

1. **Given** an assignment in `pending` status, **When** the volunteer declines with reason "Family emergency", **Then** the assignment status transitions to `declined` and an `AssignmentAudit` record is created with action `status_change` and the provided reason.
2. **Given** an assignment in `pending` status, **When** the volunteer declines without a reason, **Then** the assignment status transitions to `declined` and an audit record is created with an empty reason.
3. **Given** an assignment in `confirmed` status, **When** the volunteer attempts to decline, **Then** the assignment transitions to `declined` (volunteers can withdraw even after confirming).
4. **Given** an assignment in `draft` status, **When** a decline is attempted, **Then** the system rejects the action — draft assignments are not visible to volunteers and cannot be declined.
5. **Given** an assignment in `cancelled` status, **When** a decline is attempted, **Then** the system rejects the action — cancelled assignments cannot be declined.

---

### User Story 5 - Find Replacement Volunteers (Priority: P2)

As a ministry leader, when a volunteer declines or is unavailable, I need the system to suggest qualified replacements who are available and haven't already declined the same slot, so I can quickly fill the gap.

**Why this priority**: Substitution is the key workflow recovery mechanism. Without it, leaders must mentally track who is qualified, available, and hasn't already declined — which doesn't scale.

**Independent Test**: Can be tested by setting up a slot with a declined volunteer, creating mock availability and qualification data, and asserting the returned candidates match all three filter criteria.

**Acceptance Scenarios**:

1. **Given** a slot requiring a "Vocalist" role and 3 volunteers qualified as Vocalist in the ministry, **When** replacement candidates are requested, **Then** only volunteers who are (a) qualified for the role, (b) available during the slot's time window (via Availability Engine), and (c) have not already declined this specific slot are returned.
2. **Given** a slot where all qualified volunteers are either unavailable or have declined, **When** replacement candidates are requested, **Then** an empty list is returned (the system does not suggest unqualified volunteers).
3. **Given** a slot where a qualified volunteer is available but already assigned to an overlapping slot in a DIFFERENT ministry, **When** replacement candidates are requested, **Then** that volunteer is excluded from results (double-booking prevention).
4. **Given** a request for replacement candidates, **When** the results are returned, **Then** they are sorted by workload (least-scheduled volunteers first) to promote fairness.

---

### User Story 6 - Volunteer Confirms an Assignment (Priority: P2)

As a volunteer with a pending assignment, I need to confirm my participation so that the ministry leader knows I will attend.

**Why this priority**: Confirmation closes the scheduling loop. It's the positive counterpart to declining, and leaders need visibility into who has confirmed vs. who is still pending.

**Independent Test**: Can be tested by creating a pending assignment, invoking confirmation, and asserting the status transition and audit record.

**Acceptance Scenarios**:

1. **Given** an assignment in `pending` status, **When** the volunteer confirms, **Then** the assignment status transitions to `confirmed` and an `AssignmentAudit` record is created with action `status_change`.
2. **Given** an assignment in `draft` status, **When** confirmation is attempted, **Then** the system rejects the action — draft assignments are not visible to volunteers.
3. **Given** an assignment already in `confirmed` status, **When** confirmation is attempted again, **Then** the system is idempotent and returns success without creating a duplicate audit record.

---

### User Story 7 - Event Lifecycle Transitions (Priority: P3)

As the system, I need to automatically transition events to `past` status after their end date has passed, so that reporting and historical views are accurate.

**Why this priority**: This is a background housekeeping concern. It doesn't block the core scheduling flow but is needed for data hygiene and accurate dashboard reporting.

**Independent Test**: Can be tested by creating events with past end dates and invoking the transition logic, asserting the correct status change.

**Acceptance Scenarios**:

1. **Given** a published event whose `endDate` has passed, **When** the lifecycle transition is evaluated, **Then** the event status changes to `past` and all `pending` assignments for that event transition to `confirmed` (assumed attended if not explicitly declined).
2. **Given** a draft event whose `endDate` has passed, **When** the lifecycle transition is evaluated, **Then** the event status changes to `cancelled` (unpublished past drafts are automatically cleaned up).
3. **Given** an event whose `endDate` is in the future, **When** the lifecycle transition is evaluated, **Then** no status change occurs.

---

### Edge Cases

- What happens when slot generation is requested for an event that already has slots? The system MUST reject the generation to prevent duplicate slots. Leaders must explicitly delete existing slots before regenerating.
- What happens when a template references roles that don't exist in the ministry? The slot is generated, but the requirement referencing the missing role is flagged as a warning (not a blocking error) — the leader can fix it before publishing.
- What happens when publishing is attempted but some assignments have unresolved soft conflicts (from Spec L2)? Publishing proceeds — conflict validation occurs at assignment-creation time, not at publish time. If a leader already overrode a conflict during assignment, the override stands.
- What happens to a volunteer's pending assignments in OTHER events when they decline one assignment? Nothing — declining one assignment has no cascading effect on other events or slots.
- What happens when the last assignment on a slot is cancelled/declined? The slot remains active but unfilled. The leader is notified that the slot has zero assignments and may need attention.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support two slot generation strategies: **Equal Split** (divides event duration into equal-length slots with a trailing remainder slot) and **Template-Based** (uses predefined ministry templates with named time periods).
- **FR-002**: Template-based slot generation MUST automatically copy `SlotRequirement` records (role + required count) from the template to each generated slot.
- **FR-003**: Slot generation MUST be rejected if the target event already has existing slots.
- **FR-004**: System MUST support the **Publish** lifecycle action, which transitions the event from `draft` to `published` and all associated assignments from `draft` to `pending`.
- **FR-005**: Publishing MUST re-validate all assignments against hard constraints (qualification, ministry membership, duplicate assignment) before transitioning. Publishing MUST be rejected for events with zero assignments, events already in `published` status, events whose start date is in the past, and events where any assignment now fails a hard constraint. Soft constraints are NOT re-evaluated at publish time.
- **FR-006**: System MUST support the **Cancel Event** action, which transitions the event to `cancelled` and cascades cancellation to all associated slots and assignments.
- **FR-007**: Cancelling a draft event MUST remove (delete) all draft assignments rather than transitioning them, since draft assignments were never visible to volunteers.
- **FR-008**: Cancellation MUST be rejected for events already in `cancelled` or `past` status.
- **FR-009**: System MUST support the **Decline Assignment** action, which transitions an assignment from `pending` or `confirmed` to `declined` with an optional reason.
- **FR-010**: Declining MUST be rejected for assignments in `draft` or `cancelled` status.
- **FR-011**: System MUST support the **Confirm Assignment** action, which transitions an assignment from `pending` to `confirmed`. Confirmation MUST be idempotent — confirming an already-confirmed assignment succeeds without creating a duplicate audit record.
- **FR-012**: Every status change (publish, cancel, decline, confirm) MUST generate an `AssignmentAudit` record with the action type, actor identity, reason (if provided), and timestamp. The `action` field MUST be extended beyond the D1 base values (`created`, `updated`, `deleted`, `status_change`) to include event-level audit types: `event_published`, `event_cancelled`. Assignment-level actions (confirm, decline) use `status_change`.
- **FR-013**: System MUST provide a `findReplacementVolunteers(slotId, roleId)` method that returns volunteers who are: (a) qualified for the specified role, (b) available during the slot's time window (via Availability Engine), (c) not already assigned to an overlapping slot, and (d) have not already declined this specific slot.
- **FR-014**: Replacement candidates MUST be sorted by workload (ascending — least-scheduled first) to promote scheduling fairness.
- **FR-015**: System MUST support automatic lifecycle transitions: published events past their end date transition to `past`; draft events past their end date transition to `cancelled`.
- **FR-016**: When an event transitions to `past`, all remaining `pending` assignments MUST automatically transition to `confirmed` (assumed attended).
- **FR-017**: All operations MUST enforce `churchId` isolation — events, slots, assignments, and replacement queries are scoped to the volunteer's church.
- **FR-018**: The Slot & Assignment Manager MUST remain a pure domain service with no direct infrastructure dependencies, receiving all data through injected interfaces.

### Key Entities

- **SlotGenerationStrategy**: Discriminated union representing the generation approach — `EqualSplit` (event duration, slot duration) or `TemplateBased` (template reference with named periods and requirements).
- **SchedulePublishResult**: Outcome of publishing, containing the updated event status, count of assignments transitioned, and any warnings.
- **EventCancellationResult**: Outcome of cancellation, containing the updated event status, count of slots and assignments affected, and whether assignments were deleted (draft) or transitioned (published).
- **ReplacementCandidate**: A volunteer who passes all substitution filters, annotated with their current workload count for sorting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Equal-split slot generation correctly handles exact divisions and remainders in 100% of test cases, producing non-overlapping time windows that fully cover the event duration.
- **SC-002**: Template-based slot generation correctly copies all `SlotRequirement` records from the template in 100% of test cases.
- **SC-003**: Publishing correctly transitions event and all assignments in 100% of test cases, re-validates hard constraints on every assignment, and is rejected for all invalid states (no assignments, already published, past event, stale hard constraint failures).
- **SC-004**: Event cancellation correctly cascades to all slots and assignments in 100% of test cases, differentiating between draft (delete) and published (transition) assignments.
- **SC-005**: Decline and confirm actions correctly enforce allowed source statuses and produce audit records in 100% of test cases.
- **SC-006**: Replacement candidate search correctly filters by qualification, availability, no overlap, and no prior decline — returning an empty list when no candidates match.
- **SC-007**: All operations enforce `churchId` isolation — cross-church data access is impossible in every test scenario.
- **SC-008**: Service operates as a pure domain service with zero direct infrastructure dependencies.

## Assumptions

- The Availability Engine (Spec L1) is fully implemented and provides volunteer availability resolution for any time window query.
- The Conflict & Validation Service (Spec L2) is fully implemented and provides hard/soft constraint validation at assignment-creation time. The Assignment Manager re-validates **hard constraints only** at publish time to catch stale data (e.g., volunteer lost qualification or left ministry between assignment creation and publishing). Soft constraints are NOT re-evaluated at publish time — the leader already reviewed and potentially overrode them during assignment creation.
- Domain Entities (Spec D1) — including Event, TimeSlot, SlotRequirement, Assignment, AssignmentAudit, and Availability — are fully defined and available for use.
- The `churchId` isolation pattern established in previous specs is reused without modification.
- Ministry templates (for template-based generation) are provided as input data by the caller — the template data model is not defined in this spec. This spec defines the generation logic that consumes templates.
- The notification mechanism (triggering alerts to volunteers on publish, cancel, or decline) is out of scope for this domain service. Notifications will be handled by the application layer (Spec L4) listening to domain events or command results.
- Automatic lifecycle transitions (published → past, draft → cancelled) are triggered by a scheduled background process (Spec L5), not by the domain service itself. This spec defines the transition logic; the trigger mechanism is external.
- Replacement candidate sorting by workload uses the same fairness metric defined in Spec L2 (service count within the current scheduling period).
- The `AssignmentAudit` entity from Spec D1 is reused for all audit records. The `action` field is **extended** beyond the D1 base values to include event-level audit types: `event_published` and `event_cancelled`. This requires a minor additive update to the D1 `action` string literal union type. Assignment-level actions (confirm, decline) continue to use `status_change`.
