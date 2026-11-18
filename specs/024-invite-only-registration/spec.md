# Feature Specification: Invite-Only Registration, Tenancy & Auth Route Protection

**Feature Branch**: `024-invite-only-registration`

**Created**: 2026-07-27

**Status**: Ready for planning

**Input**: Wayfinder map [Invite-only registration & auth route protection — spec (#29)](https://github.com/tiagoluizpoli/church/issues/29) and its thirteen resolved decision tickets ([#30](https://github.com/tiagoluizpoli/church/issues/30), [#31](https://github.com/tiagoluizpoli/church/issues/31), [#32](https://github.com/tiagoluizpoli/church/issues/32), [#33](https://github.com/tiagoluizpoli/church/issues/33), [#34](https://github.com/tiagoluizpoli/church/issues/34), [#35](https://github.com/tiagoluizpoli/church/issues/35), [#36](https://github.com/tiagoluizpoli/church/issues/36), [#38](https://github.com/tiagoluizpoli/church/issues/38), [#39](https://github.com/tiagoluizpoli/church/issues/39), [#40](https://github.com/tiagoluizpoli/church/issues/40), [#41](https://github.com/tiagoluizpoli/church/issues/41), [#42](https://github.com/tiagoluizpoli/church/issues/42), [#43](https://github.com/tiagoluizpoli/church/issues/43), [#44](https://github.com/tiagoluizpoli/church/issues/44)).

**Backlog item**: [BL-021 — Auth route protection & sign-up suppression (invite-only flow) (#18)](https://github.com/tiagoluizpoli/church/issues/18) · [`BL-021.md`](../../manual-planning/0001-volunteer-scheduling/backlog/items/BL-021.md)

---

## Overview

The application must operate on an administrative invitation model, and today it does the opposite: `packages/auth/src/index.ts` enables `emailAndPassword` with no gate, and the session-create hook `packages/auth/src/hooks/soft-registration.ts` auto-inserts an **`active` volunteer row in `system-church`** for every new User. A stranger who signs up does not land in a dead account — they land holding a resolvable volunteer context, which is exactly what six controllers' `preValidation` hooks require, behind no further gate.

Closing that door turned out to require settling what a tenant *is*. This specification therefore delivers four coupled things as one change:

1. **A tenancy and authority seam.** Better Auth's `organization` plugin becomes the Church record and the source of Church Membership and Active Church; the application keeps Volunteer, Ministry, Team, Roles and all scoped authority behind one `AuthorityService`.
2. **Invite-only registration.** Public credential sign-up is closed at the HTTP router; accounts are created only by redeeming a targeted invitation. Churches themselves come into existence only through Platform Operator provisioning.
3. **Redemption, delivery and transfer.** A public redemption journey with verified recipient identity, email delivery through one Church-scoped outbox, and a self-service Volunteer Transfer for the cross-Church conflict the one-active-Volunteer-profile rule produces.
4. **A consolidated route tree.** One `_authenticated` guard proving identity, one nested `_active-church` guard owning `AppShell`, and the five duplicated per-route session guards deleted.

This document is a **specification**, not a plan. Every decision below was resolved and accepted on the map before this document existed; nothing here is newly invented, and each section names the ticket that decided it so the reasoning stays reachable. The implementing session executes it without re-litigating.

### Provenance map

| Section | Decided by |
|---|---|
| §1 Tenant & authority seam | [#38](https://github.com/tiagoluizpoli/church/issues/38), [#39](https://github.com/tiagoluizpoli/church/issues/39), [#31](https://github.com/tiagoluizpoli/church/issues/31), [#42](https://github.com/tiagoluizpoli/church/issues/42) |
| §2 Church Provisioning & bootstrap | [#43](https://github.com/tiagoluizpoli/church/issues/43) |
| §3 Sign-up suppression | [#35](https://github.com/tiagoluizpoli/church/issues/35), survey [#30](https://github.com/tiagoluizpoli/church/issues/30) |
| §4 Schema delta | [#32](https://github.com/tiagoluizpoli/church/issues/32), [#39](https://github.com/tiagoluizpoli/church/issues/39), [#40](https://github.com/tiagoluizpoli/church/issues/40), [#43](https://github.com/tiagoluizpoli/church/issues/43), [#44](https://github.com/tiagoluizpoli/church/issues/44) |
| §5 Minting | [#34](https://github.com/tiagoluizpoli/church/issues/34), [#32](https://github.com/tiagoluizpoli/church/issues/32) |
| §6 Delivery | [#40](https://github.com/tiagoluizpoli/church/issues/40) |
| §7 Redemption | [#33](https://github.com/tiagoluizpoli/church/issues/33), [#32](https://github.com/tiagoluizpoli/church/issues/32), [#42](https://github.com/tiagoluizpoli/church/issues/42) |
| §8 Volunteer Transfer | [#44](https://github.com/tiagoluizpoli/church/issues/44) |
| §9 Route tree | [#36](https://github.com/tiagoluizpoli/church/issues/36), [#42](https://github.com/tiagoluizpoli/church/issues/42) |
| §10 Retirement | [#35](https://github.com/tiagoluizpoli/church/issues/35), [#39](https://github.com/tiagoluizpoli/church/issues/39), [#43](https://github.com/tiagoluizpoli/church/issues/43) |
| §11 Verification | [#41](https://github.com/tiagoluizpoli/church/issues/41) |

Domain vocabulary is `CONTEXT.md`, already amended by the map: **User, Church, Platform Operator, Church Provisioning, Church Membership, Church Member, Church Invitation, Ministry Invitation, Active Church, Scoped Membership, Access Level, Ministry Membership, Ministry Access Level, Team Membership, TeamLeader, Role, Volunteer, Retired Volunteer Profile, Volunteer Transfer, ChurchAdmin**. Use those words; the "Avoid" lists are binding.

### Standing constraint: the repo is pre-production

No real user data exists. **No data migration is ever required.** Every schema change below is a destructive reseed, not a backfill. This is what makes the seam cheap to establish now and expensive later.

---

## 1. Tenant and authority seam

### 1.1 Ownership split ([#38](https://github.com/tiagoluizpoli/church/issues/38))

Better Auth's `organization` plugin is adopted at a **strict boundary**. Two writable representations of any of these facts are prohibited.

**Better Auth owns:**

- One `organization` row **is** one domain **Church** (identity: `id`, `name`, `slug`).
- `member` is the **sole** source of Church Membership, and `member.role` the sole source of its Access Level.
- `session.activeOrganizationId` is the **sole** Active Church selector.
- `invitation` is the canonical **Church Invitation**: email-addressed, single-use.

**The application owns:**

- Volunteer profiles and the one-active-profile invariant.
- **Ministry Invitations** and Ministry Memberships.
- Team Memberships — assigned by an authorized leader, **no** invitation or acceptance lifecycle.
- Roles, and all Ministry-/Team-scoped authority.
- `AuthorityService` as the **sole** application authorization policy engine.

Better Auth's `hasPermission` may protect Better Auth's own organization-management endpoints internally. Controllers and use cases **MUST NOT** call it as a parallel domain policy system.

Rejected and not to be revisited during implementation: full plugin-domain adoption (its org-wide flat role assignment and role-less team membership cannot express Church/Ministry/Team scoped membership — see the survey [#30](https://github.com/tiagoluizpoli/church/issues/30)), and fully hand-rolled tenancy (it duplicates state Better Auth already owns).

### 1.2 Cardinality rules ([#39](https://github.com/tiagoluizpoli/church/issues/39), [#31](https://github.com/tiagoluizpoli/church/issues/31), [#44](https://github.com/tiagoluizpoli/church/issues/44))

- A User **may** hold Church Membership in **many** Churches, and **may administer many** Churches.
- A User **may have only one _active_ Volunteer profile**, therefore participates as a Volunteer in exactly one Church at a time.
- Retired Volunteer Profiles are unbounded: a User may hold many, exactly one of which is active (§8).
- The rule is enforced structurally by a **partial unique index** on `volunteer(user_id) WHERE left_at IS NULL` (§4.5) — not by application code.

The consequence this specification is built around: an invitation from a *second* Church cannot silently reassign a Volunteer. It produces the **split outcome** (§7.5) — Church Membership succeeds, the Ministry half is rejected by name, nothing is reassigned, and the invitation stays `pending`. Volunteer Transfer (§8) is the user's own way out of that state.

### 1.3 Scoped Memberships and Access Levels ([#39](https://github.com/tiagoluizpoli/church/issues/39))

Each domain owns a **typed** Scoped Membership with its own valid Access Levels. There is no generic polymorphic role table and no arbitrary scope strings.

| Scoped Membership | Access Levels | Stored in |
|---|---|---|
| Church Membership | `member \| admin` | Better Auth `member.role` |
| Ministry Membership | `volunteer \| leader` | `ministry_volunteer` |
| Team Membership | `member \| leader` | `ministry_volunteer_team` |

- `sub_leader` is **retired**. Its intended meaning becomes **TeamLeader**: a Team Membership at `leader`, scoped to explicitly assigned Teams — not a vague Ministry-wide deputy.
- A Church Membership at `admin` (a **ChurchAdmin**) grants a **management override** across subordinate resources in that Church. It creates **no** Ministry or Team Membership and grants **no** participatory action — a ChurchAdmin does not receive Assignments or answer Availability by virtue of being an admin.
- **Role** stays the canonical term for a *function* a Volunteer performs (Vocalist, Teacher, Sound Technician), never a permission. Every Role belongs to exactly one Ministry; global Roles are removed. Access Levels and Roles are separate axes.

### 1.4 The authorization contract ([#39](https://github.com/tiagoluizpoli/church/issues/39))

```text
AuthorityService.can({ user, action, resource })
```

- A Better Auth adapter supplies verified User, Church Membership and Active Church facts.
- Domain repositories supply Ministry Membership, Team Membership, Role, resource ownership and other attributes.
- Each protected action is evaluated **against the specific resource**, never against a coarse route role.
- Missing, stale, cross-Church, or conflicting scope data **denies**.
- Per the constitution's Explicit Parameter Contracts principle, `can` takes one named-`type` object parameter; the same applies to every new function this spec introduces.

### 1.5 Active Church resolution and switching ([#42](https://github.com/tiagoluizpoli/church/issues/42))

- `session.activeOrganizationId` is canonical. Protected requests map it to a Church and **revalidate Church Membership per request**; they never infer Church from a Volunteer row.
- Changing or invalidating Active Church **cancels in-flight Church-scoped requests and removes Church-scoped query data before any destination loads**.
- **Entry gate:** valid existing Active Church → skip selection. Exactly one membership and no active Church → select silently. Several memberships and none active → show the selector. **No** memberships → authenticated, shell-free no-access state.
- **Selector presentation is the accepted variant C — "Compare access"**: Church identity/location, Church Membership access, available application areas, last-opened time; a compact list on mobile. The retained prototype at `apps/web/src/routes/prototype/active-church.tsx` (+ `active-church.NOTES.md`, route `/prototype/active-church`, variant C default) is the **implementation reference**; delete it only as a deliberate part of this implementation's handoff.
- Active Church is remembered **only inside the Better Auth session**. A fresh session runs the gate again. No separate browser/User "last Church" preference is introduced now.
- **Switcher placement:** top of the sidebar above Church-scoped navigation on desktop; inside the navigation drawer on mobile. **Not** in the account menu — Active Church is application context, that menu is User identity.
- **Switch routing policy:** routes explicitly declare `preserve` or `fallback`; unknown and new routes default to `fallback` at `/dashboard`. `preserve` replays the full path, query and hash **only after authorization against the target Church**; failed authorization falls back to `/dashboard`. Routes carrying Church-owned resource ids normally fall back. The policy seam ships with the first implementation; individual routes may opt into preservation incrementally.
- **Cross-Church destinations:** same-Church destination opens directly. Another Church where the User is a member → **one** confirmation naming current and target Church, then switch and open the exact destination. No Active Church + a verified Church-targeted link → may select its target automatically. **No** membership in the target Church → retain the current Active Church and show a generic access-denied that does not reveal whether the resource exists.
- **Invitation acceptance is itself consent** to enter that Church: make it Active, clear Church-scoped work and cache, and continue to the exact redemption result **without a second switch confirmation**.
- **Session synchronization:** Active Church is session-wide, not tab-local. After another tab changes it, stale tabs immediately cancel scoped requests, disable scoped mutations, and block with *"Active Church changed in another tab."* An explicit **Continue** clears cache and applies the normal route policy. Tabs **MUST NOT** silently reroute over possible unsaved work.
- **Forced recovery:** if the current Church Membership is removed, clear Active Church and never replay the former Church route. The recovery screen names the former Church: *"You no longer have access to [Church]. Your Church Membership was removed."* With several remaining memberships show selector C with that explanation; with one, select it and show the explanation on its dashboard; with none, show it in the shell-free no-access state. Do **not** identify who removed the User.
- **Volunteer language stays inside scheduling contexts.** General selectors, dashboards and navigation expose granted capabilities and available areas; they never announce that an ordinary Church Member is "not a Volunteer". Unavailable scheduling navigation is simply omitted; a direct unauthorized scheduling URL gets a normal access denied.

---

## 2. Church Provisioning and first-administrator bootstrap ([#43](https://github.com/tiagoluizpoli/church/issues/43))

Every invitation presupposes an inviter, so the first administrator must exist before §5 has a root.

### 2.1 The Platform Operator

- **One Platform Operator User per environment**, identified by configuration and seeded at bootstrap.
- It **never holds Church Membership** in any Church, is not a super-tenant, and has **no scope in `AuthorityService`** — which under §1.4 has no scope above Church.
- Provisioning runs as a **server-side script/CLI in the deployment environment**. There is **no HTTP surface**: nothing to authenticate, rate-limit, or accidentally expose.
- Self-service Church creation is rejected for this release — it is unauthenticated tenant creation and would reopen the door §3 closes. It can be added later without redesigning this seam.

### 2.2 The Church record shape

Better Auth `organization` owns Church identity (`id`, `name`, `slug`). The domain `church` table is reduced to an **extension row whose primary key is the organization id**, holding only `timezone` and `settings`.

- Name and slug live in exactly one writable place (§1.1).
- Because the id is the same value, **every existing `churchId` foreign key across scheduling, participation and planning keeps working unchanged.**
- Peer tables synced on write are explicitly rejected.

### 2.3 First authority

- The organization plugin's role set is configured to exactly **`member | admin`**; the creating/first user receives `admin`.
- Better Auth's default `owner` tier is **not** adopted, and adapter-level `owner → admin` mapping is **also** rejected — two vocabularies for one fact is the ambiguity the seam exists to prevent.
- The bootstrap ChurchAdmin receives **no Volunteer profile**. A Volunteer profile is born at first Ministry Membership, for them as for everyone (§4.1).

### 2.4 Account creation for the first administrator

Through **the same public redemption flow as everyone else**. Provisioning mints a Better Auth **Church Invitation** addressed to the administrator's email with `inviterId` = the Platform Operator User; they redeem it and set their own password.

- There is exactly **one** account-creation path in the system.
- No operator ever knows a user's credentials, so no forced-password-change state exists.
- **If the invited email already belongs to an existing User**, redemption attaches Church Membership `admin` to the existing account — they sign in rather than sign up. Permitted, because only Volunteer participation is single-Church and the bootstrap admin has no Volunteer profile.

### 2.5 Atomicity, collision, recovery

Provisioning writes the `organization` row, the `church` extension row and the first Church Invitation **inside a single database transaction**, calling Better Auth's server API with the transaction-bound db handle (or writing its tables directly at provisioning time). Either the whole tenant exists or none of it does.

- **Slug collision** surfaces as a **named error** from the existing unique constraint; the operator retries with a different slug. Idempotent convergence keyed on slug is rejected — it would silently mean "adopt the existing Church".
- **Wrong administrator email** is repaired by **canceling** the Church Invitation and minting a new one. No teardown; nobody has redeemed.
- Sequential-writes-plus-compensation is the documented fallback **only** if Better Auth's server API cannot be enlisted in the transaction, and then requires a stated reconciliation step.

### 2.6 The empty-Church gap — state it, do not paper over it

There is **no Ministry-creation API or UI anywhere in the application**; Ministries exist only through seed scripts. Provisioning seeds **nothing** — a default "General" Ministry would invent domain content the church did not ask for. Ministry management is ruled out of scope for this effort (§14).

> **Consequence, to be carried into release notes:** until Ministry management ships, a provisioned Church can admit Church Members but **cannot form Ministries**, and therefore cannot mint Ministry Invitations.

---

## 3. Sign-up suppression ([#35](https://github.com/tiagoluizpoli/church/issues/35))

### 3.1 The gate

- Configure Better Auth with **`disabledPaths: ["/sign-up/email"]`**.
- The public `POST /api/auth/sign-up/email` route returns HTTP **`404`** with the plain-text body **`Not Found`**.
- The trusted redemption handler calls **`auth.api.signUpEmail(...)` directly**. Better Auth server API calls do not traverse the HTTP router (`auth.api` is `getEndpoints(...).api`; `auth.handler` builds `router(...)` — they fork at `auth/base.mjs:11-51`), so this remains available.

Why the alternatives lose ([#30](https://github.com/tiagoluizpoli/church/issues/30) established each as fact, not preference):

| Mechanism | Blocks HTTP | Blocks `auth.api.signUpEmail` | Verdict |
|---|---|---|---|
| `emailAndPassword.disableSignUp` | yes | **yes** — checked inside the handler, never consults `ctx.request` | rejected: kills redemption |
| `hooks.before` | yes | yes unless guarded on `ctx.request` | rejected: rests on caller-context discrimination |
| `databaseHooks.user.create.before → false` | yes | yes, for *any* caller | rejected: widest net |
| **`disabledPaths`** | yes (404) | **no** | **adopted** — the only mechanism whose block is structurally HTTP-scoped |

Security rests on the disabled HTTP path, **never** on hidden UI.

### 3.2 Provisioning lifecycle after the gate

- **Delete** the session-create soft-registration hook and its `system-church` behavior. Ordinary sign-in creates **no** domain records.
- Redemption explicitly creates or connects the User and establishes Church Membership.
- Accepting a Ministry Invitation establishes Ministry Membership **and creates the Volunteer profile only when the User enters their first Ministry**.
- Delete only `system-church`-specific seed/test artifacts. **Preserve and evolve** the explicit development/test fixtures: `db:seed:dev-users` must stay usable during every implementation phase, and is extended with a **second Church** and invitation states in every lifecycle status so redemption and tenant isolation are exercisable locally.
- Fixture setup may write known state directly; **production provisioning may not**.

### 3.3 The login screen

- `/login` renders `SignInForm` **only**, and explains that access is invitation-only.
- `SignUpForm` is **retained as a dormant reusable component** — it has no public route and no link. (Redemption composes its own account-creation step; keeping the component avoids re-deriving the form.)
- `SignInForm.onSwitchToSignUp` becomes **optional**, and the switch link renders only when a caller supplies it (`apps/web/src/components/sign-in-form.tsx:14`, `:136` are the current required-prop and render sites).

---

## 4. Schema delta

One destructive migration. `packages/db/src/schema/**` plus a generated Drizzle migration; **no backfill**, no data preservation (see the standing constraint).

### 4.1 `ministry_invitation` — rewritten ([#32](https://github.com/tiagoluizpoli/church/issues/32))

A Ministry Invitation is **targeted, never a bearer link**, and grants a Ministry Membership at a stated Ministry Access Level plus a set of Roles. It **never** grants Team Membership.

```text
ministry_invitation
  id                    uuid        pk
  churchId              uuid        not null -> church
  ministryId            uuid        not null -> ministry
  inviteeUserId         text        null     -> user              \ exactly
  churchInvitationId    text        null     -> ba invitation     / one set
  ministryAccessLevel   enum('volunteer','leader')                        not null
  status                enum('pending','accepted','rejected','canceled')  not null default 'pending'
  inviterId             text        not null -> user
  expiresAt             timestamptz not null
  acceptedAt            timestamptz null
  canceledAt            timestamptz null
  createdAt             timestamptz not null
  updatedAt             timestamptz not null

  partial unique (ministryId, inviteeUserId)      where status = 'pending'
  partial unique (ministryId, churchInvitationId) where status = 'pending'
```

Delta against today's table (`packages/db/src/schema/onboarding.ts`):

- **drop** `teamId`, `token`, `type`
- **add** `inviteeUserId`, `churchInvitationId`, `ministryAccessLevel`, `inviterId`, `acceptedAt`, `canceledAt`, `createdAt`, `updatedAt`
- **replace** the `status` value set: `active | used | expired` → `pending | accepted | rejected | canceled`

Rules attached to this table:

- **Exactly one** of `inviteeUserId` / `churchInvitationId` is set — a check constraint, not an application convention.
- **There is no `expired` status.** Expiry is evaluated **lazily at read time** against `expiresAt`, matching Better Auth rather than diverging from it.
- Default expiry **14 days**. A **chained** invitation has no independent clock — its `expiresAt` is only evaluated once the User exists, so in practice the Church Invitation's Better Auth 48-hour default governs the pair.
- **Mint-time guard:** reject when the invitee already holds Ministry Membership in that Ministry. Re-inviting **updates `expiresAt` in place** rather than creating a row (Better Auth's `resend: true` behaviour), which is what the partial unique indexes enforce.

### 4.2 `ministry_invitation_role` — new ([#32](https://github.com/tiagoluizpoli/church/issues/32))

```text
ministry_invitation_role
  id                    uuid pk
  churchId              uuid not null -> church
  ministryInvitationId  uuid not null -> ministry_invitation (cascade)
  roleId                uuid not null -> role                (cascade)
  createdAt             timestamptz not null

  unique (ministryInvitationId, roleId)
```

Mirrors `ministry_volunteer_role` with real FKs. A `uuid[]` column was rejected: no FK, and it pushes existence checking into acceptance-time code.

**A Role deleted between mint and acceptance cascades out of the pending invitation and is simply not granted; acceptance proceeds.** Under-granting means "not yet in the vocalist pool", which a leader fixes in one click; failing acceptance would block a person's account creation over an edit they had no part in. (Role has no create/update/delete anywhere in the server today, so the cascade makes the lenient outcome the default with no acceptance-time branch to write.)

### 4.3 `outbox_message` — new ([#40](https://github.com/tiagoluizpoli/church/issues/40))

One **general, Church-scoped** outbox serving invitation emails and Volunteer-Transfer notifications alike — one worker, one retry policy, one place support looks.

```text
outbox_message
  id                uuid        pk
  churchId          uuid        not null -> church
  kind              enum        not null   -- 'invitation.chained', 'invitation.ministry',
                                           -- 'invitation.church-bootstrap',
                                           -- 'transfer.ministry-digest',
                                           -- 'transfer.leaderless-ministry'
  payload           jsonb       not null   -- typed per kind; carries ids, never rendered copy
  status            enum('pending','sent','failed') not null default 'pending'
  attempts          integer     not null default 0
  scheduledFor      timestamptz not null
  lastError         text        null
  providerMessageId text        null
  correlationId     text        not null
  sentAt            timestamptz null
  createdAt         timestamptz not null
  updatedAt         timestamptz not null
```

The payload references the invitation **by id** and is rendered at send time, so a message never carries a stale copy: **the worker re-reads and skips delivery for an invitation no longer `pending`.** Delivery status for an invitation is a query against this table by correlation, not a second mechanism.

The worker's runtime host (in-process interval, external scheduler) is an implementation choice, constrained to: **at-least-once delivery, idempotent per outbox row, safe under concurrent workers via row-level locking.**

### 4.4 `volunteer_transfer` — new ([#44](https://github.com/tiagoluizpoli/church/issues/44))

Both the domain audit record **and** the idempotency key — one object, so a replay cannot half-exist.

```text
volunteer_transfer
  id                       uuid        pk
  userId                   text        not null -> user
  sourceChurchId           uuid        not null -> church
  destinationChurchId      uuid        not null -> church
  sourceVolunteerId        uuid        not null -> volunteer
  destinationVolunteerId   uuid        not null -> volunteer
  ministryInvitationId     uuid        not null -> ministry_invitation
  withdrawnAssignmentCount integer     not null
  endedMembershipCount     integer     not null
  confirmedAt              timestamptz not null
  correlationId            text        not null
  createdAt                timestamptz not null

  unique (userId, ministryInvitationId)
```

Per-assignment detail is **not** duplicated here; it is reached through `assignment_audit` by `correlationId`.

### 4.5 Changes to existing tables

**`volunteer`** ([#44](https://github.com/tiagoluizpoli/church/issues/44)):

- **add** `leftAt timestamptz null`
- **add** `succeededByVolunteerId uuid null` — self-reference, so the chain is walkable without an audit query
- **replace** `userId text().unique()` with a **partial unique index on `volunteer(user_id) WHERE left_at IS NULL`**
- `volunteerStatusEnum` is **untouched** — `status` keeps meaning "is this person currently servable"; retirement is an independent axis

**`ministry_volunteer`** ([#44](https://github.com/tiagoluizpoli/church/issues/44), [#39](https://github.com/tiagoluizpoli/church/issues/39)):

- **add** `leftAt timestamptz null` (`joinedAt` exists today with no counterpart)
- **replace** `systemRole systemRoleEnum` with the Ministry Access Level `volunteer | leader`; `sub_leader` disappears

**`ministry_volunteer_team`** ([#39](https://github.com/tiagoluizpoli/church/issues/39)): **add** a Team Membership Access Level `member | leader`.

**`role`** ([#39](https://github.com/tiagoluizpoli/church/issues/39)): make `ministryId` **required**; **drop** `isGlobal`.

**`church`** ([#43](https://github.com/tiagoluizpoli/church/issues/43)): reduce to an extension row — **primary key is the organization id**, keeping only `timezone` and `settings`; `name` and `slug` move to `organization`.

**`church_admin`** ([#39](https://github.com/tiagoluizpoli/church/issues/39)): **dropped entirely.** Church-wide administration is Better Auth `member.role = 'admin'`.

**`system_role` enum** ([#39](https://github.com/tiagoluizpoli/church/issues/39)): **dropped.**

**Better Auth tables**: the `organization` plugin's `organization`, `member`, `invitation` and the `session.activeOrganizationId` column arrive with the plugin's own schema generation. Teams are disabled, so the plugin declares no `team`/`teamMember` models and no `invitation.teamId` — there is nothing to generate and nothing unused to carry.

### 4.6 Reads that must change with the schema ([#44](https://github.com/tiagoluizpoli/church/issues/44), [#39](https://github.com/tiagoluizpoli/church/issues/39))

Every volunteer-by-user read must filter to the **active** profile (`left_at IS NULL`):

- `apps/server/src/infrastructure/repositories/drizzle-volunteer.repository.ts:71` (`findByUserId`) and `:220` (`findByUserIdGlobally`)
- their contracts at `volunteer.repository.ts:48` and `:90`
- the sole caller `apps/server/src/application/db-volunteer-manager.ts:258`
- the contract tests at `volunteer.contract-spec.ts:46,55` must assert a **retired profile is not returned**

Separately, §1.5 retires the Volunteer-derived Church bootstrap entirely: the six `preValidation` hooks that assign `request.churchId` from `resolveVolunteerContext` are **replaced by Active Church resolution** —

`volunteer-controller.ts:78`, `volunteer-schedule-controller.ts:36`, `leader-controller.ts:107`, `leader-rostering-controller.ts:122`, `admin-leader-controller.ts:102`, `church-admin-controller.ts:127`.

Whatever survives that replacement must still be `left_at IS NULL`-scoped.

---

## 5. Minting ([#34](https://github.com/tiagoluizpoli/church/issues/34))

### 5.1 Who may mint

| Actor | May mint | May grant |
|---|---|---|
| **ChurchAdmin** | any Ministry in the Active Church | `volunteer` **or** `leader` |
| **Ministry leader** | their **own** Ministry only | `volunteer` only, with Roles from that Ministry |
| **TeamLeader** | nothing | — |

A Ministry leader **may** initiate the chained Church Invitation + Ministry Invitation pair for a recipient outside the Church. The Church Invitation is the admission prerequisite for the Ministry grant, **not** a delegation of Church authority.

### 5.2 Scope enforcement

The endpoint derives the User and **Active Church** from the authenticated Better Auth session, takes `ministryId` from the URL, resolves the target Ministry **within that Active Church**, and then asks `AuthorityService` to evaluate the caller's persisted Church and Ministry Memberships.

**The request body cannot supply or override `churchId`, `ministryId`, `inviterId`, authority, or the caller's Access Level.** The persisted target Ministry and every requested Role are resolved under the same Active Church and Ministry scope before minting.

### 5.3 Endpoint contracts

```text
POST /ministries/:ministryId/invitations
```

Body: recipient **email**, `ministryAccessLevel`, `roleIds`.

The application resolves the email:

- an **existing Church Member** → a Ministry Invitation addressed by `inviteeUserId`;
- **anyone else** → the chained Church Invitation + Ministry Invitation pair, with the address living on the Better Auth invitation.

Response: a typed invitation representation carrying its **identifier, kind (`ministry-only` | `chained`), status, expiry, delivery status, and relative redemption path**. It returns **neither a bearer token nor a host-specific absolute URL** — the delivery layer and the web client own absolute URLs (§6.2).

```text
POST /ministries/:ministryId/invitations/:invitationId/resend
```

Enqueues a **fresh delivery request against the existing invitation**, updating `expiresAt` in place, never minting a duplicate. Same minting authority as creation, and the same indistinguishable `404` behaviour. Bounded by a **60-second cooldown** plus a **per-invitation daily cap** (§6.4).

### 5.4 Failure behavior

| Condition | Response |
|---|---|
| Missing authentication | `401 UNAUTHORIZED` |
| Nonexistent Ministry **/** Ministry outside the Active Church **/** Ministry the caller has no authority to manage | `404 MINISTRY_NOT_FOUND` — **deliberately indistinguishable**, to prevent resource discovery across authority boundaries |
| Authorized for the Ministry but requesting `leader` as a Ministry leader | `403 INSUFFICIENT_INVITATION_AUTHORITY` |
| Invalid Role ids, including Roles outside the target Ministry | validation failure; **neither half** of an invitation is created |
| Invitee already holds Ministry Membership in that Ministry | rejected at mint (§4.1) |

Indistinguishability here is a **verifiable equality between responses**, not three similar-looking branches (§11.2).

### 5.5 Minting is transactional with delivery

`POST /ministries/:ministryId/invitations` writes the invitation rows **and the outbox delivery request in one transaction**, then returns immediately. Mail-provider latency or an outage can never fail or roll back a valid mint.

---

## 6. Delivery ([#40](https://github.com/tiagoluizpoli/church/issues/40))

### 6.1 Channel

**Email is the only delivery channel**, for both invitation types. A User's sign-in identity *is* their email, so an in-app channel reaches no one email does not — and the ordinary case (a Church Member receiving their first Ministry Invitation) has **no `volunteer_notification` row to address**, because the Volunteer profile is born at first Ministry Membership. In-app invitation delivery is out of scope (§14).

A **copyable absolute redemption URL** ships alongside the email as the escape hatch when mail bounces or is spam-filtered. It stays safe: the link is targeted, Better Auth refuses acceptance unless the session email matches, and §7's verification code still gates a new account — a leaked link grants nothing on its own.

### 6.2 Composition and the absolute URL

- **The application composes the message.** Better Auth's `sendInvitationEmail` is **left unset** — without it the plugin sends nothing and hands back no token or link, which is exactly what is wanted, since redemption addresses invitations by `invitationId`.
- `afterCreateInvitation` is **not** used for delivery either: at that moment the Ministry half of a chained pair does not exist yet, so a hook-sent message could only invite someone to an abstract organization without naming the Ministry that wants them.
- **One message per invitation act.** A chained mint produces **one** email, enqueued only after both rows commit, naming the Church, the Ministry, the Ministry Access Level, the Roles and the expiry, linking `/invitations/church/:invitationId`. A Ministry-only invitation links `/invitations/ministry/:invitationId`.
- **The web client assembles the absolute URL** by joining its own origin to the relative path the mint API returns — correct by construction in local, preview and production, with no environment config to drift.
- The **one** place the server renders an absolute URL is the email body, composed by the outbox worker at send time from transport configuration. It never enters the mint response.
- **Bootstrap** (§2.4): the Platform Operator script mints a standalone Church Invitation with no Ministry half, composes a Church-only message on the same outbox, and — because it may run where no worker polls — **also prints the relative redemption path** so the operator can convey it out-of-band. It accepts an optional base-URL argument for convenience only; **no host is persisted in configuration**.
- Email copy is **English**, matching the application (no i18n framework exists).

### 6.3 Recipient identity

The destination email is **fixed at mint and immutable**. A typo is corrected by **canceling** the invitation and minting a new one, so a mistaken address never sits redeemable-in-waiting and the audit trail states exactly who was invited and when. (Better Auth offers no email-change operation on an invitation, so an editable application-side address would drift from the Church half.)

### 6.4 Failure, retry and limits

- Transient failures — 5xx, timeouts, connection errors — **retry with backoff up to a fixed attempt cap**.
- **Hard bounces and invalid addresses fail terminally**, no retry.
- Either way the invitation's typed representation exposes a **delivery status** readable by the minting API's consumers. There is no admin UI in scope, so "what the administrator sees" is a typed API fact.
- **Manual resend is always available**, bounded by a **60-second cooldown** (matching §7's verification-code cooldown) and a **per-invitation daily cap**. The cap does double duty: it stops a bouncing address from earning a sender-reputation penalty, and it stops an unbounded resend loop from extending `expiresAt` indefinitely and keeping an invitation alive forever.

### 6.5 Transport

- An application-owned **`EmailSender` port** — `send` with typed, per-kind template payloads — with **Resend as the first adapter**. Swapping vendors later touches one adapter.
- Dev and E2E bind a **capture adapter** that records messages instead of sending, so tests never dispatch real mail and can assert on what would have been sent.
- §7's **verification code uses the same port but bypasses the outbox and sends synchronously**: the person is waiting, the caller must learn immediately whether it went out, and a stuck worker must not silently block account creation.
- Better Auth's **`requireEmailVerificationOnInvitation` stays off** — §7 verifies the invited address with its own one-time code before acceptance begins, and the plugin option would additionally block *reject*, trapping an invitee who simply wants to decline.

### 6.6 Security and audit

- The outbox row **is** the structured delivery record: invitation id in the payload, kind, status, attempts, timestamps, provider message id, correlation id.
- **Logs stay redacted**: no email addresses, no full invitation identifiers, no absolute redemption URLs, and **never** a verification code. Logs carry the correlation id only.
- Delivery is infrastructure, not a domain act: **there is no `invitation-sent` domain audit event.**

---

## 7. Redemption ([#33](https://github.com/tiagoluizpoli/church/issues/33), [#32](https://github.com/tiagoluizpoli/church/issues/32))

### 7.1 Routes and preview

- **`/invitations/church/:invitationId`** — **public, shell-free**: a chained Church Invitation + Ministry Invitation.
- **`/invitations/ministry/:invitationId`** — **authenticated**: a Ministry Invitation addressed to an existing Church Member. A signed-out User returns here after sign-in.
- A valid public preview may show **only** the invited email, Church, Ministry, Ministry Access Level, Roles and expiration. The email is **prefilled and read-only**.
- **Unavailable invitations are indistinguishable before authentication** — nonexistent, expired, canceled, rejected and already-accepted all return the same result. Preview input is validated and rate-limited; invitation identifiers and email addresses are **not logged**.

### 7.2 Happy paths

- **New User**: supplies name and password, then **verifies a one-time code sent to the invited email**. Invitation acceptance begins only after verification, so a forwarded or leaked link alone cannot create the matching identity.
- **Existing User**: signs in with the invited email and returns to the invitation route.
- Account creation/sign-in and acceptance are presented as **one guided journey**, although the server executes durable checkpoints (§7.4).
- After processing, the route shows an **explicit result**. **Continue** selects the invitation's Church as Active Church and opens `/dashboard`. **Redemption never preserves an unrelated prior deep link.**

### 7.3 Identity and lifecycle branches

- **Wrong signed-in User**: told the invitation belongs to another account, **without seeing the invited email**. Switching account requires confirmation and returns to the invitation route; **the current session is never changed automatically**.
- **Already a Church Member** (became one after the pair was issued): the Church step is treated as satisfied, the outstanding Church Invitation is **consumed**, and Ministry acceptance continues.
- **Already a Ministry Member**: acceptance is **idempotent** — existing access is never reduced, missing invited Roles are added, and the invitation is consumed.
- **After matching authentication** the intended User sees the exact state. An already-accepted invitation offers **Continue to Church**.
- **Decline** is available to the intended User only after authentication or email verification. Declining a **chained** invitation rejects **both** parts; declining a Ministry-only invitation rejects only that invitation.
- **Interrupted new-account journeys resume at email verification.** Codes expire after **10 minutes**, allow **five attempts**, and may be resent after a **60-second cooldown**. The invitation's own expiration remains authoritative. Existing accounts switch to sign-in / password recovery rather than duplicate creation.

### 7.4 Transaction and retry contract

The browser calls **one application-owned redemption API**; it never coordinates Better Auth and application writes itself. That API validates inputs, rate-limits public steps, invokes Better Auth server-side, invokes the domain use case, **accepts an idempotency key**, and returns a typed outcome: **full success | Church-only | retryable failure | terminal failure**.

Better Auth and application operations **cannot honestly share one transaction** through Better Auth's public API, so redemption is a sequence of **monotonic, retryable checkpoints**:

1. create or authenticate the User;
2. accept **Church Membership** through Better Auth;
3. **atomically** create or transfer the Volunteer profile, apply Ministry Membership and Roles, and accept the Ministry Invitation;
4. **enqueue notifications from that same application transaction** for post-commit delivery.

> **If the application transaction (3) fails:** the User and any accepted Church Membership remain valid, the Ministry Invitation remains `pending`, **no partial Ministry grant survives**, **zero** outbox rows exist, and the result offers a safe retry.

This is the real contract. It is deliberately **not** all-or-nothing, and §11 verifies it as written.

### 7.5 The split outcome — cross-Church Volunteer conflict

If the User already holds an **active** Volunteer profile in another Church:

- **Church Membership succeeds** (a User may be a Church Member in many Churches, §1.2);
- the **Ministry half is rejected with a named error**; nothing is reassigned;
- the Ministry Invitation **stays `pending`**, so it remains redeemable if the situation is later resolved;
- the invitee lands **authenticated as a Church Member with no scheduling identity** — the member-but-not-Volunteer state §1.5 must present without announcing "you are not a Volunteer".

The result screen **names both Churches**, explains the one-active-Volunteer-profile rule, and offers the self-service **Volunteer Transfer** (§8). The former Church **cannot veto** it. The explanation stays inside the invitation/scheduling context.

### 7.6 Audit boundary

- **Audited domain acts, exactly:** acceptance, decline, Church-only partial acceptance, Ministry acceptance, Volunteer Transfer.
- Transfer audit records source and destination Church, withdrawn future Assignments, ended memberships, and explicit confirmation.
- **Failed identity checks and throttling events go to the security log**, not the domain audit.
- **One correlation ID spans the attempt**, and appears on the outbox rows and `assignment_audit` rows it produces.
- Passwords, verification codes, full invitation identifiers and unnecessary email addresses are **never** logged. **Ordinary preview visits are not domain audit events.**

---

## 8. Volunteer Transfer ([#44](https://github.com/tiagoluizpoli/church/issues/44))

A Volunteer Transfer **retires one profile and births another**. History is never re-attributed to a Church that did not receive the service.

### 8.1 Profile history

The old `volunteer` row is **retired, never moved and never deleted**, keeping its original `churchId` forever — so every historical `assignment`, `ministry_volunteer`, `availability_check` and `volunteer_notification` row hanging off it stays attributed to the Church that actually received the service. (Mutating `volunteer.churchId` in place would retroactively make a Church A assignment belong to a volunteer whose Church is B, and every Church-scoped read of past service would silently lose Church A's history.)

The destination profile is **born fresh** — `status = 'active'`, `notes = null`, new `createdAt`. **Nothing carries over.** `volunteer.notes` is a former-Church leader's private observation and is Church-scoped data; a non-`active` status is equally a former-Church judgement and must not follow the person into a Church that cannot explain it.

### 8.2 Membership lifecycle

- Every Ministry Membership in the former Church: `ministryVolunteer.status → 'inactive'` plus `leftAt`.
- `ministry_volunteer_role` and `ministry_volunteer_team` rows are **left in place** — they record *why* a past Assignment was possible, and deleting them erases the explanation for history being kept. (Deleting `ministry_volunteer` outright is rejected outright: `ON DELETE CASCADE` from `availability_check.ministryVolunteerId` would destroy the availability history §7 promised to preserve.)
- **Memberships are never restored.** A later return to that Church is a fresh invitation, a fresh Volunteer profile, and fresh Ministry Membership.

### 8.3 Availability

`availability_check` rows are **untouched** — confirmed and pending alike. They hang off the now-`inactive` `ministry_volunteer`, so "who still owes us availability" queries exclude them through the membership status they already read.

### 8.4 Assignments

Every `assignment` in `draft | pending | confirmed` whose **`shift`'s `timeSlot` starts strictly after the transfer commit** becomes `cancelled`, with a `reason` naming the transfer and an `assignment_audit` row (`action = 'status_change'`, `actorId` = the transferring User, reason naming the transfer, and the transfer's `correlationId`).

- Already `declined`/`cancelled` rows are untouched — terminal.
- **The cut is the time slot start, not the parent event's date.** A slot that has started is past and protected, even if its event runs on.
- Published rosters simply **show the hole**. Deferring to leader action would be a former-Church veto by inaction.

### 8.5 Atomicity and concurrency

**One application transaction**, entered **only** from invitation redemption — checkpoint 3 of §7.4. In order, under one boundary:

1. `SELECT ... FOR UPDATE` the active `volunteer` row and every `ministry_volunteer` row about to end;
2. re-validate the destination Ministry Invitation is still `pending` and unexpired — if not, **terminal failure and nothing changes**;
3. retire the old profile (`leftAt`, `succeededByVolunteerId`);
4. flip the former Church's Ministry Memberships to `inactive` with `leftAt`;
5. cancel qualifying future Assignments and write their `assignment_audit` rows;
6. create the destination Volunteer profile, its Ministry Membership at the invited Access Level, and its invited Roles;
7. mark the Ministry Invitation `accepted`;
8. write the `volunteer_transfer` row;
9. enqueue every `outbox_message` — so a notification is **structurally impossible** unless the transfer committed.

The **partial unique index** on the active profile makes two simultaneous transfers impossible even if locking were bypassed.

> **Required and easy to miss:** to close the assignment race, **the rostering path must take `FOR SHARE` on the `ministry_volunteer` row it validates eligibility against.** Otherwise an inserter that read `active` before step 4 commits an Assignment the step-5 sweep never saw, leaving a departed Volunteer standing on a live roster. `SERIALIZABLE` (pushes retries onto callers for a conflict they did not cause), an advisory lock on `userId` (cannot reach an insert that never learned to take it) and post-commit reconciliation (accepts a window where a live roster is wrong) are all rejected.

### 8.6 Idempotency

Natural, not bolted on: the `volunteer_transfer` unique index on `(userId, ministryInvitationId)` **is** the idempotency key, so a replayed confirm returns the original outcome instead of re-executing. §7.4's client-supplied idempotency key rides along on the redemption API but is **not** what guarantees correctness — a client that regenerates it still cannot transfer twice.

### 8.7 Authority and safety

Three confirmation layers, all required:

1. choose **Move my Volunteer profile** from the split-result screen;
2. review both Churches with the **actual** affected Memberships and future Assignments, and acknowledge the consequences;
3. **re-authenticate**, type the destination Church name, and select **Confirm Volunteer Transfer**.

Layer 3's re-authentication is **server-side password verification through Better Auth, issuing no new session**, rejecting the transfer outright on mismatch. (The repo is `emailAndPassword`-only, so every User has a password. A session-freshness window is rejected — it makes the strongest layer depend on how long ago a tab was opened.)

**No former-Church actor can block the transfer**: no approval step, no hold, and no state a former-Church leader can put a Volunteer into that prevents it.

### 8.8 Notifications

- **One digest per affected Ministry** — affected meaning a Membership ended there or an Assignment was withdrawn there — addressed to that Ministry's **active leaders**. Each names the Volunteer, states they transferred out, and lists every withdrawn future Assignment (event, date, slot, Role) so the leader can re-roster. One `outbox_message` per Ministry, written **inside** the transfer transaction. Per-assignment messages are rejected as unbounded noise.
- **The digest does not name the destination Church.** The move is one the former Church is forbidden to veto; disclosing where the person went is not required to re-roster.
- **ChurchAdmins are notified in exactly one case**: the departing Volunteer was the **last active leader** of a Ministry. The transfer still proceeds — blocking until a replacement is appointed is a former-Church veto in all but name — but that Ministry's digest has no leader to reach, so it escalates to every ChurchAdmin, flagged as a **leaderless Ministry** with its withdrawn Assignments listed. Routine departures never reach ChurchAdmins.

### 8.9 Entry point

Volunteer Transfer is reachable **only from invitation redemption**. There is **no standalone "leave my Church" action**: departing with no destination is already achievable by not accepting. Transfer and acceptance are **the same transaction**, never two sequential operations — a User who abandoned between them would end up with no Volunteer profile in *any* Church, strictly worse than where they started and reachable by closing a tab.

---

## 9. Route tree ([#36](https://github.com/tiagoluizpoli/church/issues/36), amended by [#42](https://github.com/tiagoluizpoli/church/issues/42))

### 9.1 Final shape

```text
__root                            app-wide concerns only
├── login                         public, shell-free
├── invitations/church/$invitationId    public, shell-free
├── invitations/ministry/$invitationId  authenticated, shell-free
└── _authenticated                valid session, NO AppShell
    ├── select-church             authenticated, shell-free (selector C)
    └── _active-church            valid Active Church, OWNS AppShell
        ├── /                     redirect → /dashboard
        ├── dashboard
        ├── availability          redirect → /dashboard?section=availability
        ├── notifications
        ├── scheduling/*
        └── volunteer/*
```

- **`__root.tsx`** keeps only application-wide concerns: head content, global providers, toaster, router/query devtools, `<Outlet />`. `<AppShell>` is removed from it.
- **`_authenticated.tsx`** proves **identity only** — one `authClient.getSession()` check. No shell.
- **`_active-church.tsx`** revalidates **Church Membership** against `session.activeOrganizationId` before mounting `AppShell` or loading any Church-scoped data, and owns the scheduling breadcrumb hooks currently mounted from the root.
- Every Church-scoped application route lives **below `_active-church`**. The pathless prefixes leave all public URLs unchanged.

### 9.2 What moves, what is deleted

**Move** beneath `_authenticated/_active-church/` (paths unchanged):

`apps/web/src/routes/dashboard.tsx`, `notifications.tsx`, `availability.tsx`, `scheduling.tsx`, `scheduling/index.tsx`, `scheduling/planning-cycles.tsx`, `scheduling/planning-cycles/*`, `scheduling/tailoring*`, `scheduling/rostering/$ministryId/$cycleId.tsx`, `volunteer/availability.tsx`.

**Delete**:

- `apps/web/src/routes/index.tsx`'s card-based home component — `/` becomes an authenticated redirect to `/dashboard`.
- The **five duplicated `getSession()` → `redirect('/login')` guards** in `scheduling.tsx`, `scheduling/planning-cycles.tsx`, `dashboard.tsx`, `notifications.tsx`, `volunteer/availability.tsx`. Feature-specific **authorization** stays on the route that owns it; only the duplicated **authentication** check goes.

**Add**: `_authenticated.tsx`, `_active-church.tsx`, `select-church.tsx`, `invitations/church/$invitationId.tsx`, `invitations/ministry/$invitationId.tsx`.

**Keep public and shell-free**: `login.tsx` (rendering `SignInForm` only, §3.3) and both invitation routes.

### 9.3 Redirect-back behavior

- An unauthenticated visitor to a protected deep link sends the **complete internal destination** (path, query and hash) to `/login`.
- The return destination **must be validated as a same-origin internal path**. External URLs, protocol-relative URLs, backslash and encoded variants, `javascript:` and malformed values are **rejected**; the fallback is `/dashboard`.
- An already-authenticated visitor to `/login` is redirected to the validated destination when present, otherwise `/dashboard`.
- **Invitation redemption is exempt** — it never preserves an unrelated prior deep link (§7.2).

### 9.4 Availability routes

`/availability` remains beneath the authenticated tree as the sidebar/navigation redirect to `/dashboard?section=availability`, preserving optional `eventId` forwarding. `/volunteer/availability` remains a separate authenticated page and loses its duplicated session guard. **Consolidating the two availability experiences is out of scope.**

---

## 10. Retirement — code and data that must disappear

Deletion is part of the work, not cleanup. A system that still carries these paths still carries the open door.

| Item | Why | Ticket |
|---|---|---|
| `packages/auth/src/hooks/soft-registration.ts` **and its registration** in `packages/auth/src/index.ts`'s `databaseHooks.session.create.after` | It auto-provisions an `active` volunteer in `system-church` on **every** sign-in, swallowing failures. Left in place it would win or lose a race against the correct Volunteer row for an invited User's real Church. | [#35](https://github.com/tiagoluizpoli/church/issues/35), [#30](https://github.com/tiagoluizpoli/church/issues/30) |
| Every `system-church` fixture, seed artifact and assertion | The identifier appears nowhere else in the codebase — only that hook and its tests. | [#35](https://github.com/tiagoluizpoli/church/issues/35) |
| `church_admin` table + the `seed-dev-users.ts:417` write | Church-wide administration becomes Better Auth `member.role = 'admin'`. | [#39](https://github.com/tiagoluizpoli/church/issues/39), [#43](https://github.com/tiagoluizpoli/church/issues/43) |
| `system_role` enum and `sub_leader` everywhere | Replaced by Ministry Access Level; `sub_leader` becomes TeamLeader = Team Membership at `leader`. | [#39](https://github.com/tiagoluizpoli/church/issues/39) |
| `role.isGlobal` and nullable `role.ministryId` | Every Role belongs to exactly one Ministry. | [#39](https://github.com/tiagoluizpoli/church/issues/39) |
| `ministry_invitation.token`, `.type`, `.teamId` | Invitations are targeted, never bearer; Team Membership is assigned-only. | [#32](https://github.com/tiagoluizpoli/church/issues/32) |
| The six Volunteer-derived `preValidation` Church-bootstrap hooks | Replaced by Active Church resolution. | [#39](https://github.com/tiagoluizpoli/church/issues/39) |
| The five duplicated route session guards + `routes/index.tsx`'s home component | One `_authenticated` guard. | [#36](https://github.com/tiagoluizpoli/church/issues/36) |
| `apps/web/tests/global-setup.ts`'s sign-up-based `authUser` (`:82`) and `SUB_LEADER_STORAGE_STATE` | The sign-up path returns 404 the moment the gate lands. | [#41](https://github.com/tiagoluizpoli/church/issues/41) |

**Rewritten rather than deleted**: `apps/server/src/scripts/seed-dev-users.ts` and `apps/server/src/test-support/e2e-seed.ts` create their Churches **through the provisioning operation** (§2), then continue seeding Ministries and Volunteers directly. One origin for every Church — the provisioning path is exercised on every local run and every E2E run, so it cannot silently rot.

---

## 11. Verification ([#41](https://github.com/tiagoluizpoli/church/issues/41))

Authoritative test plan: [`.plan/research/invite-only-registration-verification-architecture.md`](../../.plan/research/invite-only-registration-verification-architecture.md). This section carries its binding parts; the document holds the per-area checklists.

### 11.1 Layers and the allocation rule

**L0** schema/constraint (Vitest + real PG) · **L1** domain unit · **L2** server integration (Fastify `inject` + PG) · **L3** RTL component · **L4** Playwright.

**A scenario is proved at the lowest layer that can fail for the real reason.** A rule enforced by a database index is proved at L0 and nowhere else. Authorization is a pure function of memberships, so the matrix is **exhaustive at L1** — `src/domain/**` gates at **100% branches** — and L2 keeps exactly **one allow and one deny per endpoint**, enough to prove the endpoint is wired to `AuthorityService` and derives scope from the session. Anything needing two concurrent connections is **L2 only**. **L4 proves journeys, never rules.**

### 11.2 Two mandatory assertion styles

1. **Indistinguishability is asserted as equality between responses**, not as separate shape checks. `404 MINISTRY_NOT_FOUND` for nonexistent, cross-Church and unauthorized Ministries must be **byte-identical**; likewise the pre-authentication unavailable result across nonexistent/expired/canceled/rejected/accepted. Three passing shape assertions do not prove the property.
2. **Negative assertions name the foreign tenant's real values** — Church B's actual name, id and slug absent from the serialized response, never merely "the list is empty".

### 11.3 The fixture

`apps/server/src/test-support/identity-fixtures.ts`: **two Churches** and ten identities chosen so every rule has a real counterexample — `platformOperator` (no membership anywhere, denied everything), `adminA` (admin with **no** Volunteer profile), `leaderWorshipA` **and** `leaderKidsA` (cross-*Ministry* deny inside one Church), `teamLeaderA`, `memberOnlyA` (the member-but-not-Volunteer state), `dualMemberAB` (Volunteer in B, member of both), `outsider` (email only). Invitations pre-seeded in **every** lifecycle state, including an `expiredPendingMinistry` that is `status='pending'` with a past `expiresAt` — because there is no `expired` status.

### 11.4 Three harness facts that reorder implementation

1. **The E2E bootstrap breaks on day one.** `apps/web/tests/global-setup.ts:82` creates every E2E user through `POST /api/auth/sign-up/email` — the path §3 makes return 404. **The gate and the bootstrap rewrite must land in the same change.** The replacement provisions both Churches through the real Platform Operator operation and creates each user by **redeeming a real invitation**, reading the verification code from the capture `EmailSender`.
2. **The truncation root moves.** `truncateAll()` cascades from `church`, which is now an extension row keyed by the organization id — cascading from it leaves `organization`, `member` and `invitation` behind, presenting as flaky authorization failures. Root becomes **`organization, "user"`**, guarded by a test that inserts into every new table and asserts the truncate reaches all of them. `apps/server/tests/integration/repositories/setup.ts`'s `seed()` must create `organization` + `member` rows, not bare `church` rows.
3. **`apps/server/vitest.config.ts` uses explicit include lists, not globs.** A new `tests/identity/**` directory runs only once registered. **Registering it is a first task, not an afterthought.**

### 11.5 Coverage points that are easy to get wrong

- Sign-up suppression asserts the **body** `Not Found`, not just the status (a catch-all 404 is a different failure), **and** separately asserts `auth.api.signUpEmail` still works in-process. Without that second test, switching to `disableSignUp` passes everything else and silently breaks redemption.
- Redemption is verified against the **real** contract — monotonic retryable checkpoints, not all-or-nothing: a checkpoint-3 failure leaves the User and Church Membership valid, the Ministry Invitation `pending`, no partial grant, and **zero** outbox rows.
- Volunteer Transfer's boundary is asserted **to the second**: a slot starting one second before commit is untouched, one second after is cancelled, and a started slot inside a still-running event is protected.
- Open-redirect coverage on the redirect-back target (protocol-relative, backslash, encoded, `javascript:`) is a **pure function** — L1, not L4.
- Redaction is asserted by scanning captured logger output for the fixture's known values, across mint, preview, redemption, verification and transfer.

### 11.6 Highest-risk item

**The `FOR SHARE` roster seam (§8.5).** Its test **must be written against the existing rostering path and observed to fail** before the lock is added. A green result on an implementation that never took the lock proves nothing, and the defect it guards — an Assignment committed against a membership the transfer sweep already passed — leaves a departed Volunteer standing on a live roster.

### 11.7 The E2E budget — six journeys, `apps/web/tests/identity/`

1. **`redemption-new-user.spec.ts`** — `outsider` opens a chained invitation link, sets name + password, reads the verification code from the capture sender, verifies, lands on `/dashboard` with Church A active as a Volunteer.
2. **`redemption-existing-member.spec.ts`** — `memberOnlyA`, signed out, opens a Ministry invitation, signs in, returns, accepts, gains a Volunteer profile and Ministry access.
3. **`volunteer-transfer.spec.ts`** — `dualMemberAB` redeems a Church A invitation, gets the split result, walks all three confirmation layers, ends as a Church A Volunteer with the Church B roster showing the hole.
4. **`route-protection.spec.ts`** — unauthenticated deep link to `/scheduling/planning-cycles` → `/login` → sign in → **returns to the deep link**; `/` redirects to `/dashboard`; `/login` while authenticated redirects away.
5. **`active-church-switching.spec.ts`** — `dualMemberAB` lands on selector C, picks Church A, switches to Church B via the sidebar switcher, sees Church B data with **no Church A remnants**.
6. **`identity-cross-tenant-isolation.spec.ts`** — `adminA` requests Church B's invitation endpoints by direct URL with known-valid Church B ids → `404`, and no Church B name renders anywhere.

**Not at L4**: the sign-up 404, the authority matrix, invitation failure copy, expiry, resend limits, atomicity, concurrency — all proved lower.

---

## 12. Success criteria

These **supersede BL-021's original five**, which predate the tenancy work. Each is checkable.

**Sign-up suppression**

- **SC-001** `POST /api/auth/sign-up/email` returns HTTP `404` with body `Not Found`, and no route or link anywhere in `apps/web` reaches a sign-up form.
- **SC-002** `auth.api.signUpEmail` remains callable in-process and is the account-creation path used by redemption.
- **SC-003** Signing in creates **no** domain rows. The soft-registration hook, its tests, and every `system-church` artifact are gone from the repository.

**Tenancy and authority**

- **SC-004** Church identity (`name`, `slug`) is writable in exactly one place — the Better Auth `organization` row — and `church` is an extension row keyed by the organization id, with every pre-existing `churchId` foreign key still resolving.
- **SC-005** Every protected request derives its Church from `session.activeOrganizationId` and revalidates Church Membership; no controller derives Church from a Volunteer row.
- **SC-006** `AuthorityService` is the only application authorization policy engine; no controller or use case calls Better Auth `hasPermission`, and the authority matrix passes exhaustively at L1 under the 100%-branch domain gate.
- **SC-007** `church_admin`, `system_role`, `sub_leader` and `role.isGlobal` no longer exist in schema or code; Team Membership carries `member | leader`.

**Provisioning**

- **SC-008** A Church can be created **only** by the Platform Operator script — there is no HTTP route that creates one — and the script writes `organization`, `church` and the first Church Invitation in a single transaction that either fully commits or leaves nothing.
- **SC-009** The first ChurchAdmin's account is created by redeeming that Church Invitation through the same public flow as everyone else, and holds Church Membership `admin` with **no** Volunteer profile.
- **SC-010** `seed-dev-users` and `e2e-seed` provision their Churches through that same operation.

**Invitations**

- **SC-011** A Ministry Invitation is always targeted: exactly one of `inviteeUserId` / `churchInvitationId` is set, enforced by a database constraint; `token`, `type` and `teamId` no longer exist.
- **SC-012** A ChurchAdmin may mint for any Ministry in the Active Church at either Access Level; a Ministry leader may mint only for their own Ministry at `volunteer` only; a TeamLeader cannot mint. The request body cannot influence `churchId`, `ministryId`, `inviterId` or the caller's authority.
- **SC-013** Nonexistent, cross-Church and unauthorized Ministries produce **byte-identical** `404 MINISTRY_NOT_FOUND` responses.
- **SC-014** Minting writes the invitation rows and the outbox delivery request in one transaction and returns a relative redemption path — never a token, never an absolute URL.
- **SC-015** Resend enqueues against the existing invitation, updates `expiresAt` in place, and is bounded by a 60-second cooldown and a per-invitation daily cap.

**Redemption**

- **SC-016** Before authentication, nonexistent / expired / canceled / rejected / already-accepted invitations produce **identical** unavailable responses.
- **SC-017** A new User's account is created only after the one-time code sent to the invited address is verified; codes expire in 10 minutes, allow five attempts, and resend after 60 seconds.
- **SC-018** A checkpoint-3 failure leaves the User and Church Membership valid, the Ministry Invitation `pending`, **no** partial Ministry grant, and **zero** outbox rows — and the API returns a retryable outcome.
- **SC-019** A User with an active Volunteer profile in another Church who redeems gains Church Membership, is refused the Ministry half by a **named** error, sees both Churches named, and is offered Volunteer Transfer. The invitation remains `pending`.
- **SC-020** Accepting an invitation makes that Church Active and continues to the redemption result without a second switch confirmation, never preserving an unrelated prior deep link.

**Volunteer Transfer**

- **SC-021** A transfer retires the old profile (`leftAt`, `succeededByVolunteerId`) and creates a fresh one; no historical row is re-attributed, and `volunteer.notes`/`status` do not carry over.
- **SC-022** The partial unique index on `volunteer(user_id) WHERE left_at IS NULL` makes a second active profile impossible, and `(userId, ministryInvitationId)` on `volunteer_transfer` makes a replayed confirmation return the original outcome.
- **SC-023** Assignments are cancelled **iff** their shift's time slot starts strictly after commit, each with an `assignment_audit` row carrying the transfer's correlation id.
- **SC-024** The rostering path takes `FOR SHARE` on the `ministry_volunteer` row it validates against, and the concurrency test was **observed to fail** before the lock existed.
- **SC-025** Transfer requires all three confirmation layers, ending in server-side password verification that issues no new session. No former-Church actor can block it.
- **SC-026** Affected Ministries receive one digest each, addressed to active leaders, never naming the destination Church; ChurchAdmins are notified **only** for a leaderless Ministry.

**Route tree**

- **SC-027** Exactly one session guard exists in the route tree (`_authenticated`) and exactly one Active Church guard (`_active-church`); the five per-route duplicates are gone and `__root.tsx` no longer mounts `AppShell`.
- **SC-028** Unauthenticated visits to `/` or any Church-scoped route redirect to `/login` carrying the full internal destination, and return there after sign-in; external, protocol-relative, backslash, encoded and `javascript:` targets are rejected in favour of `/dashboard`.
- **SC-029** `/login` and both invitation routes render standalone, without sidebar or header chrome.
- **SC-030** A User with several Church Memberships and no Active Church lands on selector C; switching clears Church-scoped cache and cancels in-flight scoped requests before the destination loads; a stale tab blocks rather than silently rerouting.

**Delivery and observability**

- **SC-031** One email per invitation act, composed by the application, with `sendInvitationEmail` unset and no absolute URL in the mint response; the capture adapter is bound in dev and E2E.
- **SC-032** Logs across mint, preview, redemption, verification and transfer contain no email address, no full invitation identifier, no absolute redemption URL and no verification code; one correlation id spans an attempt and appears on the outbox and `assignment_audit` rows it produced.
- **SC-033** The audited domain acts are exactly acceptance, decline, Church-only partial acceptance, Ministry acceptance and Volunteer Transfer — and no `invitation-sent` domain event exists.

**Verification**

- **SC-034** All six E2E journeys in §11.7 pass, and the full suite is green with every retired-behaviour test deleted or rewritten per §10 and §11.4.

---

## 13. Implementation sequencing

From [#41](https://github.com/tiagoluizpoli/church/issues/41) §14 — written so verification leads implementation rather than trailing it. Each step leaves the suite green.

1. **Harness first** — `identity-fixtures.ts`, the truncation-root change plus its guard test, the capture `EmailSender`, outbox assertions, and `vitest.config.ts` include registration. **No product code yet.**
2. **L0 constraints** — cheapest and most load-bearing: partial unique indexes, check constraints, cascades.
3. **L1 `AuthorityService`** — the 100%-branch domain gate makes this the natural TDD surface, and every later layer depends on it.
4. **The sign-up gate and the E2E bootstrap rewrite, in the same change.** The gate breaks global setup; the rewrite is meaningless without the gate.
5. **L2 by area, in dependency order**: provisioning → minting/delivery → redemption → transfer.
6. **L3** route/guard/redemption components.
7. **L4 journeys last**, once the seams they traverse are proved.

Per `agents.local.md`: `bun run validate:affected` within each phase, `bun run test:e2e -- tests/identity/[spec].spec.ts` as the story gate, and `bun run validate` only at handoff.

**Ordering constraints that are not negotiable**: (4) is atomic — gate and bootstrap together. The `FOR SHARE` test (§11.6) is written and observed failing before the lock is added. Schema changes are a destructive reseed, never a backfill.

---

## 14. Out of scope

Ruled out on the map. Each is recoverable later; none is a gap in this specification.

- **Admin UI for minting invitations** — create/list/revoke screens, Ministry and Team pickers, expiry controls. **The minting API is the boundary of this effort.**
- **Ministry management** (create, rename, archive). Ordinary administrative CRUD, and the reason §2.6's empty-Church consequence must be stated in release notes.
- **In-app invitation delivery.** `volunteer_notification` is keyed on `volunteerId`, and the ordinary case has no such row; a User-scoped notification table reaches no one email does not.
- **Shareable multi-use ministry-join links.** Every invitation is targeted; a link redeemable by whoever holds it cannot carry a per-person grant and cannot be audited to a person.
- **Role gate on `/scheduling`, and removing the server-side `/admin/schedule-builder` carve-out.** BL-021 says to *record* this coupling, not act on it: the carve-out exists only because `/scheduling` guards on authentication alone, so adding a role guard would make it removable. See [Controller cluster (#11)](https://github.com/tiagoluizpoli/church/issues/11).
- **Consolidating `/availability` and `/volunteer/availability`.**
- **Billing, plans, subscriptions and monetization** — they motivate multi-Church tenancy but belong to a separate product effort.
- **Multi-Church *Volunteer* participation.** Lifting the one-active-profile rule means an active-church concept far beyond this destination; the split outcome (§7.5) is the designed extension point where that change would land.
- **Data migration of existing accounts** — pre-production, nothing to migrate.

### Known gaps carried forward

- **Email template markup** and the **outbox worker's runtime host** are implementation concerns; §11 verifies the port and the queue, not rendered HTML or the scheduler.
- **Resend account/domain provisioning** is an implementation/ops task.
- **Load and rate-limit tuning** is not verified — §11 asserts a limiter exists and that its response preserves indistinguishability, not its thresholds.

---

## 15. Downstream effects

- **[BL-017](../../manual-planning/0001-volunteer-scheduling/backlog/items/BL-017.md)** — its route guards land in the files §9 relocates. BL-017 must be planned **after** this ships, against `_authenticated` / `_active-church`, and its guards belong on the routes that own them, never re-duplicated. This is the coupling BL-021 recorded as a blocking relationship.
- **[Controller cluster (#11)](https://github.com/tiagoluizpoli/church/issues/11)** — the `/admin/schedule-builder` carve-out becomes removable once `/scheduling` carries a role guard. Recorded, not acted on (§14).
- **`CONTEXT.md`** is already amended with every term this specification uses; no further domain-language change is required to implement it.
