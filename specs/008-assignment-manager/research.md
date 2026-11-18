# Research: Slot & Assignment Manager

## Decision 1: Service Architecture Pattern

**Decision**: Use the same `as const` object pattern as `ConflictValidationService` and `AvailabilityEngine` — a frozen object with static methods, no class instantiation.

**Rationale**: Consistency with the two existing domain services (L1, L2). All three services are pure functions that receive injected data and return domain objects. A class with constructor-injected dependencies is unnecessary when there are no stateful dependencies to manage.

**Alternatives considered**:
- Class-based service with dependency injection → Over-engineering for a pure function pipeline.
- Standalone exported functions → Loses the namespace grouping that `ConflictValidationService.validate()` provides.

## Decision 2: Slot Generation — Remainder Handling (Equal Split)

**Decision**: When the event duration isn't evenly divisible by the slot duration, generate a shorter trailing slot to cover the remainder. Never silently discard time.

**Rationale**: The spec explicitly requires "no time is silently discarded" (User Story 1, Scenario 2). A 65-minute event with 30-minute slots produces 2×30min + 1×5min = 3 slots. Leaders can see and adjust the trailing slot.

**Alternatives considered**:
- Round up the last slot to fill full duration → Creates overlap with event end.
- Reject uneven divisions → Too restrictive for real-world scheduling.
- Silently discard remainder → Violates spec requirement explicitly.

## Decision 3: Template Input Shape

**Decision**: Define a `SlotTemplate` input type that the caller provides. The template includes named periods with relative or absolute times and optional requirement definitions. This is an input contract, NOT a persisted entity.

**Rationale**: Spec Assumption 5 explicitly states "the template data model is not defined in this spec." The service needs a typed contract for what it receives, but persistence/CRUD of templates belongs to the repository layer.

**Alternatives considered**:
- Accept raw JSON objects → Loses type safety.
- Define a full `ScheduleTemplate` domain entity → Expands scope beyond spec boundaries.

## Decision 4: AssignmentAudit Action Extension

**Decision**: Extend the `AssignmentAuditAction` union type in the existing `assignment-audit.ts` entity to include `event_published` and `event_cancelled`. This is additive — no breaking change.

**Rationale**: Spec FR-012 explicitly requires event-level audit types for precise audit queries. Using generic `status_change` for everything makes audit filtering ambiguous.

**Alternatives considered**:
- Overload `status_change` for everything → Loses audit precision.
- Create a separate `EventAudit` entity → Over-engineering; the existing `AssignmentAudit` table structure handles it.

## Decision 5: Event Entity — Missing `past` Status

**Decision**: Extend `EVENT_STATUS_OPTIONS` in `event.ts` to include `'past'`. Add a `markAsPast()` mutation method.

**Rationale**: The current entity only has `draft | published | cancelled`. The spec requires a `past` status for lifecycle transitions (FR-015, User Story 7). This is an additive, non-breaking change to the existing entity.

**Alternatives considered**:
- Keep using `cancelled` for past events → Loses semantic distinction between "leader cancelled" and "naturally expired."
- Use a separate `archivedAt` timestamp → Adds complexity; a status value is simpler and consistent with the existing state machine.

## Decision 6: Assignment Entity — Missing `draft` Status

**Decision**: Extend `ASSIGNMENT_STATUS_OPTIONS` in `assignment.ts` to include `'draft'`. When assignments are created during schedule building (before publishing), they start as `draft` rather than `pending`.

**Rationale**: The spec distinguishes between draft assignments (pre-publish, invisible to volunteers) and pending assignments (post-publish, visible). The current entity defaults to `pending`, which is incorrect for the pre-publish workflow. The publish action transitions `draft → pending`.

**Alternatives considered**:
- Create assignments as `pending` immediately → Volunteers would see unfinished schedules.
- Use a separate `isPublished` flag → Adds a parallel state tracking mechanism; cleaner to use the status enum.

## Decision 7: Assignment Entity — Missing `cancelled` Status

**Decision**: Extend `ASSIGNMENT_STATUS_OPTIONS` to also include `'cancelled'`. When an event is cancelled, assignments transition to `cancelled` (not deleted).

**Rationale**: The spec requires cascade cancellation for published events (FR-006). Published assignments were already visible to volunteers, so they need a `cancelled` status rather than deletion. Draft assignments are deleted (FR-007), not transitioned.

## Decision 8: Hard Constraint Re-Validation at Publish

**Decision**: Reuse the existing `ConflictValidationService.validate()` for hard constraint checks at publish time. For each assignment, construct a minimal `ValidationRequest` and catch `HardConstraintError`. Soft conflicts are skipped by providing a neutral `availabilityResult` (status: `AVAILABLE`).

**Rationale**: Avoids duplicating hard constraint logic. L2 already has the validated, tested implementation. The Assignment Manager calls L2's validate, catches hard constraint errors, and collects all failing assignments before returning a rejection.

**Alternatives considered**:
- Duplicate the hard constraint checks inline → Violates DRY.
- Add a `validateHardOnly()` method to L2 → Possible but unnecessary; we can construct a neutral request that bypasses soft checks.
- Skip re-validation entirely → Rejected per assumption review (stale data risk).

## Decision 9: TimeSlot Entity — Missing `status` Field

**Decision**: Add a `status` field to `TimeSlotProps` with values `'active' | 'cancelled'`. Default to `'active'`. Add a `cancel()` mutation method.

**Rationale**: FR-006 requires event cancellation to cascade to slots. Currently `TimeSlot` has no status field, so there's no way to represent a cancelled slot.

**Alternatives considered**:
- Delete cancelled slots from the database → Loses audit trail.
- Use a `deletedAt` soft delete → Inconsistent with the explicit status pattern used by Event and Assignment.
