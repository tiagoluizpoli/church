# Feature Specification: Schedule Builder (Desktop)

**Feature Branch**: `013-schedule-builder`

**Created**: 2026-06-25

**Last Updated**: 2026-06-26 (post-grilling session — 70 design decisions incorporated)

**Status**: Draft

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Build and Publish a Schedule (Priority: P1)

A ministry leader creates a new event, configures its time slots and role requirements inside the builder, assigns volunteers, and publishes the finalized schedule so volunteers are notified.

**Why this priority**: This is the entire scheduling loop. Without it, no downstream confirmation, notification, or volunteer visibility can occur.

**Independent Test**: Leader creates an event via the quick-create modal, lands in the builder, auto-generates 2 slots, applies a role template, assigns a volunteer to each required cell, and publishes. Assigned volunteers receive notifications.

**Acceptance Scenarios**:

1. **Given** a leader clicks "New Event", **When** they fill the quick-create modal (title + date range + ministry) and save, **Then** they are immediately redirected into the Schedule Builder for that event.
2. **Given** the builder opens with no slots, **When** the leader sees the empty state, **Then** two options are shown inline: "Auto-generate slots" and "Add slot manually."
3. **Given** the leader chooses "Auto-generate slots", **When** they pick a strategy (duration-based or count-based) and confirm, **Then** a time range list preview is shown before slots are saved, and a role template selection step follows.
4. **Given** slot rows exist in the grid, **When** a leader assigns a volunteer to a cell via drag-and-drop or click, **Then** the cell immediately shows the volunteer's first name + last initial + a conflict badge, and the staffing meter updates.
5. **Given** all required cells are filled and no hard violations exist (in a hard-enforcement ministry), **When** the leader clicks "Publish", **Then** the schedule status changes to Published and only the assigned volunteers receive notifications.
6. **Given** the schedule is in Draft state, **When** the leader makes any change, **Then** it is persisted automatically — an "Auto-saving..." indicator confirms the action.

---

### User Story 2 — Handle Conflicts and Overrides (Priority: P2)

A ministry leader attempts to assign a volunteer who has a conflict and is guided to either pick someone else or override with a written justification.

**Why this priority**: Conflict detection is the core integrity rule. Leaders must be able to act on conflicts and record their decisions before publishing.

**Independent Test**: Leader assigns a volunteer to two overlapping slots. Builder flags double-booking. Leader overrides with a 10-character reason. Assignment saves with audit trail entry. Publish succeeds.

**Acceptance Scenarios**:

1. **Given** a volunteer is already assigned to a slot, **When** the leader assigns them to an overlapping slot, **Then** the cell highlights orange ("Double-booked"); if the volunteer explicitly marked unavailability, the cell highlights red ("Unavailable").
2. **Given** a conflict cell exists, **When** the leader clicks "Override", **Then** a dialog appears with a reason field that requires a minimum of 10 characters before enabling the confirm button.
3. **Given** the leader submits a valid reason, **When** the override is confirmed, **Then** the assignment saves, the cell shows a "Conflict Override" indicator, and the override + reason are recorded in the audit trail.
4. **Given** a ministry uses hard enforcement, **When** unresolved hard violations exist, **Then** the Publish button is disabled and the violations are listed for the leader to resolve.
5. **Given** the leader opens the ⋯ overflow menu in the header, **When** they click "View Audit Log", **Then** a panel shows all override decisions made for this event (volunteer, slot, reason, leader who authorized).

---

### User Story 3 — Respond to a Volunteer Decline (Priority: P2)

A volunteer declines their assignment after the schedule is published. The leader is notified and reassigns through a substitution flow.

**Why this priority**: Declines are time-sensitive — a slot can go unstaffed if the leader doesn't act quickly.

**Independent Test**: Volunteer declines an assignment. Leader receives an in-app notification. Leader opens the builder, sees × badge on the declined cell, clicks it, and is placed in substitution mode to find a replacement.

**Acceptance Scenarios**:

1. **Given** a published schedule exists, **When** a volunteer declines their assignment, **Then** the leader receives an in-app notification ("João declined the 10:00–14:00 Projectionist slot").
2. **Given** the leader opens the builder after a decline, **When** they view the grid, **Then** the declined cell shows a × badge alongside the volunteer's name.
3. **Given** the leader clicks a declined cell, **When** the picker opens, **Then** it opens in substitution mode: pre-filtered to available volunteers, with the declined volunteer pinned at the top labeled "Declined — find replacement."
4. **Given** the leader selects a replacement volunteer, **When** the assignment is saved, **Then** only the new volunteer (added) and the original volunteer (removed) receive re-notifications.

