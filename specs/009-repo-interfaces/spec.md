# Feature Specification: Repository Interfaces (Spec R1)

**Feature Branch**: `009-repo-interfaces`

**Created**: 2026-05-22

**Status**: Draft

**Input**: User description: "Repository Interfaces — TypeScript contracts for all data access. Defines the abstraction layer between domain services and the database implementation, ensuring testability with mocks and consistent church-isolated data access. Refines 04-repository-contracts.md."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Define Type-Safe Data Access Contracts (Priority: P1)

As a domain service developer (e.g., building the Availability Engine or Conflict & Validation Service), I need well-defined TypeScript interfaces for every data access operation, so that I can depend on stable contracts without coupling to the database implementation, and I can mock them in unit tests.

**Why this priority**: Every domain service (Specs L1, L2, L3) depends on repository interfaces to access persisted data. Without these contracts, domain services cannot be developed or tested in isolation. This is the foundational dependency for the entire Infrastructure Layer.

**Independent Test**: Can be fully tested by verifying that the interfaces compile, that mock implementations can be created against them, and that domain services can consume mocks without type errors.

**Acceptance Scenarios**:

1. **Given** a domain service that needs to look up a volunteer by ID within a church, **When** it calls the VolunteerRepository interface, **Then** it receives a domain entity (Spec D1) — not a Drizzle schema object — with full type safety.
2. **Given** a domain service developer creating a mock for testing, **When** they implement the repository interface, **Then** the TypeScript compiler ensures every required method is present with correct signatures.
3. **Given** a repository method signature, **When** a consumer inspects it, **Then** the first parameter is always `churchId` (enforcing multi-tenant isolation at the type level).
4. **Given** a developer tries to pass a `VolunteerId` where a `ChurchId` is expected, **When** TypeScript compiles, **Then** a type error is raised (branded IDs prevent cross-entity swapping).

---

### User Story 2 - Support All Domain Service Data Needs (Priority: P1)

As the scheduling system, I need repository interfaces that cover every data query and mutation required by the Availability Engine (L1), Conflict & Validation Service (L2), and Slot & Assignment Manager (L3), so that no domain service is blocked by a missing data access method.

**Why this priority**: If the interfaces are incomplete, domain services must either reach around the abstraction (violating clean architecture) or be blocked until the interface is extended. Complete coverage from day one prevents both scenarios.

**Independent Test**: Can be tested by cross-referencing every data access call in the L1, L2, and L3 specs against the repository interfaces and verifying 100% coverage.

**Acceptance Scenarios**:

1. **Given** the Availability Engine needs to fetch availability records (both available and unavailable types) and existing assignments for a volunteer in a time range, **When** the developer reviews the AvailabilityRepository and AssignmentRepository interfaces, **Then** methods exist for both queries with the required parameters (churchId, volunteerId, time range).
2. **Given** the Conflict & Validation Service needs to check if a volunteer is qualified for a role and belongs to a ministry, **When** the developer reviews the VolunteerRepository interface, **Then** methods exist for volunteer-ministry membership lookup (`hasMembershipInMinistry`) and volunteer-role qualification checks (`hasRoleQualification`).
3. **Given** the Slot & Assignment Manager needs to create assignments, transition statuses, and generate audit records, **When** the developer reviews the AssignmentRepository interfaces, **Then** methods exist for create, status transitions, and audit record creation.
4. **Given** the Slot & Assignment Manager needs to find replacement volunteers, **When** the developer reviews the VolunteerRepository interface, **Then** a method exists to list qualified, available volunteers for a given role within a ministry.

---

### User Story 3 - Enforce Church Isolation at the Contract Level (Priority: P1)

As a security-conscious developer, I need every repository method to require `churchId` as a parameter, so that cross-church data leaks are structurally impossible — not just a convention but a compile-time guarantee.

**Why this priority**: Multi-tenant data isolation is a non-negotiable security requirement. Making it a type-level enforcement (not a runtime-only check) ensures that no developer can accidentally omit the church filter. Branded ID types further ensure that IDs from different entities cannot be accidentally swapped.

