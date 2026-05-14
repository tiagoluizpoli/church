# Feature Specification: Domain Entities

**Feature Branch**: `005-domain-entities`  
**Created**: 2026-05-13  
**Status**: Draft  
**Input**: User description: "Implement the next specification from the specification-list (Spec D1: Domain Entities) — Pure TypeScript interfaces and classes representing the core business entities for the Church Volunteer Scheduling Platform."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entity Base Class Foundation (Priority: P1)

As a developer building the domain layer, I need a reusable `Entity` base class that encapsulates identity (`id`), equality, and timestamp tracking, so that every domain entity inherits consistent behavior without reimplementing boilerplate.

**Why this priority**: Every other domain entity depends on this base. Without it, no entity can be instantiated or compared.

**Independent Test**: Can be fully tested by instantiating the base class with mock props, verifying auto-generated IDs, and asserting equality comparisons between instances.

**Acceptance Scenarios**:

1. **Given** no `id` is provided, **When** an entity is constructed, **Then** a UUID is automatically generated.
2. **Given** an explicit `id` is provided, **When** an entity is constructed, **Then** the provided `id` is used.
3. **Given** two entity instances, **When** they share the same `id`, **Then** `.equals()` returns `true`.
4. **Given** two entity instances, **When** they have different `id` values, **Then** `.equals()` returns `false`.
5. **Given** an entity instance, **When** `.equals()` is called with `null` or `undefined`, **Then** it returns `false`.

---

### User Story 2 - Core Organizational Entities (Priority: P1)

As a developer building repositories, I need domain entity definitions for **Church**, **Ministry**, **Team**, **Role**, **Volunteer**, and **MinistryVolunteer**, so that the infrastructure layer has a well-defined target type to map persistence records into.

**Why this priority**: These are the foundational organizational entities that all scheduling features depend on. Repositories cannot be built without them.

**Independent Test**: Can be fully tested by constructing each entity from raw props, verifying all required properties are accessible, and confirming that optional properties default correctly.

**Acceptance Scenarios**:

1. **Given** valid `ChurchProps`, **When** a `Church` entity is created, **Then** `name`, `slug`, `timezone`, and `settings` are accessible via typed getters or props.
2. **Given** valid `MinistryProps` with no `deletedAt`, **When** a `Ministry` entity is created, **Then** `deletedAt` defaults to `undefined`, indicating an active ministry.
3. **Given** valid `MinistryVolunteerProps`, **When** a `MinistryVolunteer` entity is created, **Then** the `systemRole` reflects one of the three allowed values: `leader`, `sub_leader`, or `volunteer`.
4. **Given** a `Volunteer` entity, **When** accessed, **Then** `churchId`, `userId`, and `status` are all available and typed.

---

### User Story 3 - Scheduling Entities (Priority: P1)

As a developer building the scheduling domain services, I need domain entity definitions for **Event**, **TimeSlot**, and **SlotRequirement**, so that scheduling logic operates on strongly-typed domain objects rather than raw database rows.

**Why this priority**: These are the core data structures that the Availability Engine (L1) and Slot & Assignment Manager (L3) will operate on.

**Independent Test**: Can be fully tested by constructing each entity, verifying date invariants, and asserting that status transitions are representable.

**Acceptance Scenarios**:

1. **Given** valid `EventProps`, **When** an `Event` is created, **Then** `startDate` and `endDate` are `Date` objects (UTC by convention — verified via `instanceof Date`).
2. **Given** valid `TimeSlotProps`, **When** a `TimeSlot` is created, **Then** `startTime` is strictly before `endTime`.
3. **Given** valid `SlotRequirementProps`, **When** a `SlotRequirement` is created, **Then** `requiredCount` is a positive integer.
4. **Given** `EventProps` where `startDate >= endDate`, **When** an `Event` is constructed, **Then** the entity throws a domain error rejecting the invalid range.
5. **Given** `TimeSlotProps` where `startTime >= endTime`, **When** a `TimeSlot` is constructed, **Then** the entity throws a domain error rejecting the invalid range.

---

### User Story 4 - Assignment & Audit Entities (Priority: P1)

As a developer building the conflict and validation services, I need domain entity definitions for **Assignment**, **AssignmentAudit**, and **Availability**, so that assignment lifecycle, audit trails, and volunteer availability are modeled as first-class domain concepts.

**Why this priority**: These entities are required for the Conflict & Validation Service (L2) and Assignment Manager (L3). Without them, no volunteer can be assigned or audited.

**Independent Test**: Can be fully tested by constructing each entity, verifying status enum values, and asserting audit action types.

**Acceptance Scenarios**:

