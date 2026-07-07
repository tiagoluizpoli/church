# Feature Specification: Church-wide UX/IA Redesign

**Feature Branch**: `018-churchwide-ux-redesign`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "BL-014 — Church-wide UX/IA redesign: navigation, dashboard, notifications, scheduling flow. Grilled to a shared design decision set (see `.plan/grilling/2026-07-06-bl014-churchwide-ux-redesign.md`) covering: role-scoped primary navigation; removal of dead nav links and leftover template scaffolding; a single top-bar notification bell replacing the dashboard-embedded inbox; a tabbed volunteer dashboard replacing an undifferentiated vertical stack; a guided step-sequence for the planning-cycle screen replacing an always-visible 4-card grid; a single canonical create-event UI; and role-badge disambiguation for Leader/Sub-leader identity in the schedule builder. Visual/theme redesign has been completed as a follow-up pass using the Impeccable tool."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Role-appropriate navigation (Priority: P1)

A Volunteer opens the app and sees only the navigation items relevant to them (Dashboard, Availability). A Leader, Sub-leader, or ChurchAdmin additionally sees Scheduling. No nav item ever points at a page that doesn't exist.

**Why this priority**: This is the foundational IA decision every other screen change depends on, and it directly removes the most visible symptom of the current redesign complaint (dead links, leftover template scaffolding on the homepage) for the least technical audience the product serves.

**Independent Test**: Log in as a plain Volunteer and confirm the nav shows exactly Dashboard + Availability with no dead links; log in as a Leader/Sub-leader/Admin and confirm Scheduling additionally appears. Can be verified without any other redesign work landing first.

**Acceptance Scenarios**:

1. **Given** a user with only the Volunteer role, **When** they view the primary navigation (desktop sidebar or mobile nav), **Then** they see only Dashboard and Availability — no Scheduling, Shifts, Profile, Alerts, or Todos entries.
2. **Given** a user with a Leader or Sub-leader role, **When** they view the primary navigation, **Then** they additionally see Scheduling.
3. **Given** any user, **When** they open the app's home screen, **Then** they see a real landing surface — no leftover template banner and no duplicate builder-events list that belongs to Scheduling.

---

### User Story 2 - Single notification center (Priority: P2)

Any user sees one notification bell in the top bar (present on both desktop and mobile) showing an unread count. Opening it shows the most recent notifications, unread-first, each linking to its relevant context. A "View all" action opens a full notification history.

**Why this priority**: Directly resolves the backlog's "two disconnected surfaces with no single source of truth" complaint, and is independently valuable/testable once the nav exists to host it.

**Independent Test**: Trigger a notification (e.g., an availability reminder), confirm it appears in the bell's dropdown with an unread indicator, confirm clicking it opens the correct context, and confirm it no longer also appears anywhere on the dashboard.

**Acceptance Scenarios**:

1. **Given** a user with unread notifications, **When** they view the top bar, **Then** they see a bell icon with an unread count.
2. **Given** the bell dropdown is open, **When** the user clicks a notification, **Then** they are taken to that notification's relevant context (availability, assignment, or ministry schedule) the same way today's notification detail view behaves.
3. **Given** the bell dropdown is open, **When** the user selects "View all", **Then** a full notification history page opens.
4. **Given** the volunteer dashboard, **When** a user views it, **Then** no notifications section is present there — the bell is the only notification surface.

---

### User Story 3 - Organized volunteer dashboard (Priority: P3)

A Volunteer's dashboard presents Upcoming Assignments, Availability Needed, and Ministry Schedule as distinct, switchable sections on one page — not one long undifferentiated stack.

**Why this priority**: Resolves the "everything on top of the other" complaint; depends on notifications having already moved to the bell (P2) so the dashboard's remaining scope is well-defined.

**Independent Test**: Open the dashboard and confirm the three remaining concerns are presented as separate, clearly labeled sections a user can switch between, with Upcoming Assignments shown by default and outstanding availability items visibly counted.

