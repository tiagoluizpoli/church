# Feature Specification: Drizzle Repository Implementations (Spec R2)

**Feature Branch**: `010-drizzle-repos`

**Created**: 2026-06-23

**Status**: Draft

**Input**: User description: "Concrete classes with churchId isolation and mapping between Schema (Spec S1) and Domain Entities (Spec D1)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Type-Safe Data Persistence via Drizzle ORM (Priority: P1)

As a developer, I want concrete implementations of the repository interfaces using Drizzle ORM, so that domain operations are correctly persisted to and retrieved from the PostgreSQL database.

**Why this priority**: Concrete repositories are the bridge between the application's domain logic and the physical database. Without these implementations, the system cannot load or save data.

**Independent Test**: Can be tested by running vitest against a mock or dockerized PostgreSQL instance to verify that repository queries and mutations successfully interact with the database.

**Acceptance Scenarios**:

1. **Given** a repository interface `VolunteerRepository`, **When** the concrete `DrizzleVolunteerRepository` is called to retrieve a volunteer by ID, **Then** it executes the correct SQL query and returns the mapped `Volunteer` domain entity.
2. **Given** a new `Volunteer` entity is created, **When** the repository persists it, **Then** the record is successfully inserted into the database with correct fields.

---

### User Story 2 - Strict Multi-Tenant Isolation (Priority: P1)

As a tenant user (church member or leader), I want all data access queries to automatically scope themselves to my `churchId`, so that I never see or modify data belonging to another church.

**Why this priority**: Multi-tenant security is a core requirement of the platform. Data leakage between different churches is a critical security violation.

**Independent Test**: Create two tenant database entries (Church A and Church B). Verify that querying records through Repository A never returns records owned by Church B, even if querying for all records or broad ranges.

**Acceptance Scenarios**:

1. **Given** Church A has volunteer "John" and Church B has volunteer "Sarah", **When** querying volunteers for Church A, **Then** only "John" is returned.
2. **Given** a request to fetch a volunteer by ID belonging to Church B using Church A's ID, **When** the repository retrieves it, **Then** a `NotFoundError` is thrown.

---

### User Story 3 - Transactional Database Operations (Priority: P1)

As a developer orchestrating multi-step writes (e.g., creating an event and its slots), I want all operations to run within a transaction block, so that partial failures rollback the database to a clean, consistent state.

**Why this priority**: Multi-record scheduling operations must be atomic to prevent orphan slots, orphan requirements, or incomplete assignments in case of errors.

**Independent Test**: Run a transactional event creation block where slot insertion fails. Verify that the parent event is rolled back and not persisted.

**Acceptance Scenarios**:

1. **Given** a transaction context, **When** multiple repository methods are called passing the context, **Then** they share the same database transaction.
2. **Given** a failure occurs inside a `UnitOfWork.run()` callback, **When** the callback exits via error, **Then** all writes made within the callback are rolled back.

---

### User Story 4 - Consistent Mapping and Domain Error Handling (Priority: P2)

As a domain developer, I want repositories to return pure Domain Entities and throw domain-specific errors (like `NotFoundError`), so that my domain layer remains completely decoupled from Drizzle ORM and SQL exceptions.

**Why this priority**: Decoupling the domain layer from persistence details is a key principle of Clean Architecture, allowing easy testing and changes to infrastructure.

**Independent Test**: Verify that all returned values are instances of `Entity` subclasses (e.g., `Volunteer`, `Event`), and that database errors or missing rows are translated into `NotFoundError` or other `DomainError` types.

**Acceptance Scenarios**:

1. **Given** a query for a non-existent event ID, **When** the repository executes, **Then** it throws a `NotFoundError` instead of returning null or throwing an ORM-specific query exception.
2. **Given** a database row returned from the query, **When** mapped, **Then** all branded ID strings are typed correctly and dates are in UTC.

---

### Edge Cases

- **Null/Empty ChurchId**: If a repository method receives an empty string or null `churchId`, it must immediately throw a validation error rather than attempting a query that might bypass isolation.
- **Transaction Context Swapping**: If a repository method is passed a transaction context that belongs to a different client or session, it must fail loudly or handle it gracefully by executing within the provided transaction context.
- **Relational Joins with Deleted Parents**: When fetching slots with requirements, if the parent event or role is soft-deleted, the repository should exclude it from the active domain query.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Concrete repository implementations MUST be created for all repository contracts defined in Spec R1:
  - `DrizzleChurchRepository` implements `ChurchRepository`
  - `DrizzleMinistryRepository` implements `MinistryRepository`
  - `DrizzleVolunteerRepository` implements `VolunteerRepository`
  - `DrizzleRoleRepository` implements `RoleRepository`
  - `DrizzleEventRepository` implements `EventRepository`
  - `DrizzleTimeSlotRepository` implements `TimeSlotRepository`
  - `DrizzleAssignmentRepository` implements `AssignmentRepository`
  - `DrizzleAvailabilityRepository` implements `AvailabilityRepository`
  - `DrizzleAssignmentAuditRepository` implements `AssignmentAuditRepository`
