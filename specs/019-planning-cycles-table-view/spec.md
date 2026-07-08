# Feature Specification: Planning Cycles Table View (Desktop, Expandable Rows)

**Feature Branch**: `019-planning-cycles-table-view`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "Replace the current card/list-based presentation with a table-based presentation, desktop breakpoint only, scoped strictly to the Planning Cycles module: (1) Planning cycles index — existing-cycles list becomes a flat table; (2) Template library — saved templates list becomes a flat table; (3) Selected cycle review — becomes a table with expandable rows (weekday row expands to reveal its individual time-slot rows). Below the desktop breakpoint, all three screens keep their current card/list layout unchanged. Scope is strictly these 3 Planning Cycles screens — no other list screen in the app is touched in this pass; this is a deliberately small first pass to validate the pattern before a larger rollout."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scan cycles and templates at a glance on desktop (Priority: P1)

A ChurchAdmin reviewing the Planning Cycles index or the Template library on a desktop-sized screen sees each list as a compact table (one row per cycle or template) instead of today's stacked cards, so more items are visible at once and their key attributes (name, window/weekday, status/block-count) line up in scannable columns.

**Why this priority**: This is the simplest, lowest-risk slice — flat tables, no nesting — and it's the foundation the priority-3 nested table builds on conceptually (same table primitive, same breakpoint rule). It also delivers standalone value (denser scanning) without needing the expandable-row work to be shippable.

**Independent Test**: On a desktop-width viewport, open the Planning cycles index and confirm cycles render as table rows with visible name/window/status columns; open the Template library and confirm the same for templates (name/weekday/block-count). Fully verifiable without the cycle-review table (User Story 2).

**Acceptance Scenarios**:

1. **Given** a ChurchAdmin on a desktop-width viewport views the Planning cycles index, **When** the page loads, **Then** existing cycles render as rows in a table with columns for name, date window, and status — not as stacked cards.
2. **Given** a ChurchAdmin on a desktop-width viewport views the Template library, **When** the page loads, **Then** saved templates render as rows in a table with columns for name, weekday, and block count — not as stacked cards.
3. **Given** either screen has zero items, **When** the table renders, **Then** an empty-state message appears in place of the table (not an empty table shell with no rows).

---

### User Story 2 - Drill into a cycle's calendar without leaving the row (Priority: P2)

A ChurchAdmin reviewing a selected cycle's calendar (the "Calendar review" section) sees each weekday/date entry as a single collapsed table row summarizing its window and slot count; expanding that row in place reveals the individual time slots underneath it, without navigating to a separate screen or losing their place in the table.

**Why this priority**: This is the one screen in this pass that actually needs nesting, and it's the specific pain point that motivated the change (today's stacked weekday cards, each pre-expanded with all their slots, make a full cycle hard to scan). It depends on User Story 1 only in that it reuses the same table foundation, but is independently the higher-value deliverable.

