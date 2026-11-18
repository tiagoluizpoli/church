# Research: Domain Entities

## Decision 1: Package Location for Domain Entities

**Decision**: Domain entities live inside the existing `packages/api` package as a `src/domain/` folder, following the 4-layer Clean Architecture blueprint (`presentation → application → domain → infrastructure`). The `Entity<T>` base class and `DomainError` base class are placed in a new `packages/core` package (`@church/core`) for cross-project reuse.

**Rationale**: Clean Architecture layers are **folders within a project**, not separate packages. The `packages/api` package is the backend project — its internal structure should follow the 4-layer blueprint: `presentation/` (routers), `application/` (use-cases, services), `domain/` (entities, rules), `infrastructure/` (repositories). Creating a separate `packages/domain` would fragment the project's architecture into packages, violating the colocation principle. The base class (`Entity<T>`) and base error (`DomainError`) ARE reusable across different projects, so they belong in a shared core package.

**Alternatives considered**:
- **Separate `packages/domain` package**: Rejected — over-engineers the layer boundary. Layers are folders, not packages.
- **Everything in `packages/api/src/domain/` including base class**: Rejected — the `Entity<T>` base and `DomainError` are project-agnostic primitives reusable across different backends.

## Decision 2: Entity Base Class Design

**Decision**: Use an abstract generic class `Entity<T>` with `protected _props`, dedicated read-only getters per field, and encapsulated mutation methods. Lives in `packages/core`.

**Rationale**: Per clarification session — the `props` bag is `protected` (FR-013), consumers use dedicated getters (e.g., `event.title`), and state changes go through entity methods (e.g., `assignment.confirm()`). This gives the entity full control over its invariants.

**Alternatives considered**:
- **Public `props` with no getters**: Rejected — exposes internal state, breaks encapsulation principle.
- **Immutable entities with `with()` factory**: Rejected by user — unnecessary object duplication for in-place state transitions.

## Decision 3: Domain Error Strategy

**Decision**: One dedicated error class per invariant violation, all extending a common `DomainError` base class. `DomainError` lives in `packages/core`, specific errors live alongside the entities in `packages/api/src/domain/errors/`.

**Rationale**: Per clarification session — centralizing message/code inside each class prevents inconsistency when the same error is thrown from multiple call sites. The class count will remain manageable (< 10 for this spec).

**Alternatives considered**:
- **Single `DomainError` with `code` discriminator**: Rejected — risk of inconsistent message strings across throw sites.
- **Hybrid (base + subclass categories)**: Rejected — unnecessary indirection for a small error surface.

## Decision 4: Relationship to Existing Drizzle Enums

**Decision**: Domain entities re-declare enum values as TypeScript string literal union types. They do NOT import from `@church/db` schema files.

**Rationale**: FR-004 mandates zero external dependencies in the domain layer. FR-008 requires alignment without coupling. The `$inferSelect` types from Drizzle are useful for mapper implementations (Spec R2), but the domain itself only uses plain TypeScript types. A contract test (SC-005) verifies alignment at CI time.

**Alternatives considered**:
- **Import enum values from `@church/db`**: Rejected — couples domain to persistence layer.
- **Shared `@church/types` package**: Premature — adds a package solely for string literals.

## Decision 5: Testing Strategy

**Decision**: Unit tests in `packages/api/tests/domain/`. Contract alignment test in `packages/api/tests/contract/`.

**Rationale**: Domain entities are pure TypeScript with zero I/O. Tests verify construction, getter access, encapsulated mutation, equality, date range invariant enforcement, and error throwing. The contract test imports both `@church/db` schema types and domain prop interfaces to verify structural alignment at compile time.

**Alternatives considered**:
- **Integration tests with DB**: Rejected — mapper/repository testing belongs in Spec R2.
