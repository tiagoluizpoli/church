# Volunteer Scheduling — Feature Backlog

This file tracks features and improvements that were explicitly identified and understood during the specification and grilling process, but were **deferred from the MVP** due to scope, complexity, or missing infrastructure.

Each item here is **not forgotten** — it is a deliberate deferral with full context captured so the next agent or developer can pick it up and implement it with complete understanding of the requirement, the reason it was deferred, and the conditions under which it should be built.

---

## Summary Table

| ID     | Title                                          | Category        | Status    |
|--------|------------------------------------------------|-----------------|-----------|
| BL-001 | Real-time builder updates on availability change | Schedule Builder | Backlog |
| BL-002 | Schedule duplication from past events          | Schedule Builder | Backlog |
| BL-003 | Per-event volunteer exclusion by leader        | Schedule Builder | Backlog |
| BL-004 | Separate "Now Serving" section for in-progress assignments | Volunteer Dashboard | Backlog |
| BL-005 | Configurable cooldown for repeated availability reminders | Volunteer Dashboard | Backlog |

---

## Detailed Items

---

### BL-001 — Real-time builder updates when volunteer availability changes

**Status**: Backlog

**Feature area**: Schedule Builder (Spec F1 / `specs/013-schedule-builder`)

**Summary**: When a volunteer updates their availability (e.g., marks themselves unavailable for a time slot) *after* they have already been assigned by a leader in the Schedule Builder, the builder should detect this change and update the affected cell's conflict badge in real-time — without requiring the leader to close and reopen the builder.

**Full Context**:

During the grilling session for Spec F1, the following was confirmed:

- Assigned cells display a conflict badge (name + color indicator) reflecting the volunteer's availability state at the time of the last load (Q20, Q40).
- In the MVP, conflict state is recalculated only when the builder is opened or refreshed. If a volunteer's availability changes mid-session while the leader has the builder open, the leader will not see the updated conflict state until they reload.
- This is acceptable for MVP because the system uses standard HTTP (tRPC) with no WebSocket or Server-Sent Events (SSE) infrastructure. Adding real-time push requires a significant architectural addition.

**What "real-time" means here**:
- The leader has the builder open in their browser.
- A volunteer submits or updates their availability for the current event's time range.
- The builder detects this update (via WebSocket, SSE, or polling) and immediately re-renders the affected assignment cell with the correct conflict badge — no page reload required.

**Why deferred**:
- The finalized planning decision explicitly states "No WebSockets, standard HTTP (tRPC), simple and robust data flow."
- Real-time push requires either WebSockets, SSE, or aggressive short-interval polling — all of which add infrastructure complexity outside MVP scope.

**Prerequisites for implementation**:
1. A real-time transport layer must be available (WebSocket server or SSE endpoint on the Fastify backend).
2. The frontend must subscribe to availability-change events scoped to the current event's volunteers.
3. On receiving a change event, the client must re-run the conflict check for the affected assignment and update the cell badge.

**Suggested approach when implementing**:
- Use SSE (Server-Sent Events) as the simplest upgrade path from standard HTTP — no full WebSocket handshake required, works over existing HTTP infrastructure, and is well-supported by Fastify via `@fastify/sse` or native Node.js streams.
- Subscribe only to the volunteers present in the current event (scoped subscription), not a global availability change feed.
- Re-use the existing Availability Engine (Spec L1) and Conflict Validation Service (Spec L2) — the real-time layer just triggers a re-evaluation of already-computed logic.

**Impact if left unimplemented**:
- Leaders who keep the builder open for extended sessions may act on stale availability data.
- Mitigation: the auto-save + reload cycle (closing and reopening the builder) always reflects fresh state. Leaders can be informed of this via a tooltip or help text in the builder.

---

### BL-002 — Schedule duplication from past events

**Status**: Backlog

**Feature area**: Schedule Builder (Spec F1 / `specs/013-schedule-builder`)

**Summary**: When creating a new event, a leader should be able to choose an existing past event as a template, inheriting its slot structure and role requirements (and optionally its volunteer assignments) as a starting point — rather than configuring everything from scratch.

**Full Context**:

During the grilling session for Spec F1, this was evaluated against role templates (Q22/BL decision) and deferred. The reasoning:

- Role templates (Q22) already solve the most common recurring case: same ministry, same roles, same slot structure. A template applies role requirements to all slots in one step.
- Schedule duplication is a superset of templates — it copies the entire event shape including slot times, labels, requirements, and optionally past assignments.
- The added value over templates is when the event has a unique or irregular structure that hasn't been saved as a template, or when the leader wants to pre-populate assignments from a previous edition of the same event (e.g., "Annual Retreat 2026" copied from "Annual Retreat 2025").