---

### User Story 4 — Manage Slot Structure (Priority: P3)

A ministry leader adds, edits, and removes time slots and adjusts role requirements within the builder.

**Why this priority**: Slot structure is the scaffold. Leaders must be able to adapt it without leaving the builder.

**Independent Test**: Leader opens builder with existing slots, edits a slot's time via modal, adds a new slot and is prompted to copy role requirements from an existing slot, and increases a role's required count from 1 to 2 via inline +/− buttons. Two fill cells appear in that column.

**Acceptance Scenarios**:

1. **Given** the builder is open, **When** the leader adds a new slot manually, **Then** a dialog asks "Copy role requirements from existing slot?" with a slot picker; the new slot inherits the chosen slot's requirements.
2. **Given** the leader clicks a slot's time/label in the row header, **When** the slot edit modal opens, **Then** they can edit start time, end time, and optional label in one place.
3. **Given** a role requires 1 volunteer, **When** the leader clicks the + button in that role's column header within a slot row, **Then** a second fill cell appears in that column for the same slot.
4. **Given** a slot with existing assignments, **When** the leader attempts to remove it, **Then** a confirmation dialog warns that all assignments in this slot will be removed.
5. **Given** the leader attempts to set a slot time that overlaps with an existing slot, **When** they try to save, **Then** the system hard-blocks with an inline error stating the overlap — overlapping slots are never allowed. (Next-valid-time suggestion is post-MVP.)

---

### User Story 5 — Use Auto-Suggestions (Priority: P4)

The system passively surfaces suggested volunteers in every empty cell so leaders can build schedules faster.

**Why this priority**: Suggestions dramatically reduce time-to-complete for large events without requiring any extra interaction.

**Independent Test**: Leader opens builder for an event where volunteers have submitted availability. Every empty cell shows up to 3 ranked suggestions. Leader clicks "Accept" on one — it fills the cell.

**Acceptance Scenarios**:

1. **Given** volunteers have submitted availability, **When** the builder loads, **Then** each empty cell shows up to 3 suggested volunteers ranked by: fully available first, then least-assigned in this event.
2. **Given** a suggested volunteer has a partial conflict, **When** their suggestion is shown, **Then** it is visually de-prioritized with a conflict indicator but remains selectable.
3. **Given** the leader clicks "Accept" on a suggestion, **When** the action completes, **Then** the volunteer is assigned, the conflict check runs, and the suggestion list collapses into the normal assigned-cell view.

---

### User Story 6 — Sub-Leader Manages Their Team (Priority: P3)

A sub-leader opens the builder for an event and can assign volunteers to their team's slots only.

**Why this priority**: Sub-leaders have a defined scope. The builder must enforce it while still giving them the context of the full event.

**Independent Test**: Sub-leader opens builder. Sidebar shows only their team's volunteers. Their team's slot cells are interactive. Other teams' cells are visible but locked. Sub-leader assigns a volunteer successfully.

**Acceptance Scenarios**:

1. **Given** a sub-leader opens the builder, **When** the sidebar loads, **Then** it shows only volunteers belonging to their team — not the full ministry pool.
2. **Given** the builder grid is visible, **When** the sub-leader views slots belonging to other teams, **Then** those cells are visible (read-only) but no interaction is possible.
3. **Given** the sub-leader attempts to navigate to another team's cell, **When** they try to interact, **Then** no picker opens and no drag-drop is accepted.

---

### Edge Cases

- Builder opened by a non-leader: redirect to volunteer schedule view with a toast ("You don't have access to the schedule builder").
- Builder opened on a mobile device: show "Use desktop" interstitial. "Continue anyway" loads the full builder — not a hard block.
- Event opened with no slots yet: inline empty state with "Auto-generate slots" and "Add slot manually" options.
- No volunteers have submitted availability: suggestions are empty; sidebar shows all volunteers as gray ("No response").
- All volunteers are already assigned to other slots: on-demand picker shows full list with "Already assigned (N slots)" badges; leader can still select and trigger the normal conflict flow.
- Volunteer's availability changes after assignment: cell badge reflects last-loaded state. Leader uses the manual refresh button in the header to pull fresh data without a full page reload.
- Auto-save fails due to network error: persistent warning banner appears ("Changes not saved — Retry"). Builder stays fully interactive. Leader must retry manually.
- Leader attempts to remove a role column that has existing assignments: system warns and requires confirmation.
- Leader opens builder for a published event: all interactions enabled (assignment edits only). Adding/removing slots or changing role counts is NOT supported in MVP — slot structure is locked after publish. A future "Return to Draft" action (post-MVP) will unlock structural edits; until then the locked controls show an explanatory tooltip and no unlock path is offered.

