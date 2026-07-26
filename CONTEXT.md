# Church Volunteer Scheduling Context

This context handles the scheduling, availability, and assignment of volunteers to roles within a church's events.

## Language

**User**:
The authentication identity. A User may administer multiple Churches but may be a Volunteer in only one Church.
_Avoid_: Account, member

**Church**:
The root tenant representing a distinct congregation or local church body.
_Avoid_: Organization, tenant, customer

**Church Membership**:
The Scoped Membership that grants a User access to a Church. Its Access Level is `member` or `admin`, and it is independent of whether the User is a Volunteer.
_Avoid_: Organization membership, tenant membership

**Church Member**:
A User associated with a Church through Church Membership. Volunteer participation and authority are additive to this base relationship.
_Avoid_: Organization member, tenant member

**Active Church**:
The Church selected as the current scope of an authenticated session. Every protected operation is evaluated within it, and a User may switch only among Churches where they hold Church Membership.
_Avoid_: Active organization, current tenant

**Scoped Membership**:
An association granting a User access within one domain scope, such as a Church, Ministry, or Team. Each Scoped Membership carries an Access Level defined by that scope.
_Avoid_: Global role, system role

**Access Level**:
A named level of permitted actions within one Scoped Membership. Access Levels are scope-specific and do not describe the functions a Volunteer performs.
_Avoid_: Role, permission flag

**Ministry**:
A high-level department or service area within a Church (e.g., "Kids Ministry", "Worship Ministry"). Carries a ministry-wide `defaultDirection` (all-in / all-out) that decides whether it starts opted into every slot of a cycle; this overrides a church-wide global default (an Unleash flag today, a church setting later) and is in turn overridden by the leader's manual per-slot choices. `defaultDirection` is not a template concept.
_Avoid_: Department, group

**Ministry Membership**:
The Scoped Membership that grants a Volunteer access to one Ministry. It carries the Volunteer’s Ministry Access Level and Ministry Roles.
_Avoid_: Organization team membership

**Ministry Access Level**:
The permission level attached to one Ministry Membership: `volunteer` or `leader`. It applies only within that Ministry; Team leadership is granted separately per Team.
_Avoid_: System role, global role

**Team**:
A specific group of Volunteers within a Ministry (e.g., "Acoustic Team", "Media Team").
_Avoid_: Sub-group, crew

**Team Membership**:
The Scoped Membership that associates a Ministry Volunteer with one Team. Its Access Level is `member` or `leader`.
_Avoid_: Organization team membership

**TeamLeader**:
A Volunteer whose Team Membership has the `leader` Access Level. A Volunteer may lead multiple Teams without gaining authority over the rest of the Ministry.
_Avoid_: Sub-leader, deputy

**Role**:
A function a Volunteer performs within one Ministry (e.g., "Vocalist", "Guitarist", "Teacher", or "Sound Technician"). Each Role belongs to exactly one Ministry and may support scheduling, communication, training, and other Ministry workflows.
_Avoid_: Permission, access level, system role, job

**Volunteer**:
A Church Member who participates in one or more Ministries and may serve in one or more Roles. A User may have only one Volunteer profile, even when that User administers multiple Churches.
_Avoid_: User, member, worker

**Event**:
A scheduled gathering owned by the Church (e.g., "Sunday Service" or a multi-day retreat). An Event belongs to exactly one PlanningCycle and may be hourly-based or day-based. Many Ministries participate in a single Event; the Event itself is not owned by any one Ministry. Its lifecycle is `draft → scheduled` (its cycle locked) `→ cancelled` / `→ past`; an Event is never "published" — publishing is per MinistryParticipation, not per Event.
_Avoid_: Gathering, service

## Planning Lifecycle

**PlanningCycle**:
A church-scoped planning window over an arbitrary **date** range (a week, a month, a quarter — presets are UI sugar over `startDate`/`endDate`). Boundaries are dates only, never a time-of-day, resolved in the Church's timezone. It is the aggregate an administrator drafts and then locks; it parents the Events planned within it. Cycle date ranges for a Church must not overlap, though gaps between cycles are allowed. An Event belongs to the cycle of its **start date** (hour ignored) and may leak past that cycle's end date into later dates.
_Avoid_: Month, MonthlyPlan, schedule, cycle (bare)

**EventTemplate**:
A church-owned, ChurchAdmin-configured blueprint for recurring single-day gatherings on a given weekday (services or any weekly non-service gathering). Holds ordered TimeBlocks. Applying it to a PlanningCycle creates one Event per matching date in the cycle, with one TimeSlot per TimeBlock. Multi-day and one-off dynamic Events are created manually, not from a template.
_Avoid_: ServiceTemplate, WeekdayTemplate, RecurringEvent

**TimeBlock**:
One labelled `{ label, startTime, endTime }` entry within an EventTemplate, carrying a stable id. Generating an Event copies each TimeBlock into a TimeSlot that records its `sourceTemplateBlockId`. That id is the hinge a MinistryServingProfile matches on to auto-seed inclusions.
_Avoid_: Period, shift, slot

