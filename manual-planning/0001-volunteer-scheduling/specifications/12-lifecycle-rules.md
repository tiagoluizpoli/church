# Spec 12: Lifecycle & Cleanup Rules

## Purpose
Define rules for data retention, cleanup, and state transitions for old schedules.

---

## 1. State Transitions
- **Draft -> Published**: All assignments become visible to volunteers.
- **Published -> Past**: Event date has passed. Assignments are archived for reporting.
- **Published -> Cancelled**: All linked assignments are automatically marked as `cancelled`.

---

## 2. Cleanup Logic
- **Expired Tokens**: Delete `MinistryInvitation` records 30 days after expiration.
- **Old Drafts**: Notify leaders about drafts older than 60 days that were never published.

---

## 3. Testing Requirements (Mandatory)
- **Unit**: Verify that cancelling an event correctly updates the status of all `TimeSlots` and `Assignments`.
- **Integration**: Verify that `church_id` isolation is maintained during batch cleanup operations.
- **Audit**: Verify that archiving an event preserves the `AssignmentAudit` trail for compliance.