1. **Given** valid `AssignmentProps`, **When** an `Assignment` is created, **Then** `status` is one of `pending`, `confirmed`, or `declined`.
2. **Given** valid `AssignmentAuditProps`, **When** an `AssignmentAudit` is created, **Then** `action` is one of `created`, `updated`, `deleted`, or `status_change`.
3. **Given** valid `AvailabilityProps`, **When** an `Availability` is created, **Then** `type` is either `available` or `unavailable`, and the time window is valid.
4. **Given** `AvailabilityProps` where `startTime >= endTime`, **When** an `Availability` is constructed, **Then** the entity throws a domain error rejecting the invalid range.

---

### User Story 5 - Entity-to-Schema Mapper Contract (Priority: P2)

As a developer building the repository layer, I need a clear, typed mapper interface that defines how to convert between Drizzle schema rows and domain entities, so that the infrastructure layer can be built against a stable contract.

**Why this priority**: While not business logic itself, this contract is the bridge that makes domain entities usable by the repository layer (Spec R1/R2). Without it, the mapping logic will be ad-hoc.

**Independent Test**: Can be tested by verifying that the mapper interface is exported, correctly typed, and that a trivial implementation satisfies the type constraint.

**Acceptance Scenarios**:

1. **Given** a mapper interface `EntityMapper<Schema, Domain>`, **When** a repository implements it, **Then** it provides `toDomain(schema)` and `toPersistence(domain)` methods.
2. **Given** a Drizzle row, **When** `toDomain()` is called, **Then** it returns a properly constructed domain entity.
3. **Given** a domain entity, **When** `toPersistence()` is called, **Then** it returns a plain object matching the Drizzle insert type.

---

### Edge Cases

- What happens when an entity is constructed with an invalid `churchId` (empty string or malformed UUID)?
  - **Behavior**: Domain entities do not validate foreign key existence — that is the responsibility of the repository/persistence layer. Entities accept any string value for ID references.
- What happens when `startDate >= endDate` on an Event (or `startTime >= endTime` on a TimeSlot / Availability)?
  - **Behavior**: This invariant is enforced via a **defense-in-depth** strategy across three layers:
    1. **API/Application Layer (Primary)**: Zod input schemas reject invalid date ranges before data reaches the domain. This is the intended first line of defense and produces user-friendly validation errors.
    2. **Persistence Layer (Secondary)**: Database `CHECK` constraints (`start < end`) reject invalid ranges at write time, guarding against any bypass of the application layer.
    3. **Domain Entity (Failsafe)**: The entity constructor throws a domain error (e.g., `InvalidDateRangeError`). This is a last-resort safeguard — if data somehow passes both prior layers with an invalid range, the domain refuses to instantiate a semantically meaningless object.
- What happens when `deletedAt` is set on a Ministry?
  - **Behavior**: The entity stores it as-is. Filtering soft-deleted ministries is the responsibility of queries/repositories.

## Clarifications

### Session 2026-05-13

- Q: Can domain entities mutate their own props after construction, or must all changes produce a new instance? → A: Mutable via encapsulated methods. Props are not directly exposed for mutation; entities control their own state transitions (e.g., `assignment.confirm()` instead of `assignment.props.status = 'confirmed'`).
- Q: Should all domain errors extend a single base class with a code discriminator, or should each invariant get its own dedicated error class? → A: One dedicated class per error (e.g., `InvalidDateRangeError`). Each class centralizes its own message and identity, preventing inconsistency when the same error is thrown from multiple call sites. All domain error classes extend a common `DomainError` base for catch-all handling.
- Q: Should consumers access entity fields via the raw `props` bag or via dedicated read-only getters? → A: Dedicated read-only getters (e.g., `event.title`, `event.startDate`). The `props` object stays `protected` — invisible to consumers. Consistent with encapsulated mutation pattern.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define an `Entity<T>` abstract base class with `id`, `createdAt`, `updatedAt`, typed `props: T`, and an `equals()` method for identity comparison.
- **FR-002**: System MUST define domain entity classes for all 12 entities: `Church`, `Ministry`, `Team`, `Role`, `Volunteer`, `MinistryVolunteer`, `Event`, `TimeSlot`, `SlotRequirement`, `Assignment`, `AssignmentAudit`, `Availability`.
- **FR-003**: Every domain entity (except `Church`) MUST include `churchId` in its props interface for multi-tenant isolation.
- **FR-004**: Domain entities MUST be pure TypeScript with zero external dependencies (no ORM, no framework, no database imports).
- **FR-005**: All `Date` fields in domain entities MUST represent UTC values, consistent with the UTC-First Timezone Policy (Spec S4).
- **FR-006**: Enum-like fields (`status`, `systemRole`, `action`, `type`, `enforcementType`) MUST use TypeScript string literal union types, not runtime enums.
- **FR-007**: System MUST define an `EntityMapper<Schema, Domain>` interface with `toDomain()` and `toPersistence()` methods to formalize the mapping contract between persistence rows and domain entities.
- **FR-008**: Domain entity prop interfaces MUST align with the existing Drizzle schema columns (Spec S1) but remain decoupled — no imports from `@church/db`.
- **FR-009**: The `MinistryVolunteer` entity MUST model the contextual leadership system (`systemRole`: `leader` | `sub_leader` | `volunteer`) as defined in the schema.
- **FR-010**: All entities MUST be exported from a single barrel file for clean imports by downstream consumers (repositories, services).
- **FR-011**: The `start < end` date range invariant MUST be enforced at three layers: (1) Zod input validation at the API/application layer as the primary gate, (2) database `CHECK` constraints at the persistence layer as secondary protection, (3) domain entity constructors as a failsafe that throws a domain error if violated.
- **FR-012**: Domain errors MUST follow a one-class-per-error pattern. Each invariant violation has its own dedicated error class (e.g., `InvalidDateRangeError`) that extends a common `DomainError` base class. Error classes centralize their own message and identity.
- **FR-013**: Entity fields MUST be exposed via dedicated read-only getters (e.g., `event.title`, `volunteer.status`). The raw `_props` object MUST be `protected` and invisible to external consumers.

