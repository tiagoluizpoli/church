# Spec L2: Conflict & Validation Service

## Purpose
Enforce the "Soft" vs "Hard" scheduling rules and audit any overrides.

## 1. Rule Enforcement
- **Hard Rules**:
    - Volunteer is not qualified for the Role.
    - Volunteer is not part of the Ministry.
    - Result: Throw `ValidationError` (Prevent save).
- **Soft Rules**:
    - Volunteer is unavailable (Blockout).
    - Volunteer is double-booked.
    - Result: Return `ConflictResult` with a list of issues. Allow save only with an `overrideReason`.

## 2. Overriding Auditing
- If a leader overrides a soft conflict, the service must create an `AssignmentAudit` record.
- `AssignmentAudit` Fields:
    - `assignmentId`, `leaderId`, `churchId`, `reason`, `timestamp`.

## 3. Testing Requirements (Mandatory)
- **Unit**: Verify that `Hard Rules` cannot be bypassed.
- **Integration**: Verify that `AssignmentAudit` is correctly saved to the database upon override.
- **Security**: Ensure only users with `LEADER` or `ADMIN` roles can trigger an override.

## 🔗 References
- [Spec 07: Conflict Validation](./07-conflict-validation.md)
