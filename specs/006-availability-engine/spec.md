# Feature Specification: Availability Engine (Spec L1)

**Feature Branch**: `006-availability-engine`

**Created**: 2026-05-15

**Status**: Draft

**Input**: User description: "start the availability engine now. read all the files and related files to that specific specification (06-availability-engine.md)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resolve Volunteer Availability (Priority: P1)

As the scheduling system, I need to reliably determine if a volunteer is available for a specific time range, so that ministry leaders can make informed scheduling decisions without double-booking people.

**Why this priority**: Core scheduling functionality depends on knowing who is actually available. Without this, the system is just a manual calendar.

**Independent Test**: Can be fully tested by providing a `volunteer_id` and `time_range` and asserting the output against mock blockouts and assignments.

**Acceptance Scenarios**:

1. **Given** a volunteer with no blockouts or assignments in the timeframe, **When** availability is checked, **Then** return `AVAILABLE`.
2. **Given** a volunteer with a blockout overlapping the timeframe, **When** availability is checked, **Then** return `UNAVAILABLE`.
3. **Given** a volunteer with a confirmed or pending assignment overlapping the timeframe, **When** availability is checked, **Then** return `DOUBLE_BOOKED`.

---

### User Story 2 - Editing Existing Assignments (Priority: P2)

As a ministry leader editing an existing assignment, I need the availability engine to ignore the volunteer's current assignment for that slot, so that I don't get a false `DOUBLE_BOOKED` warning against their own shift.

**Why this priority**: Required for updating schedules. Without it, you cannot change the role or details of an existing assignment without triggering a conflict error.

**Independent Test**: Can be tested by passing an `exclude_assignment_id` to the engine.

**Acceptance Scenarios**:

1. **Given** a volunteer assigned to "Slot A", **When** checking availability for the same time with `exclude_assignment_id` = "Slot A", **Then** return `AVAILABLE` (assuming no other conflicts).
2. **Given** a volunteer assigned to "Slot A" and "Slot B", **When** checking availability with `exclude_assignment_id` = "Slot A", **Then** return `DOUBLE_BOOKED` due to "Slot B".

### Edge Cases

- What happens when a shift crosses midnight (e.g., 10 PM to 2 AM)?
- What happens when a blockout is marked as `is_all_day`? The engine expects the repository layer to have already resolved this into strict UTC bounds (00:00 to 23:59 local time) before injecting it.
- What happens when an overlap is only partial (e.g., blockout ends at 10:00 AM, shift starts at 09:30 AM)?
- What happens when a shift is exactly back-to-back with a blockout (e.g., blockout ends at 09:00 AM, shift starts at 09:00 AM)? (Should be `AVAILABLE`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST calculate availability status (`AVAILABLE`, `UNAVAILABLE`, `DOUBLE_BOOKED`) based on existing `Availability` (blockouts) and `Assignment` records.
- **FR-002**: System MUST enforce `church_id` isolation for all queries.
- **FR-003**: System MUST accept an optional `exclude_assignment_id` parameter to ignore a specific assignment during the check.
- **FR-004**: System MUST evaluate `is_all_day` blockouts using pre-calculated UTC bounds provided by the caller, keeping the domain engine pure of timezone logic.
- **FR-005**: System MUST accurately handle time ranges that cross midnight.
- **FR-006**: System MUST evaluate overlapping ranges using strict mathematical bounds (e.g., `start1 < end2 && end1 > start2`).

### Key Entities

- **AvailabilityEngine**: Domain Service that orchestrates the checks and encapsulates the business rules for "what constitutes a conflict".
- **Availability (Blockout)**: Data representing periods when the volunteer explicitly cannot serve.
- **Assignment**: Data representing existing commitments that cause double-booking conflicts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Availability engine correctly identifies all 3 states (Available, Unavailable, Double Booked) with 100% accuracy in unit tests.
- **SC-002**: 100% of defined edge cases (partial overlaps, back-to-back shifts, midnight crossing, all-day blockouts) pass automated testing.
- **SC-003**: Service executes purely in TypeScript with no direct external dependencies, relying entirely on injected data or repository interfaces.

## Assumptions

- The system strictly adheres to the Timezone Policy (Spec S4). All inputs (`time_range`) are provided in UTC.
- "Back-to-back" events (where Event A ends exactly when Event B begins) are NOT considered conflicts.