---

## Requirements *(mandatory)*

### Functional Requirements

**Entry & Navigation**

- **FR-001**: System MUST provide a quick-create modal (title, date range, ministry) that, on save, immediately redirects the leader into the Schedule Builder for the new event.
- **FR-002**: Builder route MUST be protected — non-leaders are redirected to the volunteer schedule view with a toast notification explaining the access restriction.
- **FR-003**: Builder MUST display a "Use desktop" interstitial on mobile devices, with a "Continue anyway" option that loads the full builder without a second gate.
- **FR-004**: System MUST support deep-linking to a specific event's builder view so leaders can share or bookmark the URL.

**Grid Layout**

- **FR-005**: Builder MUST display a grid where rows represent time slots and columns represent role requirements.
- **FR-006**: For hourly-based events, slot rows MUST display start–end time ranges. For day-based events, slot rows MUST display day labels ("Day 1", "Day 2") instead of time ranges.
- **FR-007**: Multi-day events MUST display a sticky date-header row separating each calendar day within the single scrollable grid.
- **FR-008**: When a role requirement has a count greater than 1, the column MUST display stacked multi-fill cells within a single column (not separate columns per position).
- **FR-009**: Fully-filled slot rows (all requirements assigned, no hard conflicts) MUST receive a subtle green background tint to signal completion at a glance.

**Volunteer Pool Sidebar**

- **FR-010**: Builder MUST display a persistent sidebar showing the full volunteer pool (all ministry members for leaders; own-team members only for sub-leaders).
- **FR-011**: Each volunteer in the sidebar MUST display: first name + last initial, a color availability badge (green = available, yellow = partial, red = unavailable, gray = no response submitted), and a workload count showing slots already assigned in this event.
- **FR-012**: Availability badge detail MUST be revealed on hover without navigating away from the sidebar.
- **FR-013**: Sidebar MUST default to sorting order: available-first → partial → unavailable → no-response; within each group, least-assigned-first, then alphabetical.
- **FR-014**: Leaders MUST be able to filter the sidebar by name AND by role simultaneously (AND logic).

**Assignment**

- **FR-015**: Leaders MUST be able to assign a volunteer to a cell via drag-and-drop from the sidebar.
- **FR-016**: Leaders MUST be able to assign a volunteer to a cell by clicking the cell, which opens an on-demand picker showing the filtered volunteer list with an inline search box.
- **FR-017**: The on-demand picker MUST be pre-filtered to available volunteers for that slot's time range. When all volunteers are already assigned, the picker shows the full list with "Already assigned (N slots)" badges.
- **FR-018**: Assigned cells MUST display: volunteer first name + last initial + conflict badge (color-coded by severity).
- **FR-019**: Assigned cells MUST additionally display a confirmation status badge after publishing: ✓ (confirmed), × (declined), or clock icon (pending response).
- **FR-020**: Leaders MUST be able to remove an assignment by clicking the assigned cell and selecting "Remove" from the picker.

**Conflict Detection**

- **FR-021**: System MUST check volunteer availability and conflict status immediately upon each assignment action, without a full page reload.
- **FR-022**: System MUST differentiate between two conflict severities: "Unavailable" (red — volunteer explicitly marked unavailability) and "Double-booked" (orange — volunteer assigned to overlapping slot).
- **FR-023**: Conflict detection MUST check across all events in all ministries the volunteer belongs to, not only within the current event.
- **FR-024**: Leaders MUST be able to override a conflict by providing a written reason of at least 10 characters; the "Confirm Override" button remains disabled until the minimum is met.
- **FR-025**: Override decisions MUST be recorded in an audit trail: assignment, conflict reason, justification text, leader who authorized, and timestamp.
- **FR-026**: Audit trail for the current event MUST be accessible via "View Audit Log" in the ⋯ overflow menu in the builder header.

