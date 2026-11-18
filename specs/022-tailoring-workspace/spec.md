# Feature Specification: Tailoring Workspace Reorganization

**Feature Branch**: `022-tailoring-workspace`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "Reorganize ministry participation 'tailoring' flow into a leader/sub-leader-facing multi-page workflow: ministry list → cycle list → tailoring detail page (calendar + filters + slot/shift/headcount editing), with a single batched availability-check fire per save, and a data-model note distinguishing volunteers claimed by another ministry from self-reported unavailability."

**Iteration 2 (2026-07-12)**: The tailoring workspace's date-filter presentation and per-slot save model are redesigned — see [`iteration-2-filters-and-row-save.md`](./iteration-2-filters-and-row-save.md) for the original decision record and the `## Clarifications` section below for corrections made during `/speckit-clarify` that supersede that record's Part C. This spec has been updated in place below (US3 amended, US3a new, FR-007/FR-010/FR-011/FR-013 amended, FR-020–FR-027 new, Edge Cases, Success Criteria, Assumptions) to reflect it; sections not called out as changed are unaffected. Not yet implemented — see `tasks.md` Phase 8.

**Iteration 3 (2026-07-13)**: User Story 2 (the ministry-scoped cycle picker) gets real columns, a leader-facing tailoring-progress status, filters, header pills, a padding-consistency fix, and row-level navigation to both the tailoring workspace and Builder Events — see [`iteration-3-cycle-list-status-nav.md`](./iteration-3-cycle-list-status-nav.md) for the full decision record. **This is the first part of the feature that is not frontend-only** — it requires a new `touchedAt` column on `ministry_participation` and a new backend aggregation endpoint (research.md R15/R16, data-model.md §5). US2 amended below, FR-028–FR-036 new, Edge Cases/Success Criteria/Assumptions extended. Not yet implemented — see `tasks.md` Phase 9.

## Clarifications

### Session 2026-07-12

