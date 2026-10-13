# Church Volunteer Scheduling Context

This context handles the scheduling, availability, and assignment of volunteers to roles within a church's events.

Every term people see on screen or in an email carries its Brazilian Portuguese word as `(pt-BR: …)`, and `UI:` names the English screen word wherever it differs from the term. Code stays English and uses the terms as written here. pt-BR copy uses the masculine generic (*Voluntário*, *escalado*).

## Language

**Person** (pt-BR: Pessoa):
A human the Church knows. Capacities stack on a Person: they log in as a User, belong to a Church as a Church Member, and may in addition lead a Ministry or be a ChurchAdmin. A Person may administer multiple Churches but may be a Volunteer in only one. Every Person has exactly one User.
_Avoid_: Individual, account, user (for the human)

**User**:
A Person's login identity: what authenticates and signs in. It is never shown on screen.
_Avoid_: Account, Person (for the login), member

**Church** (pt-BR: Igreja):
The root tenant representing a distinct congregation or local church body.
_Avoid_: Organization, tenant, customer

**Platform Operator**:
The trusted actor that provisions Churches. It is a single User per environment, identified by configuration, that never holds Church Membership in any Church and exists only to create a Church and invite its first ChurchAdmin.
_Avoid_: Superadmin, root user, system user

**Church Provisioning**:
The act of bringing a Church into existence: the Platform Operator atomically creates the Church and mints the Church Invitation that admits its first ChurchAdmin. It is the only origin of a Church; ordinary invite-only onboarding begins once that first ChurchAdmin has redeemed.
_Avoid_: Church signup, tenant creation, onboarding

**Church Membership**:
The Scoped Membership that grants a Person access to a Church. Its Access Level is `member` (pt-BR: Membro) or `admin` (UI: Admin · pt-BR: Administrador), and it is independent of whether the Person is a Volunteer. Only a ChurchAdmin raises a Church Member to `admin` or lowers one to `member`; a Church always keeps at least one ChurchAdmin, so the last one cannot be lowered.
_Avoid_: Organization membership, tenant membership

**Church Member** (pt-BR: Membro):
A Person associated with a Church through Church Membership: anyone registered in the Church, whether or not formally received into it (baptism is not implied). Volunteer participation and authority are additive to this base relationship.
_Avoid_: Organization member, tenant member

**Church Invitation** (pt-BR: Convite para a igreja):
An email-addressed invitation for a person outside a Church to become a Church Member, creating or connecting their User identity as needed. It grants the `member` or `admin` Access Level; only a ChurchAdmin may invite at `admin`. A person has at most one pending Church Invitation per Church: inviting them as admin while a `member` one is pending raises that one to `admin`, keeping any Ministry Invitation paired with it.
_Avoid_: Sign-up link, magic link, organization invitation

**Ministry Invitation** (pt-BR: Convite para o ministério):
A targeted invitation to join one Ministry, granting a Ministry Membership at a stated Ministry Access Level together with a set of Roles; at `volunteer` level it names at least one Role. It is addressed either to an existing Church Member or to a Church Invitation, in which case the two are minted as a pair and accepted together. A ChurchAdmin may issue one for any Ministry in their Church; a Ministry leader may issue one for their own Ministry only and may grant only the `volunteer` Ministry Access Level. A TeamLeader cannot issue one. It is never a shareable link, and it never grants Team Membership. A person has at most one pending Ministry Invitation per Ministry; a fresh one is refused while it is pending, even if expired, and is resent instead. Whoever may issue an invitation may resend or revoke it. A revoked invitation is kept, with who revoked it, when, and why (by hand, or because its Ministry was archived, which revokes every pending invitation to it). Revoking the last pending Ministry Invitation paired with a Church Invitation revokes that Church Invitation too.
_Avoid_: Church Invitation, team invitation, invite link, invite token

**Active Church**:
The Church selected as the current scope of an authenticated session. Every protected operation is evaluated within it, and a Person may switch only among Churches where they hold Church Membership.
_Avoid_: Active organization, current tenant

**Scoped Membership**:
An association granting a Person access within one domain scope, such as a Church, Ministry, or Team. Each Scoped Membership carries an Access Level defined by that scope.
_Avoid_: Global role, system role

**Access Level**:
A named level of permitted actions within one Scoped Membership. Access Levels are scope-specific and do not describe the functions a Volunteer performs.
_Avoid_: Role, permission flag