### Key Entities

- **Entity\<T\>**: Abstract base class providing identity (`id`), timestamps (`createdAt`, `updatedAt`), `protected` props, dedicated read-only getters, encapsulated mutation, and equality comparison.
- **DomainError**: Abstract base error class. Each specific invariant violation extends it (e.g., `InvalidDateRangeError extends DomainError`).
- **Church**: Root tenant — `name`, `slug`, `timezone`, `settings`.
- **Ministry**: Organizational unit within a church — `name`, `description`, `enforcementType`, soft-deletion via `deletedAt`.
- **Team**: Sub-group within a ministry — `name`, parent `ministryId`.
- **Role**: Functional role (e.g., "Vocalist", "Sound Tech") — `name`, optional `ministryId`, `isGlobal` flag.
- **Volunteer**: Church-scoped user profile — `userId` (link to auth), `status`, `notes`.
- **MinistryVolunteer**: Junction entity — links a volunteer to a ministry/team with a `systemRole` and `status`.
- **Event**: Scheduled occurrence — `title`, `description`, `location`, date range, `status` lifecycle.
- **TimeSlot**: Time window within an event — `startTime`, `endTime`, `label`.
- **SlotRequirement**: Staffing need per slot — `roleId`, `teamId`, `requiredCount`, `notes`.
- **Assignment**: Volunteer-to-slot binding — `roleId`, `status`, `reason`, `assignedBy`.
- **AssignmentAudit**: Immutable audit trail — `action`, `reason`, `leaderId`, `timestamp`.
- **Availability**: Volunteer time window — `type` (available/unavailable), date range, `isAllDay`, `reason`, `repeatRule`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 12 domain entity classes compile and pass type-checking with zero `any` or `unknown` casts.
- **SC-002**: Unit tests achieve 100% coverage on the `Entity` base class (construction, equality, defaults).
- **SC-003**: Every domain entity can be round-tripped through its mapper contract (domain → persistence → domain) without data loss. *(Deferred to Spec R2 — requires concrete mapper implementations.)*
- **SC-004**: Domain entity module has zero runtime dependencies — verified by inspecting the compiled output's import graph.
- **SC-005**: All prop interfaces align 1:1 with their corresponding Drizzle schema columns, verified by a contract test.

## Assumptions

- The existing Drizzle schema (Spec S1) is the authoritative source for column names, types, and constraints. Domain entities mirror this structure but remain decoupled.
- Domain entities are mutable through encapsulated methods — external code does not directly modify `_props`. State transitions are controlled by the entity itself (e.g., `assignment.confirm()`). Rich domain behavior will be added by subsequent specs (L1 Availability Engine, L2 Conflict Service, L3 Assignment Manager).
- The `Entity` base class uses `crypto.randomUUID()` for ID generation, which is available in all target runtimes (Node.js 19+, Bun).
- The `EntityMapper` interface is a contract only — concrete mapper implementations will be created in Spec R2 (Drizzle Implementations).
- `MinistryInvitation` (onboarding) is considered a separate bounded context and is NOT included in this domain entity set. It will be modeled in its own spec (F3).