**Acceptance Scenarios**:

1. **Given** a Volunteer opens their dashboard, **When** the page loads, **Then** Upcoming Assignments is shown by default.
2. **Given** a Volunteer has outstanding availability checks, **When** they view the dashboard, **Then** a visible count/badge indicates this without requiring them to switch sections first.
3. **Given** a Volunteer switches to the Ministry Schedule section, **When** it is shown, **Then** it no longer competes for vertical space with the other two sections.

---

### User Story 4 - Guided scheduling/planning flow (Priority: P4)

An Admin/Leader working the planning-cycle screen sees only the step relevant to where their cycle currently is (create → apply template → review generated events → lock), instead of four always-visible cards. Creating an event anywhere in the product uses one consistent interface. The schedule builder never shows two different volunteers as visually identical.

**Why this priority**: Addresses the least navigable existing flow (per live walkthrough feedback: "weird... hard to follow even by the person who commissioned it"), plus two concrete consistency defects (duplicate create-event UI, Leader/Sub-leader name collision) confirmed during grilling. Lower priority than P1-P3 because it's scoped to the admin/leader audience, not the whole congregation.

**Independent Test**: Walk through creating a planning cycle from scratch and confirm only the relevant step is surfaced at each stage; confirm there is exactly one create-event interface reachable from anywhere in the product; confirm two volunteers with names that would otherwise truncate identically are shown with disambiguating role badges in the builder.

**Acceptance Scenarios**:

1. **Given** no planning cycle exists yet, **When** an Admin visits the planning screen, **Then** only cycle creation is presented as the active step.
2. **Given** a cycle has been created, **When** the Admin returns to the planning screen, **Then** template application and event review become the active steps, and the cycle list moves to a secondary/history position.
3. **Given** an Admin or Leader wants to create an event from any entry point in the product, **When** they do so, **Then** they use the same single create-event interface every time.
4. **Given** two volunteers whose names truncate identically in the schedule builder's assignee list, **When** their roles differ (e.g., one is a Leader, the other a Sub-leader), **Then** the builder shows a role badge that disambiguates them regardless of name truncation.

---

### Edge Cases

- What happens when a user holds both a Volunteer role and a Leader/Sub-leader role (dual capacity)? Navigation MUST reflect the union of what each held role is entitled to see (i.e., they see Scheduling in addition to the Volunteer nav items), not just the Volunteer view.
- How does the planning-cycle step sequence behave when a cycle is locked? The relevant "current step" for a locked cycle is a read-only review state, not an editable step.
- What happens to a notification whose deep-linked target no longer exists or has changed (e.g., an assignment was cancelled after the notification was sent)? The system falls back to the nearest still-valid context, consistent with existing deep-link fallback behavior.
- What happens on the homepage once the leftover template scaffolding and duplicate events list are removed — is the homepage empty? No: it becomes a genuine landing surface appropriate to the caller's role, not a blank page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST show a Volunteer-scoped navigation set (Dashboard, Availability) to users whose only role is Volunteer.
- **FR-002**: System MUST additionally show a Scheduling navigation entry to users holding a Leader, Sub-leader, or ChurchAdmin role.
- **FR-003**: System MUST remove all navigation entries and routes that have no real, built destination (current examples: Shifts, Profile, and the Todos stub).
- **FR-004**: The homepage MUST NOT render leftover template/starter scaffolding (e.g., a default splash banner) and MUST NOT duplicate the Scheduling area's events list.
- **FR-005**: System MUST present exactly one notification control (a bell icon) in the top bar, visible on both desktop and mobile layouts, showing an unread-notification count.
- **FR-006**: The notification bell control MUST open a view listing the most recent notifications, unread-first, each capable of navigating the user to its relevant context (availability, assignment, or ministry schedule).
- **FR-007**: System MUST provide a full notification history accessible from the bell's dropdown (a "view all" action).
- **FR-008**: The volunteer dashboard MUST NOT present a notifications section; notifications are reachable only via the bell.
- **FR-009**: The volunteer dashboard MUST present Upcoming Assignments, Availability Needed, and Ministry Schedule as distinct, independently viewable sections on a single route, defaulting to Upcoming Assignments.
- **FR-010**: The Availability Needed section MUST expose a count of outstanding items visible without navigating into that section.
- **FR-011**: The planning-cycle screen MUST show only the step(s) relevant to the current cycle's state (no active cycle → creation only; cycle selected → template/review steps), rather than all steps simultaneously.
- **FR-012**: System MUST provide a single canonical create-event interface used consistently everywhere an event can be created, replacing any duplicate creation forms.
- **FR-013**: The schedule builder's volunteer/assignee list MUST visually disambiguate Leader vs. Sub-leader identity (e.g., a role badge) independent of name-string truncation.
- **FR-014**: The redesigned navigation, dashboard, notification, and scheduling flows MUST continue to support every user flow already documented in `specs/017-scheduling-reshape/spec.md` and its `test-plan.md` (DL2/DL3/DL4 scenarios) — no existing covered scenario may be silently dropped.

