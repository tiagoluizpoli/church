# Feature Specification: Mobile Parity & Table Bulk-Expand for Cycles

**Feature Branch**: `021-mobile-parity-and-terminology`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "Building on specs 019 (table view) and 020 (draft editing, timezone formatting, header consolidation) which shipped desktop-only. Close remaining gaps: (1) add an expand-all/collapse-all control to the Calendar review table; (2) mobile parity for slot/event add/edit/delete; (3) mobile parity for timezone-aware date/time formatting; (4) redesign the mobile nav drawer's nested-item hierarchy so children visually read as children, same behavior; (5) fix the light/dark/system theme toggle not working on mobile."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage a draft cycle's events and slots from a phone (Priority: P1)

A ChurchAdmin reviewing a still-draft cycle on a mobile phone can add, edit, and delete a day's event, and add, edit, and delete an individual time slot within a day — the same capabilities spec 020 shipped for desktop — using controls sized and laid out for a touch screen instead of the desktop's inline table-row actions and dialogs.

**Why this priority**: Without this, mobile is read-only for the single most-valuable admin action on this screen (fixing mistakes in a draft cycle); this is the largest functional gap and the reason the user can't do real work from their phone today.

**Independent Test**: On a mobile viewport, open a draft cycle's Calendar review, add a new day-event, edit it, delete it; expand a day, add a new slot, edit it, delete it (except the last remaining slot); confirm every change persists and matches what the same actions produce on desktop. Repeat on a locked cycle and confirm no edit/delete/add affordances appear.

**Acceptance Scenarios**:

1. **Given** a draft cycle's Calendar review on a mobile viewport, **When** a ChurchAdmin taps to add a day-event, **Then** a mobile-appropriate input surface (not the desktop dialog) opens and, on save, the new event appears in the list.
2. **Given** a draft cycle's Calendar review on a mobile viewport, **When** a ChurchAdmin taps to edit or delete a day-event, **Then** the same mobile-appropriate surface lets them do so, and the list reflects the change once saved.
3. **Given** an expanded day on a mobile viewport, **When** a ChurchAdmin adds, edits, or deletes one of its slots, **Then** the change is reflected without affecting sibling slots, and a day's last remaining slot cannot be independently deleted (same rule as desktop).
4. **Given** a locked cycle's Calendar review on a mobile viewport, **When** it renders, **Then** no add/edit/delete affordance appears anywhere, matching desktop's locked read-only behavior.

---

### User Story 2 - Read every cycle date and time correctly on a phone (Priority: P1)

A ChurchAdmin viewing a cycle's Calendar review on a mobile phone sees every day's date and every slot's time span rendered through the same church-time/local-time toggle desktop already uses — never a raw timestamp — and sees it update immediately when they change the toggle.

**Why this priority**: This is a correctness/trust problem identical to the one spec 020 already fixed for desktop (SC-002); shipping mobile CRUD (User Story 1) without this means the new mobile edit forms would display or accept incorrect times.

**Independent Test**: On a mobile viewport, open a cycle's Calendar review, toggle church time/local time, and confirm every visible date and time updates accordingly with no raw ISO/"Z" text anywhere, matching desktop's formatting rules (day rows date-only, slot rows time-only).

**Acceptance Scenarios**:

1. **Given** the Calendar review on a mobile viewport, **When** a day or slot row renders, **Then** it shows only the date (day rows) or only the time span (slot rows), with no raw timestamp suffix.
2. **Given** a ChurchAdmin toggles church time/local time on a mobile viewport, **When** the toggle changes, **Then** every displayed date and time on screen updates to match, same as desktop.

---

### User Story 3 - Trust the theme toggle on a phone (Priority: P2)

A user opening the account/theme menu on a mobile viewport can pick light, dark, or system theme and see the app's appearance actually change, the same as it does on desktop.

**Why this priority**: An isolated, high-visibility bug — every mobile session is affected — but fixing it doesn't depend on, or block, any other item in this feature.