**What duplication should cover**:
- **Always copied**: Slot structure (time ranges, labels), role requirements per slot.
- **Optional, user-chosen at copy time**: Past volunteer assignments. The leader should be presented with a checkbox: "Also copy assignments from the original event?" with a warning that assignments may need revision (volunteers may have changed availability or left the ministry).

**What duplication must NOT copy**:
- Event title (leader enters a new one), date range (leader sets new dates), publish status (always starts as Draft), and notification history.

**Why deferred**:
- Role templates (Q22) cover the core recurring-event problem for MVP.
- Duplication with optional assignment copying introduces edge cases: volunteers may no longer be in the ministry, roles may have changed, date-based availability conflicts will differ. Handling these gracefully requires additional validation logic.
- Adding this after MVP is low-risk — it's a new creation flow that doesn't touch the builder canvas itself.

**Prerequisites for implementation**:
1. Role templates (Q22) must be shipped and in use — duplication is an evolution beyond templates, not a replacement.
2. The event creation modal (Q42) needs a "Copy from existing event" option that triggers a second step: event selector (list of past events in the same ministry).
3. The copy operation must re-resolve all volunteer assignments against current ministry membership (volunteers who left must be dropped; a warning must be shown listing dropped assignments).

**Suggested approach when implementing**:
- Add a "Copy from event" option in the new event creation modal (after leader enters title and date range).
- Fetch the selected past event's slots and requirements; apply them to the new event before redirecting to the builder.
- If "copy assignments" is checked: copy assignments but immediately run the full conflict + membership check and surface all warnings in the builder on load, not silently.
- Do not auto-publish; always open as Draft with warnings visible.

---

### BL-003 — Per-event volunteer exclusion by leader

**Status**: Backlog

**Feature area**: Schedule Builder (Spec F1 / `specs/013-schedule-builder`)

**Summary**: A ministry leader should be able to mark a specific volunteer as "excluded from this event" — hiding them from the volunteer pool and auto-suggestions for that event only — without removing them from the ministry.

**Full Context**:

During the grilling session for Spec F1, this was deferred from MVP. The reasoning:

- For MVP, the volunteer pool always shows all ministry members. Leaders simply ignore volunteers they don't want to assign.
- The normal path for a volunteer who can't participate is to submit their unavailability through the standard availability flow (marking themselves unavailable for the event's time range). The conflict detection system then surfaces them as unavailable in the pool.
- However, there are legitimate cases where a volunteer hasn't submitted their unavailability (e.g., they're abroad, they notified the leader verbally) and the leader wants to remove them from view to reduce noise and avoid accidentally assigning them.

**What exclusion should mean**:
- The excluded volunteer is hidden from the sidebar pool and removed from all auto-suggestions for this specific event only.
- Their assignments (if any exist before exclusion) should be flagged for review, not silently deleted.
- The exclusion is reversible — the leader can un-exclude the volunteer from the same event.
- Exclusion does NOT affect the volunteer's membership in the ministry, their availability records, or their pool visibility in any other event.

**What exclusion is NOT**:
- A substitute for proper availability submission by the volunteer.
- A permanent or ministry-level action.
- A way to remove someone from the ministry — that belongs in Ministry settings.

**Why deferred**:
- Introduces a new data entity: an event-volunteer exclusion record (event_id + volunteer_id + excluded_by + reason).
- Requires UI surface for managing exclusions (set, view, and reverse) within the builder sidebar.
- The problem it solves is adequately mitigated for MVP by the availability system — leaders can ask volunteers to submit unavailability, or simply skip over them in the pool.

**Prerequisites for implementation**:
1. A new `event_volunteer_exclusion` table or equivalent record in the data model.
2. A right-click or context menu action on volunteer cards in the sidebar: "Exclude from this event."
3. Excluded volunteers shown in a collapsed "Excluded" section at the bottom of the sidebar (not fully hidden, so the leader can reverse the exclusion).
4. Existing assignments from an excluded volunteer must surface a warning: "This volunteer is excluded from this event but has an active assignment."
5. RBAC: only leaders (and sub-leaders for their team) can exclude volunteers.

---

### BL-004 — Separate "Now Serving" section for in-progress assignments

**Status**: Backlog

**Feature area**: Volunteer Dashboard (Spec F2 / `manual-planning/0001-volunteer-scheduling/specifications/F2-volunteer-dashboard.md`)

**Summary**: The volunteer dashboard should eventually split currently active assignments out of `My Upcoming Assignments` into a dedicated `Now Serving` section, so volunteers can distinguish what is happening right now from what is merely upcoming.

