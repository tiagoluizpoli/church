# Spec F1: Schedule Builder (Desktop)

## Purpose
Define the complex, desktop-first UI for Ministry Leaders to build and manage volunteer schedules.

---

> **⚠️ REFINEMENT LOG — 2026-06-26**
> This file was refined after a 70-question grilling session. The original content below is preserved. Additions and changes are documented in the **Grilling Refinements** section at the bottom of this file. When the original content conflicts with the refinements, **the refinements take precedence**.

---

## 1. Core Layout *(original)*
- **Event Header**: Title, Date Range, Status (Draft/Published), and "Publish" button.
- **Sidebar (Volunteer Pool)**:
    - Search/Filter by name or role.
    - Status indicators (Available, Conflict, Double-booked).
    - Drag handles for each volunteer.
- **Main Canvas (Timeline View)**:
    - **Rows**: Time Slots.
    - **Columns**: Roles/Requirements (e.g., "Projectionist 1", "Projectionist 2", "Sound").
    - **Cells**: Drop zones for assignments.

## 2. Interaction Rules *(original)*
- **Drag and Drop**: 
    - Volunteers can be dragged from the Sidebar into a Slot/Role cell.
    - Dragging triggers an immediate background call to the `Availability Engine`.
- **In-Place Validation**:
    - If a volunteer is dropped into a conflict, show an immediate Orange (Double-booked) or Red (Unavailable) highlight.
    - Clicking the conflict shows the `Override` dialog.
- **Slot Management**:
    - Leaders can add/remove slots or edit the "Required Count" for a role directly in the grid.

## 3. Real-time Feedback *(original)*
- **Staffing Meter**: A percentage bar showing how many requirements are fulfilled (e.g., "75% Staffed").
- **Saving State**: "Auto-saving..." indicator to reassure the user.

## 4. Frontend Technology *(original)*
- **React 19** + **Vite**.
- **TanStack Router** for deep linking to specific events.
- **Dnd-kit** (or similar) for accessible, performant drag and drop.
- **Shadcn/UI** for components (Table, Dialogs, Popovers).

## 5. Testing Requirements *(original)*
- **Component**: Verify that dragging a volunteer into a cell correctly triggers the validation visual.
- **Integration**: Verify that "Publish" button is disabled if `Hard Enforcement` rules are violated.
- **E2E**: Full journey - Create slot -> Drag volunteer -> Overcome conflict -> Publish.

## 🔗 References
- [Spec 10: Scheduling API](./10-scheduling-api.md)

## 🔴 Mandatory UI Component Rule
Everything must be built exclusively using standard **shadcn/ui** components. Do not build custom UI elements from scratch. Make as few modifications as possible. If a component is missing, pause and ask the user to find a community implementation.

---

## Grilling Refinements — 2026-06-26

The following decisions were made during a detailed grilling session on the Schedule Builder spec. Each item notes **what changed**, **what the original assumption was**, and **why the decision was made**.

---

### Entry Point & Canvas

**Decision**: The builder is the single canvas for the full scheduling workflow.
- **Original assumption**: Unclear — the spec implied the builder was just for assignment.
- **Changed to**: Leader creates an event via a lightweight quick-create modal (title + date range + ministry only). On save, they are immediately redirected into the builder. Slot generation, role requirements, and volunteer assignment all happen inside the builder.
- **Why**: Splitting the workflow across multiple pages creates friction. The builder becomes the "home" for the event lifecycle.

---

### Volunteer Pool Sidebar

**What was added / clarified**:

- **4th availability status (gray)**: Original spec had 3 statuses (Available, Conflict, Double-booked). Added a 4th: **gray = no availability submitted yet**. Gray volunteers sort after red in the sidebar. This signals "chase this person for availability" — different from "explicitly unavailable."
- **Workload count badge**: Each volunteer shows how many slots they're already assigned to in this event. Promotes workload balance without extra interaction.
- **Sort order**: Available-first → partial → unavailable → no-response. Within each group: least-assigned-first, then alphabetical.
- **Sub-leader scope**: Sub-leaders see only their own team's volunteers — not the full ministry pool.
- **Combined name + role filters**: Both can be active simultaneously (AND logic). Original spec implied name search only.
- **Hover detail**: Badge shows color status at a glance; hover reveals full availability breakdown.