- **FR-002**: All database operations MUST filter implicitly by `churchId` (except for `ChurchRepository` lookup methods). This isolation MUST be checked on every select, insert, update, and delete query.
- **FR-003**: The `withChurchIsolation` utility MUST be defined as a helper function returning the Drizzle SQL filter expression `eq(table.churchId, churchId)` for implicit scoping.
- **FR-004**: Each repository implementation MUST map Drizzle schema records to their respective Domain Entities. Enums MUST be strictly validated during mapping: if the DB enum value is not a valid member of the domain union type, the mapper MUST throw a mapping exception. Branded nominal ID types MUST be mapped via compile-time type assertions (`row.id as VolunteerId`) to eliminate runtime overhead.
- **FR-005**: All `get*` methods MUST throw a `NotFoundError` (from `@church/core`) if the record does not exist or does not match the provided `churchId`.
- **FR-006**: A concrete `DrizzleUnitOfWork` MUST implement `UnitOfWork` using Drizzle's `db.transaction()` functionality, yielding a concrete `DrizzleTransactionContext` class wrapper that implements the opaque `TransactionContext` interface. Repositories MUST check if the passed context is an instance of `DrizzleTransactionContext` to safely extract the active transaction client.
- **FR-007**: Every mutation or query method in the repositories MUST accept an optional `tx?: TransactionContext` argument and execute its query using the transaction client if present, falling back to the default database client otherwise.
- **FR-008**: Complex relational retrieval (e.g., `EventWithSlots` or `TimeSlot` with nested `requirements`) MUST prioritize Drizzle's Relational Queries API (`db.query...`) to automatically populate relationships and simplify entity mapping.
- **FR-009**: Date fields persisted to or retrieved from the database MUST follow the timezone policy (UTC). Database columns for timestamps MUST use `timestamp(..., { withTimezone: true, mode: 'date' })`.
- **FR-010**: Branded entity ID properties MUST be preserved and correctly mapped when parsing database columns.
- **FR-011**: Standard repository read methods (e.g., `listByMinistry`) MUST implicitly exclude soft-deleted records using `isNull(table.deletedAt)` where soft-delete columns exist in the database schema.
- **FR-012**: Concrete repository classes MUST accept the Drizzle database client instance (`PgDatabase` or compatible type) through constructor dependency injection rather than importing a singleton directly, enabling custom configurations and mocking.
- **FR-013**: Database integration tests MUST run against a local or containerized PostgreSQL instance, using a truncation utility to reset all tables to a clean state before/after each test run, and seeding required data inline.

### Key Entities

- **Drizzle Database Instance**: The injected database connection instance (`PgDatabase`) configured in `@church/db`.
- **Drizzle Transaction Client**: A transaction-scoped client instance (`PgTransaction`) wrapped by `DrizzleTransactionContext`.
- **DrizzleUnitOfWork**: Concrete implementation of the domain's transactional manager.
- **Entity Mappers**: Specialized mapper utilities converting Drizzle DB models to Domain Entities (performing strict enum verification and compile-time ID branding).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of contract tests in `apps/server/src/domain/repositories/contract-tests/` pass when run against the concrete Drizzle repository implementations.
- **SC-002**: Database integration test suite runs and passes in under 15 seconds against a PostgreSQL container instance.
- **SC-003**: Zero SQL or ORM types leak into the repository interface signatures or return types.
- **SC-004**: Multi-tenant isolation test verifies that no cross-tenant reading or writing occurs (validated by specific integration tests using Church A and Church B).
- **SC-005**: Atomic transaction test verifies that a failed nested slot creation rolls back the parent event creation.

## Assumptions

- A running PostgreSQL database (or Docker compose service) is available for integration testing.
- The Drizzle database schema (`packages/db/src/schema/`) is correct and up to date.
- The `EntityMapper` interface is used to ensure consistent structure for all entity mappings.
- The domain entities have constructor properties matching the data fields returned from the database schema.
