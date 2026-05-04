# Feature Specification: Database Schema (Phase 1)

**Feature Branch**: `[001-db-schema]`  
**Created**: 2026-05-03
**Status**: Draft  
**Input**: User description: "Implement the first specification from the specification-list (Spec S1: Database Schema)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Multi-Tenant Data Isolation (Priority: P1)

As a system administrator, I need all domain entities to be strictly isolated by `church_id`, so that data from different churches never leaks or mixes.

**Why this priority**: Data isolation is the foundational security requirement for a multi-tenant platform.

**Independent Test**: Can be fully tested by attempting to retrieve records using a different `church_id` than the one assigned to the context.

**Acceptance Scenarios**:

1. **Given** a multi-tenant environment, **When** a query is executed for a specific church, **Then** only records matching that `church_id` are returned.
2. **Given** an attempt to create an assignment, **When** no `church_id` is provided, **Then** the operation fails.

---

### User Story 2 - Core Scheduling Structure (Priority: P1)

As a ministry leader, I need the foundational data structures (Events, TimeSlots, Requirements) to exist so that I can eventually schedule volunteers.

**Why this priority**: Required to support any scheduling workflows.

**Independent Test**: Can be tested by inserting and retrieving structured event and slot data.

**Acceptance Scenarios**:

1. **Given** a valid ministry, **When** creating an Event with TimeSlots, **Then** the hierarchy is persisted correctly.
2. **Given** a TimeSlot, **When** requirements are added, **Then** the relational links are maintained.

---

### Edge Cases

- **Ministry Deletion**: To preserve historical scheduling data and audit logs, Ministries are **soft-deleted** via a `deleted_at` timestamp. Related records (Events, Assignments) remain intact but are filtered from active views where `deleted_at` is non-null.
- **Concurrent Assignment**: Race conditions are prevented via DB-level unique constraints.
- **Invalid Invitation**: Invitations that are expired, used, or for a deleted ministry MUST return a specific domain error (e.g., `INVITATION_EXPIRED` or `INVITATION_INVALID`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define the `Church` entity to establish the multi-tenancy foundation. However, creating or managing churches from the system is OUT OF SCOPE. A single base church will be seeded, and all features will use its `church_id`.
- **FR-002**: System MUST enforce `church_id` on all subordinate tables (Ministry, Team, Volunteer, Event, TimeSlot, Requirement, Availability, Assignment).
- **FR-003**: System MUST support `Ministry` entities with an `enforcement_type` ("soft" or "hard").
- **FR-004**: System MUST support a contextual `Volunteer` entity that references the global `user.id`.
- **FR-005**: System MUST capture volunteer roles ("LEADER", "SUB_LEADER", "VOLUNTEER") via a join table.
- **FR-006**: System MUST persist `Event`, `TimeSlot`, and `SlotRequirement` entities.
- **FR-007**: System MUST track `Availability` and `Assignment` states for volunteers.
- **FR-008**: System MUST support `MinistryInvitation` tracking for onboarding.
- **FR-009**: System MUST audit assignment changes via `AssignmentAudit`.
- **FR-010**: System MUST support `Team` entities within a Ministry to allow for sub-grouping of volunteers and delegated leadership.
- **FR-011**: System MUST prevent duplicate assignments for the same volunteer on the same time slot via a database-level unique constraint on `(church_id, slot_id, volunteer_id)`.
- **FR-012**: System MUST enforce `MinistryInvitation` rules:
  - **Expiry**: Validation MUST fail if `now() > expires_at`.
  - **Usage**: One-time invitations MUST be marked as `used` atomically and rejected for subsequent attempts.
  - **Idempotency**: If a volunteer is already a member of the ministry, the invitation should be treated as "already accepted" without creating duplicate membership records.

### Key Entities *(include if feature involves data)*

- **Church**: The root tenant (`id`, `name`, `slug`, `settings`).
- **Ministry / Team**: The functional hierarchy within a church.
- **Volunteer**: A user's contextual profile within a church.
- **Event / TimeSlot / SlotRequirement**: The hierarchy representing when people serve and what is needed.
- **Availability / Assignment**: The mapping of volunteers to TimeSlots.
- **MinistryInvitation**: Tracking for onboarding links.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of non-root tables include a `church_id` column with a foreign key constraint.
- **SC-002**: Schema strictly defines relationships to support one-to-many and many-to-many joins.
- **SC-003**: Integration tests verify that unauthorized cross-church queries return zero results.

## Assumptions

- We are using a relational database.
- An ORM will be used for schema definition and migrations.
- A base `Church` record will be provided via a database seed so that multi-tenancy is active by design without requiring a Church management UI.