**Ministry** (pt-BR: Ministério):
A high-level department or service area within a Church (e.g., "Kids Ministry", "Worship Ministry"). Carries a ministry-wide `defaultDirection` (all-in / all-out) that decides whether it starts opted into every EventTimeBlock of a Cycle; this overrides a church-wide global default (a church setting later) and is in turn overridden by the leader's manual per-EventTimeBlock choices. `defaultDirection` is not a template concept. Only a ChurchAdmin creates, renames, or archives a Ministry; it is archived, never deleted, and cannot be archived while it still takes part in an Event that is not yet past.
_Avoid_: Department, group

**Ministry Membership**:
The Scoped Membership that grants a Volunteer access to one Ministry. It carries the Volunteer’s Ministry Access Level and Ministry Roles. Only a ChurchAdmin changes its Ministry Access Level. A ChurchAdmin may change the Roles of any Ministry Membership or end it; a Ministry leader may change the Roles of the `volunteer`-level members of their own Ministry and their own, and may end only `volunteer`-level memberships there. A Role cannot be taken away, nor the membership ended, while an Assignment in that Ministry on an Event not yet past still depends on it. An ended membership is kept with its Roles as history; rejoining takes a new Ministry Invitation.
_Avoid_: Organization team membership, ministry volunteer

**Ministry Access Level**:
The permission level attached to one Ministry Membership: `volunteer` (pt-BR: Voluntário) or `leader` (pt-BR: Líder). It applies only within that Ministry; Team leadership is granted separately per Team. A `leader` may hold no Roles, leading without serving, but is still a Volunteer of that Church, so a Person leads Ministries only in the one Church where they volunteer.
_Avoid_: System role, global role

**Team** (pt-BR: Equipe):
A specific group of Volunteers within a Ministry (e.g., "Acoustic Team", "Media Team").
_Avoid_: Sub-group, crew

**Team Membership**:
The Scoped Membership assigned by an authorized leader to associate a Ministry Volunteer with one Team. Its Access Level is `member` or `leader`; it has no invitation or acceptance lifecycle.
_Avoid_: Organization team membership

**TeamLeader** (pt-BR: Líder de equipe):
A Volunteer whose Team Membership has the `leader` Access Level. A Volunteer may lead multiple Teams without gaining authority over the rest of the Ministry.
_Avoid_: Sub-leader, deputy

**Role** (pt-BR: Função):
A function a Volunteer is able to perform within one Ministry (e.g., "Vocalist", "Guitarist", "Teacher", "Usher", or "Sound Technician") — a qualification, not where the Volunteer stands; that is the Sector. Each Role belongs to exactly one Ministry and may support scheduling, communication, training, and other Ministry workflows. A ChurchAdmin may manage the Roles of any Ministry; a Ministry leader may manage the Roles of their own Ministry, since the leader is the one who knows what the Ministry needs. A Role is archived, never deleted: archiving hides it from new use but keeps the qualifications and history that name it, and a rename shows through history.
_Avoid_: Permission, access level, system role, job

**Sector** (pt-BR: Setor):
A named spot or duty within one Ministry where its Volunteers are placed for a Shift (e.g., "Babies Room", "Main Door", "Visitor Reception", "Templo", "Stage"). Each Sector belongs to exactly one Ministry and is registered once, then reused Cycle after Cycle; every Ministry that sets a headcount has at least one. Nobody belongs to a Sector: which Volunteers may serve there follows from their Roles alone. A ChurchAdmin may manage the Sectors of any Ministry; a Ministry leader may manage the Sectors of their own Ministry. A Sector is archived, never deleted, and a rename shows through history. Neither a Sector nor a Role can be archived while an upcoming ShiftRequirement or the Ministry's UsualSetup still uses it.
_Avoid_: Team, post, station, position, place, area

**Volunteer** (pt-BR: Voluntário):
A Church Member who participates in one or more Ministries and may serve in one or more Roles. A Person may have only one **active** Volunteer profile, even when that Person administers multiple Churches. Earlier participation in another Church survives as a Retired Volunteer Profile.
_Avoid_: User, member, worker

**Retired Volunteer Profile**:
The Volunteer profile a Person held in a Church they have transferred away from. It is never deleted and never re-attributed to another Church: it keeps its original Church and carries the Assignments, Ministry Memberships, and AvailabilityCheck history served under it, so past service always reads as service to the Church it was given to. It grants no participation — a retired profile receives no Assignments and answers no AvailabilityCheck. A Person may hold many retired profiles but only one active one.
_Avoid_: Inactive volunteer, archived volunteer, old profile

