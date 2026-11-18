# Feature Specification: Volunteer Scheduling Migration Strategy

**Feature Branch**: `002-volunteer-scheduling-migration`  
**Created**: 2026-05-04  
**Status**: Draft  
**Input**: User description: "Specify the migration strategy for volunteer scheduling, gathering all information from manual planning specs and existing plans."

## Clarifications

### Session 2026-05-04
- Q: If the initial admin email is not found during `init-system`, should the script create the user or fail? → A: Fail with error and stop initialization.
- Q: What should be the default status for a lazily created volunteer? → A: `active` (for MVP, with future plans for a validation flow).
- Q: Should the initial admin be automatically added to a default ministry? → A: Yes, create an "Administration" ministry and add the admin as `LEADER`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - System Initialization (Priority: P1)

As a system developer, I need to establish the foundational Church and Admin records so that the multi-tenant system has a root tenant and an initial authorized user.

**Why this priority**: Without a Church and an Admin, no other domain entities (Ministries, Volunteers, Events) can be created or managed.

**Independent Test**: Can be tested by running the initialization script and verifying that a "System Church" exists and the designated user has an ADMIN role linked to it.

**Acceptance Scenarios**:

1. **Given** a fresh database with only `user` table, **When** the initialization script runs, **Then** a "System Church" record is created.
2. **Given** a "System Church", **When** a specific email is provided, **Then** that user is linked to the Church with an ADMIN role.

---

### User Story 2 - Lazy Volunteer Onboarding (Priority: P1)

As a user logging into the platform, I need my volunteer profile to be created automatically so that I can start interacting with my church's ministries without a separate registration step.

**Why this priority**: "Soft registration" ensures zero friction for users and maintains the link between global auth and church-specific context.

**Independent Test**: Can be tested by logging in as a user who has no Volunteer record and verifying that one is created automatically in the default Church.

**Acceptance Scenarios**:

1. **Given** a User exists but has no Volunteer record, **When** they log in, **Then** a Volunteer record is created and linked to their `user.id` and the default `church_id`.
2. **Given** a User already has a Volunteer record, **When** they log in, **Then** no duplicate record is created.

---

### User Story 3 - Relational Integrity (Priority: P2)

As a system administrator, I need to ensure that all data links are strictly maintained during and after migration so that there are no orphaned records or broken relationships.

**Why this priority**: Critical for data consistency and multi-tenant security.

**Independent Test**: Can be tested by attempting to create a Volunteer without a Church link and verifying the database enforces the foreign key constraint.

**Acceptance Scenarios**:

1. **Given** the migration logic, **When** a Volunteer is created, **Then** it MUST have a valid Foreign Key to both `user.id` and `church.id`.
2. **Given** an existing `user.id`, **When** migration runs, **Then** the `user.id` value is preserved and used as the reference in all new domain tables.

---

### Edge Cases

- **User Email Not Found**: If the designated ADMIN email doesn't exist in the `user` table during initialization, the script MUST fail with a clear error and abort the initialization process.
- **Multiple Logins**: Concurrent logins for a new user must not result in duplicate Volunteer records (idempotency).
- **Existing Sessions**: Migration must not invalidate existing Better Auth sessions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST create a "System Church" record with a unique slug and name during the first migration/seed phase.
- **FR-002**: System MUST identify the initial admin user by email, link them to the System Church, create a default "Administration" ministry, and assign the user as its `LEADER`.
- **FR-003**: System MUST implement a "Soft Registration" mechanism that triggers on user login to create a `Volunteer` record if one does not exist for the current Church.
- **FR-004**: System MUST use the existing `user.id` from Better Auth as the primary identifier or foreign key in the `Volunteer` table.
- **FR-005**: System MUST enforce `church_id` on all new domain entities to ensure strict multi-tenant isolation.
- **FR-006**: System MUST maintain referential integrity via database-level foreign key constraints between `Volunteer`, `User`, and `Church`.

### Key Entities *(include if feature involves data)*

- **Church**: The root tenant representing a congregation (`id`, `name`, `slug`, `settings`).
- **User**: The global authentication identity managed by Better Auth (`id`, `email`, `name`).
- **Volunteer**: The church-specific profile of a User.
    - **Status**: `active` (default for soft registration), `inactive`, `on_hold`.
    - **System Roles**: `LEADER`, `SUB_LEADER`, `VOLUNTEER`.
- **Ministry/Team**: Organizational units within a Church where Volunteers serve.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of existing users can log in after migration without session loss.
- **SC-002**: A "System Church" record is present in the database after the initialization script completes.
- **SC-003**: New users have a `Volunteer` record created within 500ms of their first login.
- **SC-004**: No `Volunteer` record exists in the database without a corresponding `user_id` and `church_id`.

## Assumptions

- Better Auth is the source of truth for user identities.
- The first migration step is responsible for structural changes (schema), while the initialization script handles data-level setup (Church/Admin).
- A default `church_id` or `slug` is available for the "Soft Registration" flow.
