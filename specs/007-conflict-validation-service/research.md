# Research: Conflict & Validation Service

## Constraint Classification Pattern

**Context**: The service must enforce two distinct categories of scheduling rules — Hard (blockers that prevent saves entirely) and Soft (warnings that allow leader overrides). This is a well-known pattern in constraint-satisfaction systems.

**Decision**: Implement as a two-phase pipeline: `HardConstraintValidator` → `SoftConflictDetector`. Hard failures short-circuit the pipeline; soft issues accumulate into a `ConflictReport`.
**Rationale**: Sequential evaluation with early exit on hard failures avoids unnecessary computation. Accumulating all soft issues into a single report gives leaders complete visibility for override decisions.
**Alternatives considered**:
- Single unified validator returning severity levels: Rejected because hard constraints must throw (not return), making them fundamentally different from soft issues.
- Strategy pattern with pluggable validators: Over-engineered for 4 hard rules and 3 soft rules. A simple function pipeline is sufficient.

## Integration with Availability Engine (Spec L1)

**Context**: The Conflict & Validation Service needs UNAVAILABLE/DOUBLE_BOOKED status from the existing `AvailabilityEngine`.

**Decision**: The service will accept `AvailabilityResult` as pre-computed injected data rather than calling `AvailabilityEngine` internally. The caller (application layer) is responsible for running `AvailabilityEngine.checkAvailability()` and passing the result into the conflict service.
**Rationale**: Keeps the conflict service pure and decoupled from the availability engine's data-fetching requirements. The application layer already has access to blockouts and assignments from the repository layer.
**Alternatives considered**:
- Injecting the `AvailabilityEngine` itself: Creates coupling between two domain services. The conflict service shouldn't need to know about blockout arrays and assignment contexts — it only needs the result.

## Fairness Check Approach

**Context**: The spec requires detecting when a volunteer has "served N times in the current scheduling period" and exceeds a fairness threshold.

**Decision**: The service receives a pre-computed `serviceCount` (number of times the volunteer is currently assigned in the period) and a `fairnessThreshold` (configurable max). Comparison is `serviceCount >= fairnessThreshold`.
**Rationale**: Counting assignments is a repository concern. The domain service only needs to compare two numbers. If `fairnessThreshold` is 0, the check is skipped entirely (disabled).
**Alternatives considered**:
- Receiving full assignment list and counting internally: Rejected because the "scheduling period" definition (current month vs custom) is a business configuration concern, not domain logic.

## AssignmentAudit Entity Extension

**Context**: The existing `AssignmentAudit` entity (Spec D1) has an `action` field with options `['created', 'updated', 'deleted', 'status_change']` and an optional `reason` field. The Conflict & Validation Service needs to record override-specific data (conflict types).

**Decision**: Extend the existing `AssignmentAudit` entity by adding an `overrideConflictTypes` optional field to `AssignmentAuditProps`. The `action` value for overrides will be `'created'` (since the override happens at assignment creation time). The `reason` field already serves the `overrideReason` purpose.
**Rationale**: Reuses the existing entity and error infrastructure. Adding one optional field is minimally invasive.
**Alternatives considered**:
- Creating a separate `OverrideAudit` entity: Rejected — violates the existing entity model from Spec D1 and duplicates shared fields.

## Error Design: HardConstraintError

**Context**: The project already has `DomainError` (from `@church/core`) and concrete errors like `InvalidDateRangeError`.

**Decision**: Create a `HardConstraintError` extending `DomainError` with a typed `reason` field containing the specific constraint code (`NOT_QUALIFIED`, `NOT_IN_MINISTRY`, `EVENT_IN_PAST`, `DUPLICATE_ASSIGNMENT`).
**Rationale**: Follows the established one-class-per-error pattern. The `reason` field allows the application layer to map to appropriate HTTP status codes.
**Alternatives considered**:
- Four separate error classes (one per hard constraint): Excessive — the constraint type is metadata, not a fundamentally different error.

## Override Authorization Boundary

**Context**: The spec states that only `LEADER` (ministry-scoped) or `ADMIN` roles can override. The domain service validates caller role context.

**Decision**: The service receives a `CallerContext` parameter with `{ userId, systemRole, ministryId? }`. The domain service checks that `systemRole` is `'leader'` or `'admin'`. Ministry scoping (leader must belong to the target ministry) is also validated at the domain level since ministry membership data is already available.
**Rationale**: Role validation at the domain level provides defense-in-depth. The application layer (tRPC middleware, Spec A3) provides the primary gate, but the domain service ensures the contract is enforced even if called directly.
**Alternatives considered**:
- Deferring all authorization to the application layer: Rejected because the domain service should be self-protecting. A pure `isAuthorizedToOverride()` check is trivial and adds no infrastructure coupling.