**Independent Test**: On a desktop-width viewport, select a cycle with multiple weekday entries and confirm each renders as a single collapsed row (date/window/slot-count); expand one row and confirm its child slot rows (each slot's own time window) appear nested beneath it; collapse it again and confirm the child rows disappear and the parent row's summary is unchanged. Verifiable independently of User Story 1's two flat tables.

**Acceptance Scenarios**:

1. **Given** a selected cycle's Calendar review section on a desktop-width viewport, **When** the page loads, **Then** each weekday/date entry appears as one collapsed table row showing its date window and slot count, with its individual time slots hidden.
2. **Given** a collapsed weekday row, **When** a ChurchAdmin expands it, **Then** its individual time-slot rows appear nested directly beneath it, each showing that slot's own start/end time.
3. **Given** an expanded weekday row, **When** a ChurchAdmin collapses it again, **Then** its child slot rows disappear and the row returns to its collapsed summary state.
4. **Given** multiple weekday rows, **When** a ChurchAdmin expands one, **Then** the others remain in whatever state (expanded or collapsed) they were already in — expanding one row does not affect the others.
5. **Given** a locked cycle's Calendar review section, **When** it renders as a table, **Then** it remains read-only in the same way today's locked-cycle card view is read-only — no new editing affordance is introduced by the table format.

---

### User Story 3 - Mobile users see no regression (Priority: P3)

A user viewing any of the three Planning Cycles screens on a narrower-than-desktop viewport sees the same card/list presentation that exists today — the table format is additive to desktop and does not replace or degrade the existing mobile experience.

**Why this priority**: Lower priority than the two table deliverables because it's a non-regression guarantee, not new capability — but it's a hard constraint on how User Stories 1 and 2 must be built (breakpoint-gated, not a wholesale replacement), so it's called out as its own testable story.

**Independent Test**: On a narrower-than-desktop viewport, open all three screens and confirm each renders identically to its pre-change card/list layout, with no table markup present. Verifiable at any point once User Stories 1-2 land, by resizing the viewport.

**Acceptance Scenarios**:

1. **Given** any of the three Planning Cycles screens, **When** viewed on a narrower-than-desktop viewport, **Then** the screen renders its existing card/list layout, unchanged from today's behavior.
2. **Given** a user resizes their browser window across the desktop breakpoint while on one of these screens, **When** the width crosses the breakpoint, **Then** the presentation switches between table and card/list layout without losing the user's current selection (e.g., which cycle is selected, which weekday row was expanded is not required to persist across the switch).

---

### Edge Cases

- What happens when a weekday row has only one time slot? It still renders as an expandable row (consistent behavior regardless of child count), rather than being flattened into a single non-expandable row.
- What happens when a cycle has zero weekday entries yet (e.g., before a template has been applied)? The Calendar review table shows an empty-state message, consistent with User Story 1's empty-state requirement for the other two tables.
- How does sorting/ordering work in the new tables? Rows preserve the same ordering already used by today's card/list views (no new sort feature is introduced by this change).
- What happens to row-level actions that exist today (e.g., Edit/Delete on a template, "locked" status badge on a cycle)? They remain available in the table row, in a manner appropriate to a table layout (e.g., an actions column), rather than being dropped.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On a desktop-width viewport, the Planning cycles index MUST present existing cycles as rows in a table, showing at minimum each cycle's name, date window, and status.
- **FR-002**: On a desktop-width viewport, the Template library MUST present saved templates as rows in a table, showing at minimum each template's name, weekday, and block count.
- **FR-003**: On a desktop-width viewport, the selected cycle's Calendar review section MUST present each weekday/date entry as a collapsible table row, showing at minimum its date window and slot count when collapsed.
- **FR-004**: A collapsed weekday row MUST be expandable to reveal its individual time-slot rows nested beneath it, each showing that slot's own start/end time.
- **FR-005**: Expanding or collapsing one weekday row MUST NOT change the expand/collapse state of any other weekday row.
- **FR-006**: Below the desktop breakpoint, all three screens MUST continue to render their existing card/list presentation, unchanged in structure and content from their current behavior.
- **FR-007**: Row-level actions and status indicators already present in today's card/list views (e.g., a template's Edit/Delete actions, a cycle's locked/draft status) MUST remain present and reachable in the corresponding table row.
- **FR-008**: Any of the three tables MUST show an empty-state message when its underlying list has zero items, rather than rendering an empty table with no rows.
- **FR-009**: A locked cycle's Calendar review table MUST remain read-only, consistent with the existing locked-cycle behavior — the table format MUST NOT introduce new editing affordances.
- **FR-010**: This change MUST be scoped to exactly the three screens above (Planning cycles index, Template library, selected cycle's Calendar review). No other list-bearing screen in the application (e.g., Availability, Tailoring, Builder events, Dashboard, notification history) is altered by this feature.

### Key Entities

This feature introduces no new domain entities. It changes only the presentation of existing data already surfaced by the Planning Cycles screens shipped in `specs/018-churchwide-ux-redesign`: `PlanningCycle` (name, window, status), `EventTemplate` (name, weekday, blocks), and the generated calendar's weekday/date entries and their time slots.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a desktop-width viewport, a ChurchAdmin can see at least twice as many cycles or templates at once, compared to today's one-card-per-row stacked layout, without scrolling further than before.
- **SC-002**: A ChurchAdmin can locate a specific weekday's time slots within a selected cycle by expanding exactly one row, without navigating away from the Calendar review screen.
- **SC-003**: 100% of the three screens' existing row-level actions (edit, delete, status display) remain reachable after the change, verified by exercising each action from the new table layout.
- **SC-004**: 0 regressions on narrower-than-desktop viewports — all three screens render identically to their pre-change behavior below the desktop breakpoint.
- **SC-005**: 0 other list-bearing screens in the application change as a result of this feature.

## Assumptions

- This feature builds directly on the Planning Cycles screens shipped in `specs/018-churchwide-ux-redesign` (Phase 6/8) — the underlying routes, data, and role-gating from that feature are reused unchanged; only the presentation of existing lists changes.
- "Desktop-width viewport" reuses whatever breakpoint convention the rest of the application already applies for desktop-vs-mobile layout switches (e.g. the existing sidebar-vs-bottom-nav switch) — no new breakpoint value is introduced by this feature.
- The table presentation is achieved using a pre-built, off-the-shelf table component (sourced from a component registry external to this codebase, per direct user instruction) rather than a hand-rolled table implementation — consistent with this repo's existing standard of using pre-built UI primitives rather than bespoke ones.
- This is a deliberately narrow first pass. Applying the same table-based presentation to other list-bearing screens in the application (Availability, Tailoring, Builder events, Dashboard, notification history, etc.) is explicitly out of scope and left to a future, separate feature once this pattern has been validated here.
- Sorting, filtering, column customization, and row-level bulk actions are not introduced by this feature — the tables present the same data, in the same order, with the same per-row actions as today's card/list views.