**Independent Test**: Can be tested by verifying that every method on every interface includes `churchId` as a required parameter, and that attempting to call a method without it causes a TypeScript compilation error.

**Acceptance Scenarios**:

1. **Given** any repository interface method, **When** a developer inspects its signature, **Then** `churchId` is the first required parameter (except for methods on ChurchRepository that look up the church itself).
2. **Given** a developer tries to call `volunteerRepository.getById(volunteerId)` without `churchId`, **When** TypeScript compiles, **Then** a type error is raised.

---

### User Story 4 - Support Transactional Operations (Priority: P2)

As a domain service orchestrating multi-entity operations (e.g., creating an event with slots, publishing a schedule), I need repository interfaces that support transactional boundaries, so that partial failures don't leave the database in an inconsistent state.

**Why this priority**: Operations like "create event + generate slots + attach requirements" span multiple tables. Without transactional support at the interface level, the concrete implementation cannot guarantee atomicity, leading to data corruption on failures.

**Independent Test**: Can be tested by verifying that the interface design supports a transaction context parameter, that a UnitOfWork interface provides callback-based transaction orchestration, and that mock implementations can simulate transactional behavior.

**Acceptance Scenarios**:

1. **Given** an operation that creates an event and its slots, **When** slot creation fails mid-way, **Then** the event creation is also rolled back — no orphan events exist.
2. **Given** a domain service that needs to perform multiple repository calls atomically, **When** it uses the UnitOfWork.run() callback, **Then** all calls within the transaction share the same database session and commit/rollback together.

---

### Edge Cases

