# Quickstart: Volunteer Dashboard

**Branch**: `develop` | **Date**: 2026-06-29

Use this after implementation to verify the feature end-to-end.

---

## 1. Prepare Environment

1. Ensure Postgres / app stack is running via existing project workflow.
2. Add any new server env vars to local `.env`.
3. Run schema migration for new dashboard tables / columns.
4. Seed test data with at least:
   - one volunteer user
   - two ministries for that volunteer
   - one hourly upcoming Event with leader-defined service slots needing availability answers
   - one day-based or special-date Event with leader-defined service blocks needing availability answers
   - one published assignment already scheduled for the volunteer
   - one in-progress assignment
   - several stored scheduling notifications

---

## 2. Start Apps

```bash
bun run dev:server
bun run dev:web
```

Open the web app and authenticate as seeded volunteer.

---

## 3. Verify Core Flows

### Availability needed

1. Open `/dashboard`.
2. Confirm `Availability needed` appears above assignments.
3. Open hourly Event task.
4. Answer each visible service slot and save.
5. Confirm success message appears.
6. Re-open same Event and verify saved slot answers render.
7. Open day-based Event task.
8. Answer each leader-defined block for the special-date / retreat scenario.
9. Save and verify task only clears when every required slot has an answer.

### Overlap warning

1. Use an Event where volunteer already has a published assignment.
2. Mark overlapping unavailability.
3. Confirm warning explains staffing / reassignment consequence.
4. Confirm behavior follows rollout flag:
   - allow path: explicit confirmation then save succeeds
   - blocked path: save prevented with clear message

### Upcoming assignments

1. Confirm only volunteer-owned published assignments render.
2. Confirm first actionable Event group auto-expands.
3. Confirm in-progress assignment shows visible badge.
4. Confirm in-progress assignment response controls are disabled.
5. Confirm scheduled future assignment shows the protected `I cannot serve` flow.
6. Confirm the destructive action requires typed confirmation before saving.

### Notifications inbox

1. Open inbox section.
2. Verify unread styling.
3. Mark one item read.
4. Use `mark all as read`.
5. Use `Load more` and confirm older notifications append.
6. Open notification whose exact target no longer exists.
7. Confirm user lands in best current section and sees the `Original target changed` explanation toast.

### Ministry schedule

1. Open ministry schedule section.
2. If volunteer belongs to multiple ministries, confirm default ministry follows next upcoming assignment.
3. Switch ministries manually.
4. Expand one Event.
5. Confirm rows show team, role, volunteer display name, and confirmation state only.

### Offline / refresh

1. Load dashboard while online.
2. Simulate offline mode.
3. Reload dashboard.
4. Confirm cached assignments / inbox / ministry schedule still render.
5. Trigger manual refresh while offline and confirm clear failure message with cached data preserved.
6. Restore connectivity and confirm subtle data-updated indicator appears only if data changed.

---

## 4. Targeted Test Commands

```bash
bun run --filter server test
bun run --filter web test
bun run --filter web test:e2e
```

If the implementation adds narrower file-scoped commands, run those first during task-by-task execution.
