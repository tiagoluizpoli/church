# Feature Specification: Tailoring Workspace Reorganization

**Feature Branch**: `022-tailoring-workspace`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "Reorganize ministry participation 'tailoring' flow into a leader/sub-leader-facing multi-page workflow: ministry list → cycle list → tailoring detail page (calendar + filters + slot/shift/headcount editing), with a single batched availability-check fire per save, and a data-model note distinguishing volunteers claimed by another ministry from self-reported unavailability."

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

After picking a ministry, the leader sees the cycles that ministry can currently tailor, and picks one to enter the actual tailoring workspace for that ministry+cycle pair.

**Why this priority**: This is the required intermediate step between "which ministry" and "which cycle's events" — without it, multi-cycle ministries have no way to disambiguate which cycle they're editing.

**Independent Test**: Click a ministry with 2+ open cycles; verify a cycle list appears scoped to that ministry, and clicking a cycle opens the tailoring workspace for exactly that ministry+cycle combination.

**Acceptance Scenarios**:

1. **Given** a ministry with two cycles open for tailoring, **When** the leader clicks that ministry, **Then** they see both cycles listed and can navigate into either independently.

---

### User Story 3 - Tailor participation for a cycle: pick slots, split shifts, set headcounts (Priority: P1)

Inside the tailoring workspace for a ministry+cycle, the leader sees a calendar bounded to the cycle's date range with markers on days that have events, uses the calendar (and other filters) to narrow the event/slot list, checks which slots the ministry will serve, and for each included slot either leaves it as one shift or splits it (equally or by manual time spans), setting the headcount needed per shift.

**Why this priority**: This is the core value of the whole feature — it is the actual tailoring work. Stories 1-2 only exist to get the leader here correctly scoped.

**Independent Test**: Open a cycle with a known event on a known day; click that day on the calendar and confirm the slot list filters to only that day's slots; check a slot, split it into 2 equal shifts, set headcount 5 on each, and confirm both shifts persist with headcount 5.

**Acceptance Scenarios**:

1. **Given** a cycle spanning a full month, **When** the leader opens the tailoring workspace, **Then** the calendar shows exactly the cycle's first day through its last day, with a marker on every day containing at least one event.
2. **Given** the calendar has a marked day, **When** the leader clicks it, **Then** the slot list below updates to show only that day's events/slots, and clicking the same day again (or an explicit clear action) restores the full list.
3. **Given** an event with three time slots, **When** the leader checks only two of them, **Then** only those two show shift/headcount controls; the unchecked slot shows none.
4. **Given** a checked slot with default single-shift state, **When** the leader switches to split mode and chooses "equal, 3 shifts", **Then** three shifts appear with equal time bounds inside the slot, each independently accepting a headcount value.
5. **Given** the same slot, **When** the leader instead chooses manual split and enters explicit start/end times for two shifts, **Then** the system rejects any span that starts after it ends, extends outside the parent slot's bounds, or overlaps another manual span in the same slot.
6. **Given** the leader wants to find events by name or by a start-time window (e.g., "starts between 8am and 12pm"), **When** they use the corresponding filter control, **Then** the visible slot list narrows accordingly without a page reload.

---

### User Story 4 - Fire availability checks once per save, not per edit (Priority: P2)

After making any number of slot/shift/headcount changes in a tailoring session, the leader explicitly saves/publishes once, and volunteers receive exactly one batched availability-check notification reflecting all the changes — not one notification per slot or shift touched.

**Why this priority**: Directly prevents notification spam for volunteers, a named failure mode the leader wants avoided. It's P2 because it depends on Story 3 existing first, but is still required before this feature can be considered done.

**Independent Test**: Modify 3 different slots/shifts (inclusion, split, headcount) in one sitting, then save once; confirm exactly one availability-check batch is triggered, not three.

**Acceptance Scenarios**:

1. **Given** a leader who checked a new slot, split an existing slot, and changed a headcount all in the same visit, **When** they click the single save/publish action, **Then** exactly one availability-check event fires covering all three changes.
2. **Given** the schedule for a cycle has already been released, **When** the leader returns to the tailoring workspace and makes further changes, **Then** the workspace still allows edits and still fires availability checks in the same single-batch manner.

---

### Edge Cases