**Substitution Flow**

- **FR-027**: When a volunteer declines a published assignment, the leader MUST receive an in-app notification identifying the volunteer, slot, and role affected.
- **FR-028**: Declined cells MUST be visually marked with a × badge.
- **FR-029**: Clicking a declined cell MUST open the picker in substitution mode: pre-filtered to available volunteers, with the declined volunteer pinned at the top and labeled "Declined — find replacement."

**Slot Management**

- **FR-030**: Leaders MUST be able to add new slots within the builder; on addition, a dialog MUST ask whether to copy role requirements from an existing slot (with a slot picker).
- **FR-031**: Leaders MUST be able to edit a slot's time range and optional label via a modal dialog (not inline).
- **FR-032**: System MUST hard-block saving a slot whose time range overlaps any existing slot, with an inline error stating the overlap. (Proposing the next valid time is a post-MVP enhancement — not required for this spec.)
- **FR-033**: Leaders MUST be able to adjust role required count per slot using inline + / − buttons in each column header within the slot row.
- **FR-034**: Leaders MUST be able to remove slots; removal of a slot with existing assignments MUST require explicit confirmation.
- **FR-035**: Leaders MUST NOT be able to add, remove, or restructure slots on a Published event — those changes require the event to be in Draft status.

**Slot Auto-Generation**

- **FR-036**: When the builder opens with no slots, an inline empty state MUST offer "Auto-generate slots" and "Add slot manually" as the two primary actions.
- **FR-037**: The auto-generation wizard MUST support two modes: duration-based (leader specifies minutes per slot) and count-based (leader specifies total number of slots).
- **FR-038**: Before confirming auto-generation, the wizard MUST display a time range list preview showing each slot that will be created.
- **FR-039**: After slot generation, the wizard MUST offer a role template selection step to apply role requirements to all slots at once.

**Role Templates**

- **FR-040**: Role templates MUST be ministry-scoped — each ministry manages its own templates in Ministry settings. Templates are not shared across ministries.
- **FR-041**: Applying a template in the wizard MUST populate all generated slots with the template's role requirements in a single action.

**Auto-Suggestions**

- **FR-042**: Every empty cell MUST passively display up to 3 suggested volunteers, ranked by the same sidebar sort order (available-first, least-assigned-first).
- **FR-043**: Suggestions for volunteers with partial conflicts MUST be visually de-prioritized but remain selectable.
- **FR-044**: Clicking "Accept" on a suggestion MUST assign the volunteer, trigger the conflict check, and collapse the suggestion list.

**Save & State**

- **FR-045**: All assignment and structural changes MUST be auto-saved without requiring manual user action; an "Auto-saving..." indicator MUST confirm the action.
- **FR-046**: Auto-save failure MUST display a persistent warning banner ("Changes not saved — Retry") with a retry button; the builder MUST remain fully interactive during failure.
- **FR-047**: Builder header MUST include a manual refresh button that pulls fresh availability and conflict state for all volunteers without a full page reload.

**Staffing Meters**

- **FR-048**: Builder header MUST display an event-level staffing meter using three-state color coding: red (below 50% filled), yellow (50–99%), green (100%).
- **FR-049**: Each slot row label MUST display a per-slot mini-meter or fill percentage badge using the same three-state color scheme.
- **FR-050**: Assignments with active conflicts MUST count as filled in both meters — conflict severity is tracked separately via cell color, not meter state.

**Publish**

- **FR-051**: The Publish button MUST be a primary action in the builder header, disabled only when a hard-enforcement ministry has unresolved hard violations.
- **FR-052**: Publishing MUST notify only volunteers with active assignments in the event.
- **FR-053**: Post-publish assignment edits (swap, add, remove) MUST notify only the directly affected volunteers (newly assigned and removed).

**Builder Header**

- **FR-054**: Builder header MUST display (left to right): event title linking to the event detail page, date range, ministry name, status badge (Draft/Published), auto-save indicator.
- **FR-055**: Builder header MUST show two primary action buttons: "Publish" and "Send Reminder."
- **FR-056**: "Send Reminder" MUST send a push notification to all ministry volunteers who have not yet submitted availability for this event.
- **FR-057**: A ⋯ overflow menu MUST group secondary actions: "Print / Export" (links to Spec F4 flow) and "View Audit Log."
- **FR-058**: Event metadata (title, date range, ministry) MUST be edited on the separate Event Detail page, not within the builder.
- **FR-059**: Event deletion is NOT available from within the builder.