**Volunteer Transfer** (pt-BR: Transferência de voluntário):
The self-directed move of a Person's Volunteer participation from one Church to another. It retires the Volunteer profile in the former Church and creates a new one in the destination, ending the Person's Ministry and Team Memberships and withdrawing future Assignments in the former Church while preserving historical service and audit attribution. Nothing carries across: the new profile is born fresh, without the former Church's notes or status. Church Membership is independent and is not ended by a Volunteer Transfer. The former Church cannot prevent the move.
_Avoid_: Volunteer reassignment, Church-approved transfer

**Event** (pt-BR: Evento):
A scheduled gathering owned by the Church (e.g., "Sunday Service" or a multi-day retreat). An Event belongs to exactly one Cycle and may span one day or several. Its start and end are always Instants, given to it rather than implied by any kind of Event, and it holds at least one EventTimeBlock, every one within its bounds; a manually added Event starts with one EventTimeBlock covering the whole Event, which may be kept or replaced by finer ones (a retreat may be one block or one per session). It belongs to the CalendarDay its start falls on, so a gathering running from 22:00 Friday to 01:00 Saturday is a Friday Event. Many Ministries participate in a single Event; the Event itself is not owned by any one Ministry. Its lifecycle is `draft → scheduled` (its Cycle sent) `→ cancelled` (pt-BR: Cancelado) / `→ past`. Once its Cycle is sent, a ChurchAdmin may still **move** it (a new start, same duration, its EventTimeBlocks and Shifts moving with it) or **cancel** it, until it starts; a cancellation is final (no reopening), and the Event stays visible as cancelled. An Event is never "published" — publishing is per Schedule, not per Event.
_Avoid_: Gathering, service

## Time

Three kinds of time exist in this context, and every date bug so far has come from confusing them. They meet in one direction only: **TimeOfDay + CalendarDay + Church Timezone → Instant**. An Instant may be read back as a CalendarDay, but only through the Church Timezone.

**Instant**:
A single absolute moment, the same moment for every observer. Everything a Volunteer physically shows up for is an Instant — Event start and end, EventTimeBlock and Shift bounds — as is every audited moment.
_Avoid_: Timestamp, datetime, UTC time, date

**CalendarDay**:
A labelled day such as `2027-01-04`, carrying no time and no offset. It is never a point on the timeline, so it compares only to another CalendarDay: an Instant must be converted through the Church Timezone before it can meet one. Cycle bounds are CalendarDays, as is the planning grid a leader arranges Events on.
_Avoid_: Date, day key, local date

**TimeOfDay**:
A wall-clock time such as `10:30`, naming an hour and minute with no day and no offset, and therefore no position on the timeline. It is what an EventTemplate's TemplateTimeBlocks are authored in, before any date exists.
_Avoid_: Time, local time, clock time

**Church Timezone** (pt-BR: Fuso horário da igreja):
The single IANA timezone name a Church keeps time in, and the only lens under which an Instant and a CalendarDay may be compared. There is no viewer's day and no viewer's clock in this context: every CalendarDay, every displayed time, and every grouping resolves in the Church Timezone, wherever the viewer happens to be.
_Avoid_: Local timezone, user timezone, home timezone, offset

## Planning Lifecycle

**Cycle** (pt-BR: Ciclo):
A church-scoped planning window over an arbitrary **CalendarDay** range (a week, a month, a quarter — presets are UI sugar over `startDate`/`endDate`). Boundaries are CalendarDays, never a TimeOfDay and never Instants, so they carry no offset of their own, and both are included: a 12–25 October Cycle covers the 25th. It is the aggregate a ChurchAdmin drafts and then **sends to the Ministries** (UI: Send to Ministries · pt-BR: Enviar aos ministérios); it parents the Events planned within it. Its states are **Draft · Sent · Past** (pt-BR: Rascunho · Enviado · Encerrado). While draft it may be renamed, have its dates changed (never so that one of its Events falls outside), or be deleted with its Events. Sending needs at least one Event and cannot be undone; it opts each Ministry into only what its UsualSetup names, leaving every other Ministry free to opt in while preparing. Cycle date ranges for a Church must not overlap, though gaps between Cycles are allowed. An Event belongs to the Cycle containing the CalendarDay its start Instant falls on in the Church Timezone, and may leak past that Cycle's last day into later ones.
_Avoid_: PlanningCycle, lock, Month, MonthlyPlan, schedule

