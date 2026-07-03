# Feature Specification: Scheduling Reshape — Church-Owned Cycles, Templates & Shifts

**Feature Branch**: `017-scheduling-reshape`

**Created**: 2026-07-03

**Status**: Draft

**Input**: User description: "Re-center scheduling on church-owned Events planned in Planning Cycles, generated from Event Templates, tailored per ministry via Ministry Participation and Shifts, with per-participation availability checks and roster publishing."

> **Authoritative background** (already agreed, do not re-litigate): [`CONTEXT.md`](../../CONTEXT.md) (ubiquitous language), [`docs/adr/0001-church-owned-events-and-planning-cycles.md`](../../docs/adr/0001-church-owned-events-and-planning-cycles.md), [`docs/adr/0002-church-timeslots-ministry-shifts.md`](../../docs/adr/0002-church-timeslots-ministry-shifts.md), and [`manual-planning/0001-volunteer-scheduling/refinement-02-scheduling-reshape.md`](../../manual-planning/0001-volunteer-scheduling/refinement-02-scheduling-reshape.md).

## User Scenarios & Testing *(mandatory)*

The system serves three personas: a **Church Admin** who owns the church calendar, a **Ministry Leader** who staffs their ministry, and a **Volunteer** who serves. Scheduling flows top-down: the admin plans and locks a period, each ministry tailors its slice and gathers availability, then each ministry rosters and publishes independently.

### User Story 1 - Church Admin plans and locks a period (Priority: P1)

A Church Admin selects a target period (e.g. next month), applies reusable weekday templates to generate the recurring services automatically, adds any one-off or multi-day events by hand, reviews the whole calendar, and locks it so ministry leaders can begin their work. Until locked, the period is invisible to everyone but admins.

