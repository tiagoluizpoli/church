# Inventory: the current app against the Flow catalogue

Resolves [Inventory the current app against the Flow catalogue](https://github.com/tiagoluizpoli/church/issues/366),
a ticket on the map [MVP Journeys: flows, page map and spec cut](https://github.com/tiagoluizpoli/church/issues/365).
Surveyed `develop` @ `54b0ee7` on 2026-10-08.

**Fixing nothing.** This is what the Flow tickets decide against.

## Method

- **Code**: every web route (`apps/web/src/routes`), nav item (`app-shell.tsx`), feature
  component, and every server controller route with its gate.
- **Runtime**: a throwaway worktree seeded with `db:reseed:dev` (Igreja Semente, anchor
  2026-10-08), server + web in dev. Each step of the J3→J9 chain was run as the real
  persona, through the API (curl with a Better Auth session) and then through the UI (Playwright):
  admin Helena Duarte, Kids leader Natália Viana, Kids TeamLeader Patrícia Cardoso,
  Volunteer Rafael Moura, plus a new user who redeemed an invitation.
- **Labels**: **keep** (works, serves a Flow) · **fix** (serves a Flow, broken or
  incomplete) · **missing** (a Flow needs it, nothing exists) · **extra** (serves no Flow).
  "Verified" means it was run; "code" means it was read but not run.

## The findings that matter

These seven decide whether the MVP chain works at all. Each one has repro steps below.

| # | Finding | Flows hit |
|---|---|---|
| B1 | **No one can join a church that already has 100 members.** Better Auth's organization plugin caps membership at its default of 100; Igreja Semente has 282. Every Church Invitation redemption fails, and the UI blames the password. | onboarding, invitations |
| B2 | **A Ministry leader who is not an admin cannot open the prepare or staffing pages.** Those pages call admin-only cycle endpoints and get a 403. The leader API works; only the UI is wired wrong. | prepare, staff & publish, after publish |
| B3 | **An admin without a Volunteer profile gets 401s in the leader UI.** The Rostering page fails ("Check your connection"), the notification bell polls 401 forever with a red toast, and home is an empty "Volunteer dashboard". | home, prepare, staff |
| B4 | **The cycle end date is exclusive in code but read as inclusive.** A 12–25 Oct cycle gets no Event on Sunday the 25th. The seed stores September as `09-01 → 10-01`, but the reseed log reads it as "09-01 to 09-30". | planning a cycle |
| B5 | **The nav's "Availability" item opens a dead editor.** It goes to the legacy per-Event dashboard tab. Its save does nothing, it says "no slots yet", and it shows "Missing" after the check is confirmed. The working AvailabilityCheck page is reachable only from a button. | answering availability |
| B6 | **A locked Event cannot be moved, edited or cancelled through the planning API.** Editing needs "reopen", and a reopened Event can never be locked again. Cancelling a scheduled Event works only through the legacy `/events/:id/cancel`. | admin changes after lock |
| B7 | **The church's first admin invitation is never emailed.** The outbox kind exists, but the drainer fails it as "not yet implemented"; the provisioning script prints the link instead. No email exists for "availability opened", "schedule published" or "need help": those are in-app only. | provisioning, notifications, need help |

---

## By Flow ticket

### [Flows: provisioning & onboarding](https://github.com/tiagoluizpoli/church/issues/371)

| Item | Label | Notes |
|---|---|---|
| `provision-church.ts`, `ensure-platform-operator.ts`, `bun run db:init` | **keep** | Script creates the Church + first Church Invitation, prints the redemption path. Fits "minimal helper". |
| Bootstrap invitation email (`invitation.church-bootstrap`) | **fix** | `db-outbox-drainer.ts:110` fails it terminally: "Delivery not yet implemented". (B7) |
| Church Invitation page `/invitations/church/$id` (preview → send code → name/password → join) | **fix** | Verified broken (B1). Repro below. |
| Decline a Church Invitation | **missing (UI)** | API `POST /redemption/church/:id/decline` exists; the page has no Decline button. |
| Ministry Invitation page `/invitations/ministry/$id` (accept / decline, signed in) | **keep** (code) | Accept/decline wired; not run end-to-end because of B1. |
| Expired / invalid invitation states | **keep** (code) | Page has not-found and rate-limit (429) branches. Not run. |
| Login `/login` | **keep** | "Access is invitation-only". Verified. |
| Log out | **keep** | User menu → Sign Out. |
| Forgot password | **missing** | No route, no link on login. |
| Land on the right home | **fix** | Everyone lands on `/dashboard` = "Volunteer dashboard" (see home & navigation). |

**B1 repro.** As Natália (leader), `POST /ministries/<Kids>/invitations` for a new email →
open `/invitations/church/<id>` → Send code → read it from
`GET /redemption/church/<id>/debug-code` → Join. UI: "We couldn't create your account. Try
again with a different password." Cause: `POST /api/auth/organization/accept-invitation`
as the new user returns `403 ORGANIZATION_MEMBERSHIP_LIMIT_REACHED`.
`packages/auth/src/index.ts:58` calls `organization({...})` with no `membershipLimit`.
Side effects: `db-redemption-manager.ts:205` swallows the error with no log, and leaves a
**half-made User** (user + session rows, Church Invitation still `pending`, no member row).
The E2E `tests/identity/redemption-new-user.spec.ts` passes only because E2E churches are small.

### [Flows: Ministries & Roles](https://github.com/tiagoluizpoli/church/issues/372)

| Item | Label | Notes |
|---|---|---|
| Create / edit / archive a Ministry | **missing** | No endpoint, no UI (as charted). |
| Manage Roles (admin any, leader own) | **missing** | No endpoint, no UI. |
| Set default direction `PATCH /admin/ministries/:id/default-direction` | **missing (UI)** | Endpoint works for admin only (leader 403). No UI. |
| Standing serving profile `GET/PUT /admin/ministries/:id/serving-profile` | **missing (UI)** | Admin-only (leader 403 verified). No UI. Seeded profiles do pre-fill inclusions, Shifts and headcounts on lock (verified). |
| `ministry.enforcementType` (`soft`) | **extra** | On the Ministry row; no Flow names it. |

### [Flows: invitations](https://github.com/tiagoluizpoli/church/issues/373)

| Item | Label | Notes |
|---|---|---|
| Mint a Ministry Invitation `POST /ministries/:id/invitations` | **missing (UI)** | API verified: leader → volunteer level OK; leader → leader level 403 `INSUFFICIENT_INVITATION_AUTHORITY`; admin → leader OK; TeamLeader → 404 `MINISTRY_NOT_FOUND`. Unknown email → `chained` (Church + Ministry pair), 48 h expiry. **No web caller.** |
| Admin invites a ChurchAdmin (Church Invitation alone) | **missing** | No endpoint (as charted). |
| See pending invitations | **missing** | No list endpoint. |
| Resend `POST /ministries/:id/invitations/:id/resend` | **missing (UI)** | Endpoint with cooldown and daily cap; no web caller. |
| Revoke | **missing** | No endpoint. |
| Invitation email (`invitation.ministry` / `invitation.chained`) | **keep** | Goes through the outbox; verified `sent` (capture sender in dev, Resend in production). English-only hardcoded HTML in `resend-email-sender.ts`. |

### [Flows: people](https://github.com/tiagoluizpoli/church/issues/374)

| Item | Label | Notes |
|---|---|---|
| People directory, member detail | **missing** | No endpoint, no UI. |
| Assign / remove a Volunteer's Roles | **missing** | Roles are set only by an invitation (`roleIds`). |
| Promote / demote access, remove from a Ministry | **missing** | No endpoint. |
| Eligible-volunteer list per Shift (staffing) | n/a | Closest existing read of people; leader-scoped. See staffing. |

### [Flows: event templates](https://github.com/tiagoluizpoli/church/issues/375)

| Item | Label | Notes |
|---|---|---|
| Template library `/scheduling/planning-cycles/templates`: list, create with TimeBlocks, edit, delete | **keep** | Admin-only API; reached from a cycle page ("Template library") with a "Back to selected cycle" link. Sits under Cycles, as charted. |
| Apply templates to a cycle | **keep**, but see B4 | Verified: generates Events + TimeSlots; skips the cycle's last day. |

### [Flows: planning a cycle](https://github.com/tiagoluizpoli/church/issues/376)

| Item | Label | Notes |
|---|---|---|
| Cycle list `/scheduling/planning-cycles`, create `/new` (dialog over the list) | **keep** | Verified. Breadcrumb says "Planning cycles", nav says "Cycles". |
| Cycle review `/scheduling/planning-cycles/$id`: Apply template, Add event, Template library, Lock | **keep** | Verified on desktop. Lock is enabled with zero Events. |
| Cycle end date | **fix** | B4. `cycle-event-generator.ts:165` and archiving (`db-planning-cycle-manager.ts:188`) use `endDate` exclusively. Repro: create 2026-10-12 → 2026-10-25, apply "Culto de Domingo" + "Culto de Quarta" → 3 Events (Wed 14, Sun 18, Wed 21), no Sun 25. CONTEXT.md calls it a CalendarDay range; which end is meant must be decided. |
| Add a one-off Event | **fix** | "Hourly" asks for a date only; the Event spans the whole day with **no TimeSlots**. Ministries have nothing to opt into until the admin adds slots. |
| Add a multi-day Event | **fix** | "Day-based" takes a date range; same no-slot gap. |
| Edit / delete Event and TimeSlots in draft | **keep** (code) | Dialogs wired. "Cancel" on a draft Event **deletes** it (verified). |
| Lock | **keep** | Verified: Events → `scheduled`, one MinistryParticipation per Ministry per Event, profile pre-fill applied. |

### [Flows: preparing a Ministry's cycle](https://github.com/tiagoluizpoli/church/issues/377)

The leader API works end to end (verified as Natália). **The UI does not open for a leader who
is not an admin (B2).**

| Item | Label | Notes |
|---|---|---|
| Cycles needing my action: `/scheduling` cards, `/scheduling/tailoring` (pick Ministry) → `/$ministryId` (pick cycle) | **fix** | B2: `/scheduling/tailoring` calls `GET /admin/planning-cycles?state=locked` → 403 → "You don't have access to this ministry list". For an admin: B3. |
| Workspace `/scheduling/tailoring/$m/$c`: opt slots in/out, split (equal-N / manual), headcount per Role | **fix** | B2: calls `GET /admin/planning-cycles/:id` → 403 → "You don't have access to this workspace". API: inclusions, split (verified), requirement upsert all work. |
| Headcount 0 | **fix** | `PUT /tailoring/shifts/:id/requirements` with `requiredCount: 0` → 422 (`minimum: 1`). No endpoint deletes a requirement. Feeds [Optional Roles: where a zero headcount is set](https://github.com/tiagoluizpoli/church/issues/370). |
| Open availability ("Request availability") | **keep** (API verified) | One AvailabilityCheck per Ministry membership per cycle (150 for Kids); repeat calls create 0. In-app notice `availability_reminder` only; no email. |
| Track who answered | **missing (UI)** | `GET /tailoring/cycles/:id/availability-status` works (verified). Its component `availability-status-section.tsx` is not mounted anywhere. |
| Resend a reminder | **keep** (code) | The same button calls `resend-availability` for participations already fired. |
| Two kinds of requirements | **extra** | Shift-level SlotRequirements (live) sit next to legacy TimeSlot-level `slot.requirements`, both returned by the participation read. |

### [Flows: answering availability](https://github.com/tiagoluizpoli/church/issues/378)

| Item | Label | Notes |
|---|---|---|
| `/volunteer/availability`: list checks, detail, mark Shifts / whole days, confirm | **keep** | Verified (API + page on 390 px). Confirm with zero marks works. Two Ministries → two checks (by design). |
| Change after confirming | **keep**, rule undecided | Marks can still change after confirm; the state stays `confirmed`. No cutoff exists. |
| Nav "Availability" → `/availability` → `/dashboard?section=availability` | **fix** | B5. Legacy per-Event tab: save is `useMutation({ mutationFn: async () => undefined })` (`use-volunteer-dashboard.ts:222`), the editor says "No slots available yet", it shows "Missing" for the confirmed Outubro check, and it lists a cancelled Event. |

### [Flows: staffing & publishing](https://github.com/tiagoluizpoli/church/issues/379)

| Item | Label | Notes |
|---|---|---|
| Staffing board `/scheduling/rostering/$m/$c` (CycleBuilder) | **fix** | B2: calls `GET /admin/planning-cycles/:id` → 403, skeleton, then redirect to `/scheduling`. Reached from the workspace's "Open builder". |
| Eligible volunteers (availability, conflict, qualified Roles, last served) | **keep** (API verified) | |
| Assign / remove / reassign (reason ≥ 10 chars) / override despite unavailability | **keep** (assign verified; others code) | Assignment starts `pending`. |
| Completion vs headcount | **keep** (API verified) | `requiredCount` 12, `assignedCount` 1, 8%. |
| Publish the cycle for a Ministry, below-full confirm | **keep** (API verified) | First call → `belowFull`, not published; with `confirmBelowFull` → published. Needs `?ministryId=`. |
| Publish one MinistryParticipation `POST /rostering/participations/:id/publish` | **extra** | No web caller. |
| Audit trail (`getCycleAuditLog`, panel in the board; `/assignments/:id/audit`) | keep or park: the ticket's question | Wired in the board; not run because of B2. |
| TeamLeader read-only roster (`/scheduling` Team cards, `/rostering/$m?teamId=`) | **extra** | TeamLeader is treated as a Volunteer in the MVP. |
| Breadcrumb "Rostering" on the board → `/scheduling/rostering` | **fix** | Bare TanStack "Not Found" (verified). |
| Naming | n/a | Nav "Rostering" opens the *prepare* pages (`/tailoring`); the staffing board is `/rostering` ("Open builder"). Input for [Plain-language names for Tailoring and Rostering](https://github.com/tiagoluizpoli/church/issues/369). |

### [Flows: volunteer schedule & notifications](https://github.com/tiagoluizpoli/church/issues/380)

| Item | Label | Notes |
|---|---|---|
| Dashboard tab "Upcoming Assignments" | **keep** | Verified empty state; confirm / "unable to serve" actions wired. |
| Dashboard tab "Ministry Schedule" | **keep** (verified renders) | Lists the past September cycle first. |
| `/notifications` inbox + bell + detail sheet + deep links | **keep** | Verified for a Volunteer. |
| "Schedule published" notice | **keep**, scope differs | One per Event per assigned Volunteer; CONTEXT.md says a VolunteerNotification is scoped to the cycle. |
| Email: availability opened, schedule published | **missing** | B7. In-app only. |
| `GET /volunteer/schedule` vs `GET /volunteer/assignments` | **extra** (one of them) | Two reads of "my assignments". |

### [Flows: need help](https://github.com/tiagoluizpoli/church/issues/381)

| Item | Label | Notes |
|---|---|---|
| `POST /volunteer/assignments/:id/cancel` | **fix** (vs. the Flow) | Verified: **deletes** the Assignment and sends in-app `assignment_removed` ("A volunteer cancelled their assignment… The slot is open again.") to the Ministry's leaders, through their Volunteer profiles. A leader or admin without one gets nothing; no email. |
| `PATCH /volunteer/assignments/:id` `declined` ("Confirm unable-to-serve notice" dialog) | **keep** (code) | Closest existing shape to a "flag". |
| A flag that keeps the Assignment and alerts the leader | **missing** | |

### [Flows: admin changes after lock](https://github.com/tiagoluizpoli/church/issues/382)

Verified on the locked Outubro cycle (B6):

| Action | Result | Label |
|---|---|---|
| Add an Event to a locked cycle | 201, born `scheduled`, one participation per Ministry | **keep** |
| Move / edit a scheduled Event | 409 `Cannot transition from scheduled to update` | **fix** |
| Add a TimeSlot to a scheduled Event | 409, same | **fix** |
| Reopen an Event | 204 → `draft`; edits then work | **keep** |
| Re-lock a reopened Event | `POST …/lock` → 409 `Cannot transition from locked to locked`; **no way back to `scheduled`** | **fix** |
| Cancel a scheduled Event (planning API) | 409 `Cannot transition from scheduled to cancel` | **fix** |
| Cancel a scheduled Event (legacy `POST /events/:id/cancel`) | 201, `cancelled` | **extra** (legacy path) |
| Who is told | Not observed (no Assignments on the cancelled Event); no "event cancelled" notice type exists | **missing** |

### [Flows: leader changes after publish](https://github.com/tiagoluizpoli/church/issues/383)

| Item | Label | Notes |
|---|---|---|
| Reassign / override after publish | **keep** (code) | Same board actions; `assignment_added` / `assignment_removed` notices exist. Blocked in the UI by B2. |
| Respond to a "need help" flag | **missing** | Depends on the need-help Flow. |

### [Flows: home & navigation per persona](https://github.com/tiagoluizpoli/church/issues/384)

| Item | Label | Notes |
|---|---|---|
| Landing `/` → `/dashboard` "Volunteer dashboard" for every persona | **fix** | Admin with no Volunteer profile: empty page backed by 401s (B3). |
| Admin home + first-run checklist | **missing** | |
| Nav: Dashboard, Availability; Scheduling → Cycles, Rostering if `canAccessScheduling` | **fix** | Leaders see "Cycles" (admin-only → redirected to `/scheduling`); "Availability" goes to the dead tab (B5). |
| `/scheduling` capability cards | **keep** | Admin sees only "Church planning", no Ministry cards. A Volunteer can open it by URL ("No Scheduling work"). |
| Notification bell for an admin with no Volunteer profile | **fix** | Polls `/volunteer/notifications` → 401, red "Request failed with status code 401" toast (B3). |
| Select church, switch-church confirm, no-access, cross-church deep links | **keep** | Verified select-church for two-church personas. |
| Breadcrumbs (auto from URL, ids hidden, overrides for cycle/Ministry names) | **fix** | Dead crumb on the board; label drift ("Planning cycles" vs "Cycles"). |
| User menu (name, Sign Out), theme toggle, mobile drawer + bottom nav | **keep** | |
| Command palette (Ctrl+K) | **extra** | No Flow needs it. |
| `/prototype/active-church` route + `prototype-switcher.tsx` | **extra** | A design prototype shipped in the route tree. |

---

## Email today (for the fog patch "Email delivery")

- **Transport**: `ResendEmailSender` in production (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`),
  `CaptureEmailSender` everywhere else (in memory; backs the debug-code route).
  Wired in `apps/server/src/main/di/injections.ts:185`.
- **Path**: transactional outbox (`outbox_message`) drained by `OutboxPoller`, with retry
  policy. The verification code is sent directly, not through the outbox.
- **Sent**: `invitation.ministry`, `invitation.chained`, `invitation.verification-code`,
  `redemption.accepted`, `transfer.ministry-digest`, `transfer.leaderless-ministry`.
- **Not sent**: `invitation.church-bootstrap` (terminal "not yet implemented"); anything for
  availability opened, schedule published, reminders, or need help (in-app
  `volunteer_notification` rows only).
- **Templates**: inline English HTML in `resend-email-sender.ts`; the transfer digest prints
  times in UTC.

## Extra: legacy surfaces no Flow uses

Input for [Dispositions for existing features](https://github.com/tiagoluizpoli/church/issues/386).

- **Server**: `time-slot-controller` (`/events/:id/slots*`, TimeSlot-level requirements,
  `generate`); `event-controller` `schedule-builder`, `reminders`, legacy `cancel`;
  `assignment-controller` (`/assignments` create / override / delete / audit, alongside
  `/rostering` equivalents); `POST /rostering/participations/:id/publish`;
  `GET /volunteer/assignments` next to `/volunteer/schedule`; `GET /feature-flags`
  (no web caller; Unleash-backed).
- **Web**: `use-schedule-builder.ts` (no importers); `availability-status-section.tsx`
  (no importers, though "track who answered" needs it); `QuickCreateEventModal`'s
  `ministry` target (`adminApi.createEvent` throws "Quick create is not available");
  `publishEvent` and `listRoleTemplates` stubs in `utils/api-instances.ts`; the dashboard's
  per-Event availability tab (B5).
- **Kept as is, no Journey** (map's Out of scope): Volunteer Transfer
  (`/redemption/transfer/*`, `volunteer-transfer-flow.tsx`), multi-church switching.

## Not verified

- Ministry Invitation accept/decline end-to-end, expired-invitation pages (blocked by B1 on
  the seeded church; an E2E covers the small-church path).
- The staffing board UI, audit panel, reassign/override UI (blocked by B2 for the leader persona).
- Who is notified when a scheduled Event with Assignments is cancelled or reopened.
