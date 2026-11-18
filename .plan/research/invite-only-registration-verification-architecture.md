# Verification Architecture — Invite-Only Registration, Tenancy & Route Protection

**Wayfinder map**: [Invite-only registration & auth route protection — spec](https://github.com/tiagoluizpoli/church/issues/29)
**Ticket**: [Design verification architecture for invite-only registration and tenant isolation](https://github.com/tiagoluizpoli/church/issues/41)
**Date**: 2026-07-27 · **Status**: design only — no tests implemented by this document.

This is the executable test architecture for the specification assembled by
[Assemble the invite-only registration spec](https://github.com/tiagoluizpoli/church/issues/37). It says *what is proved*, *at
which layer*, *against which fixture*, and *in which file* — so the implementing
session writes tests instead of re-deriving coverage.

Scenario classes follow the repo's existing idiom (`specs/023-event-builder/coverage-plan.md`):
**C1** happy · **C2** edge · **C3** invalid input · **C4** permission/isolation ·
**C5** system/infra · **C6** concurrency · **C7** state transition · **C8** catastrophic.

---

## 0. Decisions under verification

| # | Decision | What must be provable |
|---|---|---|
| [#35](https://github.com/tiagoluizpoli/church/issues/35) | Sign-up closed via `disabledPaths` | HTTP path 404s; `auth.api.signUpEmail` still callable server-side; soft registration gone |
| [#43](https://github.com/tiagoluizpoli/church/issues/43) | Platform Operator provisioning | organization + `church` extension + first Church Invitation commit atomically; slug collision named error |
| [#39](https://github.com/tiagoluizpoli/church/issues/39) | Scoped Membership + Access Level | `AuthorityService` is the only policy engine; stale/cross-Church scope denies |
| [#38](https://github.com/tiagoluizpoli/church/issues/38) | Better Auth seam | one writable representation of Church Membership / Active Church |
| [#32](https://github.com/tiagoluizpoli/church/issues/32) | Invitation identity | targeted only; chained pair; partial unique pending indexes; Volunteer born at first Ministry Membership |
| [#34](https://github.com/tiagoluizpoli/church/issues/34) | Minting authority | scope from session, never body; `404 MINISTRY_NOT_FOUND` indistinguishability |
| [#40](https://github.com/tiagoluizpoli/church/issues/40) | Delivery | mint + outbox row in one transaction; resend cooldown/cap; capture `EmailSender` |
| [#33](https://github.com/tiagoluizpoli/church/issues/33) | Redemption journey | monotonic checkpoints; pre-auth indistinguishability; typed outcomes |
| [#44](https://github.com/tiagoluizpoli/church/issues/44) | Volunteer Transfer | retire-and-rebirth; partial unique index; `FOR SHARE` roster seam; idempotency |
| [#36](https://github.com/tiagoluizpoli/church/issues/36) / [#42](https://github.com/tiagoluizpoli/church/issues/42) | Route tree | `_authenticated` / `_active-church` split; redirect-back validation; switcher policy |

---

## 1. Harness inventory (what already exists)

Nothing below is invented; the architecture reuses these seams.

| Seam | Location | Reused for |
|---|---|---|
| Fastify `inject` against the real app | `apps/server/tests/http/*.http.test.ts`, `createFactify` from `src/main/fastify/setup` | every HTTP contract assertion, including the sign-up 404 |
| Dockerized PG + Drizzle | `apps/server/tests/integration/repositories/setup.ts` (`testDb`, `seed()`, `truncateAll()`) | schema/constraint and repository layers |
| Shared repository contract specs run twice | `src/domain/contracts/contract-tests/*.contract-spec.ts`, driven by `tests/contract/repositories/*` (mock) and `tests/integration/repositories/drizzle-repos.test.ts` (real PG) | one spec proves both the fake and Drizzle honour the active-profile filter |
| `FixedClock` | `apps/server/src/test-support/clock.ts` | lazy expiry, verification-code TTL, resend cooldown |
| Notification spy | `apps/server/src/test-support/notification-service-spy.ts` | pattern to copy for the capture `EmailSender` |
| E2E storage states + seed shell-out | `apps/web/tests/global-setup.ts`, `apps/server/src/test-support/e2e-seed.ts` | role sessions; **must be rewritten — see §3.4** |
| Cross-tenant E2E precedent | `apps/web/tests/scheduling/planning-cross-tenant-isolation.spec.ts` | shape for the identity-layer leakage spec |
| Component harness | `apps/web/vitest.config.ts` `component` project, `*.component.test.tsx` + jsdom + MSW | redemption/selector/guard UI |

**Commands** (from repo root, per `agents.local.md`):
`bun run test:unit` · `bun run test:integration` · `bun run test:e2e -- tests/[path].spec.ts` · `bun run validate:affected`.

### 1.1 Two harness gotchas that will silently swallow new tests

1. **`apps/server/vitest.config.ts` uses explicit include lists, not globs, for
   several paths.** `tests/application/*` and every project's membership is
   enumerated. A new directory such as `tests/identity/**` runs **only** once
   added to the `unit` or `integration` project `include` array. Adding the
   directory is part of the first implementation task, not an afterthought.
2. **Coverage thresholds are gates, not reports.** `src/domain/**` is at
   **100%** statements/branches/functions/lines; `src/application/**` at
   95/90/95/95; `src/infrastructure/repositories/**` at 90/85/90/90;
   `src/api/dtos/**` at 100. `AuthorityService` lands in `src/domain` — every
   deny branch must be covered by a unit test or the suite fails. This is the
   reason §5 pushes the authorization matrix down to L1 rather than proving it
   through HTTP.

---

## 2. Layer allocation policy

| Layer | Tool / location | Owns |
|---|---|---|
| **L0 Schema & constraint** | Vitest + real PG, `apps/server/tests/integration/schema/*.test.ts` | partial unique indexes, FK/cascade behaviour, enum domains, `ON DELETE` semantics |
| **L1 Domain unit** | Vitest, node, `apps/server/tests/domain/**`, `src/**/*.test.ts` | `AuthorityService` decision matrix, invitation state machine, transfer eligibility computation, redirect-target validation (pure) |
| **L2 Server integration** | Vitest + PG + Fastify `inject`, `apps/server/tests/http/**`, `tests/integration/**` | endpoint contracts, status/body shape, transaction boundaries, outbox enqueue, concurrency |
| **L3 Frontend component** | Vitest + jsdom + RTL + MSW, `apps/web/src/**/*.component.test.tsx` | redemption result states, church selector, switcher confirmation, guard redirect computation |
| **L4 E2E** | Playwright, `apps/web/tests/identity/*.spec.ts` | six complete journeys only |

**Allocation rule.** A scenario belongs at the **lowest layer that can fail for
the real reason**.

- A rule enforced by a database index is proved at **L0** and nowhere else. An
  L2 test that merely observes the resulting 409 is duplication unless the
  *mapping* from constraint to typed error is itself the thing under test — in
  which case one L2 test covers the mapping and L0 covers the constraint.
- Authorization is a pure function of memberships → proved exhaustively at
  **L1**. L2 keeps exactly **one** representative allow and one representative
  deny per endpoint, to prove the endpoint is actually wired to
  `AuthorityService` and derives scope from the session.
- Anything requiring two concurrent database connections is **L2 only**.
- **L4 proves journeys, never rules.** No permission matrix, no validation
  table, no failure-copy enumeration at L4.

**Budget.** L4 is capped at the six journeys in §9. Every scenario below carries
its layer tag; a scenario with no tag is not covered anywhere and is a gap.

---

## 3. Fixture architecture

### 3.1 The canonical identity fixture

New: `apps/server/src/test-support/identity-fixtures.ts`, alongside
`scheduling-fixtures.ts`. Fixed UUIDs in the existing convention so specs can
reference values without querying.

Two Churches — **A (Grace)** and **B (Hope)** — because every isolation
assertion needs a real second tenant, and Volunteer Transfer needs a *source*
Church that is not the destination.

| Handle | Identity | Why it exists |
|---|---|---|
| `platformOperator` | User, **no** Church Membership anywhere | [#43](https://github.com/tiagoluizpoli/church/issues/43) — provisioning actor; also the negative case "operator has no scope in `AuthorityService`" |
| `adminA` | Church Membership A `admin`, **no Volunteer profile** | bootstrap admin shape; proves administration without scheduling identity |
| `leaderWorshipA` | Church Member A, Ministry Membership Worship `leader`, Volunteer A | ministry-scoped minting authority |
| `leaderKidsA` | Church Member A, Ministry Membership Kids `leader`, Volunteer A | cross-*Ministry* deny inside one Church |
| `teamLeaderA` | Ministry Membership Worship `volunteer` + Team Membership `leader` | TeamLeader may not mint |
| `volunteerA` | Ministry Membership Worship `volunteer`, Volunteer A | ordinary participant |
| `memberOnlyA` | Church Membership A `member`, **no Volunteer** | the member-but-not-Volunteer state [#42](https://github.com/tiagoluizpoli/church/issues/42) item 6 |
| `dualMemberAB` | Church Membership in **both** A and B, Volunteer in **B** | Active Church switching **and** the cross-Church Volunteer conflict |
| `adminB` / `volunteerB` | Church B counterparts | tenant isolation |
| `outsider` | email only, **no User row** | chained-pair redemption |

Invitation states, all pre-seeded so lifecycle tests need no setup choreography:
`pendingMinistryToMember`, `pendingChainedToOutsider`, `acceptedMinistry`,
`canceledMinistry`, `rejectedMinistry`, `expiredPendingMinistry`
(`status='pending'`, `expiresAt` in the past — there is **no** `expired`
status), `pendingMinistryInChurchB`.

The fixture is a **builder**, not a fixed dump: `seedIdentityFixture(db, {...})`
returns typed handles, and each L2 test opts into the slice it needs. Constitution
principle VII applies — one named options object, no inline types.

### 3.2 Truncation root changes

`truncateAll()` currently runs `TRUNCATE TABLE church, "user" RESTART IDENTITY CASCADE`.
Under [#43](https://github.com/tiagoluizpoli/church/issues/43) `church` becomes an extension row keyed by the organization
id, so `church` is no longer the tenancy root and cascading from it will leave
`organization`, `member`, and `invitation` rows behind — cross-test bleed that
presents as flaky authorization failures.

**Required change**: truncation root becomes `organization, "user"` (cascade),
and the new tables are asserted reachable. A single L0 test —
`truncate-root.test.ts` — inserts one row in every new table
(`organization`, `member`, `invitation`, `ministry_invitation`,
`ministry_invitation_role`, `outbox_message`, `volunteer_transfer`), runs
`truncateAll()`, and asserts all are empty. That test is the guard against a
future table being added outside the cascade.

### 3.3 Capture `EmailSender` and outbox assertions

- `apps/server/src/test-support/capture-email-sender.ts` — implements the
  `EmailSender` port, records `{ kind, to, payload }`, sends nothing. Bound in
  dev, unit, integration and E2E ([#40](https://github.com/tiagoluizpoli/church/issues/40)). Modelled on `notification-service-spy.ts`.
- `apps/server/src/test-support/outbox-assertions.ts` — `expectOutbox(db, { churchId, kind, count })`
  and `drainOutbox(db, { sender })` which runs the worker's send loop once
  synchronously, so tests assert on queue *state* and on *delivery* separately.
  The outbox is an assertable queue, never a mock ([#40](https://github.com/tiagoluizpoli/church/issues/40) explicitly hands this
  seam to this ticket).

### 3.4 The E2E bootstrap must be rewritten — and it is load-bearing

`apps/web/tests/global-setup.ts:82` (`authUser`) creates every E2E user with
`POST /api/auth/sign-up/email`. Under [#35](https://github.com/tiagoluizpoli/church/issues/35) that path returns **404 Not Found**.
Every existing Playwright spec therefore fails at global setup on the day the
gate lands — before any identity feature is exercised.

Replacement, and it must mirror production rather than route around it:

1. `e2e-seed` provisions Church A and Church B through the **same Platform
   Operator provisioning operation** the product uses ([#43](https://github.com/tiagoluizpoli/church/issues/43) requires seeds to
   converge on it).
2. Each E2E user is created by **redeeming an invitation** through the real
   redemption API — the only account-creation path in the system — with the
   verification code read from the capture `EmailSender` rather than a mailbox.
3. Sessions are captured to `tests/.auth/*.json` exactly as today.
4. `outsider` is left un-redeemed so the L4 new-account journey has real work
   to do.

Consequence worth stating plainly: **provisioning and redemption are exercised
on every E2E run**, so they cannot silently rot — this is the payoff [#43](https://github.com/tiagoluizpoli/church/issues/43)
predicted. The cost is that a redemption regression fails global setup rather
than one spec. Accepted deliberately: a broken redemption path *should* stop
the suite.

New storage states: `church-b-admin.json` already exists; add
`member-only.json` (Church Member without Volunteer) and `dual-member.json`
(two Church Memberships) — the two states no current spec can reach.

### 3.5 Time control

Lazy expiry ([#32](https://github.com/tiagoluizpoli/church/issues/32)) means no row ever transitions to `expired`; a test that waits
for wall-clock expiry is a test that sleeps. Two mechanisms, chosen per layer:

- **L0/L2**: seed `expiresAt` in the past directly. No clock injection needed —
  the read-time filter is the thing under test.
- **L1/L2 for the code TTL, cooldown and daily cap**: inject `FixedClock`
  (`src/test-support/clock.ts`). The verification-code (10 min / 5 attempts /
  60 s cooldown) and resend (60 s cooldown + daily cap) rules are pure
  functions of `now`, so they belong at L1 with `FixedClock` and are proved
  once each at L2 for wiring.

---

## 4. Public sign-up suppression ([#35](https://github.com/tiagoluizpoli/church/issues/35))

Target file: `apps/server/tests/http/auth.http.test.ts` (extends the existing
`Auth passthrough` describe).

- [ ] **C1/L2** `POST /api/auth/sign-up/email` with a valid body → status **404**, body **exactly** `Not Found`, `content-type` `text/plain`. Assert the body, not just the status: a 404 from the Fastify catch-all is a different failure than the `disabledPaths` block, and only the body distinguishes them.
- [ ] **C4/L2** the same request with an *authenticated* admin session → still 404. Proves the block is path-scoped, not auth-conditional.
- [ ] **C2/L2** `POST /api/auth/sign-in/email` remains reachable (not 404) — the existing assertion, kept as the regression sentinel for an over-broad `disabledPaths`.
- [ ] **C1/L2** `auth.api.signUpEmail({...})` called **directly in-process** creates a User. This is the load-bearing half of the decision ([#30](https://github.com/tiagoluizpoli/church/issues/30): `auth.api` and `auth.handler` fork at `auth/base.mjs:11-51`) and the reason `disableSignUp` was rejected. Without this test a future switch to `disableSignUp` passes every other test here and breaks redemption.
- [ ] **C4/L2** every other Better Auth path that could create a User is closed: `POST /api/auth/sign-up` variants and, if the admin plugin is ever enabled, `admin/create-user`. Assert 404 for each currently-disabled path by iterating the configured `disabledPaths` list, so adding a path to config adds a test automatically.
- [ ] **C7/L2** signing in an existing User creates **no** `volunteer` row and no `member` row — soft registration is gone. Seed a User with no memberships, sign in, assert both tables unchanged.
- [ ] **C8/L0** `system-church` exists nowhere: a repository-wide assertion in `tooling/validation` or a simple integration test that `SELECT count(*) FROM organization WHERE slug = 'system-church'` is 0 after seeding. The existing `soft-registration` tests are **deleted**, not adapted.
- [ ] **C1/L3** `/login` renders `SignInForm` only, with invitation-only copy, and no sign-up switch link when `onSwitchToSignUp` is omitted (now optional).
- [ ] **C2/L3** `SignUpForm` still renders in isolation when a caller supplies it — it is retained dormant, so a deletion regression is caught.

---

## 5. Authorization matrix ([#39](https://github.com/tiagoluizpoli/church/issues/39))

`AuthorityService.can({ user, action, resource })` is a pure decision over
memberships. Exhaustive at **L1** — `apps/server/tests/domain/authority-service.test.ts`
— because `src/domain/**` carries a 100% branch gate.

Table-driven over the cross product of: actor (`platformOperator`, `churchAdmin`,
`ministryLeader`, `teamLeader`, `volunteer`, `memberOnly`, `nonMember`) ×
resource Church (same / other) × resource Ministry (own / other) × action
(mint invitation, resend, cancel, read invitation, assign Team Membership,
roster, read schedule).

- [ ] **C1/L1** ChurchAdmin allowed on every action within their Active Church, including Ministries they hold no membership in.
- [ ] **C4/L1** ChurchAdmin of A denied on every Church B resource.
- [ ] **C1/L1** Ministry leader allowed within their own Ministry; **C4** denied in a sibling Ministry of the same Church (`leaderKidsA` against Worship).
- [ ] **C4/L1** TeamLeader denied minting; allowed only the Team-scoped actions [#39](https://github.com/tiagoluizpoli/church/issues/39) grants.
- [ ] **C4/L1** `platformOperator` denied **everything** — it holds no Church Membership and has no scope above Church. This is the test that stops a "super admin" from being quietly reintroduced.
- [ ] **C4/L1** ChurchAdmin at `admin` is denied *participatory* actions (receive assignment, answer availability) — administration is not participation.
- [ ] **C2/L1** a User who leads Worship in A and volunteers in Kids in A gets leader decisions for Worship and volunteer decisions for Kids in the same evaluation. This is the arity the Better Auth plugin could not express ([#30](https://github.com/tiagoluizpoli/church/issues/30)) and the single most important row in the table.
- [ ] **C2/L1** missing scope data → deny. Stale scope (membership row absent but claim present) → deny. Conflicting scope → deny. Never "allow by default".
- [ ] **C4/L1** an Active Church the User is no longer a member of → deny, regardless of Ministry rows that still exist.
- [ ] **C4/L2** exactly one wiring test per protected endpoint: the endpoint consults `AuthorityService` and derives Church from `session.activeOrganizationId`, never from `volunteer`. Assert by seeding a User whose Volunteer Church ≠ Active Church and confirming the response scopes to the Active Church.
- [ ] **C8/L1** no controller or use case calls Better Auth `hasPermission`. Static assertion (grep-style test in `tooling/validation`) — a second policy engine is exactly the failure [#38](https://github.com/tiagoluizpoli/church/issues/38) prohibits, and it is cheap to detect at the source level.

---

## 6. Church Provisioning & bootstrap ([#43](https://github.com/tiagoluizpoli/church/issues/43))

Provisioning has **no HTTP surface**, so its home is L2 integration against the
script's exported function — `apps/server/tests/integration/provisioning.test.ts`.

- [ ] **C1/L2** one call creates the `organization`, the `church` extension row with the **same id**, and one `pending` Church Invitation addressed to the given email with `inviterId = platformOperator`.
- [ ] **C1/L0** `church.id` is a FK to `organization.id`; deleting the organization cascades (or restricts — assert whichever the schema declares, and that it is declared).
- [ ] **C1/L2** the creating User receives Church Membership `admin`; the configured role set is exactly `member | admin` — assert that creating a member with role `owner` **fails**, proving Better Auth's default tier is not reachable.
- [ ] **C4/L2** the bootstrap admin has **no** `volunteer` row after provisioning and after redeeming their invitation. Only a Ministry Membership creates one.
- [ ] **C8/L2** atomicity: force a failure after the organization insert (inject a repository that throws on the invitation write) → **zero** organization rows, zero church rows, zero invitations. No orphaned tenant. If the implementation falls back to sequential-writes-plus-compensation, this test asserts the reconciliation instead, and the fallback must be named in the spec.
- [ ] **C3/L2** slug collision → named error, not a raw constraint error, and **no** partial writes. Explicitly assert the second call did **not** adopt the existing Church (idempotent convergence was rejected).
- [ ] **C7/L2** wrong administrator email → cancel the invitation, mint a new one; Church untouched; the canceled invitation is no longer redeemable.
- [ ] **C2/L2** invited email already belongs to an existing User → redemption **attaches** Church Membership `admin` to that account; no second User row; no Volunteer profile.
- [ ] **C1/L2** the bootstrap enqueues **one** Church-only `outbox_message` (`kind = 'invitation.church-bootstrap'`) and the script returns the **relative** redemption path — no absolute URL, no host in config.
- [ ] **C2/L2** a freshly provisioned Church has **zero** Ministries, and minting a Ministry Invitation in it fails with `404 MINISTRY_NOT_FOUND`. This pins the known empty-Church gap ([#43](https://github.com/tiagoluizpoli/church/issues/43)) as *asserted behaviour* rather than an undocumented dead end.

---

## 7. Minting, isolation and delivery ([#34](https://github.com/tiagoluizpoli/church/issues/34), [#40](https://github.com/tiagoluizpoli/church/issues/40))

Target: `apps/server/tests/http/ministry-invitations.http.test.ts`.

### 7.1 Contract

- [ ] **C1/L2** `POST /ministries/:ministryId/invitations` by `adminA` for an existing Church Member → one `ministry_invitation` addressed by `inviteeUserId`, `kind: 'ministry-only'`, typed response carrying id, kind, status, expiry, **relative** path.
- [ ] **C1/L2** the same call for an email outside the Church → a **chained pair**: one Better Auth `invitation` plus one `ministry_invitation` with `churchInvitationId` set and `inviteeUserId` null.
- [ ] **C1/L0** the `exactly one of (inviteeUserId, churchInvitationId)` rule is enforced by a check constraint — assert both-null and both-set inserts fail at the database.
- [ ] **C3/L2** response contains **no** bearer token and **no** absolute URL. Assert by regex over the serialized body for `http://` / `https://` — the host-agnosticism [#34](https://github.com/tiagoluizpoli/church/issues/34) requires is otherwise easy to regress.
- [ ] **C1/L2** requested Roles are persisted as `ministry_invitation_role` rows with FKs.
- [ ] **C3/L2** a `roleId` belonging to **another Ministry** → validation failure, and **neither half** of a chained pair is created. Assert both tables empty, not just the error.
- [ ] **C2/L2** re-inviting the same recipient updates `expiresAt` **in place**; row count stays 1.
- [ ] **C1/L0** partial unique index `(ministryId, inviteeUserId) WHERE status = 'pending'` rejects a second pending row and **permits** a new pending row once the first is `canceled`. Same for `(ministryId, churchInvitationId)`.
- [ ] **C2/L2** minting for someone who already holds Ministry Membership in that Ministry → mint-time guard rejects.
- [ ] **C1/L2** default expiry is **14 days** for a Ministry Invitation; the Church half keeps Better Auth's **48 hours**; a chained Ministry Invitation is governed in practice by the Church half.

### 7.2 Authority and indistinguishability

- [ ] **C4/L2** `leaderWorshipA` minting for Kids → `404 MINISTRY_NOT_FOUND`.
- [ ] **C4/L2** `adminB` minting for a Church A Ministry → `404 MINISTRY_NOT_FOUND`.
- [ ] **C3/L2** a nonexistent `ministryId` → `404 MINISTRY_NOT_FOUND`.
- [ ] **C4/L2** **the three responses above are byte-identical** — same status, same body, same headers. Assert equality of the serialized responses, not three separate shape checks. Indistinguishability is the property; three passing shape assertions do not prove it.
- [ ] **C4/L2** `leaderWorshipA` requesting `ministryAccessLevel: 'leader'` for their **own** Ministry → `403 INSUFFICIENT_INVITATION_AUTHORITY` (distinguishable on purpose: authority over the Ministry is already established).
- [ ] **C4/L2** `teamLeaderA` minting anywhere → `404 MINISTRY_NOT_FOUND`.
- [ ] **C4/L2** unauthenticated → `401 UNAUTHORIZED`.
- [ ] **C4/L2** body-supplied `churchId`, `inviterId`, or a `ministryId` differing from the URL are **ignored**, not honoured and not echoed. Seed a Church B `ministryId` in the body while calling Church A's URL and assert the created row is Church A's.

### 7.3 Delivery and outbox

- [ ] **C1/L2** a successful mint writes invitation rows **and** one `outbox_message` **in one transaction**: force a post-insert failure and assert *both* are absent.
- [ ] **C1/L2** a chained mint enqueues exactly **one** message (`invitation.chained`), not two, naming Church, Ministry, Access Level, Roles, expiry.
- [ ] **C5/L2** `sendInvitationEmail` is **unset**: creating a Better Auth invitation dispatches nothing through the capture sender until the application's own outbox drains.
- [ ] **C5/L2** the worker re-reads the invitation at send time and **skips** delivery when it is no longer `pending` (cancel between enqueue and drain).
- [ ] **C5/L2** transient failure (5xx / timeout) → `attempts` increments, `status` stays `pending`, backoff respected up to the cap; then `failed`.
- [ ] **C5/L2** hard bounce → terminal `failed`, **no** retry.
- [ ] **C6/L2** two concurrent workers on one row → exactly one send. Two pools, row-level locking; asserted by capture-sender call count.
- [ ] **C1/L2** `POST /ministries/:ministryId/invitations/:invitationId/resend` enqueues a new message against the **existing** invitation and updates `expiresAt`; invitation row count unchanged.
- [ ] **C2/L2** resend within 60 s → rejected (`FixedClock`); after 60 s → accepted; beyond the daily cap → rejected even after cooldown. The cap test is what stops an unbounded resend loop extending `expiresAt` forever.
- [ ] **C4/L2** resend carries the same authority and the same `404 MINISTRY_NOT_FOUND` indistinguishability as mint.
- [ ] **C1/L2** the verification code ([#33](https://github.com/tiagoluizpoli/church/issues/33)) uses the same `EmailSender` port but **bypasses the outbox** — assert the capture sender received it with zero outbox rows written.

---

## 8. Redemption journey ([#33](https://github.com/tiagoluizpoli/church/issues/33), [#32](https://github.com/tiagoluizpoli/church/issues/32))

Target: `apps/server/tests/http/invitation-redemption.http.test.ts` (L2) and
`apps/web/src/features/invitations/**/*.component.test.tsx` (L3).

### 8.1 Pre-authentication surface

- [ ] **C1/L2** `GET` preview of a valid Church Invitation returns **only** invited email, Church, Ministry, Access Level, Roles, expiry. Assert the response has no other keys — a whitelist assertion, so a future field addition is a deliberate act.
- [ ] **C4/L2** nonexistent, expired, canceled, rejected and already-accepted invitations all return **the same** unavailable payload pre-authentication. Byte-identical, as in §7.2.
- [ ] **C4/L2** preview is rate-limited; the limiter response is itself indistinguishable from unavailable where it must be.
- [ ] **C4/L2** invitation identifiers and email addresses do **not** appear in logs — see §11.

### 8.2 Chained pair, new account

- [ ] **C1/L2** create account → verification code sent to the **invited** address (capture sender) → code accepted → Church Membership created → Ministry Membership + Roles created → **Volunteer profile born here, not earlier** → both invitations `accepted`.
- [ ] **C7/L2** acceptance never begins before code verification: assert that a request skipping verification creates no `member` row. This is what makes a leaked link inert.
- [ ] **C2/L2** code expires after 10 minutes, allows 5 attempts, resendable after 60 s (`FixedClock`).
- [ ] **C2/L2** interrupted journey resumes at verification — no duplicate User, no duplicate Church Membership.
- [ ] **C2/L2** the invitee already became a Church Member after the pair was minted → Church step treated as satisfied, the outstanding Church Invitation **consumed**, Ministry acceptance continues.

### 8.3 Ministry-only, existing member

- [ ] **C1/L2** signed-in intended recipient accepts → Ministry Membership + Roles; Volunteer profile created if this is their first Ministry, reused otherwise.
- [ ] **C2/L2** acceptance is **idempotent** when Ministry Membership appeared in between: existing access never reduced, missing invited Roles added, invitation consumed.
- [ ] **C4/L2** a *different* signed-in User → told the invitation belongs to another account, **without** revealing the invited email. Assert the address is absent from the body.
- [ ] **C4/L2** the current session is never mutated automatically by a wrong-user visit.
- [ ] **C7/L2** decline is available only after authentication/verification; declining a chained pair rejects **both** halves, a Ministry-only invitation rejects **one**.
- [ ] **C2/L2** a Role deleted between mint and acceptance cascades out and acceptance **proceeds** with the remaining Roles. (`ON DELETE CASCADE` on `ministry_invitation_role` — the L0 half is in §7.1.)

### 8.4 Cross-Church conflict — the split outcome

- [ ] **C7/L2** `dualMemberAB` (Volunteer in B) redeems a Church A chained pair → Church Membership A **created**, Ministry half **rejected with the named error**, Ministry Invitation stays **`pending`**, nothing reassigned. Three assertions, all required: [#31](https://github.com/tiagoluizpoli/church/issues/31)'s rule, [#32](https://github.com/tiagoluizpoli/church/issues/32)'s deliberate non-atomicity, and the invitation's continued redeemability.
- [ ] **C1/L2** the typed outcome is `church-only`, distinct from `full-success`, `retryable-failure` and `terminal-failure`.
- [ ] **C2/L2** the result names both Churches and offers Volunteer Transfer.
- [ ] **C1/L3** each of the four typed outcomes renders its own component state; the `church-only` state keeps Volunteer language inside the invitation context ([#42](https://github.com/tiagoluizpoli/church/issues/42)) and never announces "you are not a Volunteer" generically.

### 8.5 Checkpoint atomicity

The transaction boundary is the subtle part: Better Auth and application writes
**cannot** share one transaction, so the contract is *monotonic retryable
checkpoints*, not all-or-nothing. Tests must assert the real contract, not an
imagined one.

- [ ] **C8/L2** failure inside checkpoint 3 (the application transaction) → the User **and** the accepted Church Membership survive; Ministry Invitation stays `pending`; **no** partial Ministry grant, **no** orphan Volunteer profile, **no** Role rows; outcome is `retryable-failure`.
- [ ] **C8/L2** retrying after that failure succeeds and produces exactly one of everything — no duplicate Volunteer, no duplicate membership.
- [ ] **C8/L2** failure **between** checkpoints 2 and 3 leaves the same state (proves monotonicity, not just single-transaction rollback).
- [ ] **C6/L2** two concurrent redemptions of the same invitation → one `accepted`, one typed failure; never two memberships. Two pools.
- [ ] **C1/L2** notifications are enqueued **inside** the application transaction: a checkpoint-3 rollback leaves **zero** outbox rows. A notification for work that did not commit is structurally impossible.
- [ ] **C2/L2** the client-supplied idempotency key is accepted and a replay returns the original outcome rather than re-executing.

---

## 9. Volunteer Transfer ([#44](https://github.com/tiagoluizpoli/church/issues/44))

The densest area, and the one [#44](https://github.com/tiagoluizpoli/church/issues/44) explicitly handed here. Target:
`apps/server/tests/integration/volunteer-transfer.test.ts` (L2) plus L0 constraints.

### 9.1 Structural guard (L0)

- [ ] **C1/L0** partial unique index `volunteer(user_id) WHERE left_at IS NULL`: two active profiles for one User → violation; one active + one retired (`left_at` set) → **permitted**. This is the whole one-active-profile rule, and it is a database fact, so it is proved here and nowhere else.
- [ ] **C1/L0** `volunteer_transfer` unique `(userId, ministryInvitationId)` rejects a duplicate — the idempotency key *is* the audit row.
- [ ] **C1/L0** `ministry_volunteer.leftAt` and `volunteer.succeededByVolunteerId` exist and the self-reference resolves.
- [ ] **C8/L0** deleting a `ministry_volunteer` row cascades to `availability_check` — the hazard [#44](https://github.com/tiagoluizpoli/church/issues/44) cited for *not* deleting memberships. Asserting the cascade exists is what makes the "flip to inactive instead" decision self-evident to a future reader.

### 9.2 Transfer semantics (L2)

- [ ] **C1/L2** after transfer: old `volunteer` row **retained** with original `churchId`, `leftAt` set, `succeededByVolunteerId` pointing at the new profile; new profile `status='active'`, `notes=null`, fresh `createdAt`.
- [ ] **C4/L2** **nothing carries over** — assert the new profile's `notes` is null and `status` is `active` even when the old profile was `on_hold` with notes. Former-Church judgement must not follow the person.
- [ ] **C7/L2** former Church Ministry Memberships → `inactive` with `leftAt`; `ministry_volunteer_role` and `ministry_volunteer_team` rows **still present**.
- [ ] **C2/L2** `availability_check` rows untouched, and the "who owes availability" query excludes them via membership status.
- [ ] **C7/L2** assignment sweep: `draft|pending|confirmed` whose **shift's time slot starts strictly after commit** → `cancelled` + `assignment_audit` row (`action='status_change'`, actor = transferring User, reason naming the transfer, transfer `correlationId`).
- [ ] **C2/L2** boundary cases on the cut: a slot starting **one second before** commit is untouched; **one second after** is cancelled; an already-started slot inside a still-running event is untouched. The cut is the slot start, not the event date — this is the off-by-one that silently rewrites service being performed.
- [ ] **C2/L2** `declined` and `cancelled` assignments untouched (terminal).
- [ ] **C1/L2** the destination Ministry Invitation is marked `accepted` **in the same transaction**; transfer and acceptance are never two operations.
- [ ] **C8/L2** the invitation is re-validated as `pending` and unexpired **inside** the transaction — if it expired between confirmation and commit, terminal failure and **nothing changes** (no retired profile, no cancelled assignments).
- [ ] **C1/L2** `volunteer_transfer` row records both Churches, both profile ids, the invitation id, `withdrawnAssignmentCount`, `endedMembershipCount`, `confirmedAt`, `correlationId`.

### 9.3 Concurrency (L2, two pools)

- [ ] **C6/L2** two simultaneous transfer confirmations for one User → one commits, one fails; the partial unique index holds even if locking is bypassed.
- [ ] **C6/L2** **the `FOR SHARE` roster seam**: connection 1 begins a transfer and reaches step 4; connection 2 attempts to create an Assignment against the *same* `ministry_volunteer` row. Without `FOR SHARE` on the rostering path, connection 2 commits an Assignment the step-5 sweep never saw and a departed Volunteer stays on a live roster. The test must **fail** against an implementation that omits `FOR SHARE` — write it against the rostering path first and confirm it fails before the lock is added.
- [ ] **C6/L2** a replayed confirmation returns the original outcome and performs no second sweep.

### 9.4 Authority, safety, notifications

- [ ] **C4/L2** the third confirmation layer is **server-side password verification** issuing **no new session** — a wrong password rejects the transfer outright; a correct one does not rotate the session token.
- [ ] **C4/L2** no former-Church actor can block it: with a former-Church leader holding every relevant role and every membership `active`, the transfer still commits.
- [ ] **C1/L2** **one digest per affected Ministry** to that Ministry's **active leaders**, listing every withdrawn Assignment (event, date, slot, Role). Twelve withdrawn shifts → still one message per Ministry.
- [ ] **C4/L2** the digest **never names the destination Church**. Assert the destination Church's name and slug are absent from the payload.
- [ ] **C2/L2** ChurchAdmins are notified **only** when the departing Volunteer was a Ministry's last active leader, flagged as leaderless; a routine departure reaches no ChurchAdmin.
- [ ] **C1/L2** all outbox rows are written inside the transfer transaction (rollback → zero messages).
- [ ] **C1/L3** the three confirmation layers render in order; layer 2 shows the **actual** affected memberships and future Assignments, not a static warning; layer 3 requires typing the destination Church name **and** the password.
- [ ] **C4/L3** there is no standalone "leave my Church" entry point — the transfer component is unreachable except from the split redemption result.

### 9.5 Active-profile filtering (contract layer)

[#44](https://github.com/tiagoluizpoli/church/issues/44) names the exact call sites. These belong in the **shared contract spec**, so both the
mock and the Drizzle implementation are held to them in one place:

- [ ] **C1/L1+L2** `volunteer.contract-spec.ts` gains: a retired profile is **not** returned by `findByUserId` (`:46`) or `findByUserIdGlobally` (`:55`), while the active successor is. The spec runs under `tests/contract/repositories/volunteer.repository.test.ts` (mock) and `tests/integration/repositories/drizzle-repos.test.ts` (real PG) — one edit, two layers of proof, and the mock can no longer drift from the `left_at IS NULL` predicate.
- [ ] **C2/L2** a User with a retired profile and **no** successor resolves to no Volunteer, not to the retired row.

---

## 10. Route protection and Active Church ([#36](https://github.com/tiagoluizpoli/church/issues/36), [#42](https://github.com/tiagoluizpoli/church/issues/42))

Two guards, two distinct failures — `_authenticated` proves identity,
`_active-church` proves Church Membership and owns `AppShell`.

### 10.1 Pure logic (L1, `apps/web/src/**/*.unit.test.ts`)

- [ ] **C1/L1** redirect-target validation: same-origin internal paths (with query and hash) preserved.
- [ ] **C3/L1** rejected → fallback `/dashboard`: absolute `https://evil.test/x`, protocol-relative `//evil.test`, backslash variants `\\evil.test`, encoded `%2f%2fevil.test`, `javascript:` and `data:` schemes, and a path with an embedded newline. Open redirect is the realistic attack on this surface and it is pure-function-testable — no reason for it to sit at L4.
- [ ] **C1/L1** switcher route policy: routes declare `preserve` or `fallback`; **unknown/new routes default to `fallback`** at `/dashboard`. Assert the default explicitly — a policy that fails open is the bug.

### 10.2 Guards and shell (L3)

- [ ] **C4/L3** unauthenticated deep link → redirect to `/login` carrying the full internal destination.
- [ ] **C1/L3** authenticated visitor at `/login` → validated destination, else `/dashboard`.
- [ ] **C1/L3** `/` → `/dashboard`; the old card home is gone.
- [ ] **C1/L3** `/login` and `/invitations/*` render **without** `AppShell`; `__root` mounts only global providers.
- [ ] **C4/L3** `select-church` renders **authenticated and shell-free** — below `_authenticated`, above `_active-church`.
- [ ] **C2/L3** zero memberships → shell-free no-access state; one → selected silently; several with no valid Active Church → selector C (identity/location, membership access, available areas, last-opened).
- [ ] **C1/L3** switching cancels in-flight Church-scoped requests and clears Church-scoped query cache **before** the destination loads. Assert with a MSW-delayed request plus a query-client spy — ordering is the property, and a switch that loads first leaks the previous tenant's data into the new view.
- [ ] **C2/L3** `preserve` replays path+query+hash **only after** authorization against the target Church; failed authorization → `/dashboard`.
- [ ] **C7/L3** membership removed → Active Church cleared, former route never replayed, recovery copy names the former Church, and does **not** name who removed them.
- [ ] **C7/L3** another tab changed Active Church → this tab cancels scoped requests, disables scoped mutations, and **blocks** with the changed-tab message; explicit Continue clears cache and applies route policy. It must not silently reroute over unsaved work.
- [ ] **C4/L3** a cross-Church deep link to a Church the User cannot access → generic access denied, Active Church **retained**, and no signal about whether the resource exists.
- [ ] **C2/L3** `memberOnlyA` sees no scheduling navigation and no "not a Volunteer" announcement; a direct scheduling URL gets ordinary access denied.
- [ ] **C4/L2** the server half: every Church-scoped endpoint revalidates Church Membership against `activeOrganizationId` per request. Seed a session whose `activeOrganizationId` names a Church the User was removed from → denied even though the session is otherwise valid.

---

## 11. Observability, leakage and redaction

Cross-tenant leakage detection is an **assertion style**, not a test suite. Two
rules, applied throughout §§4–10:

1. **Negative assertions name the foreign tenant's real values.** Never assert
   "the list is empty" where "Church B's ministry name, id and slug are absent
   from the serialized response" is available. `identity-fixtures.ts` gives
   Church B distinctive names precisely so a substring assertion is meaningful.
   The existing `planning-cross-tenant-isolation.spec.ts` is the precedent.
2. **Indistinguishability is asserted as equality between responses**, not as
   two independent shape checks (§7.2, §8.1).

Log assertions — `apps/server/tests/integration/redaction.test.ts`, capturing
the logger transport:

- [ ] **C4/L2** across mint, preview, redemption, verification and transfer, emitted logs contain **no** email address, **no** full invitation identifier, **no** absolute redemption URL, and **never** a verification code. Assert by scanning captured output for the fixture's known values.
- [ ] **C1/L2** one `correlationId` spans an entire redemption attempt and appears on the outbox rows and `assignment_audit` rows it produces.
- [ ] **C1/L2** failed identity checks and throttling events reach the **security** log; an ordinary preview visit produces **no** domain audit event.
- [ ] **C1/L2** the audited domain acts are exactly: acceptance, decline, Church-only partial acceptance, Ministry acceptance, Volunteer Transfer. Assert there is **no** `invitation-sent` domain event — delivery is infrastructure ([#40](https://github.com/tiagoluizpoli/church/issues/40)), and the outbox row is its record.

---

## 12. E2E journeys (L4 — the whole budget)

`apps/web/tests/identity/`. Six specs, complete journeys only. Every rule they
touch is already proved below them; L4 proves the journey holds together.

1. [ ] **`redemption-new-user.spec.ts`** — `outsider` opens a chained invitation link, sets name + password, reads the verification code from the capture sender, verifies, lands on `/dashboard` with Church A active as a Volunteer.
2. [ ] **`redemption-existing-member.spec.ts`** — `memberOnlyA`, signed out, opens a Ministry invitation, signs in, returns to the invitation, accepts, and gains a Volunteer profile and Ministry access.
3. [ ] **`volunteer-transfer.spec.ts`** — `dualMemberAB` (Volunteer in B) redeems a Church A invitation, gets the split result, walks all three confirmation layers, and ends as a Church A Volunteer with the Church B roster showing the hole.
4. [ ] **`route-protection.spec.ts`** — unauthenticated deep link to `/scheduling/planning-cycles` → `/login` → sign in → **returns to the deep link**; `/` redirects to `/dashboard`; `/login` while authenticated redirects away.
5. [ ] **`active-church-switching.spec.ts`** — `dualMemberAB` lands on selector C, picks Church A, switches to Church B via the sidebar switcher, and sees Church B data with no Church A remnants.
6. [ ] **`identity-cross-tenant-isolation.spec.ts`** — `adminA` requests Church B's invitation endpoints by direct URL with known-valid Church B ids → `404`, and no Church B name renders anywhere. Extends the existing isolation spec's shape to the identity surface.

**Not at L4**: the sign-up 404, the authority matrix, invitation failure copy,
expiry, resend limits, atomicity, concurrency. All proved lower.

---

## 13. Tests to delete or rewrite

Deletions are part of the verification architecture — a suite that still proves
retired behaviour is a suite that blocks the change.

- [ ] **Delete** `packages/auth`'s soft-registration hook tests together with the hook ([#35](https://github.com/tiagoluizpoli/church/issues/35)).
- [ ] **Delete** every `system-church` fixture and assertion.
- [ ] **Rewrite** `apps/web/tests/global-setup.ts` per §3.4 — mandatory, and it blocks the whole E2E suite (`authUser` at `:82`).
- [ ] **Rewrite** `apps/server/src/test-support/e2e-seed.ts` and `src/scripts/seed-dev-users.ts` to provision Churches through the provisioning operation ([#43](https://github.com/tiagoluizpoli/church/issues/43)); the `churchAdmin` write at `seed-dev-users.ts:417` goes away with the table.
- [ ] **Extend** `seed-dev-users` with a **second Church** and invitation states in every lifecycle status, so local development can exercise redemption and isolation without hand-crafted SQL ([#35](https://github.com/tiagoluizpoli/church/issues/35) requires it stay usable throughout implementation).
- [ ] **Rewrite** every test asserting `systemRole` or `sub_leader`; `TeamLeader` is a Team Membership at `leader` ([#39](https://github.com/tiagoluizpoli/church/issues/39)). `apps/web/tests/global-setup.ts`'s `SUB_LEADER_STORAGE_STATE` and `apps/web/tests/scheduling/planning-role-guard-matrix.spec.ts` are the visible surface.
- [ ] **Rewrite** tests that derive Church from the Volunteer row — the six `preValidation` hooks are replaced by Active Church resolution ([#39](https://github.com/tiagoluizpoli/church/issues/39)).
- [ ] **Update** `apps/server/tests/integration/repositories/setup.ts`: truncation root, and `seed()` must create `organization` + `member` rows rather than bare `church` rows.
- [ ] **Register** all new test directories in `apps/server/vitest.config.ts` project includes (§1.1).

---

## 14. Sequencing

The architecture is written so verification can lead implementation rather than
trail it. Recommended order — each step leaves the suite green:

1. **Harness first**: `identity-fixtures.ts`, truncation root + its guard test,
   capture `EmailSender`, outbox assertions, vitest include registration. No
   product code yet.
2. **L0 constraints** — they are the cheapest and the most load-bearing
   (partial unique indexes, check constraints, cascades).
3. **L1 `AuthorityService`** — the 100% domain gate makes this the natural
   TDD surface, and every later layer depends on it.
4. **The sign-up gate plus the E2E bootstrap rewrite, together.** They must land
   in the same change: the gate breaks global setup, and the rewrite is
   meaningless without the gate.
5. **L2 by area** in dependency order: provisioning → minting/delivery →
   redemption → transfer.
6. **L3 route/guard/redemption components.**
7. **L4 journeys last**, once the seams they traverse are proved.

Per `agents.local.md`: `bun run validate:affected` within each phase, the
relevant `bun run test:e2e -- tests/identity/[spec]` as the story gate, and
`bun run validate` only at handoff.

---

## 15. Known gaps and non-goals

- **Email template markup and the outbox worker's runtime host** are
  implementation concerns ([#40](https://github.com/tiagoluizpoli/church/issues/40)); this architecture verifies the port and the
  queue, not the rendered HTML or the scheduler.
- **Ministry management** is out of scope for the map, so the only coverage is
  the assertion in §6 that a provisioned Church is empty and cannot yet mint —
  pinning the gap rather than hiding it.
- **The admin minting UI** is out of scope; §7 verifies the API boundary only.
- **Load and rate-limit tuning** is not verified — §8.1 asserts that a limiter
  exists and that its response preserves indistinguishability, not its
  thresholds.
- **The `FOR SHARE` roster seam (§9.3) is the highest-risk item here.** It is
  the one test that must be written against the *existing* rostering path and
  observed to fail first; a green result on an implementation that never took
  the lock means the test proved nothing.