*No [NEEDS CLARIFICATION] markers: this feature was fully resolved through a dedicated grilling session (`.plan/grilling/2026-07-06-bl014-churchwide-ux-redesign.md`) before this spec was written; open questions were resolved there rather than deferred here.*

### Key Entities

This feature introduces no new domain entities. It restructures navigation and presentation around the existing scheduling domain model documented in `CONTEXT.md` (`Volunteer`, `Ministry` `leader`/`sub_leader` roles, `ChurchAdmin`, `PlanningCycle`, `EventTemplate`, `Event`, `MinistryParticipation`, `VolunteerNotification`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero navigation entries lead to a non-existent page, verified across every role (Volunteer, Leader, Sub-leader, ChurchAdmin).
- **SC-002**: A user can discover and act on a new notification using only the top-bar bell, without first visiting the dashboard.
- **SC-003**: Given any planning cycle state, an Admin/Leader can identify the single next action to take on the planning screen without cross-referencing four simultaneously visible cards.
- **SC-004**: Exactly one create-event interface exists in the product, confirmed by inspecting every entry point that can create an event.
- **SC-005**: No two volunteers with different roles are visually indistinguishable in the schedule builder's assignee list.
- **SC-006**: 100% of the DL2/DL3/DL4 scenarios in `specs/017-scheduling-reshape/test-plan.md` continue to pass after this redesign is implemented.

## Assumptions

- Visual/theme design (color, radius, spacing, typography) has been completed and integrated using the Impeccable tool, with specifications documented in [apps/web/DESIGN.md](../../apps/web/DESIGN.md) and implemented in `apps/web/src/index.css`.
- Two correctness bugs surfaced alongside this redesign work (a builder Publish-button state bug and a reassign dialog requiring raw volunteer IDs) are tracked and fixed independently of this feature; they do not block or gate this spec.
- Role-based navigation gating reuses the existing server-side role model (`leader` / `sub_leader` / `volunteer` / `admin`) — no new permission model is introduced.
- "Shifts" and "Profile" as real, built destinations are out of scope here; their nav entries are removed entirely, pending a separate future product decision if either is ever built.
- A user may hold more than one role concurrently (e.g., Volunteer and Sub-leader); navigation reflects the union of all held roles' entitlements.
- FR-004 only constrains what the homepage must **not** show (no leftover scaffolding, no duplicate events list). What positive content replaces it is deliberately left to implementation discretion — a design choice, not a hard requirement this spec pins down.
- Completing notification history pagination (FR-007) touches a small, additive piece of the existing `/api/v1/volunteer/notifications` endpoint (query params + response field), not a new endpoint — the domain/manager layer already supports cursor-based pagination end-to-end; only the HTTP route and generated client need to expose it. See `research.md` R3.