**Independent Test**: On a mobile viewport, open the theme control and select each of light/dark/system in turn; confirm the app's rendered appearance changes to match the selection every time.

**Acceptance Scenarios**:

1. **Given** a mobile viewport, **When** a user selects "dark" from the theme control, **Then** the app immediately renders in dark mode.
2. **Given** a mobile viewport, **When** a user selects "light" or "system", **Then** the app immediately renders accordingly, matching desktop's existing behavior for the same choice.

---

### User Story 4 - See the mobile nav drawer's structure at a glance (Priority: P2)

A user opening the mobile navigation drawer sees which items are sub-items of which section clearly, at a glance, through visual hierarchy (indentation, grouping, or similar cues) — without the navigation itself changing: same items, same routes, same active-state highlighting as today.

**Why this priority**: A legibility/polish fix with no functional dependency on the other stories; sequenced after the functional gaps (User Stories 1-2) and the theme bug since it's the most purely cosmetic of the four remaining items.

**Independent Test**: Open the mobile nav drawer and confirm a child item (e.g. under "Scheduling") is visually distinguishable as belonging to its parent section without relying on reading the words alone; confirm every item still navigates to the same route it does today and highlights active the same way.

**Acceptance Scenarios**:

1. **Given** the mobile nav drawer is open, **When** it renders a section with child items, **Then** the children are visually offset/grouped so their relationship to the parent is clear without ambiguity.
2. **Given** the redesigned drawer, **When** a user taps any item, **Then** navigation and the active-item highlight behave exactly as they did before the redesign.

---

### User Story 5 - Expand or collapse every day row at once (Priority: P3)

A ChurchAdmin viewing the Calendar review table (desktop) can expand every day row's slots at once, or collapse them all at once, instead of tapping each row individually.

**Why this priority**: A convenience improvement to an already-functional table; smallest and most isolated of the five items, with no dependency on or from anything else in this feature.

**Independent Test**: Open a cycle's Calendar review table with multiple day rows, use the new control to expand all of them at once, confirm every row shows its slots; use it to collapse all of them at once, confirm every row is collapsed.

**Acceptance Scenarios**:

1. **Given** the Calendar review table with some or all rows collapsed, **When** a ChurchAdmin activates "Expand all," **Then** every day row shows its slots.
2. **Given** the Calendar review table with some or all rows expanded, **When** a ChurchAdmin activates "Collapse all," **Then** every day row hides its slots.

---

### Edge Cases

- What happens if a mobile user opens the add/edit surface for a day or slot, then the cycle locks (via another session) before they save? The save fails with an error and no change is applied — same lock-transition guard already enforced on desktop (spec 020 FR-013).
- What happens when a mobile user tries to delete a day's only remaining slot? The delete control is disabled/hidden, identical to desktop (spec 020 FR-008) — deleting the day itself is required instead.
- What happens if a user manually re-collapses a single row right after using "Expand all"? Only that row changes; "Expand all"/"Collapse all" are one-shot bulk actions, not a persistent synced toggle state.
- What happens to the mobile edit/add surface when the on-screen keyboard opens over a form field near the bottom of a short viewport? The surface must keep the focused field visible (scroll/resize), consistent with standard mobile form behavior.
- What happens if a user picks the theme option that's already active? No visible change occurs (idempotent), and no error appears.
- What happens to the nav drawer's redesigned hierarchy when a section has no children (e.g. a future flat top-level item)? It renders with no child indentation, unchanged from today's flat-item styling.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On a mobile viewport, a ChurchAdmin MUST be able to add, edit, and delete a draft cycle's day-event from the Calendar review, via a mobile-appropriate input surface (not the desktop dialog/inline-row-action pattern).
- **FR-002**: On a mobile viewport, a ChurchAdmin MUST be able to add, edit, and delete an individual time slot within an expanded day, via a mobile-appropriate input surface, subject to the same last-remaining-slot restriction as desktop (spec 020 FR-008).
- **FR-003**: A locked cycle's Calendar review on a mobile viewport MUST remain fully read-only — none of FR-001/FR-002's affordances may render, matching desktop's existing locked-cycle guarantee (spec 020 FR-010).
- **FR-004**: On a mobile viewport, every date shown for a day row and every time span shown for a slot row in the Calendar review MUST render through the same timezone-aware formatting desktop uses (spec 020 FR-003/FR-004) — date-only for days, time-only for slots, no raw ISO/"Z" timestamp.
- **FR-005**: On a mobile viewport, all dates/times in the Calendar review MUST update immediately when the church-time/local-time toggle changes, matching desktop (spec 020 FR-005).
- **FR-006**: The theme control (light/dark/system) MUST correctly apply the selected theme and visibly update the app's appearance when operated from a mobile viewport.
- **FR-007**: The mobile navigation drawer MUST visually distinguish a parent nav section from its child items using hierarchy cues (e.g. indentation, grouping, weight), while preserving the exact same set of items, routes, and active-state highlighting logic as before this change.
- **FR-008**: The Calendar review table (desktop) MUST provide an "Expand all" control that expands every day row in one action.
- **FR-009**: The Calendar review table (desktop) MUST provide a "Collapse all" control that collapses every day row in one action.
- **FR-010**: Attempting a mobile add/edit/delete action (FR-001/FR-002) on a cycle that becomes locked between load and save MUST fail with an error and apply no change, matching desktop's existing lock-transition guard (spec 020 FR-013).

