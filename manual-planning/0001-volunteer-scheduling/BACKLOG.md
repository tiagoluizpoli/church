# Volunteer Scheduling — Feature Backlog

This file tracks features and improvements that were explicitly identified and understood during the specification and grilling process, but were **deferred from the MVP** due to scope, complexity, or missing infrastructure.

Each item here is **not forgotten** — it is a deliberate deferral with full context captured so the next agent or developer can pick it up and implement it with complete understanding of the requirement, the reason it was deferred, and the conditions under which it should be built.

---

## Summary Table

| ID     | Title                                          | Category        | Status    |
|--------|------------------------------------------------|-----------------|-----------|
| BL-001 | Real-time builder updates on availability change | Schedule Builder | Backlog (transport note stale — see reconciliation) |
| BL-002 | Schedule duplication from past events          | Schedule Builder | **Review — largely superseded by 017 templates/cycles** |
| BL-003 | Per-event volunteer exclusion by leader        | Schedule Builder | Backlog (re-map to 017 entities) |
| BL-004 | Separate "Now Serving" section for in-progress assignments | Volunteer Dashboard | Backlog |
| BL-005 | Configurable cooldown for repeated availability reminders | Volunteer Dashboard | Backlog (re-scope event → cycle) |
| BL-006 | Team-aware assignment attribution in Ministry Schedule view | Volunteer Dashboard | **Likely obsolete — resolved natively by 017** |
| BL-007 | Volunteer-authenticated E2E specs for the volunteer dashboard | Volunteer Dashboard | Backlog (re-point to 017) |
| BL-008 | `MinistryServingProfile` authoring UX polish   | Scheduling Reshape (017) | Backlog |
| BL-009 | Free-standing role-count presets (ex-`RoleTemplate`) | Scheduling Reshape (017) | Backlog |
| BL-010 | Per-ministry `Shift` model refinements         | Scheduling Reshape (017) | Backlog |

---

## Reconciliation against the 017 Architecture Reshape (2026-07-02)

The 017 reshape (grilled 2026-07-02; see `CONTEXT.md` + `docs/adr/0001`, `docs/adr/0002`) changes the domain enough that several existing items need re-evaluation. Summary of impact — **do not action blindly; each carries a note below:**

- **BL-001** — Still valid. The tRPC transport premise is stale: 016 replaced tRPC with Fastify, so the SSE/WebSocket upgrade path now sits on Fastify. Concept (live conflict-badge refresh) survives; the "current event's volunteers" scope becomes "current participation's shifts".
- **BL-002** — **Largely superseded.** The recurring-event problem it solved is now handled by `EventTemplate` + `PlanningCycle` + `MinistryServingProfile`. Residual value only for copying *dynamic* multi-day events (e.g. "Annual Retreat 2025 → 2026"), which are not template-generated. Re-scope to "duplicate a dynamic Event" or close.
- **BL-003** — Still valid; "event" maps to a `MinistryParticipation`, exclusion hides a volunteer from that participation's pool/suggestions. Re-map entity names.
- **BL-004** — Unaffected. Pure volunteer-dashboard UX; carries forward.
- **BL-005** — Still valid but **re-scope**: reminders are now per `PlanningCycle`, and "resend" is a first-class leader action (Q11). Cooldown key becomes `(volunteer, cycle)`, gating the resend.
- **BL-006** — **Likely obsolete.** The `slotId + roleId` ambiguity came from assignments not carrying team. In 017, `Assignment` scopes to a `MinistryParticipation` and attaches to a `Shift`, and requirements carry `Role + Team` under that participation — so team attribution is native. Expect the `claimedAssignmentIds` workaround and this item to disappear when 017 lands. Verify during 017, then close.
- **BL-007** — Still valid as a testing requirement, but the volunteer dashboard is rebuilt in 017; re-point the specs at the 017 dashboard and its `VOLUNTEER_STORAGE_STATE`.

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

---

### BL-006 — Team-aware assignment attribution in Ministry Schedule view

**Status**: Backlog

**Feature area**: Volunteer Dashboard (Spec F2 / `specs/014-volunteer-dashboard`)

**Summary**: The Ministry Schedule view currently matches assignments to slot-requirement rows using only `slotId + roleId`. When the same role appears in the same slot under multiple team-scoped requirements, assignments can be attributed to the wrong team row. A defensive partial fix (claim-tracking) was applied in 014, but full correctness requires `teamId` on the assignment record.

