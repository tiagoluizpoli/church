# Spec 12: Lifecycle & Cleanup Rules

## Purpose
Define rules for data retention, cleanup, and state transitions for old schedules.

---

## 1. State Transitions
- **Draft -> Published**: All assignments become visible to volunteers.
- **Published -> Past**: Event date has passed. Assignments are archived for reporting.
- **Published -> Cancelled**: All linked assignments are automatically marked as `cancelled`.

**Refined (017, 2026-07-02):** The single Event state machine splits into **three** independent lifecycles, with **two distinct publishes**:

- **`PlanningCycle`**: `draft -> locked -> archived` (auto-archive after `endDate`; append-only after lock). The `draft -> locked` transition is the **ChurchAdmin** cycle-lock — the church-level publish that hands the calendar to leaders.
- **`Event`**: `draft -> scheduled -> cancelled / past` — "published" leaves the Event entirely.
- **`MinistryParticipation`**: `tailoring -> availability_fired -> rostering -> published`. The `rostering -> published` transition is the **leader** roster-publish — reveals only that ministry's slice to its volunteers.

These two publishes (cycle-lock vs roster-publish) are separate and independent. (see ADR 0001 / CONTEXT.md)

---

## 2. Cleanup Logic
- **Expired Tokens**: Delete `MinistryInvitation` records 30 days after expiration.
- **Old Drafts**: Notify leaders about drafts older than 60 days that were never published.

---

## 3. Testing Requirements (Mandatory)
- **Unit**: Verify that cancelling an event correctly updates the status of all `TimeSlots` and `Assignments`.
- **Integration**: Verify that `church_id` isolation is maintained during batch cleanup operations.
- **Audit**: Verify that archiving an event preserves the `AssignmentAudit` trail for compliance.
