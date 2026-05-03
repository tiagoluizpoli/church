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