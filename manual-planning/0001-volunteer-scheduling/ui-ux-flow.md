# UI / UX Planning — Multi-Slot Scheduling

## Purpose

Define how leaders will:
- Create events
- Split time
- Define needs
- Assign volunteers

This is **interaction design**, not component code.

---

## Primary User

Ministry Leader

Goals:
- Build schedules quickly
- Avoid conflicts
- Maintain flexibility

---

## Core Workflow

### Step 1 — Create Event

User defines:
- Title
- Date
- Time range

---

### Step 2 — Define Time Structure

User chooses:

#### Option A — Manual Slots
- Adds time ranges manually

#### Option B — Automatic Split
- Defines slot duration

---

### Step 3 — Define Requirements

User assigns:
- Roles per slot
- Required count

---

### Step 4 — Assign Volunteers

User fills slots with volunteers.

---

### Step 5 — Review & Publish

User validates:
- Missing assignments
- Conflicts
- Overloads

---

## Key UX Components

### 1. Slot Visualization
Clear representation of time segmentation.

---

### 2. Assignment Interface
Should allow:
- Fast placement
- Easy replacement
- Clear visibility

---

### 3. Availability Feedback
System should visually indicate:
- Available
- Partially available
- Unavailable

---

## Decisions Made

1. **Slot Creation UX**: Both. Leaders can choose to auto-generate slots or manually create/edit them.
2. **Assignment Interaction**: Both. The UI will support both Drag-and-drop and Click-to-assign for flexibility.
3. **Conflict Handling UX**: Warn and allow override. The system will not hard-block leaders, but will clearly flag conflicts.
4. **Interface Style**: Spreadsheet-like for the MVP to allow fast, dense data manipulation. We can evolve to guided wizards later.
5. **Mobile Priority**: Desktop-first for the MVP's scheduling builder. A good mobile UX will be planned for the future, but building the schedule is primarily a desktop activity for now.
6. **Auto-Suggestions**: Yes. The system will suggest assignments to the leader to speed up the process.

---

## UX Principles

- Minimize friction
- Maximize clarity
- Avoid hidden constraints
- Make conflicts visible early
- **Strict Component Reusability**: Use standard `shadcn/ui` components exclusively. Do not reinvent UI patterns; if shadcn doesn't have it natively, find a community implementation instead of building from scratch.

---

## Risks

- Overly complex UI
- Hidden conflicts
- Slow interaction for large events

---

## Out of Scope (For Now)

- Notifications (Handled via Backend/PWA separately)
- Analytics
- Gamification

---

## 🔗 Technical Specifications (Implementation)

The concrete frontend architecture and component definitions that fulfill these UX goals are specified in:
- **[Spec F1: Schedule Builder (Desktop)](./specifications/F1-schedule-builder.md)**
- **[Spec F2: Volunteer Dashboard (Mobile/PWA)](./specifications/F2-volunteer-dashboard.md)**
- **[Spec F3: Onboarding & Invites](./specifications/F3-onboarding-ui.md)**

---

## Refinements — 2026-06-26

The following updates were made after the F1 grilling session. Original decisions are preserved above; these take precedence where they conflict.

### Updated: Workflow (Steps 1–5 now happen inside the builder)

**Original**: Steps 1–5 implied sequential pages or separate flows.
**Changed to**: Steps 1–5 all happen inside a single builder canvas. Step 1 (event creation) uses a lightweight quick-create modal (title, date range, ministry only) that immediately redirects the leader into the builder. Steps 2–5 happen without leaving.

### Updated: Slot Creation UX — "Both" now has a defined count-based mode

**Original decision #1**: "Both auto-generate and manual." 
**Refined**: Auto-generation now supports two distinct modes: (a) duration-based (specify minutes per slot) and (b) count-based (specify total number of slots). Both produce a preview before confirming. After generation, a role template step is offered.

### Updated: Availability Feedback — 4th Status Added

**Original**: Three statuses (Available, Partially available, Unavailable).
**Changed to**: Four statuses: Available (green), Partial (yellow), Unavailable (red), **No response (gray)**. Gray means the volunteer hasn't submitted availability yet — a different signal from "explicitly unavailable." Gray volunteers sort to the bottom of the sidebar.

### Updated: Mobile Priority — Interstitial with Escape Hatch

**Original decision #5**: "Desktop-first for MVP."
**Refined**: Mobile gets an interstitial warning page ("Use desktop for best experience") with a **"Continue anyway"** button. The full builder loads if the leader proceeds. This is not a hard block — leaders may legitimately need to make emergency changes from a mobile device in the field.

### New: Substitution Flow

When a volunteer declines a published assignment, the system activates a dedicated substitution mode when the leader clicks the declined cell. The picker pre-filters to available replacements and pins the declined volunteer at the top for context. This was not defined in the original UX planning.

### New: Builder Header — Full Action Set

The builder header is the command center. Refined to include:
- Primary actions: Publish, Send Reminder
- Overflow (⋯): Print/Export, View Audit Log
- Event metadata is read-only in the builder header; editing requires navigating to the Event Detail page.

### New: Post-Publish Editing Policy

Post-publish editing is **allowed for assignments** (add, swap, remove volunteers). Structural changes (add/remove slots, change role counts) are **blocked** until the event is returned to Draft. This was not addressed in the original UX planning.

### New: Conflict Detection Scope — Cross-Ministry

Conflict detection was assumed to be within-event only. It now checks across all events in all ministries the volunteer belongs to. A volunteer double-booked in two different ministries at the same time is flagged in both builders.

---

## Refinements — 2026-06-29 (Volunteer Dashboard / F2)

The following updates were made after the F2 grilling session. These apply to the volunteer-facing experience and should be treated as the current direction for Spec F2.

### New: Volunteer Dashboard is the canonical volunteer surface

- The volunteer experience is no longer a loose collection of isolated pages.
- `Availability`, `My Upcoming Assignments`, `Notifications Inbox`, and `Ministry Schedule` all belong under one volunteer dashboard.

### New: Availability follows event granularity

- Hourly Events use time-span availability input.
- Day-based Events use day-span availability input, matching retreat-style multi-day service realities rather than fake one-day slices.

### New: Dashboard has a task-first information hierarchy

- `Availability needed` is the highest-priority dashboard surface.
- `My Upcoming Assignments` is the primary service-visibility surface.
- `Notifications Inbox` is historical and supportive.
- `Ministry Schedule` is secondary, read-only, and selected one Ministry at a time.

### New: Offline mode is read-first, not write-first

- Volunteers can read cached dashboard data offline.
- Volunteer writes such as assignment responses and availability edits still require an online connection in MVP.
