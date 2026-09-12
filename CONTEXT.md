# Church Volunteer Scheduling Context

This context handles the scheduling, availability, and assignment of volunteers to roles within a church's events.

## Language

**User**:
The authentication identity. A User may administer multiple Churches but may be a Volunteer in only one Church.
_Avoid_: Account, member

**Church**:
The root tenant representing a distinct congregation or local church body.
_Avoid_: Organization, tenant, customer

**Platform Operator**:
The trusted actor that provisions Churches. It is a single User per environment, identified by configuration, that never holds Church Membership in any Church and exists only to create a Church and invite its first ChurchAdmin.
_Avoid_: Superadmin, root user, system user

**Church Provisioning**:
The act of bringing a Church into existence: the Platform Operator atomically creates the Church and mints the Church Invitation that admits its first ChurchAdmin. It is the only origin of a Church; ordinary invite-only onboarding begins once that first ChurchAdmin has redeemed.
_Avoid_: Church signup, tenant creation, onboarding

**Church Membership**:
The Scoped Membership that grants a User access to a Church. Its Access Level is `member` or `admin`, and it is independent of whether the User is a Volunteer.
_Avoid_: Organization membership, tenant membership

**Church Member**:
A User associated with a Church through Church Membership. Volunteer participation and authority are additive to this base relationship.
_Avoid_: Organization member, tenant member

**Church Invitation**:
An email-addressed invitation for a person outside a Church to become a Church Member, creating or connecting their User identity as needed.
_Avoid_: Sign-up link, magic link, organization invitation

**Ministry Invitation**:
A targeted invitation to join one Ministry, granting a Ministry Membership at a stated Ministry Access Level together with a set of Roles. It is addressed either to an existing Church Member or to a Church Invitation, in which case the two are minted as a pair and accepted together. A ChurchAdmin may issue one for any Ministry in their Church; a Ministry leader may issue one for their own Ministry only and may grant only the `volunteer` Ministry Access Level. A TeamLeader cannot issue one. It is never a shareable link, and it never grants Team Membership.
_Avoid_: Church Invitation, team invitation, invite link, invite token

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
The Scoped Membership assigned by an authorized leader to associate a Ministry Volunteer with one Team. Its Access Level is `member` or `leader`; it has no invitation or acceptance lifecycle.
_Avoid_: Organization team membership

**TeamLeader**:
A Volunteer whose Team Membership has the `leader` Access Level. A Volunteer may lead multiple Teams without gaining authority over the rest of the Ministry.
_Avoid_: Sub-leader, deputy

**Role**:
A function a Volunteer performs within one Ministry (e.g., "Vocalist", "Guitarist", "Teacher", or "Sound Technician"). Each Role belongs to exactly one Ministry and may support scheduling, communication, training, and other Ministry workflows.
_Avoid_: Permission, access level, system role, job

**Volunteer**:
A Church Member who participates in one or more Ministries and may serve in one or more Roles. A User may have only one **active** Volunteer profile, even when that User administers multiple Churches. Earlier participation in another Church survives as a Retired Volunteer Profile.
_Avoid_: User, member, worker

**Retired Volunteer Profile**:
The Volunteer profile a User held in a Church they have transferred away from. It is never deleted and never re-attributed to another Church: it keeps its original Church and carries the Assignments, Ministry Memberships, and Availability history served under it, so past service always reads as service to the Church it was given to. It grants no participation — a retired profile receives no Assignments and answers no Availability. A User may hold many retired profiles but only one active one.
_Avoid_: Inactive volunteer, archived volunteer, old profile

**Volunteer Transfer**:
The self-directed move of a User's Volunteer participation from one Church to another. It retires the Volunteer profile in the former Church and creates a new one in the destination, ending the User's Ministry and Team Memberships and withdrawing future Assignments in the former Church while preserving historical service and audit attribution. Nothing carries across: the new profile is born fresh, without the former Church's notes or status. Church Membership is independent and is not ended by a Volunteer Transfer. The former Church cannot prevent the move.
_Avoid_: Volunteer reassignment, Church-approved transfer

**Event**:
A scheduled gathering owned by the Church (e.g., "Sunday Service" or a multi-day retreat). An Event belongs to exactly one PlanningCycle and may be hourly-based or day-based. Its start and end are always Instants — a day-based Event runs church-local midnight to end of day — and it belongs to the CalendarDay its start falls on, so a gathering running from 22:00 Friday to 01:00 Saturday is a Friday Event. Many Ministries participate in a single Event; the Event itself is not owned by any one Ministry. Its lifecycle is `draft → scheduled` (its cycle locked) `→ cancelled` / `→ past`; an Event is never "published" — publishing is per MinistryParticipation, not per Event.
_Avoid_: Gathering, service

## Time

Three kinds of time exist in this context, and every date bug so far has come from confusing them. They meet in one direction only: **TimeOfDay + CalendarDay + Church Timezone → Instant**. An Instant may be read back as a CalendarDay, but only through the Church Timezone.

**Instant**:
A single absolute moment, the same moment for every observer. Everything a Volunteer physically shows up for is an Instant — Event start and end, TimeSlot and Shift bounds — as is every audited moment.
_Avoid_: Timestamp, datetime, UTC time, date

**CalendarDay**:
A labelled day such as `2027-01-04`, carrying no time and no offset. It is never a point on the timeline, so it compares only to another CalendarDay: an Instant must be converted through the Church Timezone before it can meet one. PlanningCycle bounds are CalendarDays, as is the planning grid a leader arranges Events on.
_Avoid_: Date, day key, local date

**TimeOfDay**:
A wall-clock time such as `10:30`, naming an hour and minute with no day and no offset, and therefore no position on the timeline. It is what an EventTemplate's TimeBlocks are authored in, before any date exists.
_Avoid_: Time, local time, clock time

