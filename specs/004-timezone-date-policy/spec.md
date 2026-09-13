# Feature Specification: Timezone & Date Policy
**Feature Branch**: `004-timezone-date-policy`  
**Created**: 2026-05-07  
**Status**: Draft  
**Amended by**: [ADR-0003](../../docs/adr/0003-date-time-seam-church-timezone-truth.md) — the core storage policy below still holds; see that ADR for what changed (day/instant vocabulary, church-timezone plumbing, the enforced seam, time format, time-entry direction) and a line-by-line disposition of every requirement, entity, and success criterion here.  
**Input**: User description: "Establish a strict, system-wide policy for timezone and date management to ensure deterministic scheduling and avoid common date-related bugs."

## Clarifications

### Session 2026-05-07
- Q: For recurring volunteer availability, should the recurrence be anchored to the Church's local time or the Volunteer's local time? → A: **Church's local time**.
- Q: During migration, what should be the default IANA timezone for existing churches? → A: **UTC**.
- Q: If a church's timezone changes after events are scheduled, should UTC be updated? → A: **Keep UTC unchanged** (absolute time is preserved).
- Q: Should volunteers see a timezone indicator when setting availability? → A: **Yes, prominently**.
- Q: Should the User-local vs Church-local toggle be persisted? → A: **Transient UI state**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deterministic Schedule Display (Priority: P1)

As a Ministry Leader, I want to see the schedule in my local church's timezone regardless of my current physical location, so that I can manage events without doing mental timezone math.

**Why this priority**: Correct scheduling is the core value of the platform. Timezone errors lead to missed services and volunteer confusion.

**Independent Test**: Can be fully tested by creating an event at a fixed local time and verifying it displays correctly for users in different timezones when configured for "Church-local" display.

**Acceptance Scenarios**:

1. **Given** a church configured for "America/New_York" timezone, **When** a leader schedules an event for Sunday at 9:00 AM, **Then** the database persists the timestamp as `13:00:00Z` (UTC).
2. **Given** a user in "Europe/London" viewing the New York church schedule, **When** they view the event list, **Then** the event displays as "9:00 AM" with an explicit timezone indicator (EDT/EST).

---

### User Story 2 - Accurate Availability Matching (Priority: P1)

As a Volunteer, I want my availability to match event slots correctly even during Daylight Saving Time (DST) transitions, so that I am not incorrectly flagged as unavailable or double-booked.

**Why this priority**: DST transitions are the most frequent source of scheduling bugs.

**Independent Test**: Can be tested by running availability matching logic against mock data crossing a DST boundary (e.g., "Spring Forward").

**Acceptance Scenarios**:

1. **Given** a volunteer available on Sunday from 08:00 to 10:00 UTC, **When** an event slot is defined for 08:30 to 09:30 UTC, **Then** the system identifies the volunteer as available regardless of local DST status.
2. **Given** a local clock change at 02:00 AM, **When** checking for conflicts between 01:00 AM and 03:00 AM, **Then** the system uses UTC intervals to ensure no gaps or overlaps are missed.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Persistence Layer MUST store all date and time values in UTC using timezone-aware data types.
- **FR-002**: Backend Layer MUST perform all duration calculations, availability overlaps, and conflict checks exclusively in UTC.
- **FR-003**: Presentation Layer MUST convert UTC timestamps to a target timezone (Church-local or User-local) only at the moment of rendering.
- **FR-004**: The system MUST allow configuring a "Home Timezone" for each Church entity; during migration, existing churches MUST default to "UTC".
- **FR-005**: API Layer MUST accept and return ISO 8601 strings with explicit UTC indicators (`Z`).
- **FR-006**: System MUST handle DST transitions by relying on IANA timezone database names (e.g., `America/Chicago`) rather than fixed offsets.
- **FR-007**: Availability input components MUST display a prominent timezone indicator reflecting the Church's local timezone.

### Key Entities *(include if feature involves data)*

- **Church**: Includes a `timezone` attribute (IANA name) to define the reference clock for all local events.
- **Event Slot**: Stores `start_at` and `end_at` as UTC timestamps.
- **Volunteer Availability**: Stores time windows as UTC timestamps; recurrence rules MUST be anchored to the Church's local timezone.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of date/time columns in the database schema use timezone-aware storage.
- **SC-002**: Automated integration tests confirm that availability matching works correctly for users in at least 3 different timezones with varying DST rules.
- **SC-003**: Frontend components render timestamps correctly in both "Church-local" and "User-local" modes without manual refresh or layout shifts.

## Assumptions

- The `date-fns` and `date-fns-tz` libraries will be the standard for date manipulation.
- Browsers provide reliable timezone information via `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Historical data correction for timezone changes is out of scope; absolute UTC timestamps are preserved even if the church timezone changes.
- We will use the church's local timezone as the primary display reference for all users by default; the User-local toggle is a transient UI state.