**Full Context**:

Slot requirements in the Schedule Builder can be scoped to a specific `teamId`. This produces row seeds like:

- Slot S, Role=Usher, Team=TeamA
- Slot S, Role=Usher, Team=TeamB

The `Assignment` entity and DB table have no `teamId` column. When listing assignments for a slot, the system cannot determine which team's requirement an assignment satisfies. The matching filter `slotId + roleId` matches the same assignment against all team-scoped rows for that role, causing:

1. The same volunteer to appear in multiple team rows (duplicate display).
2. The "open" slot indicator to be incorrectly suppressed for teams that have no assignment.

**Partial fix applied in 014**: A `claimedAssignmentIds` set now prevents the same assignment from being rendered in more than one row. This eliminates duplicates and restores the "open" indicator for unmatched rows, but does not guarantee the assignment appears under the correct team's row.

**What full correctness requires**:

1. A `team_id` column on the `assignment` DB table (nullable, references `team`).
2. The `Assignment` domain entity must expose `teamId?: TeamId`.
3. Assignment creation (Schedule Builder) must record which team's requirement the assignment fulfills at write time.
4. The Ministry Schedule matching filter must include `assignment.teamId === seed.teamId` (or both null).

**Why deferred**:

- Requires a DB migration and changes to the assignment creation flow.
- The partial fix eliminates the worst UX failures (duplicates, suppressed "open" rows).
- Team-scoped requirements are an advanced scheduling pattern; most ministries use a single team or no team scoping.

**Prerequisites for implementation**:

1. DB migration: add nullable `team_id` FK on `assignment`.
2. Update `AssignmentProps`, `Assignment` entity, and Drizzle mapper.
3. Update `createAssignment` router to pass `teamId` when assigning to a team-scoped requirement.
4. Update `listMinistrySchedule` matching filter to include `teamId`.
5. Remove the `claimedAssignmentIds` workaround once true team-aware matching is in place.

---

### BL-007 — Volunteer-authenticated E2E specs for the volunteer dashboard

**Status**: Backlog

**Feature area**: Volunteer Dashboard (Spec F2 / `specs/014-volunteer-dashboard`)

**Summary**: All volunteer dashboard Playwright specs in `apps/web/tests/volunteer-dashboard/` currently authenticate as a leader (`LEADER_STORAGE_STATE`). They cover the correct UI flows but do not validate that a true volunteer session (without leader permissions) can access and interact with the dashboard. This is a test coverage gap, not a product bug.

**Full Context**:

The volunteer dashboard is a volunteer-facing feature. A volunteer user has a different session context than a leader. Using `LEADER_STORAGE_STATE` in all E2E specs means:

- The specs confirm the UI renders correctly for an authenticated user.
- They do NOT confirm that the backend correctly scopes data to the volunteer's own assignments, availability, and notifications when the caller lacks leader permissions.
- Edge cases around RBAC enforcement at the volunteer level are not exercised by the E2E layer.

**Affected files**:

- `apps/web/tests/volunteer-dashboard/us1-availability.spec.ts`
- `apps/web/tests/volunteer-dashboard/us2-assignments.spec.ts`
- `apps/web/tests/volunteer-dashboard/us3-notifications.spec.ts`
- `apps/web/tests/volunteer-dashboard/us4-ministry-schedule.spec.ts`
- `apps/web/tests/volunteer-dashboard/us5-offline.spec.ts`

**What needs to change**:

1. Add a `VOLUNTEER_STORAGE_STATE` auth fixture to `apps/server/src/test-support/e2e-seed.ts` (seed a user who is a ministry member but not a leader).
2. Create the storage state via Playwright's `storageState` utility for that volunteer user.
3. Replace `LEADER_STORAGE_STATE` with `VOLUNTEER_STORAGE_STATE` in the volunteer dashboard specs.
4. Verify that each spec still passes — confirming the backend correctly serves the volunteer's own data.

**Why deferred**:

- Requires E2E seed changes and a second Playwright auth setup, which adds test infrastructure complexity.
- The integration tests (server-side) already validate data scoping with `createCaller(SEED.userAlice)` at the unit level.
- The leader-authenticated E2E specs still exercise the correct UI flows and catch regressions in rendering and interaction.

---

### BL-008 — `MinistryServingProfile` authoring UX polish

**Status**: Backlog

**Feature area**: Scheduling Reshape (Spec 017 / architecture reshape grilled 2026-07-02)