**Church Timezone**:
The single IANA timezone name a Church keeps time in, and the only lens under which an Instant and a CalendarDay may be compared. There is no viewer's day and no viewer's clock in this context: every CalendarDay, every displayed time, and every grouping resolves in the Church Timezone, wherever the viewer happens to be.
_Avoid_: Local timezone, user timezone, home timezone, offset

## Planning Lifecycle

**PlanningCycle**:
A church-scoped planning window over an arbitrary **CalendarDay** range (a week, a month, a quarter — presets are UI sugar over `startDate`/`endDate`). Boundaries are CalendarDays, never a TimeOfDay and never Instants, so they carry no offset of their own. It is the aggregate an administrator drafts and then locks; it parents the Events planned within it. Cycle date ranges for a Church must not overlap, though gaps between cycles are allowed. An Event belongs to the cycle containing the CalendarDay its start Instant falls on in the Church Timezone, and may leak past that cycle's last day into later ones.
_Avoid_: Month, MonthlyPlan, schedule, cycle (bare)

**EventTemplate**:
A church-owned, ChurchAdmin-configured blueprint for recurring single-day gatherings on a given weekday (services or any weekly non-service gathering). Holds ordered TimeBlocks. Applying it to a PlanningCycle creates one Event per matching CalendarDay in the cycle, with one TimeSlot per TimeBlock — the point at which the template's TimeOfDay values become Instants. Multi-day and one-off dynamic Events are created manually, not from a template.
_Avoid_: ServiceTemplate, WeekdayTemplate, RecurringEvent

**TimeBlock**:
One labelled `{ label, startTime, endTime }` entry within an EventTemplate, carrying a stable id. Its bounds are TimeOfDay values, so it names an hour and not a moment; an end earlier than its start means the block crosses midnight and resolves onto the following CalendarDay. Generating an Event copies each TimeBlock into a TimeSlot that records its `sourceTemplateBlockId`. That id is the hinge a MinistryServingProfile matches on to auto-seed inclusions.
_Avoid_: Period, shift, slot

**MinistryServingProfile**:
A per-Ministry standing rule declaring which EventTemplate TimeBlocks that Ministry is always on (e.g. "Projection serves every Sunday block, Wednesday night"). Per admin TimeBlock it records: whether the Ministry serves it, how the Ministry splits it into Shifts, and the headcount per Shift (per Role/Team). When a cycle's Events are generated, matching TimeSlots auto-seed the Ministry's inclusions, Shifts, and SlotRequirements in its MinistryParticipation, which the leader then confirms and tweaks. Bound to templates by `sourceTemplateBlockId`. It is a pre-fill helper only — orthogonal to the Ministry's `defaultDirection`, which is a separate ministry-wide setting, not part of the profile.
_Avoid_: StandingInvolvement, MinistryDefault, profile (bare)

**MinistryParticipation**:
A single Ministry's tailoring of a locked Event — the set of TimeSlots that Ministry is **opted into** (stored as inclusions; a slot with no inclusion row means the Ministry is not serving it), its per-slot staffing requirements, and its own roster-publish state (`tailoring → availability_fired → rostering → published`). One per (Ministry, Event). Publishing is per MinistryParticipation: when this Ministry's roster reaches its required headcount the leader publishes, making that Ministry's slice of the schedule visible to its Volunteers, independently of other Ministries on the same Event. Inclusions default to nothing and are seeded from the Ministry's standing template profile when the cycle's Events are generated; the leader confirms and adds one-off inclusions for dynamic Events. This is where per-Ministry scheduling state lives, since the Event is church-owned.
_Avoid_: Participation, involvement, ministry event

**TimeSlot**:
A church-level block of time within an Event — a shared service block (e.g. the 10:30 service) or an overall span — that Ministries opt into or out of. Its bounds are Instants. It is the same for every Ministry; per-Ministry subdivision happens below it in Shifts.
_Avoid_: Period

**Shift**:
A Ministry's subdivision of a TimeSlot inside its MinistryParticipation — the actual piece it staffs, bounded by Instants. Two Ministries may split the same TimeSlot differently (projection 2×4h, kids 4×2h). Default is one Shift equal to the whole TimeSlot (no split). A Shift must lie entirely within its parent TimeSlot's bounds — enforced as a domain invariant and by the creation form. Shifts are created either by dividing the slot into N equal parts or by setting times manually (unequal parts allowed). SlotRequirements, Assignments, and Availability marks all attach to a Shift, not the TimeSlot.
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
A Volunteer is available by default; an Availability record is an **unavailability mark** the Volunteer records as an exception, hanging off an AvailabilityCheck. Its atomic unit is a single **Shift** (a "whole day" action just marks every Shift falling on that CalendarDay in the Church Timezone). Because a Ministry splits a long TimeSlot into multiple Shifts, per-Shift marks express partial availability (serve the first block, not the second) with no extra concept.
_Avoid_: Blockout, schedule

## Example Dialogue

**Developer**: "Are volunteers assigned directly to an Event or to a specific TimeSlot within the Event?"
**Domain Expert**: "They are assigned to a TimeSlot. An Event like 'Sunday Morning' might have multiple TimeSlots, and a Volunteer serves in a specific role during one of those slots."
**Developer**: "Can a Volunteer serve in multiple Roles during the same TimeSlot?"
**Domain Expert**: "No, a Volunteer can only hold one Assignment per TimeSlot. We must prevent double-bookings."

**Developer**: "Who performed this audit action — should we call them the Leader or the Actor?"
**Domain Expert**: "Use Actor. Some audit actions are performed by leaders, but others are performed by volunteers or admins, so Actor is the broader canonical term."