**Sub-Leaders**

- **FR-060**: Sub-leaders MUST see only their own team's volunteers in the sidebar.
- **FR-061**: Sub-leaders MUST be able to interact (assign, remove, override) only with cells belonging to their team's role requirements. Other teams' cells are visible but read-only.

**Volunteer Display**

- **FR-062**: All volunteer name displays throughout the builder (sidebar, cells, picker, suggestions) MUST use first name + last initial format (e.g., "João P.").

**Volunteer Schedule View**

- **FR-063** *(cross-reference, not implemented here)*: Published schedules will be viewable by assigned volunteers through a dedicated read-only schedule page defined in Spec F2. The builder itself is never exposed to non-leaders. No implementation task exists in this spec.

### Key Entities

- **Event**: A scheduled occurrence with title, date range, type (hourly/day-based), status (Draft/Published), and ministry ownership.
- **Time Slot**: A sequential, non-overlapping subdivision of an event. For hourly events: start–end time range. For day-based events: a calendar day. Optionally labeled.
- **Role Requirement**: The minimum volunteer count needed for a specific role within a specific time slot.
- **Assignment**: A confirmed link between a Volunteer, a Role, and a Time Slot; optionally carrying conflict override audit data.
- **Volunteer Pool**: The set of ministry members (scoped to own team for sub-leaders), each with a computed availability status and workload count for the current event.
- **Role Template**: A saved set of role requirements (role + count) scoped to a ministry, applicable to all slots at once during setup.
- **Conflict Audit**: A record of an override: the assignment, the conflict type, the leader's written justification, the authorizing leader, and the timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Leaders complete the full assignment cycle for a 4-slot, 10-volunteer event in under 10 minutes.
- **SC-002**: Conflict badges appear within 1 second of any assignment action, without a full page reload.
- **SC-003**: Staffing meters (event-level and per-slot) remain accurate after every assignment, removal, or override without a manual refresh.
- **SC-004**: 90% of leaders successfully publish a schedule on their first attempt without assistance.
- **SC-005**: Zero published schedules contain unresolved hard violations in hard-enforcement ministries.
- **SC-006**: Auto-save completes within 2 seconds of any change, confirmed by a visible status indicator.
- **SC-007**: Leaders are notified of volunteer declines within 1 minute of the decline being submitted.

## Assumptions

- The Schedule Builder is the single canvas for the full scheduling workflow — event creation (title + dates) happens via a quick-create modal before entering the builder; all subsequent steps (slots, requirements, assignments) happen inside it.
- Roles are pre-configured at the Ministry level. The builder only selects from existing ministry roles — it does not create new role types.
- Role templates are managed in the Ministry settings feature (Spec MX — separate implementation). This spec only implements the builder-side apply-template flow (FR-040 builder read, FR-041 apply). Template creation/editing UI is out of scope here.
- The underlying conflict detection (Spec L1, Spec L2) and assignment lifecycle (Spec L3) logic is already implemented.
- The builder operates in single-leader mode for MVP; simultaneous multi-leader editing is out of scope.
- "Publish" transitions Draft → Published. Returning to Draft after publish is out of scope for MVP.
- Post-publish editing is limited to assignment changes only (swap, add, remove volunteers). Slot structure changes (add/remove slots, change role counts) require the event to be in Draft.
- The volunteer schedule view (read-only, published schedule) is a separate feature covered by Spec F2. FR-063 is a cross-reference only — no tasks exist for it in this spec.
- Real-time builder updates when a volunteer's availability changes after assignment are deferred to post-MVP (see BACKLOG.md, BL-001).
- Per-event volunteer exclusion by a leader is deferred to post-MVP (see BACKLOG.md, BL-003).
- Schedule duplication from past events is deferred to post-MVP (see BACKLOG.md, BL-002).
- The builder does not support keyboard shortcuts for MVP.
- No undo/redo for MVP. The "Remove" action in the picker is the recovery path for accidental assignments.
- The builder does not support event notes or slot-level notes for MVP.
- Volunteer names display as first name + last initial throughout the builder.
- All slot times display in the ministry's configured timezone (not the leader's browser timezone), consistent with Spec S4.