---

### On-Demand Picker (new)

**Original**: Only drag-and-drop was mentioned.
**Changed to**: Both drag-and-drop AND click-to-assign. Clicking any cell opens an on-demand picker — a popover filtered to volunteers available for that slot's time range, with an inline search box.

- When all volunteers are already assigned, picker shows the full list with "Already assigned (N slots)" badges. Selecting still works and triggers the normal conflict flow.
- Picker serves double duty: assign + remove. Clicking an assigned cell opens the same picker with a "Remove" option at the top.

---

### Grid Columns — Multi-Count Roles

**Original**: "Columns: Roles/Requirements (e.g., Projectionist 1, Projectionist 2, Sound)" — implied separate columns per position.
**Changed to**: A single "Projectionist" column with stacked multi-fill cells within it when count > 1. Keeps the grid compact.
- **Why**: Separate columns for each position explodes the grid width for roles with counts of 3–4.

---

### Slot Management

**What was added / clarified**:

- **Slot time and label editing**: Via a modal dialog (not inline). Modal contains time pickers + optional label field.
  - *Original said*: "edit directly in the grid" — changed to modal to prevent accidental edits in a dense grid.
- **Manual slot addition — role inheritance**: When adding a slot manually, the builder prompts: "Copy role requirements from existing slot?" with a slot picker. User chooses a source slot or starts empty.
  - *Original assumed*: No inheritance behavior defined.
- **Role count editing**: Inline + / − buttons per column per slot row. +1 adds a fill cell to that column; −1 removes one.
  - *Original said*: "edit Required Count directly in the grid" — refined to specific +/− pattern.
- **Slot overlap**: Hard block. Overlapping slots are never allowed (per domain model). Inline error on time field. This is the **one place** where hard blocking applies regardless of enforcement setting.
- **Post-publish structure**: Slot add/remove and role count changes are **locked on Published events**. Assignment changes (swap/add/remove volunteers) remain editable post-publish.

---

### Slot Auto-Generation

**What was added (not in original)**:

- Wizard supports two modes: **duration-based** (minutes per slot) and **count-based** (total number of slots).
- Before saving, shows a **time range list preview** listing each slot that will be created. Leader confirms or goes back.
- After slot generation, wizard offers a **role template selection step**.

---

### Role Templates (new concept)

**Original**: Not mentioned.
**Added**: After slot generation, leaders can apply a saved role template to populate all slots with role requirements in one step. Templates are ministry-scoped and managed in Ministry settings.
- **Why not in builder**: Role type creation in the builder risks typos and duplicates. Configuration belongs in settings; the builder only consumes configuration.

---

### Conflict Detection — Scope Expanded

**Original**: Implied within-event conflict detection only.
**Changed to**: Cross-event AND cross-ministry. If a volunteer is assigned to a slot in any other event across any ministry they belong to, it is flagged as a double-booking conflict.
- **Why**: A volunteer only has one body. The Conflict Validation Service (Spec L2) already supports cross-event detection.

---

### Conflict Override

**What was clarified**:

- Override reason requires **minimum 10 characters**. The "Confirm Override" button is disabled until met. Prevents meaningless audit entries ("x", "ok").
- Audit trail is accessible **from within the builder** via "View Audit Log" in the ⋯ overflow menu.

---

### Substitution Flow (new)

**Original**: Not defined — assumed leader would just reassign manually.
**Added**: When a volunteer declines a published assignment:
1. Leader receives an **in-app notification** (not just a badge on next open).
2. Declined cell shows × badge.
3. Clicking a declined cell opens the picker in **substitution mode**: pre-filtered to available volunteers, with the declined volunteer pinned at the top labeled "Declined — find replacement."

---

### Auto-Suggestions

**Original**: Mentioned as "auto-suggestions" without detail.
**Clarified**:
- **Passive display**: Suggestions appear in every empty cell automatically — no click needed.
- **Top 3 per cell**: More than 3 creates visual noise; full list is one click away via the picker.
- **Ranking**: Available-first, then least-assigned-first — same as sidebar order. Consistent, no extra logic.
- **Partial conflicts**: De-prioritized visually but selectable.

