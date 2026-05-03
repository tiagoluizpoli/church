# Spec 07: Domain Service — Conflict Validation

## Purpose
Enforces scheduling constraints and provides clear feedback to the Ministry Leader when a rule is violated.

---

## 1. Rule Types

### I. Hard Constraints (Blockers)
- Volunteer not qualified for the Role.
- Volunteer not in the Ministry.
- Assignment attempted for an event in the past.
- **Action**: Throw `DomainError` (Prevent save).

### II. Soft Constraints (Warnings)
- Volunteer is `UNAVAILABLE` (via Availability Engine).
- Volunteer is `DOUBLE_BOOKED`.
- Volunteer has already served X times this month (Fairness rule).
- **Action**: Return `ConflictReport`. Allow save ONLY with an `override_reason`.

---

## 2. Validation Flow
1. API receives `createAssignment` request.
2. Call `HardConstraintsValidator`.
3. Call `AvailabilityEngine`.
4. If Soft Conflict exists, respond with `409 Conflict` + the report.
5. If Leader re-submits with `override_reason`, save assignment and create `AssignmentAudit`.

---

## 3. Testing Requirements (Mandatory)
- **Unit**: Verify that `Hard Constraints` cannot be bypassed even with an override reason.
- **Unit**: Verify that `Soft Conflicts` correctly return the specific reason (Unavailable vs Double-booked).
- **Audit**: Verify that an override actually persists the reason in the `AssignmentAudit` table.
- **Security**: Verify that only `LEADER` or `ADMIN` roles can trigger an override.
