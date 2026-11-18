# Feature Specification: Conflict & Validation Service (Spec L2)

**Feature Branch**: `007-conflict-validation-service`

**Created**: 2026-05-15

**Status**: Draft

**Input**: User description: "Conflict and Validation Service — Rules for double-booking and override auditing. Refines 07-conflict-validation.md."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Validate Assignment Against Hard Constraints (Priority: P1)

As a ministry leader creating or editing a volunteer assignment, I need the system to immediately reject assignments that violate fundamental eligibility rules, so that unqualified or unauthorized volunteers are never accidentally scheduled.

**Why this priority**: Hard constraints are non-negotiable safety rails. If a volunteer isn't qualified or doesn't belong to the ministry, the assignment must be impossible — no override can bypass this.

**Independent Test**: Can be fully tested by providing a candidate assignment against mock domain entities (Volunteer, Ministry, Role) and asserting that ineligible combinations throw a domain error.

**Acceptance Scenarios**:

1. **Given** a volunteer who is NOT qualified for the requested role, **When** an assignment is attempted, **Then** a hard constraint error is raised with reason `NOT_QUALIFIED` and the save is prevented.
2. **Given** a volunteer who is NOT a member of the target ministry, **When** an assignment is attempted, **Then** a hard constraint error is raised with reason `NOT_IN_MINISTRY` and the save is prevented.
3. **Given** an assignment attempted for an event whose start time is in the past, **When** the assignment is validated, **Then** a hard constraint error is raised with reason `EVENT_IN_PAST` and the save is prevented.
4. **Given** a volunteer who already has an assignment on the same slot, **When** a duplicate assignment is attempted, **Then** a hard constraint error is raised with reason `DUPLICATE_ASSIGNMENT` and the save is prevented.
5. **Given** a volunteer who IS qualified AND belongs to the ministry AND the event is in the future AND no duplicate exists, **When** an assignment is attempted, **Then** no hard constraint error is raised and validation proceeds to soft constraint checks.

---

### User Story 2 - Detect Soft Conflicts and Present Override Decision (Priority: P1)

As a ministry leader, when I assign a volunteer who has a scheduling conflict, I need to see exactly what the conflict is (unavailable, double-booked, or overworked) so I can make an informed decision about whether to override it.

**Why this priority**: This is the core decision loop of the scheduling experience. Leaders need clear conflict information to schedule responsibly, and the ability to override when ministry needs justify it.

**Independent Test**: Can be tested by providing assignment data with known overlapping blockouts/assignments/workload counts and asserting the conflict report contains the correct issue types.

**Acceptance Scenarios**:

1. **Given** a volunteer with an `UNAVAILABLE` status (blockout overlap) for the requested time, **When** the assignment is validated, **Then** a conflict report is returned listing the specific `UNAVAILABLE` issue with the overlapping blockout details.
2. **Given** a volunteer with a `DOUBLE_BOOKED` status (existing assignment overlap) for the requested time, **When** the assignment is validated, **Then** a conflict report is returned listing the specific `DOUBLE_BOOKED` issue with the conflicting assignment details.
3. **Given** a volunteer who has already served N times in the current scheduling period and exceeds the fairness threshold, **When** the assignment is validated, **Then** a conflict report is returned listing a `FAIRNESS_EXCEEDED` issue with the current service count and threshold.
4. **Given** a volunteer with multiple concurrent soft conflicts (e.g., unavailable AND overworked), **When** the assignment is validated, **Then** the conflict report contains ALL detected issues, not just the first one.

---

### User Story 3 - Audit Trail for Override Decisions (Priority: P2)

As a church administrator, I need every soft-conflict override to be permanently recorded with the leader's identity and rationale, so that scheduling decisions can be reviewed and accountability is maintained.

**Why this priority**: Override auditing is critical for governance but does not block the core scheduling flow. It's a write-side concern that can be validated independently after the override mechanism works.

**Independent Test**: Can be tested by executing an override flow and asserting that an `AssignmentAudit` record is persisted with the correct fields.

**Acceptance Scenarios**:

1. **Given** a leader overrides a soft conflict with reason "Ministry need — only qualified volunteer available", **When** the assignment is saved, **Then** an `AssignmentAudit` record is created containing `assignmentId`, `actorId`, `churchId`, `overrideReason`, `conflictTypes`, and `timestamp`.
2. **Given** a leader saves an assignment with NO soft conflicts, **When** the assignment is saved, **Then** NO audit record is created (audits are only for overrides).
3. **Given** multiple overrides occur on different assignments, **When** an administrator queries the audit log, **Then** each override is independently retrievable by `churchId`, `assignmentId`, or `actorId`.

---

### User Story 4 - Role-Based Override Authorization (Priority: P2)

As the system, I must ensure that only users with LEADER or ADMIN roles within the relevant ministry/church can trigger an override, so that regular volunteers cannot bypass scheduling constraints.

**Why this priority**: Security boundary that prevents unauthorized schedule manipulation. Essential for trust but can be developed in parallel with the core validation logic.

**Independent Test**: Can be tested by attempting an override with different user role contexts and asserting that unauthorized users receive a permission error.

**Acceptance Scenarios**:

1. **Given** a user with `VOLUNTEER` role attempts to submit an assignment with an `override_reason`, **When** the override is processed, **Then** a permission error is raised and the save is prevented.
2. **Given** a user with `LEADER` role for the target ministry submits an override, **When** processed, **Then** the override is accepted and the assignment is saved.
3. **Given** a user with `ADMIN` role submits an override for any ministry, **When** processed, **Then** the override is accepted and the assignment is saved.
4. **Given** a conflict report exists, **When** the leader submits the assignment WITHOUT an override reason (empty or whitespace-only), **Then** the save is rejected with a validation error.
5. **Given** a conflict report exists, **When** the leader re-submits with a valid non-empty `override_reason`, **Then** the override proceeds to role authorization.

### Edge Cases

- What happens when a volunteer's qualification is revoked AFTER an assignment was created but BEFORE the event date? The validation service only validates at assignment-creation time; existing assignments remain valid until explicitly reviewed.
- What happens when a leader tries to override a hard constraint? The system MUST reject it — hard constraints are never overridable regardless of role or reason.
- What happens when the override reason is an empty string or only whitespace? The system treats this as missing and rejects the override.
- What happens when a volunteer is assigned to the same slot twice (duplicate assignment)? This is treated as a hard constraint violation (`DUPLICATE_ASSIGNMENT`).
- What happens when the fairness threshold is set to zero (disabled)? The fairness check is skipped entirely — no `FAIRNESS_EXCEEDED` issue is generated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST classify scheduling constraints into two categories: Hard (blockers) and Soft (warnings).
- **FR-002**: Hard constraint violations MUST immediately prevent assignment creation with a descriptive domain error. No override mechanism may bypass a hard constraint.
- **FR-003**: Hard constraints MUST include: volunteer not qualified for the role, volunteer not a member of the ministry, event start time is in the past, and duplicate assignment to the same slot.
- **FR-004**: Soft constraint detection MUST include: volunteer is unavailable (blockout overlap via Availability Engine), volunteer is double-booked (existing assignment overlap via Availability Engine), and volunteer exceeds the fairness threshold for the scheduling period.
- **FR-005**: When soft conflicts are detected, the system MUST return a structured `ConflictReport` containing all detected issues, not just the first.
- **FR-006**: Assignments with soft conflicts MUST only be saved when accompanied by a non-empty `override_reason` string.
- **FR-007**: Every overridden soft conflict MUST generate an `AssignmentAudit` record containing: `assignmentId`, `actorId`, `churchId`, `reason` (override justification), `overrideConflictTypes`, and `timestamp`.
- **FR-008**: Only users with `LEADER` (scoped to the relevant ministry) or `ADMIN` role MUST be permitted to submit overrides.
- **FR-009**: System MUST enforce `churchId` isolation — all validation checks, conflict detection, and audit records are scoped to the volunteer's church.
- **FR-010**: The validation flow MUST execute in order: hard constraints first, then soft constraints. If hard constraints fail, soft constraints are never evaluated.
- **FR-011**: The Conflict & Validation Service MUST remain a pure domain service with no direct infrastructure dependencies, receiving all data through injected interfaces.

### Key Entities

- **ConflictReport**: Represents the outcome of soft constraint validation. Contains a list of `ConflictIssue` items, each specifying the type (`UNAVAILABLE`, `DOUBLE_BOOKED`, `FAIRNESS_EXCEEDED`) and contextual details (e.g., overlapping blockout ID, conflicting assignment ID, service count vs threshold).
- **AssignmentAudit**: Immutable record capturing who overrode what conflict and why. Key attributes: `assignmentId`, `actorId`, `churchId`, `reason` (reuses existing field for override justification), `overrideConflictTypes` (new optional field), `timestamp`.
- **HardConstraintError**: Domain error raised when a non-overridable rule is violated. Carries a reason code (`NOT_QUALIFIED`, `NOT_IN_MINISTRY`, `EVENT_IN_PAST`, `DUPLICATE_ASSIGNMENT`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of hard constraint scenarios (unqualified, wrong ministry, past event, duplicate) are correctly blocked in automated tests.
- **SC-002**: 100% of soft conflict types (unavailable, double-booked, fairness exceeded) are correctly detected and reported in automated tests.
- **SC-003**: Override flow correctly rejects assignments without a reason and accepts assignments with a valid reason in 100% of test cases.
- **SC-004**: Every overridden assignment produces exactly one `AssignmentAudit` record with all required fields populated.
- **SC-005**: Unauthorized override attempts (non-LEADER, non-ADMIN) are rejected in 100% of test cases.
- **SC-006**: Service operates as a pure domain service with zero direct infrastructure dependencies — all external data is injected.

## Assumptions

- The Availability Engine (Spec L1) is fully implemented and provides `AVAILABLE`, `UNAVAILABLE`, and `DOUBLE_BOOKED` status resolution for any volunteer + time range query.
- Domain Entities (Spec D1) — including Volunteer, Ministry, Role, Assignment, and Availability — are fully defined and available for use.
- The `churchId` isolation pattern established in previous specs is reused here without modification.
- The fairness threshold (maximum times a volunteer can serve in a period) is a configurable value provided by the caller or ministry settings, not hardcoded.
- "Scheduling period" for fairness checks defaults to the current calendar month unless overridden by ministry configuration.
- Audit records are append-only and immutable once created — no update or delete operations are supported.
- Role-based authorization logic for `LEADER` and `ADMIN` is enforced at the application layer (tRPC middleware, Spec A3), but the domain service validates that the caller context includes the required role.
