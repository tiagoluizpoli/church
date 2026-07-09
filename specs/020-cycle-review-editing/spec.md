# Feature Specification: Cycle Review Header Consolidation, Timezone Formatting & Draft Editing

**Feature Branch**: `020-cycle-review-editing`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "Follow-on to specs/019-planning-cycles-table-view: (1) merge the selected-cycle review's redundant name/window/status block into the page header, adding event-count and slot-count chips there instead; (2) make every date/time shown in the Calendar review table respect the church-time/local-time toggle, with day rows showing only a date and slot rows showing only a time span (no raw ISO/Z); (3) let admins delete/edit whole day-events and individual time slots while a cycle is still in draft; (4) stop treating manually-added events as a highlighted 'exception' — move the add-manual-event action next to Apply template as an equally-prominent action."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See cycle status at a glance without repeated chips (Priority: P1)

A ChurchAdmin reviewing a selected planning cycle sees its name, status, date window, event count, and slot count once, in the page header, instead of that same information being repeated a second time inside the Calendar review card body.

**Why this priority**: Directly reduces visual clutter and redundant reading on the single most-visited screen in Planning Cycles; simplest of the four changes and has no dependency on the others.

**Independent Test**: Open a selected cycle's review page and confirm the name, status, window, event count, and slot count each appear exactly once (in the header), and the review card body below no longer shows a separate name/window/count summary block.

**Acceptance Scenarios**:

1. **Given** a ChurchAdmin selects a planning cycle, **When** the review page loads, **Then** the page header shows the cycle's status chip, date-window chip, an event-count chip, and a slot-count chip.
2. **Given** the page header already shows status and window, **When** the Calendar review card body renders, **Then** it no longer shows a duplicate name, window, or event/slot count block.

---

### User Story 2 - Read every planning-cycle date and time in the church's own clock (Priority: P1)

A ChurchAdmin (or anyone with access to Planning Cycles) reviewing a cycle's generated calendar sees each day's date, and each time slot's start–end time, rendered in whichever timezone they've currently selected (church time or their own local time) via the app's existing timezone toggle — never as a raw database timestamp with a trailing "Z" or an unnecessary repeated date-and-time window on every row.

**Why this priority**: Directly addresses a correctness/trust problem (raw UTC timestamps with "Z" suffixes look like bugs to end users) and is a precondition for User Story 3's editing UI, which needs to display the same values in edit form fields.

**Independent Test**: Open a selected cycle's Calendar review table, toggle between church time and local time, and confirm every day row's date and every expanded slot row's time span visibly change to match the selected mode, with no raw ISO/"Z" text anywhere and no duplicated date-and-time window per row.

**Acceptance Scenarios**:

1. **Given** the Calendar review table is showing a cycle's days, **When** a day row renders (collapsed or expanded), **Then** it shows only that day's date (no time-of-day, no "→" window, no "Z" suffix).
2. **Given** a day row is expanded, **When** its slot rows render, **Then** each slot shows only its own start–end time span (no date, no "Z" suffix).
3. **Given** a ChurchAdmin toggles from church time to local time (or back) using the existing avatar-menu control, **When** the Calendar review table re-renders, **Then** every displayed date and time updates to reflect the newly selected timezone.
4. **Given** the page header's date-window chip, **When** the timezone toggle changes, **Then** that chip's displayed dates also update to match.

---

### User Story 3 - Fix a mistake in a draft cycle without starting over (Priority: P2)

A ChurchAdmin working on a still-draft (unlocked) planning cycle can remove or change a whole day's event, or remove or change a single time slot within a day, directly from the Calendar review table — without needing to delete and regenerate the entire cycle.

**Why this priority**: High value once User Stories 1-2 establish a legible table, but depends on nothing else being broken; it is the first editing capability this screen has ever had, so it's scoped to draft cycles only (locked cycles must stay fully read-only, matching existing guarantees).

**Independent Test**: On a draft cycle, delete one day's event from the table and confirm it disappears from the list and its slot/event counts update; edit another day's details and confirm the change is reflected; expand a day, delete one of its slots, and confirm just that slot disappears while its sibling slots and the parent day remain; edit a slot's time span and confirm it updates. Repeat on a locked cycle and confirm none of these controls are present.

**Acceptance Scenarios**:

1. **Given** a draft cycle's Calendar review table, **When** a ChurchAdmin chooses to delete a day's event, **Then** that event and its slots are removed from the table and the header's event/slot counts decrease accordingly.
2. **Given** a draft cycle's Calendar review table, **When** a ChurchAdmin chooses to edit a day's event, **Then** they can change its editable details and the table reflects the change once saved.
3. **Given** an expanded day row in a draft cycle, **When** a ChurchAdmin deletes one of its slots, **Then** only that slot disappears; sibling slots and the parent day row remain unchanged except for an updated slot count.
4. **Given** an expanded day row in a draft cycle, **When** a ChurchAdmin edits a slot's start/end time, **Then** the change is reflected in that slot's row once saved.
5. **Given** a locked cycle's Calendar review table, **When** it renders, **Then** no delete or edit affordance appears anywhere in the table, consistent with today's locked read-only behavior.
6. **Given** a draft cycle's day/event with one or more slots, **When** a ChurchAdmin edits that day's date, **Then** every one of its slots shifts by the same amount of time as the day, so each slot's time-of-day and duration relative to the day are unchanged and no slot is left pointing at the old date.

---

### User Story 4 - Add a one-off event as a first-class action, not an exception (Priority: P3)

A ChurchAdmin populating a draft cycle sees "Apply template" and "Add manual event" presented as two equally-valid, equally-visible ways to build out the cycle's calendar — not as a primary path plus a visually-buried "exception" tucked inside the review card.

**Why this priority**: Purely a visual/IA correction with no functional dependency on the other three stories, but naturally sequenced last since it's the smallest, most isolated change.

**Independent Test**: Open a draft cycle's review page and confirm "Add manual event" appears in the same action row as "Apply template," with no separate highlighted "exceptions" panel remaining in the Calendar review card body.

**Acceptance Scenarios**:

1. **Given** a draft cycle's review page, **When** the page renders, **Then** "Add manual event" and "Apply template" both appear in the page's top action row, styled as peers (neither visually subordinate to the other).
2. **Given** the Calendar review card body, **When** it renders, **Then** it no longer contains a separate highlighted "manual exceptions" panel.
3. **Given** a ChurchAdmin selects "Add manual event" from its new location, **When** they complete the existing add-event flow, **Then** the new event appears in the Calendar review table exactly as it does today.

---

### Edge Cases

- What happens to a day's slots when the day's own date is edited? Every slot belonging to that day shifts by the same time delta as the day's date change, preserving each slot's time-of-day and duration — slots never end up pointing at a date other than their parent day's current date.
- What happens when a ChurchAdmin deletes the last remaining day/event in a draft cycle? The Calendar review table shows its existing empty state (unchanged from today), and the header's event/slot chips both show zero.
- What happens when a ChurchAdmin tries to delete a day's last remaining slot? The slot-level delete control is disabled (or hidden) for a day's only remaining slot — removing that day's sole content requires deleting the whole day/event instead, so a Calendar review table never shows a day row with zero slots. That slot's edit control remains available regardless (editing its time span does not remove it).
- What happens if a ChurchAdmin attempts to edit or delete a day/slot in a cycle that transitions from draft to locked while their edit form is open? The save/delete action fails with an error message and no change is applied, consistent with the existing lock-transition guard already enforced for event updates today.
- What happens to the timezone-formatted display when the church's configured timezone is invalid or unavailable? Out of scope for this feature — the existing timezone toggle's own error handling (if any) is unchanged; this feature only consumes its output.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The selected-cycle page header MUST display the cycle's name/status, date window, event count, and slot count.
- **FR-002**: The Calendar review card body MUST NOT display a second, duplicate block showing the cycle's name, date window, or event/slot counts once FR-001 is satisfied.
- **FR-003**: Every date shown for a day/event row in the Calendar review table MUST display only that day's date (no time-of-day, no start→end window, no raw timestamp suffix).
- **FR-004**: Every time shown for a slot row in the Calendar review table MUST display only that slot's own start–end time span (no date, no raw timestamp suffix).
- **FR-005**: All dates and times in the Calendar review table and the page header's date-window chip MUST reflect the currently selected timezone mode (church time or local time) from the application's existing timezone toggle, and MUST update immediately when that toggle changes.
- **FR-006**: For a draft (unlocked) cycle, a ChurchAdmin MUST be able to delete a day's event from the Calendar review table, removing it and its slots and updating the header's event/slot counts.
- **FR-007**: For a draft (unlocked) cycle, a ChurchAdmin MUST be able to edit a day's event details from the Calendar review table, including its date.
- **FR-007a**: When a day/event's date is changed (FR-007), every one of its slots MUST shift by the same time delta as the day, preserving each slot's time-of-day and duration relative to the day, so no slot is left pointing at the day's previous date.
- **FR-008**: For a draft (unlocked) cycle, a ChurchAdmin MUST be able to delete an individual time slot from within an expanded day row, without affecting sibling slots or the parent day/event, EXCEPT that a day's last remaining slot MUST NOT be independently deletable (its delete control is disabled or hidden) — removing a day's sole remaining content requires deleting the whole day/event (FR-006) instead.
- **FR-009**: For a draft (unlocked) cycle, a ChurchAdmin MUST be able to edit an individual time slot's start/end time (and label, if present) from within an expanded day row.
- **FR-009a**: For a draft (unlocked) cycle, a ChurchAdmin MUST be able to add a new time slot to an existing day/event from the Calendar review table, using the same start/end time/label field set as FR-009's edit form.
- **FR-010**: A locked cycle's Calendar review table MUST remain fully read-only — none of the delete/edit affordances introduced by FR-006–FR-009 may appear when the cycle is locked, consistent with existing locked-cycle behavior.
- **FR-011**: "Add manual event" MUST be presented in the same action row as "Apply template," styled as an equally-prominent (or more prominent) primary action, not as a visually subordinate "exception."
- **FR-012**: The Calendar review card body MUST NOT contain a separate highlighted "manual exceptions" panel once FR-011 is satisfied; adding a manual event remains reachable via the relocated action.
- **FR-013**: Attempting to edit or delete a day/event or slot in a cycle that is locked (including a lock that occurs between page load and the action) MUST fail with an error and apply no change, consistent with existing lock-transition guards.

