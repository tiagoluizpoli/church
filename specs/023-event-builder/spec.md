# Feature Specification: Event Builder (Cycle-Centric)

**Feature Branch**: `023-event-builder`

**Created**: 2026-07-14

**Status**: Draft

**Input**: Wayfinder map [Event Builder (cycle-centric) (#1)](https://github.com/tiagoluizpoli/church/issues/1) and its resolved decision tickets ([#2](https://github.com/tiagoluizpoli/church/issues/2), [#4](https://github.com/tiagoluizpoli/church/issues/4), [#5](https://github.com/tiagoluizpoli/church/issues/5), [#6](https://github.com/tiagoluizpoli/church/issues/6), [#7](https://github.com/tiagoluizpoli/church/issues/7), [#8](https://github.com/tiagoluizpoli/church/issues/8)).

## Overview

A ministry leader tailors a planning cycle (choosing which slots run, splitting shifts, setting headcounts), availability fires to volunteers, and then the leader must **staff every shift across the whole cycle**. Today that final step is broken: the surviving builder screen works one event at a time, is reached through a retired "Builder Events" entry, and forces the leader to hop between events with no cycle-wide picture of who still needs assigning or whether they are overloading the same few volunteers.

This feature replaces that with a single **cycle-centric Event Builder**: one canvas that shows every event, slot, and shift a ministry must staff for a whole cycle, lets the leader assign volunteers against the structure tailoring already locked in, ranks who to assign next, and publishes the finished roster for the entire cycle in one action. The builder never edits slots, shifts, or headcounts — that remains entirely the tailoring workspace's job.

## User Scenarios & Testing *(mandatory)*

> **Story independence note**: The stories below are ordered by delivered value, but they are **layers on one canvas**, not fully orthogonal features. Their *backend slices* (the batched read, the batched publish, the audit read, the derived gating field) are independently buildable and testable. Their *UI* mostly renders inside User Story 1's canvas, so US3/US5/US6 (and the publish UI of US2) build on US1 rather than standing wholly alone. The clean, independently-shippable MVP boundary is **US1 + US2** — staff a cycle, then publish it.

### User Story 1 - Staff a whole cycle in one canvas (Priority: P1)

A ministry leader, having finished tailoring a cycle and fired availability, opens the Event Builder for that ministry and cycle. They see every event in the cycle laid out with its included slots, shifts, and role requirements, and a running picture of how staffed each is. From a searchable list of eligible volunteers they assign people to shifts, reassign or swap when someone is already placed elsewhere, and remove assignments — all against the fixed structure tailoring produced, without ever leaving the cycle view.

**Why this priority**: This is the feature's core value and the reason the map exists — it is the only slice that turns a tailored cycle into a staffed one. Delivered alone it already replaces the orphaned per-participation builder and gives leaders a working whole-cycle assignment surface.

**Independent Test**: Open the builder for a ministry+cycle that has fired availability, assign volunteers to shifts across two or more events, reassign one, and confirm assignments persist as a draft across a reload — all within the single canvas, with no per-event navigation.

**Acceptance Scenarios**:

1. **Given** a cycle with availability fired for at least one event, **When** the leader opens the Event Builder for a ministry, **Then** every event's included slots, shifts, and role requirements for that ministry appear in one canvas with each shift's staffed-vs-required progress visible.
2. **Given** an unstaffed shift, **When** the leader selects an eligible volunteer and assigns them, **Then** the volunteer occupies a role on that shift and the shift's staffing progress updates immediately.
3. **Given** a volunteer already assigned to another shift, **When** the leader tries to assign them again, **Then** the leader is asked to explicitly choose "swap" (move them) or "assign to both", and the chosen outcome is applied.
4. **Given** draft assignments made across several events, **When** the leader reloads the builder, **Then** all draft assignments are still present.
5. **Given** the builder is open, **When** the leader searches the volunteer list by name, **Then** the list filters to matching eligible volunteers for the shift in focus.

---

### User Story 2 - Publish the whole cycle at once (Priority: P1)

Once the leader is satisfied with the draft, they publish the entire cycle in a single action. Every ministry participation in the cycle is published together. If some shifts are still short of their required headcount, the leader is warned and may confirm anyway rather than being hard-blocked.

**Why this priority**: Assignment has no user value until it can be committed. A single cycle-wide publish is the whole point of a cycle-centric builder — without it the leader would fall back to per-event publishing, defeating the feature.

**Independent Test**: With draft assignments across a cycle (some shifts below full), trigger Publish, observe the below-full confirmation, confirm, and verify every participation in the cycle moves to published in one operation.

**Acceptance Scenarios**:

1. **Given** a fully-staffed draft, **When** the leader publishes, **Then** every ministry participation in the cycle becomes published in one action.
2. **Given** a draft where one or more shifts are below required headcount, **When** the leader publishes, **Then** they are shown a below-full confirmation and can either confirm to publish anyway or cancel to keep editing.
3. **Given** a cycle that is already fully published, **When** the leader reopens the builder, **Then** they can still view assignments and reassign individual volunteers (publish is not a lock on further assignment).

---

### User Story 3 - Get ranked recommendations for who to assign (Priority: P2)

For each shift and role, the leader sees up to five plain-language recommendations of who to assign next, ordered so the fairest, most-available volunteer comes first. Volunteers whose availability is still pending are surfaced separately as "Needs response", and volunteers with a scheduling conflict are surfaced separately as conflict options requiring an explicit override reason. The top recommendation is highlighted with an explicit Accept action; nothing is ever auto-assigned.

**Why this priority**: Recommendations turn the canvas from a manual grid into an assistant, sharply cutting the leader's decision time and spreading load fairly. It is high value but the canvas is usable without it, so it ranks below the core assignment and publish slices.

**Independent Test**: For a shift with several eligible volunteers of differing availability and recent-assignment history, open its recommendations and verify the ordering, the "Needs response" and conflict groupings, and that accepting the top recommendation assigns exactly that volunteer.

**Acceptance Scenarios**:

1. **Given** a shift with eligible volunteers, **When** the leader views its recommendations, **Then** up to five safe candidates appear, ordered by longest time since their last active assignment, then fewest active assignments in the current cycle, with alphabetical tie-breaking.
2. **Given** a volunteer whose availability check for the exact shift is still pending, **When** recommendations render, **Then** that volunteer appears under "Needs response", not among safe candidates.
3. **Given** a volunteer with a shift-level unavailability mark or an overlapping assignment, **When** the leader chooses them, **Then** they appear under conflict options and assigning them requires capturing an override reason.
4. **Given** the leader accepts the highlighted top recommendation, **When** the action completes, **Then** exactly that volunteer is assigned and recommendations recalculate from the updated draft.
5. **Given** a volunteer already serving a non-overlapping shift on the same day, **When** recommendations render, **Then** they remain a safe candidate but rank lower with an inline workload explanation.

---

### User Story 4 - Reach the builder from the cycle list (Priority: P2)

From the ministry cycle list, each cycle row offers an **Assign** action that opens the Event Builder for that ministry and cycle. The action is available as soon as availability has fired for at least one event in the cycle; before any availability has fired it is disabled with an explanation. The legacy "Builder Events" entry and its per-event builder route are retired.

**Why this priority**: The builder needs a discoverable, correctly-gated door and the old broken doors must close, but the canvas can be reached and tested by direct navigation first, so this ranks below the canvas itself.

**Independent Test**: On a cycle row where availability has fired for at least one event, click **Assign** and land in the builder for that ministry+cycle; on a row where no availability has fired, confirm the action is disabled with the unlock explanation; confirm the retired "Builder Events" entries and per-event builder route no longer exist.

**Acceptance Scenarios**:

1. **Given** a cycle where availability has fired for at least one event, **When** the leader views its row, **Then** an enabled **Assign** action opens the Event Builder for that ministry and cycle.
2. **Given** a cycle where availability has not fired for any event, **When** the leader views its row, **Then** the **Assign** action is disabled and explains it "Unlocks once availability has fired for this cycle".
3. **Given** the retired legacy builder, **When** a user looks for the old "Builder Events" entry or navigates to the old per-event builder route, **Then** neither is reachable.

---

### User Story 5 - Review the assignment audit trail (Priority: P3)

While in the builder, the leader can open an audit panel showing who changed which assignment, when, and with what reason, across the whole cycle for the ministry, without a per-assignment lookup.

**Why this priority**: Accountability and troubleshooting matter but are secondary to producing the roster; the panel is opened on demand and does not block core work.

**Independent Test**: Make and override several assignments, open the audit panel, and verify a single cycle-wide list of actions with actor, action, timestamp, reason, and the affected volunteer's name.

**Acceptance Scenarios**:

1. **Given** assignment activity across a cycle, **When** the leader opens the audit panel, **Then** a single cycle-wide list of audit entries appears (actor, action, timestamp, reason where present), lazily loaded when the panel opens.
2. **Given** an audit entry, **When** it is displayed, **Then** the affected volunteer's name is shown by joining against assignments already loaded in the builder, with no per-entry name lookup.

---

### User Story 6 - Use the builder on a phone (Priority: P3)

A leader on a phone can view and operate the Event Builder as a genuinely responsive canvas — the board scrolls horizontally where needed and the volunteer list stacks below it — rather than being shown a "continue on desktop" interstitial.

**Why this priority**: Mobile parity is the stated bar for scheduling screens and the map deleted the old desktop-only interstitial, but a working desktop canvas delivers value first; true mobile responsiveness is a parity improvement layered on top.

**Independent Test**: Open the builder on a narrow viewport and confirm the leader can view events, assign a volunteer, and publish, with the board scrolling horizontally and the volunteer list stacked below — no blocking interstitial.

**Acceptance Scenarios**:

1. **Given** a narrow (phone) viewport, **When** the leader opens the builder, **Then** the full canvas is usable — no "continue on desktop" interstitial appears.
2. **Given** a narrow viewport, **When** content is wider than the screen, **Then** the event board scrolls horizontally and the volunteer list stacks below the board.

---

### Edge Cases

- **No availability fired at all**: the cycle cannot be entered — the **Assign** action is disabled; the canvas is never asked to render a cycle with nothing to assign.
- **Mixed states in one cycle**: a cycle may contain some participations still in rostering and some already published; the canvas shows all of them, and published participations render read-mostly (their assignments visible, no new eligible-volunteer suggestions offered for them).
- **Shift with zero assignments**: renders normally as an empty, fully-unstaffed shift — not a special or error state.
- **Volunteer eligible for multiple shifts across the cycle**: assigning them to one shift does not remove them from consideration elsewhere; a same-day non-overlapping second assignment is allowed but flagged as added workload.
- **Availability changes after a volunteer is already assigned**: not handled live in this feature (see Assumptions / Out of Scope) — recommendations refresh on the builder's periodic and focus-triggered revalidation, not via real-time push.
- **Publishing a cycle where every shift is empty**: allowed only via the below-full confirmation path; the leader is warned before committing an empty roster.
- **Reassigning after publish**: permitted — publish does not lock the cycle against further individual assignment changes.

## Requirements *(mandatory)*

### Functional Requirements

**Canvas scope & orientation**

- **FR-001**: The Event Builder MUST present, in a single canvas, every event in a planning cycle that a given ministry must staff, with each event's included slots, shifts, and role requirements.
- **FR-002**: The builder MUST show, for each shift, how many of its required roles are filled versus required, and provide a cycle-level orientation of overall staffing progress with the ability to filter by date.
- **FR-003**: The builder MUST operate on a whole cycle for one ministry at a time (ministry-first), not one event or one participation at a time.
- **FR-004**: The builder MUST load the cycle's structure and existing assignments in a single request rather than fetching per event or per shift.

**Assignment (pure, against locked structure)**

- **FR-005**: The builder MUST allow the leader to assign an eligible volunteer to a role on a shift, and to remove or reassign that volunteer.
- **FR-006**: The builder MUST NOT create, edit, or delete slots, shifts, or role headcounts; that structure is fixed by the tailoring workspace before the builder is entered.
- **FR-007**: When the leader assigns a volunteer who is already assigned elsewhere in the cycle, the builder MUST require an explicit choice between moving them (swap) and assigning them to both, rather than silently doing either.
- **FR-008**: The builder MUST provide a searchable list of eligible volunteers spanning the whole cycle, supporting click-to-select and drag-to-assign onto shifts.
- **FR-009**: Assignments made in the builder MUST persist as a draft and survive reloading the builder before publish.

**Recommendations, availability & conflicts**

- **FR-010**: For each shift and role, the builder MUST show up to five plain-language recommendations of eligible volunteers, never numeric scores, and MUST NOT auto-assign any of them.
- **FR-011**: Eligibility MUST be a hard filter: a recommended volunteer MUST belong to the ministry and be qualified for the role/team.
- **FR-012**: Availability MUST be evaluated for the exact shift from the volunteer's availability check and any shift-level unavailability mark; a confirmed check with no unavailability mark is "safe", and a pending check is treated as "no response", not as available.
- **FR-013**: Safe candidates MUST be ordered by longest time since their last active assignment, then fewest active assignments in the current cycle, with stable alphabetical tie-breaking.
- **FR-014**: A confirmed volunteer already serving a non-overlapping shift on the same day MUST remain a safe candidate but rank lower, with an inline explanation of the added workload.
- **FR-015**: Volunteers with a pending availability check MUST be surfaced separately as "Needs response", and volunteers with a shift-level unavailability mark or an overlapping assignment MUST be surfaced separately as conflict options.
- **FR-016**: Assigning a volunteer who is a conflict option MUST require capturing an override reason before the assignment is accepted.
- **FR-017**: Only active assignments (draft, pending, confirmed) MUST count toward fairness and workload; declined, cancelled, and otherwise inactive assignments MUST NOT count.
- **FR-018**: The default fairness scope MUST be the entire planning cycle, with a controlled option to temporarily scope fairness history to the current ministry only.
- **FR-019**: The top recommendation MUST be highlighted with an explicit Accept action, and accepting it MUST assign exactly that volunteer.
- **FR-020**: Recommendations MUST recalculate from the current draft after each assignment change, and MUST revalidate against fresh backend data after mutations, on window focus, and on a periodic refresh (roughly every 30 seconds) while the builder is open; real-time push updates are out of scope.

**Publish**

- **FR-021**: The builder MUST publish the entire cycle for the ministry in a single action that commits every ministry participation in the cycle together.
- **FR-022**: When any shift is below its required headcount, publish MUST warn the leader and allow confirming below full rather than hard-blocking; publish is not gated on full staffing.
- **FR-023**: Publishing MUST NOT prevent subsequent viewing or reassignment; a published cycle remains openable and individually editable in the builder.

**Entry point & gating**

- **FR-024**: Each cycle row in the ministry cycle list MUST offer an **Assign** action that opens the Event Builder for that ministry and cycle.
- **FR-025**: The **Assign** action MUST be enabled as soon as availability has fired for at least one event in the cycle, and disabled otherwise; while disabled it MUST explain that it "Unlocks once availability has fired for this cycle".
- **FR-026**: The **Assign** action MUST remain enabled for cycles that are fully published.

**Legacy retirement**

- **FR-027**: The legacy "Builder Events" entry point(s), the legacy event-scoped builder route, and the orphaned per-participation builder route MUST be retired so they are no longer reachable.
- **FR-028**: The legacy event-scoped builder data path MUST be replaced by the new cycle-wide builder; presentational parts of the old builder that are not tied to the per-event grid MAY be reused, while grid-structural parts are rebuilt for the cycle canvas. (Detailed reuse/rebuild/delete inventory: [Legacy builder retirement inventory (#5)](https://github.com/tiagoluizpoli/church/issues/5).)

**Audit trail**

- **FR-029**: The builder MUST provide an on-demand audit panel showing, for the whole cycle and ministry, each assignment change with its actor, action, timestamp, and reason where present, loaded in a single cycle-wide read rather than per assignment.
- **FR-030**: The audit panel MUST show the affected volunteer's name by joining against assignments already loaded in the builder, without a per-entry name lookup, and MUST load lazily when opened.

**Responsive / mobile parity**

- **FR-031**: The builder MUST be usable on phone-sized viewports (≤430px wide) for viewing, assigning, and publishing, with no blocking "continue on desktop" interstitial; its responsive layout behavior is specified measurably in FR-032.
- **FR-032**: On narrow viewports, the event board MUST scroll horizontally where wider than the screen and the volunteer list MUST stack below the board.

### Key Entities *(include if feature involves data)*

- **Planning Cycle**: the period being staffed; the unit the builder and publish operate over.
- **Ministry**: the team being staffed; the builder handles one ministry per cycle.
- **Event**: a dated occasion within the cycle that a ministry participates in; grouped as a lane in the canvas.
- **Ministry Participation**: a ministry's involvement in one event; carries its state (rostering vs published) and whether availability has fired; the unit that batched publish commits.
- **Time Slot**: a time window within an event that may or may not be included by tailoring.
- **Shift**: a staffable block within an included slot, produced by tailoring's shift split.
- **Slot/Role Requirement**: how many of each role a shift needs; fixed by tailoring, read-only to the builder.
- **Assignment**: a volunteer placed in a role on a shift; carries a status (draft, pending, confirmed, declined, cancelled) that determines whether it counts toward fairness/workload.
- **Availability Check**: a volunteer's response to a fired availability request for a shift (confirmed / pending / unavailable), driving safe-vs-needs-response-vs-conflict grouping.
- **Assignment Audit**: a record of an assignment change (actor, action, timestamp, reason) surfaced cycle-wide in the audit panel.
- **Volunteer**: a person eligible to be assigned; appears in the searchable rail and recommendations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A leader can staff and publish a complete multi-event cycle without ever navigating to a single-event or single-participation screen (zero per-event page loads in the assignment flow).
- **SC-002**: Opening the builder for a tailored cycle presents the whole cycle's staffing picture from a single initial load (one request replaces the three loads the legacy flow required).
- **SC-003**: For any shift with eligible volunteers, the leader is offered a ranked shortlist of at most five candidates and can assign the recommended volunteer in a single Accept action.
- **SC-004**: A leader can publish an entire cycle — including one deliberately left below full — in one action, with a clear below-full warning, rather than publishing event by event.
- **SC-005**: Across a cycle, no eligible, available volunteer is repeatedly favoured over others: the default ordering surfaces the volunteer with the longest gap since their last active assignment first.
- **SC-006**: The builder is fully operable on a phone-sized viewport — a leader can view, assign, and publish — with no blocking interstitial.
- **SC-007**: The legacy "Builder Events" entry and per-event builder routes are unreachable after the cutover, with no dead links left in the cycle list.

## Assumptions

- The tailoring workspace (`022-tailoring-workspace`) has already run for the cycle: slot inclusion, shift splits, and role headcounts are locked before the builder is entered, and the builder treats that structure as read-only.
- The availability engine fires availability per event; "availability has fired for at least one event" is a derivable signal (the leader having committed assignable structure for ≥1 event) and is what gates entry — full-cycle availability is not required to enter.
- Recommendation ordering, eligibility, and conflict semantics reuse the existing availability and eligibility logic; this feature changes how candidates are grouped and ranked, not the underlying availability rules.
- Real-time updates to the builder when a volunteer's availability changes after assignment are out of scope and deferred to a later backlog item (`BL-001`); freshness comes from post-mutation, focus, and ~30-second periodic revalidation only.
- Permanent, configurable fairness scope is out of scope; the cycle-wide default plus a temporary ministry-only toggle is sufficient for this feature, with durable configuration deferred to a later backlog decision.
- A separate leader "response-health" reporting view is out of scope and tracked separately (`BL-019`).
- Role-template selection is not part of this flow (removed for MVP in a prior decision) and is not reintroduced.
- The builder assigns against existing structure only; it is the last step before publish in the leader flow (ministry → cycle → tailoring → availability → **builder** → publish).

## Out of Scope

- Editing slots, shifts, or role headcounts inside the builder — remains entirely in the tailoring workspace.
- Role-template / role-template selection step.
- Real-time (WebSocket/SSE) builder updates when availability changes after assignment (deferred to `BL-001`).
- Permanent, configurable fairness-scope settings (deferred to a later backlog decision).
- A standalone leader response-health reporting screen (tracked as `BL-019`).