**EventTemplate** (UI: Event template · pt-BR: Modelo de evento):
A church-owned, ChurchAdmin-configured blueprint for recurring single-day gatherings on a given weekday (services or any weekly non-service gathering). Holds ordered TemplateTimeBlocks. Applying it to a Cycle creates one Event per matching CalendarDay in the Cycle, with one EventTimeBlock per TemplateTimeBlock — the point at which the template's TimeOfDay values become Instants. Multi-day and one-off dynamic Events are created manually, not from a template. Only a ChurchAdmin manages EventTemplates; a template's name is unique in its Church and it holds at least one TemplateTimeBlock. Several templates may share a weekday. Changing or deleting a template reaches only later applications; Events already generated from it are their own copies and stay as they are.
_Avoid_: ServiceTemplate, WeekdayTemplate, RecurringEvent

**TemplateTimeBlock** (UI: Time block · pt-BR: Horário):
One labelled `{ label, startTime, endTime }` entry within an EventTemplate, carrying a stable identity. Its bounds are TimeOfDay values, so it names an hour and not a moment; an end earlier than its start means the block crosses midnight and resolves onto the following CalendarDay. Generating an Event copies each TemplateTimeBlock into an EventTimeBlock that records which TemplateTimeBlock it came from. That link is the hinge a UsualSetup matches on to auto-seed inclusions, so it survives edits: relabelling or retiming a TemplateTimeBlock, or moving its template to another weekday, keeps its identity. Removing a TemplateTimeBlock removes every UsualSetup entry for it. Labels are unique within a template.
_Avoid_: TimeBlock (bare), period, shift, slot

**UsualSetup** (UI: Usual setup · pt-BR: Configuração padrão):
A per-Ministry standing rule declaring which EventTemplate TemplateTimeBlocks that Ministry is always on (e.g. "Projection serves every Sunday block, Wednesday night"). Per TemplateTimeBlock it records: whether the Ministry serves it, how the Ministry splits it into Shifts, and the headcount per Shift (per Sector and Role). When a Cycle's Events are generated, matching EventTimeBlocks auto-seed the Ministry's inclusions, Shifts, and ShiftRequirements in its MinistryParticipation, which the leader then confirms and tweaks. Bound to templates through the TemplateTimeBlock each EventTimeBlock came from. It is a pre-fill helper only — orthogonal to the Ministry's `defaultDirection`, which is a separate ministry-wide setting, not part of the setup. A TemplateTimeBlock the Ministry serves names at least one headcount; a (Sector, Role) pair it leaves out is not needed. A ChurchAdmin or the Ministry's leader maintains it, and a change reaches only Cycles sent after it; already-sent Cycles keep what they were seeded with.
_Avoid_: MinistryServingProfile, StandingInvolvement, MinistryDefault, profile

**MinistryParticipation**:
A single Ministry's preparation of a sent Event — the set of EventTimeBlocks that Ministry is **opted into** (stored as inclusions; an EventTimeBlock with no inclusion means the Ministry is not serving it), its per-EventTimeBlock staffing, and its stage. One per (Ministry, Event). Its stages, with the leader's action that enters each:

| Stage | Action (EN · pt-BR) | Status (EN · pt-BR) |
|---|---|---|
| preparing | Prepare · Preparar | Preparing · Em preparação |
| availability requested | Ask for availability · Pedir disponibilidade | Availability requested · Disponibilidade solicitada |
| assigning | Assign · Montar escala | Assigning · Montando escala |
| published | Publish · Publicar escala | Published · Escala publicada |

A Ministry moves its MinistryParticipations through these stages one Schedule at a time: it asks for availability, assigns and publishes the whole Schedule together, independently of other Ministries on the same Events. It may assign once it has asked for availability; its first Assignment moves it from availability requested to assigning, and answers are still accepted afterwards. Inclusions default to nothing and are seeded from the Ministry's UsualSetup when the Cycle's Events are generated; the leader confirms and adds one-off inclusions for dynamic Events. This is where per-Ministry scheduling state lives, since the Event is church-owned.
_Avoid_: Tailoring, Rostering, Participation, involvement, ministry event

**Schedule** (pt-BR: Escala):
One Ministry's part of one sent Cycle: its MinistryParticipations in that Cycle taken together. It is the unit a Ministry prepares, asks availability for, assigns and publishes, and it shows as one row with its stage on the Schedules list ("Kids · Outubro 2026"). A Volunteer sees the published Schedules of the Ministries they serve in. In pt-BR *escala* also names an Assignment, so a Schedule is always qualified: *Escala do Kids · Outubro 2026*, *Escalas dos ministérios*.
_Avoid_: Ministry-cycle, roster, rota