**MinistryServingProfile**:
A per-Ministry standing rule declaring which EventTemplate TimeBlocks that Ministry is always on (e.g. "Projection serves every Sunday block, Wednesday night"). Per admin TimeBlock it records: whether the Ministry serves it, how the Ministry splits it into Shifts, and the headcount per Shift (per Role/Team). When a cycle's Events are generated, matching TimeSlots auto-seed the Ministry's inclusions, Shifts, and SlotRequirements in its MinistryParticipation, which the leader then confirms and tweaks. Bound to templates by `sourceTemplateBlockId`. It is a pre-fill helper only — orthogonal to the Ministry's `defaultDirection`, which is a separate ministry-wide setting, not part of the profile.
_Avoid_: StandingInvolvement, MinistryDefault, profile (bare)

**MinistryParticipation**:
A single Ministry's tailoring of a locked Event — the set of TimeSlots that Ministry is **opted into** (stored as inclusions; a slot with no inclusion row means the Ministry is not serving it), its per-slot staffing requirements, and its own roster-publish state (`tailoring → availability_fired → rostering → published`). One per (Ministry, Event). Publishing is per MinistryParticipation: when this Ministry's roster reaches its required headcount the leader publishes, making that Ministry's slice of the schedule visible to its Volunteers, independently of other Ministries on the same Event. Inclusions default to nothing and are seeded from the Ministry's standing template profile when the cycle's Events are generated; the leader confirms and adds one-off inclusions for dynamic Events. This is where per-Ministry scheduling state lives, since the Event is church-owned.
_Avoid_: Participation, involvement, ministry event

**TimeSlot**:
A church-level block of time within an Event — a shared service block (e.g. the 10:30 service) or an overall span — that Ministries opt into or out of. It is the same for every Ministry; per-Ministry subdivision happens below it in Shifts.
_Avoid_: Period

**Shift**:
A Ministry's subdivision of a TimeSlot inside its MinistryParticipation — the actual piece it staffs. Two Ministries may split the same TimeSlot differently (projection 2×4h, kids 4×2h). Default is one Shift equal to the whole TimeSlot (no split). A Shift must lie entirely within its parent TimeSlot's bounds — enforced as a domain invariant and by the creation form. Shifts are created either by dividing the slot into N equal parts or by setting times manually (unequal parts allowed). SlotRequirements, Assignments, and Availability marks all attach to a Shift, not the TimeSlot.
_Avoid_: Sub-slot, block, period

**SlotRequirement**:
The staffing need (headcount) for a specific Role and Team within a **Shift**, owned by one MinistryParticipation.
_Avoid_: Staffing need, requirement

**Assignment**:
The matching of a Volunteer to a specific Role within a **Shift**, scoped to a MinistryParticipation. One Assignment per Volunteer per Shift (no double-booking).
_Avoid_: Booking, scheduling

**Actor**:
The person who performed an audited action in the scheduling system. An Actor may be a Volunteer, Ministry Leader, or Admin depending on the workflow.
_Avoid_: Leader (when the action may also be performed by volunteers or admins)

**ChurchAdmin**:
A User whose Church Membership grants management authority across every subordinate scope in that Church. Participation still requires the relevant Scoped Membership.
_Avoid_: Owner, superadmin, manager

**AvailabilityCheck**:
The unit a Volunteer answers and confirms — one per `(PlanningCycle, MinistryVolunteer membership)`, so a Volunteer serving in two Ministries/Teams gets two checks. A leader firing availability spawns the checks (`pending`); the Volunteer confirms (`pending → confirmed`, `confirmedAt`) even when leaving zero marks, so the leader can tell "acknowledged, available" from "hasn't looked".
_Avoid_: AvailabilityRequest, survey

**VolunteerNotification**:
A message to a Volunteer, scoped to a **PlanningCycle** (the package), not to a single slot — to keep noise low. Base kinds: availability reminder (leader may resend) and schedule-published. A late-dropout alert to a leader is the inverse direction.
_Avoid_: Alert, message, ping

**Availability**:
A Volunteer is available by default; an Availability record is an **unavailability mark** the Volunteer records as an exception, hanging off an AvailabilityCheck. Its atomic unit is a single **Shift** (a "whole day" action just marks every Shift on that date). Because a Ministry splits a long TimeSlot into multiple Shifts, per-Shift marks express partial availability (serve the first block, not the second) with no extra concept.
_Avoid_: Blockout, schedule

## Example Dialogue

**Developer**: "Are volunteers assigned directly to an Event or to a specific TimeSlot within the Event?"
**Domain Expert**: "They are assigned to a TimeSlot. An Event like 'Sunday Morning' might have multiple TimeSlots, and a Volunteer serves in a specific role during one of those slots."
**Developer**: "Can a Volunteer serve in multiple Roles during the same TimeSlot?"
**Domain Expert**: "No, a Volunteer can only hold one Assignment per TimeSlot. We must prevent double-bookings."

**Developer**: "Who performed this audit action — should we call them the Leader or the Actor?"
**Domain Expert**: "Use Actor. Some audit actions are performed by leaders, but others are performed by volunteers or admins, so Actor is the broader canonical term."