- What happens when a repository method is called with a valid `churchId` but the entity belongs to a different church? The concrete implementation MUST return `null` or throw a `NotFoundError` — it MUST NOT return cross-church data.
- What happens when a `getById` method is called with a non-existent ID? Required lookups throw `NotFoundError`; optional lookups return `null`. Method naming should reflect domain intent rather than a rigid formula: `get*` is used when absence is treated as an error path, while `find*` may be used for optional lookups.
- What happens when a list method has no matching results? It returns an empty array, never `null`.
- What happens when a repository method receives an empty string for `churchId`? The concrete implementation MUST reject it — but the interface itself does not enforce non-emptiness (that is a runtime concern for the implementation layer).
- What happens when a matching entity exists but is soft-deleted or archived? Default repository methods treat it as absent; deleted/archive access requires an explicit opt-in method or query variant.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define TypeScript interfaces for each aggregate root and key entity: `ChurchRepository`, `MinistryRepository`, `VolunteerRepository`, `RoleRepository`, `EventRepository`, `TimeSlotRepository`, `AssignmentRepository`, `AvailabilityRepository`, and `AssignmentAuditRepository`.
- **FR-002**: Every repository method (except `ChurchRepository.getById` and `ChurchRepository.getBySlug`) MUST accept `churchId` as the first parameter, using the branded `ChurchId` type.
- **FR-003**: All repository methods MUST return Domain Entity types (as defined in Spec D1), never database-specific objects (Drizzle schema types). All methods MUST return `Promise<T>` (async signatures). Call-facing parameter shapes MUST use explicitly named `type` or `interface` declarations rather than inline object typing.
- **FR-004**: Interfaces MUST use explicit, intent-driven names rather than forcing a blanket naming formula. When absence is an error in the domain, `get*` methods return `Promise<T>` and throw `NotFoundError` for missing entities. Optional lookups may use `find*` and return `Promise<T | null>`. `list*` methods return `Promise<T[]>`; `count*` methods return `Promise<number>`. `ChurchRepository.getBySlug` remains a required-lookup method because a missing slug is treated as an error, not routine control flow, and its `slug` parameter SHOULD use a branded domain type such as `ChurchSlug` rather than a plain `string`.
- **FR-005**: Interfaces MUST support a transaction context mechanism via an opaque branded `TransactionContext` type and a `UnitOfWork` interface providing `run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>` for callback-based atomic operations. Repository methods that participate in transactional workflows MAY accept an optional `tx?: TransactionContext` parameter for read-your-writes consistency, not only mutation methods.
- **FR-006**: The `VolunteerRepository` MUST include methods for: retrieving a volunteer by ID, finding a volunteer by user ID, listing volunteers by ministry, checking volunteer-ministry membership (`hasMembershipInMinistry`), checking volunteer-role qualification (`hasRoleQualification`), listing volunteers qualified for a role within a ministry, and updating volunteer status. Availability, overlap filtering, prior-decline filtering, and workload ranking remain domain-service concerns and MUST NOT be hidden inside `VolunteerRepository` methods.
- **FR-007**: The `AvailabilityRepository` MUST include methods for: listing all availability records (both available and unavailable types) for a volunteer within a time range, creating availability records, updating availability records, and deleting availability records. The `delete` contract remains domain-level and does not prescribe whether the infrastructure implementation performs a hard delete or a soft delete.
- **FR-008**: The `AssignmentRepository` MUST include methods for: creating assignments, updating assignment status, listing assignments by volunteer, listing assignments by slot, listing assignments by event, counting assignments within an explicit time window (for fairness/workload), finding assignments that overlap a time range (via volunteer-scoped lookup `listByVolunteerInRange` and general lookup `listByRange`), finding an assignment by slot and volunteer, listing declined assignments by slot, and deleting assignments by event. The counting method should be named `countByVolunteerInRange(...)` to reflect its explicit `startTime`/`endTime` inputs. When counting assignments for workload/fairness or similar policies, the contract MUST remain domain-neutral about which assignment statuses count; any status-based inclusion rules MUST be supplied explicitly by the caller rather than hardcoded inside the repository contract.
- **FR-009**: The `EventRepository` MUST include methods for: creating events, retrieving events by ID, retrieving events with their slots (returning `EventWithSlots` composite type), listing events by ministry and status, and updating event status. `listByMinistry(...)` MUST default to chronological ascending order by event start time unless the contract later adds an explicit ordering parameter.
- **FR-010**: The `TimeSlotRepository` MUST include methods for: retrieving a slot by ID, bulk-creating slots for an event (including nested slot requirements), listing slots by event (including nested slot requirements), and deleting slots by event (for regeneration). `getById` and `listByEvent` MUST both return fully hydrated `TimeSlot` domain objects that include nested `requirements` by default.
- **FR-011**: The `AssignmentAuditRepository` MUST include methods for: creating audit records and listing audit records by assignment, by church, and by actor (`actorId`). Audit list methods MUST default to reverse-chronological order (newest first) by timestamp unless the contract later adds an explicit ordering parameter. Time-range filtering is intentionally out of scope for v1 unless a downstream spec proves the need.
- **FR-012**: The `RoleRepository` MUST include methods for: retrieving a role by ID and listing roles available to a ministry (including global roles for the church). `listByMinistry(...)` MUST default to alphabetical ascending order by role name unless the contract later adds an explicit ordering parameter.
- **FR-013**: The `MinistryRepository` MUST include methods for: retrieving a ministry by ID, listing ministries by church, and retrieving ministry settings as a `MinistrySettings` projection type. `listByChurch(...)` MUST default to alphabetical ascending order by ministry name unless the contract later adds an explicit ordering parameter.
- **FR-014**: The `ChurchRepository` MUST include methods for: retrieving a church by ID and retrieving a church by slug. These methods do NOT require `churchId` as a parameter (the church IS the tenant root). `getBySlug(...)` SHOULD accept a branded slug type such as `ChurchSlug`.
- **FR-015**: List and count methods that support filtering by time range MUST accept explicit `startTime` and `endTime` parameters, with both bounds in UTC. Repository contracts MUST NOT infer business periods such as "current scheduling period" internally.
- **FR-016**: All entity IDs MUST use branded types (e.g., `ChurchId`, `VolunteerId`, `AssignmentId`) to prevent cross-entity ID swapping at compile time.
- **FR-017**: Slot requirements MUST be nested within the `TimeSlot` domain type (as `requirements: SlotRequirement[]`). No separate `SlotRequirementRepository` is needed — requirements are always accessed through their parent slot.
- **FR-018**: Repository methods MUST return only active / non-deleted records by default. If archived or soft-deleted records are ever needed, they MUST be exposed through explicit opt-in methods or query variants rather than changing the default behavior.