**EventTimeBlock** (UI: Time block · pt-BR: Horário):
A church-level block of time within an Event — a shared service block (e.g. the 10:30 service) or an overall span — that Ministries opt into or out of. Its bounds are Instants. It is the same for every Ministry; per-Ministry subdivision happens below it in Shifts. Once the Cycle is sent, a single EventTimeBlock may be moved (same duration, its Shifts moving with it, the Event's bounds stretching to hold it) or cancelled on its own, until it starts.
_Avoid_: TimeSlot, slot, period

**Shift** (pt-BR: Turno):
A Ministry's subdivision of an EventTimeBlock inside its MinistryParticipation — the actual piece it staffs, bounded by Instants. Two Ministries may split the same EventTimeBlock differently (projection 2×4h, kids 4×2h). Default is one Shift equal to the whole EventTimeBlock (no split). A Shift must lie entirely within its parent EventTimeBlock's bounds — enforced as a domain invariant and by the creation form. Shifts are created either by dividing the EventTimeBlock into N equal parts or by setting times manually (unequal parts allowed). ShiftRequirements, Assignments, and UnavailableShifts all attach to a Shift, not the EventTimeBlock. A Shift with no ShiftRequirement is an anomaly, not a way to say "nobody needed": it is flagged, and the Ministry cannot ask for availability until it is fixed. A Ministry that needs nobody for a Shift removes the Shift or opts out of the EventTimeBlock.
_Avoid_: Sub-slot, slot, block, period

**ShiftRequirement** (UI: People needed · pt-BR: Pessoas necessárias):
The staffing need for one Role at one Sector within a **Shift**, owned by one MinistryParticipation (e.g., Babies Room: Teacher ×1, Helper ×3). The Sector is always present. Its headcount is **people needed**, shown against progress as "3 of 5 assigned" (pt-BR: "3 de 5 escalados"). It is at least one: a Role not needed at a Sector has no ShiftRequirement, which the screens show as 0. It cannot drop below the Volunteers already assigned to it.
_Avoid_: SlotRequirement, staffing need, requirement

**Assignment** (pt-BR: Escala):
The placement of a Volunteer into exactly one ShiftRequirement — a Role at a Sector within a **Shift** — scoped to a MinistryParticipation. In pt-BR it shares *escala* with Schedule, so it is always qualified by its day and time (*Escala de dom 12 out · 10:30*); the verb is *escalar*, a placed Volunteer is *escalado*, and *Minha escala* (UI: My schedule) gathers a Volunteer's Assignments. One Assignment per Volunteer per Shift, and never two Assignments for one Volunteer whose Shifts overlap, in any Ministry (no double-booking): the first Ministry to assign someone holds them for that time. When a ChurchAdmin moves an Event or EventTimeBlock so that someone would be double-booked, that person's Assignment on the moved one is withdrawn. Cancelling an Event or EventTimeBlock cancels its Assignments. A Volunteer sees their Assignments only once the Schedule is published, and does not confirm or decline them: a published Assignment means they serve. Assignments can be added, moved or removed, before or after publishing, until their Shift starts; from then on they are fixed.
_Avoid_: Booking, scheduling, escalação (pt-BR)

**Swap request** (pt-BR: Pedido de troca):
A Volunteer's request to be taken off one of their published Assignments whose Shift has not started, asking the leader to put someone else in their place. The Volunteer is expected to find that person first and say who. The Assignment stays until the leader changes it: a request never removes anyone by itself. One open request per Assignment. It ends as **covered** (the leader moved or removed the Assignment, or a ChurchAdmin's move withdrew it), **kept** (the leader keeps the Volunteer on, optionally with a reply), **withdrawn** by the Volunteer, or **expired** (the Shift started with it still open). Cancelling its Event or EventTimeBlock closes it too, sending nothing of its own. A moved Assignment keeps its open request. Its note is seen only by the Ministry's leaders and ChurchAdmins.
_Avoid_: Need help, late dropout, cancellation, cover request

**Actor**:
The person who performed an audited action in the scheduling system. An Actor may be a Volunteer, Ministry Leader, or Admin depending on the workflow.
_Avoid_: Leader (when the action may also be performed by volunteers or admins)

**ChurchAdmin** (UI: Admin · pt-BR: Administrador):
A Church Member whose Church Membership grants management authority across every subordinate scope in that Church. Participation still requires the relevant Scoped Membership.
_Avoid_: Owner, superadmin, manager