- What happens when a leader unchecks a slot that already has shifts/headcounts configured? (Configuration for that slot should be hidden/discarded from the active edit, not silently kept invisible.)
- What happens when the leader splits a shift and then switches back to single-shift mode? (Prior split configuration for that slot is replaced by the single-shift default; the system should not silently merge stale shift data.)
- What happens when the cycle has zero events? (Calendar renders with no day markers; slot list shows an empty state, not an error.)
- What happens when a leader is responsible for a ministry with zero cycles open for tailoring? (Cycle list shows an empty state explaining none are currently available.)
- What happens when two manual shift spans are entered with identical start/end times? (Treated as an overlap and rejected.)
- What happens when a filter (name or time-of-day) matches zero slots? (List shows a "no matches" empty state, calendar markers remain unaffected since they reflect underlying data, not the current filter.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST show every leader/sub-leader a list of ministries they are responsible for, scoped to this tailoring flow, as the first screen in the flow.
- **FR-002**: Each ministry entry MUST display, for the currently relevant cycle context, the count of events the ministry participates in and the count of slots included — shift count MUST NOT be shown at this level.
- **FR-003**: Ministry entries with no participation yet MUST display zero counts rather than being hidden or omitted.
- **FR-004**: The ministry list MUST render as a table on desktop viewports and as a card list on mobile viewports, consistent with the existing responsive list pattern used elsewhere in the scheduling area.
- **FR-005**: Selecting a ministry MUST present the list of cycles that ministry currently has available to tailor.
- **FR-006**: Selecting a cycle MUST navigate to a tailoring workspace scoped to exactly that ministry+cycle pair.
- **FR-007**: The tailoring workspace MUST display a calendar bounded to the selected cycle's start and end dates.
- **FR-008**: The calendar MUST visually mark any day that has at least one event.
- **FR-009**: Clicking a marked day MUST filter the slot list below to only that day's events/slots; the filter MUST be reversible (re-click or explicit clear).
- **FR-010**: The workspace MUST provide at least two additional filters over the slot list: by event name and by a start-time-of-day window; both MUST operate on already-loaded data without requiring a new server request.
- **FR-011**: For each event/slot, the leader MUST be able to mark whether their ministry participates in it (inclusion toggle), independent of other slots on the same event.
- **FR-012**: Only included slots MUST expose shift/headcount editing controls; excluded slots MUST NOT.
- **FR-013**: Every included slot MUST default to a single, unsplit shift spanning the slot's full duration.
- **FR-014**: The leader MUST be able to convert a single shift into multiple shifts either by equal division (choosing a shift count) or by manual time spans (explicit start/end per shift).
- **FR-015**: Manual shift spans MUST be validated so that each span's start precedes its end, each span stays within its parent slot's bounds, and no two spans in the same slot overlap.
- **FR-016**: Each shift (whether the default single shift or a segment of a split) MUST accept a required headcount value representing how many volunteers are needed.
- **FR-017**: The leader MUST be able to revisit and edit the tailoring workspace for a ministry+cycle at any time, including after the cycle's schedule has been released.
- **FR-018**: All slot inclusion, shift split, and headcount changes made during a single visit MUST be saved and submitted for availability-checking as one batched action, triggering exactly one notification event to affected volunteers regardless of how many individual slots/shifts changed.
- **FR-019**: The system MUST retain, at the data level, a way to distinguish a volunteer's availability record as "unavailable — self-reported" versus "unavailable — claimed by another ministry's schedule lock", even though the screen that consumes this distinction is out of scope for this feature.

### Key Entities *(include if feature involves data)*

- **Ministry**: A group a leader/sub-leader is responsible for; the unit the ministry-list screen enumerates.
- **Cycle**: A bounded scheduling period (start date, end date) that a ministry can tailor participation for.
- **Event**: Something happening within a cycle on a specific day, containing one or more slots.
- **Slot**: A specific time window within an event that a ministry may choose to participate in.
- **Shift**: A sub-division of a slot's time (single by default, or split equally/manually) that carries its own headcount requirement.
- **Ministry Participation**: The record of a ministry's opt-in status for a given event/cycle, including which slots are included and its current tailoring state.
- **Availability Check**: The batched notification/record sent to volunteers after a save, and the record of each volunteer's response — including the self-reported-vs-claimed-elsewhere distinction described in FR-019.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A leader responsible for multiple ministries can identify which ministries still need tailoring attention within 5 seconds of landing on the ministry list, without opening any of them.
- **SC-002**: A leader can narrow a cycle's full event/slot list down to a single day's slots in one click, with the filtered view updating immediately (no perceptible loading delay for already-loaded data).
- **SC-003**: A leader can fully tailor a slot — include it, split it, and set headcounts — in a single continuous flow without leaving the tailoring workspace.
- **SC-004**: Regardless of how many individual slots or shifts a leader edits in one visit, volunteers receive exactly one availability-check notification per save action, never one per edit.
- **SC-005**: 100% of manual shift-span entries that violate ordering, bounds, or overlap rules are rejected before save, with no invalid shift ever reaching a saved state.
- **SC-006**: The ministry list and tailoring workspace are each fully usable (all actions available, no layout breakage) on both a standard desktop viewport and a standard mobile viewport.

## Assumptions

- "The relevant cycle" for ministry-list event/slot counts means the union of every cycle currently open for tailoring (state `locked`, per `PlanningCycle`), not a single "most recent" cycle — resolved during planning as research.md R10.
- The existing slot-inclusion, shift-split, and headcount data and persistence behavior are reused as-is; this feature changes their presentation and workflow, not their underlying save semantics.
- The volunteer-facing availability response experience and the leader-facing assignment/locking screen are separate, already-planned or future pieces of work and are not designed here beyond the data-distinction noted in FR-019.
- "Leader or sub-leader" access to a ministry's tailoring flow is governed by existing role/permission logic already in place elsewhere in the app; this feature does not change who is authorized, only what authorized users see.
- Additional filter types beyond name and time-of-day (mentioned as open ideas) are not required for this feature to be considered complete; FR-010's two filters are the committed minimum.
