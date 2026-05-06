# Feature Specification: Local Development Seeding

**Feature Branch**: `[003-local-seeding]`  
**Created**: 2026-05-05  
**Status**: Draft  
**Input**: User description: "Spec S3: Local Development Seeding. Generators for realistic mock data (Ministries, Roles, Teams, Volunteers) for UI testing."

## User Scenarios & Testing *(mandatory)*

## Clarifications
### Session 2026-05-06
- Q: Date dependencies for events → A: Generate mostly future events (80% future, 20% past) focusing on upcoming schedules.
- Q: Database constraints failure handling → A: Fail fast on constraints. Require explicit `--reset` flag to trigger a full cascading wipe (truncate) before seeding.

### User Story 1 - Generate clean development environment (Priority: P1)

As a developer, I want to run a single command to populate my local database with realistic, interconnected data across all entities (Churches, Ministries, Roles, Teams, Volunteers, Events, and Slots) so that I can immediately start testing and building the UI without manual data entry.

**Why this priority**: Essential for rapid development and testing cycles; without data, the frontend team cannot build or test the UI effectively.

**Independent Test**: Can be fully tested by running the seeder command and querying the database to verify the presence of multi-tenant, logically linked records.

**Acceptance Scenarios**:

1. **Given** an empty database schema, **When** the developer executes the seed script, **Then** the database contains a predictable baseline of data representing multiple churches, ministries, teams, and volunteers with associated roles and events.
2. **Given** an already populated database, **When** the developer runs the seed reset command, **Then** the existing data is wiped and replaced with a fresh baseline dataset.

---

### User Story 2 - Reproducible and predictable data states (Priority: P1)

As an integration tester, I need the generated mock data to be consistent and reproducible across runs so that I can write tests expecting specific scenarios (like double-bookings or empty slots) to always exist.

**Why this priority**: Deterministic data is required to write robust automated and manual UI tests without relying on random data that might intermittently fail assertions.

**Independent Test**: Can be tested by running the seeder twice in a row (with reset) and verifying that the generated entity IDs, names, and date relationships match identically.

**Acceptance Scenarios**:

1. **Given** the seed script configured with a fixed seed, **When** executed multiple times, **Then** the generated entity properties (e.g., volunteer names, event dates) are identical across all runs.
2. **Given** the test environment, **When** the application loads the schedule builder UI, **Then** predictable complex states (e.g., an event with conflicting volunteer assignments) are consistently present.

### Edge Cases

- **Database Constraints**: The script will fail fast with a clear error if constraints are encountered on a populated database. Developers MUST use the explicit `--reset` flag to authorize a full cascading wipe (truncate) before seeding to guarantee a clean state.
- **Date Dependencies**: The seeder will generate mostly future events (80% future, 20% past) to align with scheduling application use cases while preserving enough historical data for past-event UI testing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a command-line utility to seed the database with mock data.
- **FR-002**: System MUST generate data for the following entities: Church, Ministry, Team, Role, Volunteer, Event, Slot, and Requirement.
- **FR-003**: System MUST support generating realistic mock data (names, emails, schedules) that mimics production payloads.
- **FR-004**: System MUST ensure multi-tenant isolation by correctly assigning `church_id` to all scoped entities during generation.
- **FR-005**: System MUST provide a deterministic generation mode (using a fixed random seed) to produce identical datasets across multiple runs.
- **FR-006**: System MUST ensure logical referential integrity, where volunteers are assigned to slots that match their assigned roles and team memberships.

### Key Entities

- **Church**: Multi-tenant isolation boundary for seeded data.
- **Ministry & Team**: Structural grouping for volunteers within a church.
- **Role**: Defines responsibilities and binds volunteers to slot requirements.
- **Volunteer**: Represents a person in the system with specific roles and availability.
- **Event & Slot**: Represents the core scheduling timeline and necessary volunteer slots.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can completely reset and reseed their local environment in under 10 seconds.
- **SC-002**: The generated dataset includes at least 3 distinct churches, each with 2+ ministries, 10+ volunteers, and 5+ scheduled events to simulate realistic load and UI states.
- **SC-003**: Zero foreign key constraint or null-reference errors occur during the seeding process.
- **SC-004**: UI rendering tests pass consistently across different machines because the seeded data is 100% deterministic.

## Assumptions

- We assume the database schema (from Phase 1 / Spec S1) is fully applied and active before running the seeder.
- Local database credentials MUST be configured via environment variables and strictly validated at runtime using the project's central `@base-fullstack-template/env` schema before script execution.