**AvailabilityCheck** (UI: Availability · pt-BR: Disponibilidade):
The sheet a Volunteer answers and confirms — one per `(Cycle, Ministry Membership)`, so a Volunteer serving in two Ministries gets two checks. A Ministry **asks for availability** once per Schedule, covering every Shift it serves in that Cycle together, and only after no Shift is flagged. Only Volunteers holding a Role that some Shift in the Cycle needs get a check; one who becomes eligible later (joins the Ministry, or a Role they hold becomes needed) gets it with the next reminder. The ask may carry a **deadline** (UI: Deadline · pt-BR: Prazo), shown to the Volunteer and **past deadline** (pt-BR: Prazo vencido) once passed; answers are still accepted after it. A check is either **not confirmed yet** (pt-BR: Ainda não confirmada; the Volunteer hasn't looked, so nothing is known) or **confirmed** (pt-BR: Confirmada), even with no UnavailableShift: confirmed with none means available for every Shift. A reminder goes only to Volunteers whose check is not confirmed yet. A check shows only the Shifts that need a Role the Volunteer holds, and its answers stay changeable after confirming until the Shift is published. Being available for overlapping Shifts in two Ministries is allowed; what prevents double-booking is the Assignment, not availability.
_Avoid_: AvailabilityRequest, survey, answer-by date

**UnavailableShift** (UI: Unavailable · pt-BR: Indisponível):
One Shift on an AvailabilityCheck that the Volunteer can't serve. A Volunteer is available by default, so an AvailabilityCheck lists only its exceptions: *Ana's check has 2 UnavailableShifts.* Its atomic unit is a single **Shift** (a "whole day" action just marks every Shift falling on that CalendarDay in the Church Timezone). Because a Ministry splits a long EventTimeBlock into multiple Shifts, per-Shift exceptions express partial availability (serve the first block, not the second) with no extra concept.
_Avoid_: Availability (for the exception), unavailability, mark, blockout, schedule

**Notification** (pt-BR: Notificação):
A private message from the Church to one of its Church Members, any Person who is a member, whether Volunteer, leader or ChurchAdmin. It always reaches the bell and may also arrive by email; someone outside the Church can never receive one. Messages that go to an email address rather than a member, such as an Invitation to a new Person, a verification code or a password reset, are **Transactional emails**, not Notifications. Volunteer Notifications are scoped to a **Cycle** (the package), not to a single EventTimeBlock — to keep noise low. Base kinds: availability opened, availability reminder (leader may resend, with a cooldown, to Volunteers not confirmed yet), schedule published (once per Schedule, only to Volunteers with at least one Assignment) and schedule updated (sent when the leader chooses to send updates after publishing; it lists only that Volunteer's net changes since they were last told, never for a Shift that has already started, and names a Swap request the change covered). An **Event cancelled** notice goes at once to every Volunteer assigned in a published Schedule when a ChurchAdmin cancels an Event or EventTimeBlock; a ChurchAdmin's move reaches Volunteers only through schedule updated. A Swap request alert to a leader is the inverse direction, as is the **Event changed** alert a Ministry's leaders get (every other ChurchAdmin when the Ministry has no leader) when a ChurchAdmin adds, moves or cancels an Event or EventTimeBlock after the Cycle is sent, as is the Cycle-ready notice every active Ministry's leaders get when a Cycle is sent; the leader's answer when keeping the Volunteer on (swap request answered) goes back to the Volunteer.
_Avoid_: VolunteerNotification, Notice, Alert, message, ping

**Transactional email** (pt-BR: E-mail transacional):
An email sent to an address, whoever owns it, member or not: an Invitation to someone new, a verification code, a password reset. It has no bell entry and is never a Notification.
_Avoid_: Public notification, system email

## Example Dialogue

**Developer**: "Are volunteers assigned directly to an Event or to a specific EventTimeBlock within the Event?"
**Domain Expert**: "Neither — to a Shift. An Event like 'Sunday Morning' has EventTimeBlocks, each Ministry splits those into Shifts, and a Volunteer serves in one Role at one Sector during one Shift."
**Developer**: "Can a Volunteer serve in multiple Roles during the same Shift?"
**Domain Expert**: "No, a Volunteer can only hold one Assignment per Shift, and never two whose Shifts overlap. We must prevent double-bookings."

**Developer**: "Who performed this audit action — should we call them the Leader or the Actor?"
**Domain Expert**: "Use Actor. Some audit actions are performed by leaders, but others are performed by volunteers or admins, so Actor is the broader canonical term."
