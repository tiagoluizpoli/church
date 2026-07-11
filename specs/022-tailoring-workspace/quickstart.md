# Quickstart: Tailoring Workspace

## Manual verification path (dev environment)

1. Seed or use an existing church with ≥2 ministries assigned to the same leader/sub-leader, and one `PlanningCycle` in a state that is locked/open for tailoring with ≥1 `Event` spanning multiple days.
2. Log in as that leader. Navigate to `/scheduling/tailoring`.
3. **Story 1** — confirm both ministries appear (table on desktop viewport, cards on mobile viewport ≤ `md`), with real event/slot counts; a ministry with no participation yet shows 0/0.
4. Click a ministry with an open cycle. **Story 2** — confirm the cycle list is scoped to that ministry only.
5. Click a cycle. **Story 3** — confirm:
   - the calendar spans exactly the cycle's start→end dates, with dots on days that have events.
   - clicking a marked day filters the slot list to that day; clicking again (or clearing) restores the full list.
   - the name filter and time-of-day filter narrow the list with no network request (check devtools network tab — no new requests on filter change).
   - checking a slot reveals shift/headcount controls; unchecking hides them.
   - splitting a shift equally into N parts works, and manual spans reject overlapping/out-of-bounds/inverted times.
   - headcount persists per shift.
6. **Story 4** — touch 2+ slots/shifts across different events in the same cycle, then use the single save/publish action once. Confirm in devtools network tab that `fireAvailability` is called once per touched `MinistryParticipation` (not per slot/shift), and that the volunteer side (separate dashboard/notification list) shows exactly one new availability-check item per affected volunteer for this cycle, not one per event.
7. Re-open the same ministry+cycle after step 6 — confirm the workspace remains editable (FR-017) and further edits still batch on the next save.

## Automated coverage expectations (for `/speckit-tasks`)

- Component/interaction tests for calendar day-filter, name/time filters, split-shift mode switch, manual-span validation (reuse existing validation test cases where present).
- An integration/E2E test asserting exactly one `fireAvailability` network call per touched participation and zero duplicate `AvailabilityCheck` creation across a multi-slot, multi-event save (backs SC-004).
- Responsive snapshot/interaction tests for the ministry-list table↔card breakpoint switch (mirrors existing `cycle-list-card` test coverage).