**Why this priority**: Nothing else can happen without a locked calendar of dates and times. This is the foundation the entire flow depends on, and on its own it replaces the most error-prone manual step (building the month's date grid by hand).

**Independent Test**: Create a period covering a calendar month, apply a "Sunday" template with three service blocks and a "Wednesday" template with one, add a three-day dynamic event, and confirm the correct Events and time slots are generated on exactly the right dates; lock the period and confirm it becomes visible to ministry leaders and remains hidden from volunteers.

**Acceptance Scenarios**:

1. **Given** an empty target period, **When** the admin applies a weekday template, **Then** one Event is created for every matching weekday date within the period, each carrying one time slot per template block.
2. **Given** a draft period, **When** the admin adds a multi-day event whose start date is inside the period but whose end date falls after it, **Then** the event belongs to this period (by its start date) and is allowed to extend beyond the period's end.
3. **Given** a draft period, **When** the admin locks it, **Then** its dates and times become read-only and visible to ministry leaders, and it is still hidden from volunteers.
4. **Given** two periods for the same church, **When** the admin tries to create a period whose date range overlaps an existing one, **Then** the system prevents it (gaps between periods are allowed; overlaps are not).
5. **Given** a locked period, **When** the admin adds a new event to it, **Then** the addition is allowed (append-only), but editing or removing an already-locked event requires an explicit reopen.

---

### User Story 2 - Ministry Leader tailors participation and requests availability (Priority: P2)

Against a locked period, a Ministry Leader sees the church calendar with their ministry's involvement pre-seeded from a standing profile. They confirm or adjust which time slots their ministry serves, split long slots into the shifts they actually staff, set how many people each shift needs per role, then fire availability requests to their volunteers.

**Why this priority**: This turns a shared calendar into a ministry-specific plan and is the prerequisite for gathering availability. It encodes the real-world fact that different ministries attend different services (e.g. kids do not serve the earliest Sunday block).

**Independent Test**: On a locked period, open a ministry with an all-out default and a serving profile covering two Sunday blocks; confirm those two are pre-included and the third is off; split one slot into two shifts; set headcounts; fire availability and confirm only the intended volunteers receive a request.

**Acceptance Scenarios**:

1. **Given** a locked period and a ministry with a standing serving profile, **When** the leader opens their participation, **Then** the slots matching the profile are pre-included (seeded), respecting the ministry's all-in/all-out default.
2. **Given** an included time slot, **When** the leader splits it into N equal shifts or sets shift times manually, **Then** each shift lies entirely within the parent time slot and unequal splits are permitted.
3. **Given** a shift, **When** the leader sets a required headcount per role (and team where applicable), **Then** those requirements belong to this ministry's participation and feed its completion tracking.
4. **Given** a tailored participation, **When** the leader fires availability, **Then** an availability request is created for each of that ministry's active memberships and those volunteers are notified once for the period.
5. **Given** a ministry with an all-in default, **When** a period is generated, **Then** every slot is pre-included and the leader opts out of the few not needed.

---

### User Story 3 - Volunteer declares availability and confirms (Priority: P2)

A Volunteer opens a simple list — one item per ministry or team they belong to — for the period. They are considered available by default; they only mark the specific shifts they cannot serve. Even with nothing marked, they must confirm, so the leader knows they have acknowledged. If they are available for overlapping shifts across two ministries, the system warns them.

**Why this priority**: Availability is the input the roster is built from. The "available by default, confirm to acknowledge" model removes the burden that made the spreadsheet flow unreliable.

**Independent Test**: As a volunteer in two ministries, open both availability items for a period, mark one shift unavailable, attempt to confirm while available for two overlapping shifts in different ministries, and verify the overlap warning behaves per the configured policy; confirm and verify the leader sees the acknowledgement.

**Acceptance Scenarios**:

1. **Given** a fired availability request, **When** the volunteer opens it, **Then** they are shown as available for all of the period's shifts by default.
2. **Given** an availability request, **When** the volunteer marks a shift (or a whole day) unavailable, **Then** only those shifts become unavailable and the rest remain available.
3. **Given** zero marks, **When** the volunteer confirms, **Then** the request moves from pending to confirmed with a timestamp and the leader can distinguish "acknowledged" from "not yet looked at".
4. **Given** a volunteer available for two overlapping shifts in different ministries on the same date, **When** overlap is disallowed by policy, **Then** confirmation is blocked until they drop one; **When** overlap is allowed by policy, **Then** confirmation succeeds and a conflict is flagged for the affected leaders.

---

### User Story 4 - Ministry Leader rosters and publishes (Priority: P3)

With availability arriving, a Ministry Leader fills each shift's required headcount from a list of eligible volunteers ordered to favour those available and those who have served least recently. A live completion percentage tracks progress. When ready — even if some slots remain unfilled — the leader publishes their ministry's roster, which becomes visible to that ministry's volunteers only.

**Why this priority**: This produces the actual schedule. It depends on availability (US3) and requirements (US2). Publishing per ministry lets ministries finish on their own timelines against the same shared events.

**Independent Test**: For a participation with confirmed availability, assign volunteers to shifts, observe completion percentage rise, leave one slot unfilled, publish with confirmation, and verify only this ministry's volunteers see their assignments and other ministries on the same event are unaffected.

**Acceptance Scenarios**:

1. **Given** a shift needing N volunteers, **When** the leader opens the assignment list, **Then** eligible volunteers are ranked by availability and by least-recent serving.
2. **Given** assignments in progress, **When** the leader assigns or removes a volunteer, **Then** the participation's completion percentage updates against total required headcount.
3. **Given** a volunteer already committed to an overlapping shift, **When** the leader assigns them, **Then** the system warns (soft) or blocks (hard) per the ministry's enforcement setting, with an audited override path.
4. **Given** an incomplete roster, **When** the leader chooses to publish, **Then** they are warned about unfilled slots and may proceed; publishing reveals this ministry's schedule to its volunteers and leaves unfilled slots open for later triage.
5. **Given** two ministries on the same event, **When** one publishes, **Then** only that ministry's slice goes live; the other keeps working.

---

### User Story 5 - Live execution and late changes (Priority: P4)

After a roster is published, a Volunteer who can no longer serve a shift they are assigned to cancels it from the app; their leader is notified immediately and the slot reopens for reassignment. Leaders retain the ability to adjust rosters mid-period.

**Why this priority**: Real life changes after publish. This keeps the schedule trustworthy without forcing a full re-plan, but it is only meaningful once rosters exist.

**Independent Test**: As a volunteer, cancel a published assignment; verify the leader is notified, the slot reopens, and the volunteer can only cancel shifts assigned to themselves.

**Acceptance Scenarios**:

1. **Given** a published assignment, **When** the assigned volunteer cancels it, **Then** the leader is notified promptly and the slot returns to needing coverage.
2. **Given** a published roster, **When** a volunteer views it, **Then** they can trigger a cancellation only on shifts assigned to their own user, not others'.
3. **Given** mid-period changes, **When** the leader reassigns or edits a shift's staffing, **Then** the roster reflects the change and affected volunteers are informed.

### Edge Cases

- **Period boundaries**: An event that starts at 23:00 on the last day of a period and runs past midnight belongs to that period (boundaries are evaluated by date only, in the church's timezone; the hour is ignored).
- **Straddling multi-day event**: A multi-day event is linked to the period of its start date and may leak into later dates, even into another period's calendar span, without belonging to two periods.
- **No serving profile**: A ministry with no standing profile starts from its default direction (all-in or all-out) and the leader picks manually; dynamic events (no template) are never auto-seeded.
- **Reopening a locked period**: Editing/removing an already-locked event, or shrinking a period after events exist, must be an explicit, deliberate action; downstream participations that already fired availability must be re-notified of material changes.
- **Volunteer in many ministries**: Overlapping availability across ministries on the same date is governed by a single global policy flag; overlapping *assignments* are governed per-ministry.
- **Partial publish**: Publishing below 100% headcount is allowed with confirmation; unfilled slots stay open and enter the same triage flow as late dropouts.
- **Whole-day unavailability**: Marking a whole date unavailable marks every shift on that date; there is no finer grain than a shift.

## Requirements *(mandatory)*

### Functional Requirements

#### Planning Cycle (period)

- **FR-001**: The system MUST let a Church Admin create a Planning Cycle for a church over an arbitrary date range, with week/month/quarter presets that only compute the range.
- **FR-002**: The system MUST prevent Planning Cycle date ranges for the same church from overlapping; gaps between cycles are allowed.
- **FR-003**: The system MUST evaluate cycle boundaries by date only, in the church's timezone, ignoring time-of-day.
- **FR-004**: The system MUST keep a draft cycle visible only to Church Admins and hidden from ministry leaders and volunteers.
- **FR-005**: The system MUST let a Church Admin lock a cycle, freezing its events' dates and times and making it visible to ministry leaders; after lock the cycle is append-only (new events may be added; editing/removing a locked event requires an explicit reopen).
- **FR-006**: The system MUST automatically archive a cycle once its end date has passed (church timezone), making it read-only history.

#### Templates & event generation

- **FR-007**: The system MUST let a Church Admin define reusable Event Templates targeting a weekday and containing ordered time blocks (label, start, end), each block with a stable identity.
- **FR-008**: Applying an Event Template to a cycle MUST create one church-owned Event per matching date in the cycle's range, with one time slot per template block, and each generated time slot MUST record which template block produced it.
- **FR-009**: The system MUST let a Church Admin create dynamic and multi-day events manually (no template), and link each event to the cycle of its start date.

#### Church ownership & participation

- **FR-010**: Events MUST be owned by the Church, not by any single ministry; many ministries may participate in one event.
- **FR-011**: The system MUST represent each ministry's involvement in an event as a Ministry Participation (one per ministry per event) holding that ministry's opted-in shifts, requirements, and lifecycle state.
- **FR-012**: The system MUST store slot involvement as inclusions (a slot not included means the ministry does not serve it), seeded when a cycle's events are generated.
- **FR-013**: Seeding MUST be driven by a three-tier default: a global default, overridden by a per-ministry all-in/all-out setting, overridden by the leader's manual choices; and by a per-ministry standing serving profile that maps template blocks to standing involvement and headcounts.

#### Shifts, requirements, availability

- **FR-014**: The system MUST let a Ministry Leader subdivide a time slot into shifts within their participation, by equal division into N parts or by manual (possibly unequal) times, with every shift constrained to lie entirely within its parent time slot; a slot with no explicit split has exactly one shift equal to the whole slot.
- **FR-015**: Requirements, assignments, and availability MUST attach to shifts, never directly to a time slot.
- **FR-016**: The system MUST let a Ministry Leader set required headcount per shift, per role (and per team where a team applies), owned by that ministry's participation.
- **FR-017**: Firing availability MUST create one Availability Check per (cycle, ministry membership); a volunteer serving in multiple ministries/teams receives multiple checks.
- **FR-018**: Volunteers MUST be treated as available by default; the system MUST record only their unavailability marks, whose atomic unit is a single shift (with a whole-day helper that marks every shift on a date).
- **FR-019**: The system MUST require an explicit confirmation on each Availability Check (recording a confirmation timestamp) even when no unavailability is marked.
- **FR-020**: On availability confirmation, the system MUST detect overlapping availability across a volunteer's other ministries on the same date and, per a global policy flag, either block confirmation until one is dropped or allow it while flagging a conflict for affected leaders.

#### Rostering & publishing

- **FR-021**: When filling a shift, the system MUST present eligible volunteers ranked first by availability for that shift and then by least-recent serving frequency.
- **FR-022**: The system MUST track a completion percentage per participation as assigned headcount over total required headcount.
- **FR-023**: On assignment, the system MUST evaluate overlapping-assignment conflicts using the ministry's soft/hard enforcement setting, with an audited override (reason + authorization) for hard conflicts.
- **FR-024**: The system MUST let a Ministry Leader publish their participation's roster independently of other ministries on the same event, allowing publish below 100% headcount with an explicit confirmation.
- **FR-025**: Publishing a participation MUST reveal that ministry's schedule slice to that ministry's volunteers only, and MUST NOT change the state of other ministries' participations on the same event.
- **FR-026**: An Event MUST never be "published"; its status is limited to draft, scheduled (its cycle locked), cancelled, and past.

#### Notifications & live execution

- **FR-027**: Notifications MUST be scoped to a Planning Cycle (the package), not to individual slots; base kinds are an availability reminder (which a leader can resend) and a schedule-published notice.
- **FR-028**: After publish, a Volunteer MUST be able to cancel only shifts assigned to their own user; doing so MUST notify the corresponding leader promptly and reopen the slot for triage.
- **FR-029**: Ministry Leaders MUST retain the ability to reassign volunteers and adjust shift staffing mid-cycle after publication.

#### Roles & access

- **FR-030**: The system MUST support a church-level Church Admin role, distinct from the ministry-scoped leader role, authorized to draft and lock cycles and configure Event Templates; one person may hold both roles.
- **FR-031**: The system MUST enforce that after a cycle is locked, ministry leaders act only within their own ministry's participation.

### Key Entities

- **Planning Cycle**: A church-scoped planning window over an arbitrary, non-overlapping date range; parent of the period's events; lifecycle draft → locked → archived.
- **Church Admin**: A church-level role that owns the calendar — drafts/locks cycles and configures templates.
- **Event Template**: A reusable weekday blueprint of ordered time blocks used to generate recurring events into a cycle.
- **Time Block**: One labelled span within a template, with a stable identity that links generated shifts back to a standing serving profile.
- **Event**: A church-owned gathering belonging to one cycle; has church-level time slots; status draft/scheduled/cancelled/past.
- **Time Slot**: A shared, church-level block within an event that ministries opt into; subdivided per-ministry into shifts.
- **Ministry Serving Profile**: A per-ministry standing rule mapping template blocks to the ministry's usual involvement, shift splits, and headcounts; seeds participation.
- **Ministry Participation**: A single ministry's tailoring of one event — its included shifts, requirements, and lifecycle (tailoring → availability_fired → rostering → published).
- **Shift**: A ministry's subdivision of a time slot (default one shift = whole slot); the unit that carries requirements, assignments, and availability.
- **Slot Requirement**: The headcount needed for a role (and team) within a shift, owned by a participation.
- **Availability Check**: The unit a volunteer answers and confirms, one per (cycle, membership).
- **Availability (mark)**: A volunteer's unavailability exception for a specific shift, hung off a check (available by default).
- **Assignment**: A volunteer committed to a role within a shift, scoped to a participation; one per volunteer per shift.
- **Volunteer / Ministry / Team / Role**: Existing entities, unchanged in essence (a volunteer may belong to multiple ministries/teams).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Church Admin can generate a full month's recurring services and lock the calendar in under 10 minutes, versus the manual spreadsheet build.
- **SC-002**: A Ministry Leader can go from a locked cycle to fired availability requests for their ministry in under 5 minutes when a standing serving profile exists.
- **SC-003**: A Volunteer who has no exceptions can acknowledge a full period's availability in under 30 seconds (open → confirm).
- **SC-004**: 100% of volunteers assigned to a shift can view their own published schedule and cancel only their own assignments; 0% can alter others' assignments.
- **SC-005**: No two Planning Cycles for a church ever overlap in date range, and every event is attributable to exactly one cycle.
- **SC-006**: Every scheduled shift's staffing, availability, and assignments are attributable to exactly one ministry participation (no cross-ministry ambiguity in staffing).
- **SC-007**: Overlapping availability and overlapping assignments across ministries are surfaced to the volunteer/leader 100% of the time they occur, per the configured policy.
- **SC-008**: A late cancellation notifies the responsible leader and reopens the slot within seconds of the volunteer's action.

## Assumptions

- **Greenfield data**: There is no production scheduling data to preserve; this ships as a fresh schema with no migration of existing events/availability/assignments.
- **Builds on completed architecture**: The clean-architecture reshape (feature 016) is complete; this feature is built natively on it.
- **Church Admin exists as a role**: Near-term, one person may hold both Church Admin and a ministry leader role; the roles are modelled distinctly regardless.
- **Global policy flag**: The cross-ministry availability-overlap policy is controlled by a feature flag today, intended to become a church-level setting later; the participation default direction is likewise a global flag today.
- **Manual-shift creation UX is deferred in detail**: Shifts can be created by equal split or manual times in the MVP; the richer manual-editing interaction (timeline/drag, fine-grained picker) is an open design question tracked in the backlog (BL-010), not part of this spec's scope.
- **Reusable count presets deferred**: Free-standing role-count presets (the removed RoleTemplate) are out of scope for the MVP (backlog BL-009); recurring counts come from serving profiles, dynamic-event counts from copying a profile block or manual entry.
- **Timezone**: Each church has a single timezone used for all date-only boundary evaluation.
- **Notifications channel**: Delivered via the existing in-app / push mechanism; scoped per cycle to limit noise.