### Key Entities

This feature introduces no new domain entities. It extends the presentation layer (mobile viewport rendering, mobile input surfaces) and adds a bulk-expand control for entities already shipped in prior features: `PlanningCycle`, `Event`/day-row, and `TimeSlot`/slot-row (specs 013/017/019/020).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A ChurchAdmin can add, edit, or delete a draft cycle's day-event or time slot entirely from a mobile viewport, with 100% functional parity to the equivalent desktop action.
- **SC-002**: 0 raw ISO timestamps or "Z"-suffixed strings appear anywhere in the mobile Calendar review, in either timezone mode.
- **SC-003**: 100% of theme selections (light/dark/system) made on a mobile viewport visibly apply on the first tap.
- **SC-004**: A user can correctly identify which nav-drawer items are children of which section without misreading siblings as children, verified by visual review against the redesigned hierarchy cues.
- **SC-005**: A ChurchAdmin can expand or collapse every day row in the Calendar review table in exactly 1 action, regardless of row count.
- **SC-006**: 100% of the mobile add/edit/delete affordances (FR-001/FR-002) are absent when viewing a locked cycle on mobile, verified against both a draft and a locked cycle.

## Assumptions

- "Mobile viewport" means the existing responsive breakpoint boundary already used elsewhere in this app (the same `md:`-and-below convention spec 020's plan used to scope its desktop-only delivery) — this feature does not introduce a new breakpoint definition.
- The mobile add/edit input surface is sourced from this application's standard component library (no bespoke, one-off UI pattern invented for this feature) — it does not need to be built from nothing, since a matching standard primitive already exists in that library.
- "Expand all"/"Collapse all" are implemented as two one-shot actions (not a single synced toggle whose label reflects mixed row states), per the Edge Cases section — simplest, least ambiguous behavior when rows are later toggled individually.
- The mobile nav drawer redesign (User Story 4) is a visual/IA change only: item set, routes, and active-state logic from the existing drawer are reused unchanged.
- The theme-toggle mobile bug (User Story 3) is a defect in existing shipped behavior, not a new capability; this spec defines only the required end-state (theme selection works on mobile), not the underlying cause, which is determined during planning/implementation.
- This feature builds directly on specs 013 (TimeSlot entity), 017 (scheduling reshape), 019 (table view), and 020 (draft editing, timezone formatting) — the underlying data model, mutation endpoints (event/slot create/update/delete), and `useTimezone()` formatting stack from those features are reused unchanged; this feature adds no new backend capability, only mobile-viewport presentation/interaction and the desktop bulk-expand control.
- Church-admin-level access control is unchanged from prior specs — no new roles or permission levels are introduced.