### Key Entities

- **Repository Interface**: A TypeScript `interface` defining the data access contract for a specific aggregate root or entity. Each interface is technology-agnostic — no Drizzle, SQL, or ORM types appear in the signatures.
- **Domain Entity**: The return type for all repository methods — type aliases representing domain entity shapes extending the `Entity<T>` base class (Spec D1). These are the single source of truth across all layers.
- **Branded ID**: A nominal type (e.g., `string & { __brand: 'ChurchId' }`) that prevents accidental swapping of IDs between different entity types at compile time.
- **Transaction Context**: An opaque type that represents an active database transaction. Passed to mutation methods to ensure atomicity.
- **UnitOfWork**: An interface that provides callback-based transaction orchestration: `run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>`. Domain services use this to execute multiple repository calls atomically.
- **EventWithSlots**: A composite type returned by `EventRepository.getWithSlots`, containing the event and its fully-loaded time slots (with nested slot requirements).
- **MinistrySettings**: A projection type returned by `MinistryRepository.getSettings`, containing only ministry configuration fields (e.g., `enforcementType`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every repository interface compiles successfully with strict TypeScript settings and zero type errors.
- **SC-002**: Mock implementations of all interfaces can be created and used by domain services (L1, L2, L3) without type errors.
- **SC-003**: 100% of data access operations required by Specs L1 (Availability Engine), L2 (Conflict & Validation), and L3 (Slot & Assignment Manager) are covered by the repository interfaces.
- **SC-004**: Every method on every interface (except ChurchRepository) requires `churchId` as a branded parameter — verified by code review and contract tests.
- **SC-005**: The UnitOfWork interface is defined and can be consumed by domain service orchestration logic for atomic multi-entity operations.
- **SC-006**: Interfaces follow the `find*`/`get*` naming convention consistently across all repositories.
- **SC-007**: Branded ID types prevent cross-entity ID swapping at compile time — verified by type-level tests.

## Assumptions

- Domain Entities (Spec D1) are fully defined and available as the return types for all repository methods. Until D1 is implemented as concrete classes, type aliases in the co-located files under `entities/` serve as the shapes.
- The `Entity<T>` base class from `@church/core` is the foundation for all domain objects returned by repositories.
- The `DomainError` base class and its subclass `NotFoundError` are available in `@church/core` for error handling in `get*` methods.
- The database schema (Spec S1) has been defined, providing the persistence model that concrete implementations (Spec R2) will map to and from domain entities.
- All date/time values in repository interfaces follow the Timezone Policy (Spec S4) — parameters and return values use UTC.
- The transaction context design is infrastructure-agnostic at the interface level — the concrete mechanism (e.g., Drizzle `db.transaction()`) is defined in Spec R2, not here.
- Repository interfaces are defined in the domain layer of apps/server (`apps/server/src/domain/repositories/`) and implemented in the infrastructure layer (`apps/server/src/infrastructure/repositories/drizzle/`).
- Pagination is not required for v1 repository methods. List methods return full result sets. Pagination will be added as a future enhancement if performance requires it.

## Schema Dependencies (Logged for S1/R2)

These schema refinements were identified during the specification process and are required before the concrete implementations (Spec R2) can be completed:

- **`volunteer_role` junction table**: Required for `VolunteerRepository.hasRoleQualification`. Currently no table tracks volunteer-to-role qualifications.
- **`assignment_audit.leader_id` → `actor_id`**: Domain uses `actorId`; schema column should be renamed for alignment.
- **`availability` soft delete**: Consider adding `deletedAt` column for soft-delete support instead of hard delete.