### Key Entities

This feature introduces no new domain entities. It changes the presentation of, and adds delete/update mutation surfaces for, entities already shipped in prior features: `PlanningCycle` (name, window, status — specs 017/018), `Event`/day-row (title, date, status — specs 017/019), and `TimeSlot`/slot-row (start time, end time, label — specs 017/019, and the pre-existing `TimeSlot` entity shared with the Builder events feature from spec 013).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A ChurchAdmin can find a selected cycle's name, status, window, event count, and slot count by looking at exactly one on-screen location (the header), 100% of the time.
- **SC-002**: 0 raw ISO timestamps or "Z"-suffixed strings appear anywhere in the Calendar review table or its header chip, in either timezone mode.
- **SC-003**: A ChurchAdmin can remove a mistaken day/event or slot from a draft cycle in under 10 seconds from the table, without leaving the review page.
- **SC-004**: 100% of the new delete/edit affordances are absent when viewing a locked cycle, verified by exercising the same table view against both a draft and a locked cycle.
- **SC-005**: 0 regressions in the existing "Apply template" and "Add manual event" flows — both still complete successfully after relocating the latter.
- **SC-006**: 0 slots are left pointing at a day's previous date after that day's date is edited, verified across draft cycles with any number of slots (FR-007a).

## Assumptions

- This feature builds directly on specs/017 (scheduling reshape), /018 (churchwide UX redesign), and /019 (planning cycles table view) — the underlying table structure, routes, and data-fetching hooks from those features are reused unchanged; only the header/body content split, date/time formatting, editing affordances, and the manual-entry action's location change.
- The application's existing church-time/local-time toggle (reachable from the user avatar menu) is the single source of truth for which timezone to render dates/times in; this feature does not add a second timezone control.
- "Editing" a day/event or slot reuses whatever field set the existing manual-event-creation flow already collects (title/description/location/dates for events; start time/end time/label for slots) — this feature does not introduce new editable fields beyond what can already be set at creation time. Editing a day's date additionally cascades to its slots per FR-007a — this cascade is new behavior introduced by this feature (today's `updatePlanningEvent` route has no UI caller and no cascade logic; both are added together here).
- Deleting a day/event is a soft delete (marks it cancelled), consistent with the existing `cancelPlanningEvent` behavior already shipped for this screen; it is not a hard database delete.
- Locale-aware date ordering for future internationalization (e.g., day-month-year for Portuguese/Brazilian locale) is explicitly out of scope for this feature and is backlogged for a future i18n effort.
- A future event category/tag system with leader-assignable colors (to distinguish normal services, special events, retreats, etc. at a glance) is explicitly out of scope for this feature and is backlogged for a future feature.
- Church-admin-level access control for these screens is unchanged from specs 017-019 — no new roles or permission levels are introduced.
- FR-001's header stats are also surfaced, in the same header pattern, on the two screens adjacent to the selected-cycle review: the plain cycles-list view shows Cycles/Draft/Locked count chips, and the template-library view shows a Templates count chip. This extends FR-001's "consolidate counts into the header" intent to sibling screens for consistency, rather than scoping it to the selected-cycle review alone.