**Summary**: The first cut of `MinistryServingProfile` (the ministry's standing "template extension" over the admin's `EventTemplate`s) ships with a functional but minimal authoring surface. Richer authoring — bulk edit, per-Team defaults, previewing what a profile will seed before a cycle is generated — is deferred.

**Full Context**:

Grilled 2026-07-02 (question "A"). Decided:

- `MinistryServingProfile` records, per admin `TimeBlock`: whether the ministry serves it, how it splits it into `Shift`s, and per-`Shift` headcount (per Role/Team).
- On cycle generation it seeds inclusions + shifts + `SlotRequirement`s into each `MinistryParticipation`; the leader confirms/tweaks.
- The MVP authoring UI is "a matrix of template blocks with a serve toggle + counts". That is enough to prove the flow.

**Deferred polish**:

- Preview: "if I apply this profile to next month, here's exactly what gets seeded."
- Bulk operations across multiple templates/blocks at once.
- Per-Team split presets within a block.
- Copying one ministry's profile as a starting point for another.

**Why deferred**: The user explicitly flagged (question "A") that the `Shift`/profile model is "close enough for now, improvements later." Core seeding is the MVP; authoring ergonomics are refinement.

**Prerequisites**: `EventTemplate`, `TimeBlock`, `MinistryServingProfile`, `MinistryParticipation`, and `Shift` shipped in 017.

---

### BL-009 — Free-standing role-count presets (the dropped `RoleTemplate`)

**Status**: Backlog

**Feature area**: Scheduling Reshape (Spec 017 / architecture reshape grilled 2026-07-02)

**Summary**: The legacy `RoleTemplate`/`RoleTemplateItem` concept (a reusable named `(role → count)` bundle) is **removed for the 017 MVP**. If the need for count presets *independent of any recurring template block* proves real, re-introduce it.

**Full Context**:

Grilled 2026-07-02 (question "B"). Decided to delete `RoleTemplate` because:

- Recurring events get their counts from `MinistryServingProfile`.
- Dynamic events get counts by copying from an existing serving-profile block or manual entry.
- A separate free-standing preset library is extra complexity the MVP does not need.

**When to revisit**: If leaders repeatedly want a named count bundle that is *not* tied to a Sunday/Wednesday block — e.g. a "Standard Nursery = Teacher×1, Helper×4" they stamp onto arbitrary dynamic events — bring it back as a small `SlotRequirement` preset that can be applied to any `Shift`.

**Why deferred**: User: "for the MVP it's too much... remove it, if we do need it we add it in the future."

**Prerequisites**: Evidence from real leader usage that copy-from-profile is insufficient for dynamic events.

---

### BL-010 — Per-ministry `Shift` model refinements

**Status**: Backlog

**Feature area**: Scheduling Reshape (Spec 017 / architecture reshape grilled 2026-07-02)

**Summary**: The **core** `Shift` model ships in the 017 MVP (see below). Only two *convenience* refinements are deferred here.

**In the 017 MVP (NOT deferred — clarified 2026-07-02):**

- `TimeSlot` is church-level (shared, opt-in/out); `Shift` is the per-`MinistryParticipation` subdivision that carries `SlotRequirement`s, `Assignment`s, and `Availability` marks.
- Default is one `Shift` = the whole `TimeSlot`.
- **Bounds invariant**: a `Shift` must lie entirely within its parent `TimeSlot`; the creation form blocks start/end outside the slot.
- **Creation by count**: divide the slot's span into N equal parts.
- **Creation manually**: set shift times by hand, unequal parts allowed.

**Deferred refinements (this item):**

- Shared/reusable shift layouts across events (save a split, restamp it) — no templating of shifts in MVP.
- Cross-ministry visibility of how others split the same `TimeSlot` (coordination).

**Open 017 design question (resolve while speccing 017, not deferred past MVP):**

- The **manual-shift creation UX** — timeline drag-and-drop, a fine-granularity (e.g. 5-min) picker, etc. The UI will shape the underlying representation, so grill it during the 017 spec. Left unlocked deliberately.

**Rejected (not deferred — do not build):**

- Volunteer availability spanning *partial* `Shift`s. By design the availability atom **is** the whole `Shift` (Q7). A finer grain contradicts a locked decision.

**Prerequisites**: `TimeSlot` + `Shift` shipped in 017; real usage revealing which convenience refinement matters first.