**Full Context**:

During the grilling session for Spec F2, the following was decided for MVP:

- `My Upcoming Assignments` includes both future assignments and assignments that are currently in progress.
- An in-progress assignment remains visible until its `TimeSlot` ends.
- This was chosen because it keeps the dashboard useful during active service without introducing another top-level section in MVP.

However, a future refinement was explicitly identified:

- A separate `Now Serving` section would be a cleaner experience once the volunteer dashboard matures.
- This section would surface assignments whose `TimeSlot` has already started but not yet ended.
- `My Upcoming Assignments` would then become strictly future-facing, improving the semantic clarity of the dashboard.

**What this feature should mean**:

- `Now Serving` appears above or alongside `My Upcoming Assignments` when at least one assignment is currently active.
- Active assignments move out of the upcoming list and into `Now Serving` automatically based on the current time and the assignment's `TimeSlot`.
- If there are no active assignments, the `Now Serving` section is hidden.
- Response and visibility rules remain unchanged unless explicitly redesigned in a future spec.

**Why deferred**:

- The MVP already has a workable rule: keep in-progress assignments visible inside `My Upcoming Assignments`.
- Adding a dedicated `Now Serving` section increases dashboard complexity, layout decisions, and empty-state behavior.
- This is a UX refinement, not a blocker for the core volunteer scheduling workflow.

**Prerequisites for implementation**:
1. The volunteer dashboard route and component structure from Spec F2 must be in place.
2. The frontend must already distinguish `future`, `in_progress`, and `ended` assignment states from `TimeSlot` boundaries.
3. The dashboard information hierarchy must be revisited so `Now Serving`, `Availability needed`, and `My Upcoming Assignments` do not compete visually.

**Suggested approach when implementing**:
- Derive `Now Serving` from the same assignment dataset already used by `My Upcoming Assignments`; do not introduce a separate backend concept unless necessary.
- Keep the section conditional and lightweight in MVP+1: only show it when there is at least one active assignment.
- Preserve the existing `Event` grouping model where possible, so the feature feels like a refinement of the current dashboard rather than a parallel schedule view.

---

### BL-005 — Configurable cooldown for repeated availability reminders

**Status**: Backlog

**Feature area**: Volunteer Dashboard (Spec F2 / `manual-planning/0001-volunteer-scheduling/specifications/F2-volunteer-dashboard.md`)

**Summary**: Repeated availability reminders should eventually respect a configurable cooldown window, so leaders cannot spam the same volunteer too aggressively for the same Event while still preserving the intentionally noisy reminder model.

**Full Context**:

During the grilling session for Spec F2, the following was decided for MVP:

- Availability reminders are intentionally allowed to be noisier than most other dashboard signals.
- The same reminder need may appear in multiple prominent places in the volunteer experience.
- For MVP, the team is willing to rely on leader discretion rather than building a full anti-spam system immediately.

However, a further refinement was explicitly requested:

- The system should later support a configurable minimum gap between repeated reminders for the same volunteer and Event.
- The initial implementation can be driven by an environment variable or similar deployment-level configuration.
- In the future, this should move to a better long-term configuration surface if needed.

**What this feature should mean**:

- If a leader sends an availability reminder to a volunteer for a specific Event, the system records the send time.
- Additional reminders for the same volunteer and Event are blocked or deferred until the cooldown window has passed.
- The cooldown duration is configurable, rather than hard-coded.
- The cooldown does NOT prevent reminders for different Events or different volunteers.

**Why deferred**:

- MVP explicitly prioritizes shipping the reminder flow, even if it is somewhat noisy.
- Cooldown rules introduce extra product and infrastructure decisions: where the config lives, how leaders are informed, and whether blocked sends are hidden or explained.
- This is a safety refinement, not a prerequisite for the core volunteer scheduling workflow.

**Prerequisites for implementation**:
1. Reminder sends must be persisted with enough metadata to identify volunteer + Event + send timestamp.
2. The reminder-send path must consult a configurable cooldown value before delivering another reminder.
3. Leader-facing feedback must exist when a reminder is blocked or suppressed by cooldown.

**Suggested approach when implementing**:
- Start with a simple environment-variable-driven cooldown duration, since that was explicitly accepted as a near-term configuration source.
- Scope the cooldown to `(volunteerId, eventId)` so it does not unintentionally suppress unrelated reminders.
- Surface a concise leader-facing message such as `A reminder was already sent recently for this Event`.
- If the reminder system becomes more sophisticated later, migrate the cooldown from environment configuration to a proper application/admin configuration model.
