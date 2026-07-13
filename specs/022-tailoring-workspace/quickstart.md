# Quickstart: Tailoring Workspace

## Manual verification path (dev environment)

1. Seed or use an existing church with ≥2 ministries assigned to the same leader/sub-leader, and one `PlanningCycle` in a state that is locked/open for tailoring with ≥1 `Event` spanning multiple days.
2. Log in as that leader. Navigate to `/scheduling/tailoring`.
3. **Story 1** — confirm both ministries appear (table on desktop viewport, cards on mobile viewport ≤ `md`), with real event/slot counts; a ministry with no participation yet shows 0/0.
4. Click a ministry with an open cycle. **Story 2** — confirm the cycle list is scoped to that ministry only.
5. Click a cycle. **Story 3** — confirm:
   - the day strip spans exactly the cycle's start→end dates, one cell per day (day-of-week + day number), with dots/markers on days that have events.
   - the strip scrolls horizontally via mouse click-and-drag, touch swipe, the chevron control at each end, and keyboard arrow keys (Left/Right moves focus one day, Enter/Space selects it — added during clarification); for a long (multi-month) cycle, confirm it stays usable without needing to scroll the whole page.
   - clicking a marked day filters the slot list to that day; clicking again (or clearing) restores the full list.
   - the name filter and time-of-day filter, rendered as a horizontal row directly beneath the day strip, narrow the list with no network request (check devtools network tab — no new requests on filter change).
   - marking a slot Serving reveals shift/headcount controls; marking it Not-serving hides them.
   - splitting a shift equally into N parts works, and manual spans reject overlapping/out-of-bounds/inverted times.
6. **Story 3a** *(added in Iteration 2, corrected during clarification — this is NOT a combined row save)* — confirm the split/headcount save model:
   - marking a slot Serving persists immediately (check devtools network tab — a `setParticipationInclusions` call fires right away, no separate save step for this toggle).
   - changing the split mode does **not** fire any network request by itself; the slot's own "Save split" action becomes enabled (it's disabled while the split matches its last-saved state) — click it and confirm it persists **on its own**, independent of any headcount state.
   - typing a headcount value does **not** fire any network request by itself either; the slot's "Save headcounts" action becomes enabled instead — this is a *separate* action from "Save split", not the same click.
   - leave that slot (collapse it, or change the day/filter view) without saving either — confirm you're not blocked, and each pending indicator (split, headcount) is still there when you come back to it.
   - with the slot Serving=Yes and a headcount left blank/zero, confirm only the "Save headcounts" action is disabled with an explanation — confirm "Save split" is unaffected and still usable.
   - fill in the missing headcount and split a shift into 3+ parts, then click "Save headcounts" — confirm every role's headcount across every shift in that slot persists in one action, and the headcount-unsaved indicator clears; the split you saved earlier is unaffected.
   - if reachable, simulate one headcount call failing while others in the same batch succeed (e.g. via devtools network throttling/blocking one request) — confirm the succeeded values stay saved and only the failed one remains flagged/retryable, not an all-or-nothing rollback.
   - flip that same slot to Not-serving, then back to Serving — confirm the split/headcount values you entered are still there (not reset), since they were never saved but the tab/page was never left either.
   - with that slot still having unsaved split and/or headcount edits, try to navigate away from the tailoring workspace entirely (not just collapse the row) — confirm the same unsaved-changes confirmation from step 8 below now also fires for this case.
7. **Story 4** — touch 2+ slots/shifts across different events in the same cycle (saving each row as you go), then use the single "Request availability" action once. Confirm in devtools network tab that `fireAvailability` is called once per touched `MinistryParticipation` (not per slot/shift), and that the volunteer side (separate dashboard/notification list) shows exactly one new availability-check item per affected volunteer for this cycle, not one per event.
8. Re-open the same ministry+cycle after step 7 — confirm the workspace remains editable (FR-017) and further edits still batch on the next save.

## Automated coverage expectations (for `/speckit-tasks`)

- Component/interaction tests for day-strip day-filter (including drag/swipe/chevron navigation), name/time filters, split-shift mode switch, manual-span validation (reuse existing validation test cases where present).
- An integration/E2E test asserting exactly one `fireAvailability` network call per touched participation and zero duplicate `AvailabilityCheck` creation across a multi-slot, multi-event save (backs SC-004).
- Responsive snapshot/interaction tests for the ministry-list table↔card breakpoint switch (mirrors existing `cycle-list-card` test coverage).
- *(Added in Iteration 2, corrected during clarification)* Component tests confirming: the Serving toggle fires `setParticipationInclusions` immediately while split/headcount changes do not fire any mutation until their own respective save action; the "Save split" action is dirty-gated and persists independently of headcount state; the "Save headcounts" action commits every role across every shift in that slot together in one action, separate from "Save split"; a failed call within a multi-call headcount save doesn't roll back sibling calls that succeeded (backs FR-022b); the headcount save (not the split save) is disabled with an explanation when Serving=Yes and headcount is unset (backs SC-008); both split and headcount pending edits survive a Serving Yes→No→Yes toggle within the same render tree; each pending flag drives its own visible indicator and both extend the existing `useBlocker` navigation guard's trigger condition (research.md R13) — this last one specifically needs a test that edits a slot *without* saving, then attempts route navigation, and asserts the guard fires (the existing T030a test only covers the already-touched-participation trigger path, not this new one). Also: the day strip's keyboard arrow-key navigation (FR-020a), and the `@tanstack/react-form`/`zod` schema's equivalence with the existing `validateManualSpans`/`parseValidHeadcounts` rules (FR-027).