---

### Post-Publish Editing

**Original**: Not addressed.
**Decision**: Post-publish editing is **live** — the event remains interactive. Leaders can add, remove, or swap volunteer assignments after publishing. Each such change re-notifies only the directly affected volunteers (added + removed), not the full ministry.
- **Structural changes** (slot add/remove, role count) are **blocked** post-publish — those require Draft.

---

### Staffing Meters

**Original**: Single "Staffing Meter" percentage bar.
**Changed to**:
- **Event-level meter** in the builder header — three-state: red (<50%), yellow (50–99%), green (100%).
- **Per-slot mini-meter** in each slot row label — same three-state coloring.
- **Conflict-assigned cells count as filled** in both meters. Conflict severity is tracked via cell color, not meter state.

---

### Builder Header — Full Definition

**Original**: "Event Header: Title, Date Range, Status, Publish button."
**Expanded to**:
- Left: Event title (links to Event Detail page for metadata editing), date range, ministry name, status badge (Draft/Published).
- Center: Auto-save indicator ("Auto-saving..." / "Saved" / warning banner on failure).
- Right primary actions: **Publish** button, **Send Reminder** button.
- Right overflow (⋯): **Print / Export** (links to Spec F4), **View Audit Log**.
- Note: Event metadata (title, date, ministry) is **not editable from within the builder** — edit from the Event Detail page.
- Note: **Event deletion is not available from the builder**.

---

### Send Reminder (new)

**Added**: "Send Reminder" is a primary header action. Fires a push notification to all ministry volunteers who have not yet submitted availability for this event. Allows leader to chase responses without leaving the builder.

---

### Mobile Behavior (new)

**Original**: Desktop-first implied; no mobile behavior defined.
**Added**: When the builder is opened on a mobile browser, a full-screen interstitial appears:
> "The Schedule Builder is designed for desktop. For the best experience, open this on a computer."
> [Continue anyway]

- "Continue anyway" loads the full builder — no hard block. Leaders who need to make an emergency change from mobile can do so.
- This is intentional: leaders may be at church without a laptop and need to make quick fixes from their phone.

---

### Access Control (new)

**Original**: Not addressed.
**Added**:
- Non-leaders who navigate to the builder URL are redirected to the read-only volunteer schedule view with a toast notification ("You don't have access to the schedule builder").
- Sub-leaders: sidebar shows own-team volunteers only; can interact only with their team's cells.

---

### Day-Based Events (new)

**Original**: Assumed hourly slot rows only.
**Added**: For day-based events (e.g., multi-day retreats where slots are full days), slot rows display "Day 1", "Day 2", "Day N" labels instead of time ranges. Leader does not enter time pickers for day-based slots.

---

### Volunteer Name Format (new)

**Original**: No format specified.
**Decision**: First name + last initial throughout the builder (sidebar, cells, picker, suggestions).
- **Why**: Common first names (e.g., "João") are ambiguous in a large ministry. Last initial disambiguates without overflowing cell layout.

---

### Manual Refresh (new)

**Original**: Not addressed.
**Added**: A refresh button in the builder header pulls fresh availability and conflict state for all volunteers without a full page reload. Required because real-time availability updates are deferred to post-MVP (BACKLOG.md, BL-001).

---

### Deferred to Backlog

See [BACKLOG.md](../BACKLOG.md) for full context on each item:

- **BL-001**: Real-time builder updates when volunteer availability changes after assignment.
- **BL-002**: Schedule duplication from past events.
- **BL-003**: Per-event volunteer exclusion by leader (mark a volunteer as excluded from a specific event without removing them from the ministry).

---

### Decisions That Did NOT Change from Original

- Drag-and-drop assignment — confirmed.
- Orange (double-booked) / Red (unavailable) conflict highlighting — confirmed.
- Auto-save with indicator — confirmed.
- Hard Enforcement blocks Publish — confirmed.
- Deep linking to specific events — confirmed.
- shadcn/ui only for all components — confirmed.