- Q: When a slot row's pending split and headcount edits are saved, how should the save action(s) behave, given `splitParticipationShifts` and the headcount-upsert mutation are separate existing endpoints and headcount targets a `shiftId` that only exists after split succeeds? → A: Not a single combined row save. Three independent tiers: (1) Serving toggle autosaves instantly, unchanged. (2) Split mode/count keeps its own explicit "Save split" button, enabled only while the split form differs from its last-saved state (dirty-gated) — deliberately not autosave-on-change, since incrementing a shift-count number input would otherwise fire a save on every click. (3) Headcounts get ONE save action per slot — but combined across every role in every shift of that slot, not one per shift as today. This corrects a misreading of the original iteration-2 request: "one save" always meant "one save for all headcounts in the slot, not one per shift" — it never meant bundling split into that same save.
- Q: FR-020 lists mouse drag, touch swipe, and chevron controls for day-strip navigation but no keyboard method — should the strip also support keyboard navigation, given the calendar it replaces already does? → A: Yes — arrow-key roving focus (Left/Right moves focus one day at a time, Enter/Space selects the focused day as the active filter), matching the existing calendar's current behavior so nothing is lost in the swap.
- Q: The "Save headcounts" action now fires potentially many headcount-upsert calls at once (every role across every shift in the slot) — if some succeed and some fail mid-batch, what should happen? → A: Per-call, not all-or-nothing. Each role/shift's headcount call succeeds or fails independently; only the failed ones stay flagged unsaved/errored and are retryable without re-sending calls that already succeeded — matches how the existing page-level "Save & request availability" batch action already behaves.
- Q: The split and headcount inputs this iteration touches currently have manual, hand-rolled validation (`validateManualSpans`, `parseValidHeadcounts`) with no form-library structure — should this iteration adopt a form library instead of extending the manual approach? → A: Yes — `@tanstack/react-form` (paired with `zod`), already a project dependency and already used in `sign-in-form.tsx`/`sign-up-form.tsx`. Scoped to the fields this iteration is already rewriting for the new save-button/dirty-gating behavior (split form fields, headcount fields) — not a repo-wide retrofit of untouched forms. Existing validation *logic* (`validateManualSpans`'s bounds/overlap rules) is reused as the source of truth inside the new schema, not rewritten from scratch, consistent with this feature's established "logic unchanged, structure rewritten" precedent (research.md R2).

### Session 2026-07-13

- Q: User Story 2's cycle-picker Status badge shows `PlanningCycle.state` (always "locked" on this screen) — is that the status the leader actually needs, or something else? → A: Something else. The leader needs a tailoring-*progress* status for their own ministry's work in that cycle, not the cycle's own admin-level lifecycle state. `PlanningCycle.state` was a misreading; see research.md R15 for the full domain-model investigation this surfaced.
- Q: The corrected 3-way status's terminal state — does "the leader is done" mean `MinistryParticipation.state === 'availability_fired'` (leader fired the notification) or `=== 'published'` (rostering finished, fully staffed)? → A: The real `published` state. This makes "In progress" a wide bucket spanning `availability_fired` and `rostering` in addition to touched-but-still-`tailoring` — see Decision 2 in `iteration-3-cycle-list-status-nav.md` and research.md R15.
- Q: Nothing today distinguishes "never touched" from "touched but still in `tailoring` state" for a `MinistryParticipation` — infer it from existing rows (`ParticipationSlotInclusion`/`Shift`/`SlotRequirement` presence) or add a new field? → A: New nullable `touched_at` timestamp column on `ministry_participation`, set once on first write. Row-existence inference was rejected as ambiguous (a leader explicitly excluding every slot looks identical to never having touched the cycle). See Decision 3 in `iteration-3-cycle-list-status-nav.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See my ministries and their tailoring status at a glance (Priority: P1)

A ministry leader or sub-leader who is responsible for one or more ministries opens the tailoring section and immediately sees every ministry they lead, with a quick read on how much tailoring work they've already done for the active cycle (event count, slot count) — without having to open each ministry to find out.

**Why this priority**: Without this landing view, a multi-ministry leader has no way to know where they left off or which ministries still need attention. This is the entry point for the entire redesign and unblocks every other story.

**Independent Test**: Log in as a leader of 2+ ministries, land on the tailoring section, and verify each ministry shows correct event/slot counts (zero for ministries not yet touched this cycle) without navigating further.

**Acceptance Scenarios**:

1. **Given** a leader responsible for 3 ministries where only 1 has any tailoring done for the active cycle, **When** they open the tailoring landing page, **Then** they see all 3 ministries listed, with the untouched two showing 0 events / 0 slots and the third showing its real counts.
2. **Given** the same leader on a mobile viewport, **When** they open the same page, **Then** the ministries render as a card list (not a table) with the same information, matching the responsive pattern used by the existing cycles list.

---

### User Story 2 - Choose which cycle to tailor for a given ministry (Priority: P1)

After picking a ministry, the leader sees the cycles that ministry can currently tailor, with enough real information per cycle — its name, date span, event/slot counts, and how far along the leader's own tailoring work is — to know at a glance which cycle needs attention, and picks one to enter the actual tailoring workspace for that ministry+cycle pair. *(Amended, Iteration 3)* As the list grows over time, the leader can narrow it by date range, by whether their ministry is involved at all, and by tailoring-progress status, and can jump directly from any row to either the tailoring workspace or Builder Events for that ministry.

**Why this priority**: This is the required intermediate step between "which ministry" and "which cycle's events" — without it, multi-cycle ministries have no way to disambiguate which cycle they're editing. *(Iteration 3)* As a ministry's cycle history grows, a bare list stops being usable for "which one needs me right now" without real status and filtering.

**Independent Test**: Click a ministry with 2+ open cycles; verify a cycle list appears scoped to that ministry, showing each cycle's real name, date span, event/slot counts, and tailoring-progress status; clicking a cycle (or its Tailoring button) opens the tailoring workspace for exactly that ministry+cycle combination; its Builder Events button navigates to Builder Events scoped to the ministry, and is disabled until availability has been fired for every event the ministry has in that cycle.

**Acceptance Scenarios**:

1. **Given** a ministry with two cycles open for tailoring, **When** the leader clicks that ministry, **Then** they see both cycles listed and can navigate into either independently.
2. *(Iteration 3)* **Given** a ministry with cycles in different tailoring states, **When** the leader views the cycle list, **Then** each cycle shows its own name (not an unrelated event's title), its date span, its event count, its slot count (slots the ministry has actually included itself in, not the event's total slot count), and one of "Not started" / "In progress" / "Published" — correctly reflecting the state of every event the ministry has in that cycle, not just one.
3. *(Iteration 3)* **Given** a cycle where the ministry has touched some but not all of its events, **When** the leader views its status, **Then** it shows "In progress," not "Not started" or "Published" — the all-participations rule (research.md R16) applies to both boundaries.
4. *(Iteration 3)* **Given** the cycle list has grown to include cycles across multiple years, **When** the leader applies a date-range filter, a Ministry Involvement filter, and/or a status filter, **Then** the visible list narrows to cycles matching all applied filters (logical AND), and the header pills update to reflect the filtered set.
5. *(Iteration 3)* **Given** any row in the cycle list, **When** the leader looks at its action column, **Then** they see a Tailoring button (always enabled, navigating to that cycle's tailoring workspace) and a Builder Events button (navigating to Builder Events scoped to the ministry, disabled until availability has been fired for every event the ministry has in that cycle).

---

### User Story 3 - Tailor participation for a cycle: pick slots, split shifts, set headcounts (Priority: P1)

Inside the tailoring workspace for a ministry+cycle, the leader sees a horizontally-scrolling day strip bounded to the cycle's date range with markers on days that have events, uses the day strip and the filter row beneath it to narrow the event/slot list, marks each slot as Serving or Not serving, and for each Serving slot either leaves it as one shift or splits it (equally or by manual time spans), setting the headcount needed per shift — split and headcounts each commit via their own dedicated save action (see Story 3a).

**Why this priority**: This is the core value of the whole feature — it is the actual tailoring work. Stories 1-2 only exist to get the leader here correctly scoped.

**Independent Test**: Open a cycle with a known event on a known day; scroll/click that day on the day strip and confirm the slot list filters to only that day's slots; mark a slot Serving, split it into 2 equal shifts, set headcount 5 on each, save the row once, and confirm both shifts persist with headcount 5.

**Acceptance Scenarios**:

1. **Given** a cycle spanning a full month (or longer — up to several months), **When** the leader opens the tailoring workspace, **Then** the day strip shows exactly the cycle's first day through its last day, one cell per day (day-of-week abbreviation + day number), with a marker on every day containing at least one event, and remains fully usable regardless of cycle length.
2. **Given** the day strip has a marked day, **When** the leader clicks it, **Then** the slot list below updates to show only that day's events/slots, and clicking the same day again (or an explicit clear action) restores the full list.
3. **Given** a day strip wider than the viewport, **When** the leader drags/swipes it horizontally, or uses the chevron control at either end, **Then** the strip scrolls to reveal earlier/later days without navigating away from the page or losing the current day-filter selection.
4. **Given** an event with three time slots, **When** the leader marks only two of them Serving, **Then** only those two show shift/headcount controls; the Not-serving slot shows none.
5. **Given** a Serving slot with default single-shift state, **When** the leader switches to split mode and chooses "equal, 3 shifts", **Then** three shifts appear with equal time bounds inside the slot, each independently accepting a headcount value — none of this is persisted yet (see Story 3a).
6. **Given** the same slot, **When** the leader instead chooses manual split and enters explicit start/end times for two shifts, **Then** the system rejects any span that starts after it ends, extends outside the parent slot's bounds, or overlaps another manual span in the same slot.
7. **Given** the leader wants to find events by name or by a start-time window (e.g., "starts between 8am and 12pm"), **When** they use the corresponding filter control (rendered as a horizontal row directly beneath the day strip), **Then** the visible slot list narrows accordingly without a page reload.
8. **Given** the day strip has keyboard focus, **When** the leader presses the Left/Right arrow keys, **Then** focus moves one day at a time (scrolling into view as needed), and pressing Enter or Space on the focused day sets it as the active day-filter, without requiring a mouse or touch input.

---

### User Story 3a - Save split immediately, headcounts once per slot, with validation (Priority: P1) *(added in Iteration 2, corrected during clarification)*

Within a single slot row: marking it Serving persists immediately (no save step). Changing its split configuration persists via its own explicit "Save split" action, independent of headcounts, enabled only while the split has unsaved changes. Setting headcounts for every role across every shift in that slot persists via one explicit "Save headcounts" action for the whole slot — not one per shift, as today. Until each is saved, its own pending state is visibly flagged; the headcount save is blocked (with an explanation) whenever the slot is Serving but any required headcount is still unset.

**Why this priority**: This is a direct trust/data-integrity requirement, not a cosmetic grouping — a leader working through a long list of slots needs unambiguous save boundaries, and the workspace must never let a slot reach a half-configured, silently-invalid saved state (Serving=Yes with no headcount). Same priority as Story 3 since it's inseparable from the actual editing flow.

**Independent Test**: Mark a slot Serving (persists immediately); split it into 2 shifts and click Save split (persists immediately, independent of headcounts); set a headcount on one shift's role but leave another blank; confirm the slot's headcount save is disabled with an explanation; fill in the missing headcount; confirm the headcount save becomes available and, on click, every role's headcount across both shifts persists in one action.

**Acceptance Scenarios**:

1. **Given** a Not-serving slot, **When** the leader marks it Serving, **Then** that single toggle persists immediately (no separate save step), and the slot defaults to one unsplit shift.
2. **Given** a Serving slot, **When** the leader changes the split mode or shift count, **Then** the slot's "Save split" action becomes enabled (it is disabled while the split form matches its last-saved state), and clicking it persists the split configuration immediately, independent of any pending headcount edits.
3. **Given** a Serving slot with one or more shifts, **When** the leader enters or changes any role's headcount value on any shift, **Then** no save fires automatically — the slot's single "Save headcounts" action becomes enabled instead, covering every role across every shift in that slot.
4. **Given** a slot with unsaved split and/or unsaved headcount changes, **When** the leader collapses the row or navigates to a different day/filter view without saving, **Then** they are not blocked from doing so, and each pending action's unsaved indicator remains so they can find it again.
5. **Given** a Serving slot where at least one required headcount is still at its default/blank state, **When** the leader attempts to save headcounts, **Then** that save action is disabled and the slot explains what is missing before it can be saved. This does not block the independent split save.
6. **Given** a slot with valid headcount changes across multiple shifts, **When** the leader clicks the slot's "Save headcounts" action, **Then** every role's headcount across every shift in that slot persists together in one action, and the headcount-unsaved indicator clears.
7. **Given** a slot where the leader flips Serving from Yes to No after entering split/headcount edits, and then flips it back to Yes within the same visit, **Then** the previously-entered (unsaved) split and headcount edits are still present, not reset to the default.
8. **Given** any slot anywhere in the workspace has unsaved split and/or headcount edits, **When** the leader attempts to leave the tailoring workspace entirely (navigate away or close the tab), **Then** they see the same unsaved-changes confirmation already required by Story 4's guard (research.md R8) — this guard's trigger condition is extended by this row-level state, not replaced.

---

### User Story 4 - Fire availability checks once per save, not per edit (Priority: P2)

After making any number of slot/shift/headcount changes in a tailoring session, the leader explicitly saves/publishes once, and volunteers receive exactly one batched availability-check notification reflecting all the changes — not one notification per slot or shift touched.

**Why this priority**: Directly prevents notification spam for volunteers, a named failure mode the leader wants avoided. It's P2 because it depends on Story 3 existing first, but is still required before this feature can be considered done.

**Independent Test**: Modify 3 different slots/shifts (inclusion, split, headcount) in one sitting, then save once; confirm exactly one availability-check batch is triggered, not three.

**Acceptance Scenarios**:

1. **Given** a leader who marked a new slot Serving, split an existing slot, and changed a headcount all in the same visit, **When** they click the single save/publish action, **Then** exactly one availability-check event fires covering all three changes.
2. **Given** the schedule for a cycle has already been released, **When** the leader returns to the tailoring workspace and makes further changes, **Then** the workspace still allows edits and still fires availability checks in the same single-batch manner.

---

### Edge Cases

- What happens when a leader marks a slot Not-serving that already has shifts/headcounts configured? (Per Iteration 2 Decision 2: unsaved local edits are kept in memory for that row for the rest of the session, not discarded, in case the leader flips Serving back to Yes. They are only lost if the leader navigates away from or reloads the workspace.)
- What happens when the leader splits a shift and then switches back to single-shift mode? (Prior split configuration for that slot is replaced by the single-shift default; the system should not silently merge stale shift data.)
- What happens when the cycle has zero events? (Day strip renders with no day markers; slot list shows an empty state, not an error.)
- What happens when a leader is responsible for a ministry with zero cycles open for tailoring? (Cycle list shows an empty state explaining none are currently available.)
- What happens when two manual shift spans are entered with identical start/end times? (Treated as an overlap and rejected.)
- What happens when a filter (name or time-of-day) matches zero slots? (List shows a "no matches" empty state, day-strip markers remain unaffected since they reflect underlying data, not the current filter.)
- *(Added in Iteration 2)* What happens when a leader tries to save headcounts for a slot where Serving is Yes but any headcount is still unset? (The headcount save is disabled for that slot; the slot explains what's missing. Never silently saveable in an invalid state. The slot's independent split save is unaffected by this.)
- *(Added in Iteration 2)* What happens when a leader tries to leave the workspace entirely while any slot (not just the page-level "touched" tracker from Story 4) has an unsaved split and/or unsaved headcount edit? (Blocked by the same unsaved-changes confirmation as Story 4, per FR-026 — the guard's trigger condition is extended, not duplicated.)
- *(Added in Iteration 2)* What happens when a cycle spans several months, producing many day-strip cells? (The strip must remain scrollable and usable — this is the explicit reason the day strip replaces the fixed month-grid calendar; a long cycle is the primary case it exists to handle, not an edge case to merely tolerate.)
- *(Added during clarification)* What happens when a "Save headcounts" action for a slot with multiple shifts/roles has some persist calls succeed and others fail (e.g. a mid-batch network drop)? (Per FR-022b: succeeded values stay saved, only the failed ones remain flagged unsaved/errored and retryable — never an all-or-nothing rollback of values that already committed.)
- *(Added in Iteration 3)* What happens when a cycle has multiple events and the ministry has touched some but not all of them? (Status is "In progress" — the all-participations rule applies to both the "Not started" and "Published" boundaries, not to a majority or any-one-participation rule; see research.md R16.)
- *(Added in Iteration 3; corrected post-`/speckit-analyze`, finding I1)* What happens when a ministry has zero events in a cycle at all? (The cycle still appears in the underlying data — the batch endpoint returns every locked cycle church-wide, not only ministry-inclusive ones — with `isPartOf: false`, `eventCount`/`slotCount` of `0`, status "Not started," and the Builder Events button disabled. It's excluded from the *default* view only when the Ministry Involvement filter is set to "Part of"; the "Not part of" and "All" filter values show it.)
- *(Added in Iteration 3)* What happens to the Builder Events button when a cycle has multiple events and only some have had availability fired? (Disabled — FR-035 requires *every* participation in the cycle to have moved past `tailoring` before the button enables, not just one.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST show every leader/sub-leader a list of ministries they are responsible for, scoped to this tailoring flow, as the first screen in the flow.
- **FR-002**: Each ministry entry MUST display, for the currently relevant cycle context, the count of events the ministry participates in and the count of slots included — shift count MUST NOT be shown at this level.
- **FR-003**: Ministry entries with no participation yet MUST display zero counts rather than being hidden or omitted.
- **FR-004**: The ministry list MUST render as a table on desktop viewports and as a card list on mobile viewports, consistent with the existing responsive list pattern used elsewhere in the scheduling area.
- **FR-005**: Selecting a ministry MUST present the list of cycles that ministry currently has available to tailor.
- **FR-006**: Selecting a cycle MUST navigate to a tailoring workspace scoped to exactly that ministry+cycle pair.
- **FR-007**: *(Amended, Iteration 2)* The tailoring workspace MUST display a horizontally-scrollable day strip, bounded to the selected cycle's start and end dates, with one cell per day showing that day's day-of-week abbreviation and day number.
- **FR-008**: The day strip MUST visually mark any day that has at least one event.
- **FR-009**: Clicking a marked day MUST filter the slot list below to only that day's events/slots; the filter MUST be reversible (re-click or explicit clear).
- **FR-010**: *(Amended, Iteration 2)* The workspace MUST provide at least two additional filters over the slot list: by event name and by a start-time-of-day window; both MUST operate on already-loaded data without requiring a new server request, and both MUST render as a horizontal row positioned directly beneath the day strip.
- **FR-011**: *(Amended, Iteration 2)* For each event/slot, the leader MUST be able to mark whether their ministry is Serving or Not serving it, via an explicit two-state toggle, independent of other slots on the same event. This toggle persists immediately on change, independent of any other pending edits on that row.
- **FR-012**: Only Serving slots MUST expose shift/headcount editing controls; Not-serving slots MUST NOT.
- **FR-013**: *(Amended, Iteration 2)* Every slot MUST default to a single, unsplit shift spanning the slot's full duration the moment it is marked Serving.
- **FR-014**: The leader MUST be able to convert a single shift into multiple shifts either by equal division (choosing a shift count) or by manual time spans (explicit start/end per shift).
- **FR-015**: Manual shift spans MUST be validated so that each span's start precedes its end, each span stays within its parent slot's bounds, and no two spans in the same slot overlap.
- **FR-016**: Each shift (whether the default single shift or a segment of a split) MUST accept a required headcount value representing how many volunteers are needed.
- **FR-017**: The leader MUST be able to revisit and edit the tailoring workspace for a ministry+cycle at any time, including after the cycle's schedule has been released.
- **FR-018**: All slot serving-status, shift split, and headcount changes made during a single visit MUST be saved and submitted for availability-checking as one batched action, triggering exactly one notification event to affected volunteers regardless of how many individual slots/shifts changed.
- **FR-019**: The system MUST retain, at the data level, a way to distinguish a volunteer's availability record as "unavailable — self-reported" versus "unavailable — claimed by another ministry's schedule lock", even though the screen that consumes this distinction is out of scope for this feature.
- **FR-020**: *(New, Iteration 2)* The day strip MUST support horizontal navigation by mouse click-and-drag, touch swipe, and a chevron control fixed at each end, in addition to direct day-cell clicks.
- **FR-020a**: *(New, added during clarification)* The day strip MUST support keyboard navigation via arrow-key roving focus (Left/Right moves focus one day at a time within the strip, scrolling it into view as needed) with Enter/Space selecting the focused day as the active day-filter — matching the keyboard behavior of the month-grid calendar it replaces, so no keyboard-only capability is lost in the swap.
- **FR-021**: *(New, Iteration 2; corrected during clarification)* Within a Serving slot, split-mode/shift-count changes MUST NOT autosave; they MUST accumulate as a local, uncommitted edit until the slot's own explicit "Save split" action is used. This action is independent of headcount saving.
- **FR-021a**: *(New, corrected during clarification)* Within a Serving slot, headcount entries for every role across every shift MUST NOT autosave individually and MUST NOT be tied to the split save; they MUST accumulate as local, uncommitted edits until the slot's own explicit "Save headcounts" action is used.
- **FR-022**: *(New, Iteration 2; corrected during clarification)* Each slot MUST expose exactly one "Save headcounts" action that commits every role's headcount across every shift in that slot together, replacing any per-shift save action. This is independent from and MUST NOT be combined with the slot's "Save split" action (FR-021).
- **FR-022a**: *(New, corrected during clarification)* Each slot's "Save split" action MUST be disabled whenever the split form matches its last-saved state, and enabled only while it has changed — it MUST NOT fire automatically on every field change (e.g. every increment of a shift-count input).
- **FR-022b**: *(New, added during clarification)* When a slot's "Save headcounts" action commits multiple roles'/shifts' headcount values at once, each underlying persist call MUST succeed or fail independently — a failure on one MUST NOT roll back or discard others that already succeeded, and only the failed role/shift value(s) MUST remain flagged unsaved/errored and independently retryable.
- **FR-023**: *(Amended during clarification)* A slot with pending, uncommitted split and/or headcount edits MUST visibly flag each pending action as having unsaved changes. This flag MUST persist across collapsing/expanding the row or changing the day/filter view, and each flag MUST clear independently, only when its own corresponding save (split or headcount) succeeds.
- **FR-024**: A slot where Serving is Yes and headcount is unset for any required role MUST be blocked from saving headcounts, and MUST present the leader with a clear explanation of what is required before it can be saved. This MUST NOT block the independent split save.
- **FR-025**: If a leader marks a Serving slot Not-serving after entering split and/or headcount edits, then marks it Serving again within the same workspace visit, the previously-entered unsaved split and headcount edits MUST still be present — they MUST NOT be reset to the slot's default state.
- **FR-026**: *(Amended during clarification)* The workspace's existing unsaved-changes navigation guard (FR-018's session tracker, research.md R8) MUST also trigger when any slot has a pending uncommitted split edit (FR-021) and/or a pending uncommitted headcount edit (FR-021a), not only when a save has already succeeded for at least one participation.
- **FR-027**: *(New, added during clarification)* The split-form fields and headcount fields this iteration rewrites MUST use `@tanstack/react-form` with `zod` schema validation (both already project dependencies, already used in `sign-in-form.tsx`/`sign-up-form.tsx`) rather than continued hand-rolled/manual validation. The existing manual-span bounds/overlap rules (`validateManualSpans`) and headcount bounds rules (`parseValidHeadcounts`) MUST be preserved as the validation logic inside the new schema, not rewritten from first principles.
- **FR-028**: *(New, Iteration 3)* Each cycle in User Story 2's cycle list MUST display that cycle's own name (`PlanningCycle.name`), not any event's title, alongside its date span (start–end).
- **FR-029**: *(New, Iteration 3)* Each cycle in the list MUST display its event count (events the ministry participates in within that cycle) and its slot count, where slot count MUST mean slots the ministry has actually included itself in (`ParticipationSlotInclusion` rows), not the total slot count on the underlying events. Both MUST be `0` for a cycle the ministry is not part of (FR-033's "Not part of" case), not omitted or `null`.
- **FR-030**: *(New, Iteration 3)* Each cycle in the list MUST display a tailoring-progress status computed by aggregating every `MinistryParticipation` the ministry has across every event in that cycle, using the following rule: "Not started" when every participation's `touchedAt` is null; "Published" when every participation's `state` is `published`; "In progress" for every other combination. This status MUST NOT be `PlanningCycle.state`. A cycle the ministry is not part of MUST show "Not started" (the zero-participation case is a defined input to this rule, not an unhandled one).
- **FR-031**: *(New, Iteration 3)* The system MUST record, per `MinistryParticipation`, the first time it is modified by any inclusion/split/headcount write, via a persisted `touchedAt` timestamp, set once and not overwritten by subsequent edits.
- **FR-032**: *(New, Iteration 3; corrected post-`/speckit-analyze`, finding I2)* The data backing FR-028–FR-030 for an entire visible cycle list — including cycle name/date span (FR-028), not only the participation-derived fields — MUST be retrieved via one batched request per page load; the system MUST NOT issue one participation-data request per visible cycle row, and MUST NOT split this data across the batched request plus separate per-list requests for name/date-span data.
- **FR-033**: *(New, Iteration 3; corrected post-`/speckit-analyze`, finding I1)* The cycle list MUST provide three filters — a date range (start–end) over cycle dates, a three-way "Ministry Involvement" filter (All / Part of / Not part of, based on whether the ministry has ≥1 event in that cycle), and a status filter using FR-030's three values — combinable with AND semantics. The "Not part of" value MUST be backed by real data: the data source for this screen MUST include locked cycles the ministry has zero events in, not only cycles it already participates in.
- **FR-034**: *(New, Iteration 3)* The cycle-list page header MUST display Events-total and Slots-total counts alongside the existing Cycles-total count, each reflecting the currently-filtered set of cycles.
- **FR-035**: *(New, Iteration 3)* Each cycle row MUST provide two navigation actions: a "Tailoring" action (always enabled) to that cycle's tailoring workspace, and a "Builder Events" action (ministry-scoped, not cycle-scoped) to Builder Events, disabled until availability has been fired for every `MinistryParticipation` the ministry has in that cycle — a distinct, earlier condition than FR-030's "Published" status. For a cycle the ministry is not part of (FR-033), this condition MUST evaluate to disabled (false), never vacuously enabled from having zero participations to check.
- **FR-036**: *(New, Iteration 3)* The cycle list's container and the page header MUST use the same design-token-driven padding; they MUST NOT use two different padding mechanisms (one token-driven and responsive, one fixed) for what the design system treats as equivalent panel surfaces.

### Key Entities *(include if feature involves data)*

- **Ministry**: A group a leader/sub-leader is responsible for; the unit the ministry-list screen enumerates.
- **Cycle**: A bounded scheduling period (start date, end date) that a ministry can tailor participation for.
- **Event**: Something happening within a cycle on a specific day, containing one or more slots.
- **Slot**: A specific time window within an event that a ministry may choose to participate in.
- **Shift**: A sub-division of a slot's time (single by default, or split equally/manually) that carries its own headcount requirement.
- **Ministry Participation**: The record of a ministry's opt-in status for a given event/cycle, including which slots are included and its current tailoring state. *(Extended, Iteration 3)* Also carries `touchedAt` — a nullable timestamp set once on first edit, backing FR-030/FR-031's cycle-level tailoring-progress status.
- **Availability Check**: The batched notification/record sent to volunteers after a save, and the record of each volunteer's response — including the self-reported-vs-claimed-elsewhere distinction described in FR-019.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A leader responsible for multiple ministries can identify which ministries still need tailoring attention within 5 seconds of landing on the ministry list, without opening any of them.
- **SC-002**: A leader can narrow a cycle's full event/slot list down to a single day's slots in one click, with the filtered view updating immediately (no perceptible loading delay for already-loaded data).
- **SC-003**: A leader can fully tailor a slot — mark it Serving, split it, and set headcounts — in a single continuous flow without leaving the tailoring workspace.
- **SC-004**: Regardless of how many individual slots or shifts a leader edits in one visit, volunteers receive exactly one availability-check notification per save action, never one per edit.
- **SC-005**: 100% of manual shift-span entries that violate ordering, bounds, or overlap rules are rejected before save, with no invalid shift ever reaching a saved state.
- **SC-006**: The ministry list and tailoring workspace are each fully usable (all actions available, no layout breakage) on both a standard desktop viewport and a standard mobile viewport.
- **SC-007**: *(Amended during clarification)* A leader can save every role's headcount across an entire slot's shifts with exactly one save action, regardless of how many shifts the slot is split into — down from one save action per shift today. Split configuration saves independently via its own action and is not counted against this criterion.
- **SC-008**: *(New, Iteration 2)* 100% of headcount-save attempts while Serving=Yes and any required headcount is unset are rejected before reaching the server, with a visible explanation, matching SC-005's "no invalid state reaches saved" bar.
- **SC-009**: *(New, Iteration 2)* A cycle spanning multiple months (tested at ≥90 day cells) remains fully navigable via the day strip within the workspace's normal viewport, without requiring the leader to scroll the whole page to reach a specific day.
- **SC-010**: *(New, Iteration 3)* A leader can identify a cycle's tailoring-progress status (not started / in progress / published) at a glance from the cycle list, without opening it, for every cycle in the list simultaneously.
- **SC-011**: *(New, Iteration 3)* Loading the cycle list for a ministry with N locked cycles issues one request for participation-derived data (status/slot counts), not N requests, regardless of how large N grows.
- **SC-012**: *(New, Iteration 3)* A leader can narrow a cycle list of arbitrary size down to the cycles relevant to them using date range, involvement, and status filters in combination, with the filtered result and header pill counts updating together.
- **SC-013**: *(New, Iteration 3)* From the cycle list, a leader can reach either the tailoring workspace or Builder Events for a given cycle in one click, without an intermediate page.

## Assumptions

- "The relevant cycle" for ministry-list event/slot counts means the union of every cycle currently open for tailoring (state `locked`, per `PlanningCycle`), not a single "most recent" cycle — resolved during planning as research.md R10.
- The existing slot-inclusion, shift-split, and headcount data and persistence *payload shapes* are reused as-is; this feature (and Iteration 2) changes their presentation, timing, and client-side orchestration — when and how often each mutation fires — not the shape of what's sent or the underlying entities.
- The volunteer-facing availability response experience and the leader-facing assignment/locking screen are separate, already-planned or future pieces of work and are not designed here beyond the data-distinction noted in FR-019.
- "Leader or sub-leader" access to a ministry's tailoring flow is governed by existing role/permission logic already in place elsewhere in the app; this feature does not change who is authorized, only what authorized users see.
- Additional filter types beyond name and time-of-day (mentioned as open ideas) are not required for this feature to be considered complete; FR-010's two filters are the committed minimum.
- *(New, Iteration 2)* Pending split and headcount edits (FR-021, FR-021a) are session-scoped only; no local-storage or draft-persistence mechanism is added. This is a deliberate scope boundary matching research.md R8's original "no local-draft persistence" decision, not a gap — see the Clarifications entry above and iteration-2-filters-and-row-save.md Decision 2 (Decision 2's *intent* — memory retained across a Serving toggle within the session — still holds; its description of a single combined row save does not, per this session's clarification).
- *(New, Iteration 2, resolved via `/impeccable shape` 2026-07-12)* The horizontal drag-scroll interaction for the day strip (FR-020) had no existing implementation pattern in this codebase; resolved as hand-rolled pointer events with free momentum scroll (no snap-to-day), with the day strip and filter row sticky at the workspace top — see research.md R11.
- *(New, added during clarification)* FR-027's `@tanstack/react-form` adoption is scoped to the split/headcount fields this iteration already rewrites — it is not a directive to retrofit form-library validation onto other, untouched parts of this feature (the ministry list, cycle list, or day strip have no form fields to begin with) or onto unrelated features elsewhere in the app.
- *(New, Iteration 3)* FR-030's aggregation rule — "all participations must reach X" for both the "Not started" and "Published" boundaries — is a documented default (research.md R16), not a re-litigated open question. It was not put to the user as a clarification question during this iteration's drafting; revisit only if it produces a visibly wrong status against real seeded data during implementation.
- *(New, Iteration 3)* FR-035's Builder Events button targets the existing ministry-scoped route (`/scheduling/builder-events?ministryId=...`) unchanged — making Builder Events itself cycle-aware is explicitly out of scope for this iteration and would require its own future spec.
- *(New, Iteration 3)* Iterations 1 and 2 of this feature remain frontend-only, as shipped. Iteration 3 is the first and only part of this feature that touches `apps/server`/`packages/db` — this does not retroactively change the "no backend changes" framing recorded for Iterations 1–2 in `plan.md`'s Technical Context or `tasks.md`'s Path Conventions history.
- *(New, Iteration 3, resolved via `/speckit-analyze` finding I1, 2026-07-13 — supersedes the earlier open question of the same name)* The cycle-list data source (FR-032's batched endpoint) returns every locked cycle church-wide, not only ministry-inclusive ones, specifically so FR-033's "Not part of" filter value has real data to show. This was caught as a genuine gap during `/speckit-analyze`, not deferred — resolved in the same pass, not left as a follow-up.
- *(New, Iteration 3, resolved via `/speckit-analyze` finding I2, 2026-07-13)* FR-032's "one batched request" guarantee covers all of FR-028–FR-030's data, including cycle name/date span — the earlier draft's allowance for FR-028 to optionally stay on separate, pre-existing calls is removed; the new endpoint is this route's sole data source.
