# Research: the Church slug, what it does today and whether URLs should carry it

Status: research only. Resolves [#975](https://github.com/tiagoluizpoli/church/issues/975) for map [#973](https://github.com/tiagoluizpoli/church/issues/973) (Church Settings). The decision is the human's; see §6.

Tree read: `origin/develop` at `5d187193`. Better Auth read from the installed package, `better-auth@1.7.7` (root `package.json` catalog), under `node_modules/.bun/better-auth@1.7.7+…/node_modules/better-auth/dist/plugins/organization/`.

## 1. Short answer

- The slug is an **operator-side handle**. It is set once when a Church is provisioned, and used afterwards only to find that Church again from scripts and seeds. **No user ever sees it.** No API DTO returns it, no web code reads it, and no URL contains it.
- Routes do not carry the Church id either. **The Active Church lives in the Better Auth session** (`session.activeOrganizationId`), not in the path. The only Church-naming URL piece is an optional `?church=<id>` deep-link marker. The web reads it, but no server-built link emits it today.
- A ChurchAdmin can **already change the slug, name, logo and metadata today**, by calling Better Auth's `POST /api/auth/organization/update` directly. The route is open and the plugin's `admin` role holds `organization: ["update"]`. Better Auth checks only that the new slug is non-empty and unique. This bypasses `AuthorityService` (ADR 0009), so the Church Settings work must close it (§5).
- Recommendation for the grilling ticket: **leave the slug out of the Church Settings screen and out of URLs for now.** Lock its format, keep it operator-set, and let a future public church page own any decision about making it editable.

## 2. Every place the slug is read or written today

### Storage and invariants

| Where | What | Why |
|---|---|---|
| `packages/db/src/schema/organization.ts:31` | `slug: text('slug').notNull().unique()`, constraint `organization_slug_unique` (`migrations/0000_sturdy_red_wolf.sql:210-214`) | Mirrors the Better Auth organization plugin's required, unique `slug` column. |
| `packages/db/src/schema/church.ts:5-9` | Comment: "`name` and `slug` are writable there [organization] and nowhere else" | Spec 024 §2.2 / SC-004: Church identity has one writable home. |
| `packages/db/src/tenancy.ts:56` | `ChurchSlugSchema = z.string().trim().min(1).brand<'ChurchSlug'>()` | **The only format rule anywhere: non-empty after trim.** There is no character set, case or length limit. `"Igreja São Paulo!!"` would be accepted. |
| `apps/server/src/domain/entities/church.ts:3,7,37` | `ChurchSlug` branded type, `Church.slug` getter | Branded per spec-009 grilling decision 18 (`.specify/memory/sessions/2026-06-21-spec-009-grilling.md:58`). |
| `apps/server/src/infrastructure/mappers/church.mapper.ts:44-65` | `toChurchSlug` rejects a blank persisted slug | Defensive read mapping. |

### Writers

| Where | What |
|---|---|
| `apps/server/src/scripts/provision-church.ts:110-136` (via `operator.ts:25,106-116` `provision-church --slug`) | **The only production writer.** The Platform Operator passes `--slug`, and a unique violation becomes `ChurchSlugTakenError` / `CHURCH_SLUG_TAKEN` (`domain/errors/church-slug-taken.ts`). Spec 024 §2.5 chose a named error over convergence on slug, because converging would silently "adopt the existing Church". |
| `packages/db/src/tenancy.ts:140-175` `createChurch` | Low-level insert used by provisioning and seeds. |
| `apps/server/src/scripts/init-system.ts:45-60` + `seed-data.json` (`system-church`) | Local dev bootstrap (`bun run db:init`). Uses the **slug as its idempotence key**: it finds by slug and creates the Church if none is found. |
| Seeds: `seeds/blueprints/*` (`igreja-semente`, `igreja-colheita`), `seeds/builders/church.ts`, E2E recipes (`e2e-<tag>`) | Fixed or generated slugs. `seeds/recipes/development.ts:227-232,413-421` derives seed ids from the **blueprint** slug constant and maps `churchSlug` → id for cross-Church groups. These read the blueprint value, not the database value. |
| Better Auth `POST /organization/update` (`routes/crud-org.mjs:160-232`) | **An unintended writer.** It is reachable through the catch-all `/api/auth/*` mount (`apps/server/src/main/fastify/setup.ts:332-353`) and is not in `disabledPaths` (`packages/auth/src/index.ts:61`, which blocks only `/sign-up/email` and `/organization/update-member-role`). The permission check passes for any `admin` member because `adminAc` grants `organization: ["update"]` (`access/statement.mjs:24-25`, adopted in `packages/auth/src/organization/roles.ts`). The body schema is `slug: z.string().min(1)`, and the only other check is uniqueness. |

### Readers

| Where | What |
|---|---|
| `ChurchRepository.getBySlug` (`domain/contracts/infrastructure/church.repository.ts:7`, `drizzle-church.repository.ts:47-53`) | Defined, contract-tested (`tests/domain/contracts/contract-tests/church.contract-spec.ts:44-56`), and **called by no production code**. It dates from spec 009 (repository interfaces), where grilling decision 10 made it a throwing `get*`. It anticipated lookup by slug and was never wired. |
| `findChurchBySlug` (`packages/db/src/tenancy.ts:263-270`) | Used by `init-system.ts` and by `ensureChurch` (`tenancy.ts:195-217`, which no production code calls). |
| CLI output | `provision-church.ts:277` and the dev reseed log print the slug for the operator. |
| Tests | Many fixtures set slugs. The cross-tenant isolation tests (`apps/web/tests/identity/active-church-switching.spec.ts:143`, `cross-tenant-invitation-isolation.spec.ts:42`, spec 024 rule "name, id and slug absent") treat **the slug as tenant-identifying data that must not leak**. |
| Better Auth routes that accept a slug | `set-active` (`organizationSlug`), `get-full-organization` and `get-organization` (`organizationSlug`), `check-slug`, all in `crud-org.mjs`. The web registers `organizationClient()` (`apps/web/src/lib/auth-client.ts:13`) but calls none of these. The server calls `setActiveOrganization` with `organizationId` only (`api/auth/resolve-active-church-and-persist.ts`, `api/controllers/active-church-controller.ts:192`, `better-auth-redemption-identity-gateway.ts:94`). |

**Never:** no API DTO, no web component, no email template and no notification link reads the slug.

## 3. Why routes use the Church id, or more exactly, no Church at all

- **The Active Church is session state, not a path segment.** Spec 024 §1.5 (settled in #42, shipped by map #54) says: "`session.activeOrganizationId` is canonical. Protected requests map it to a Church and revalidate Church Membership per request." Every route sits under the pathless `_authenticated/_active-church` layout, and resource paths (`/ministries/$ministryId`, `/schedules/$ministryId/$cycleId/...`) carry resource ids, never a Church segment. The same section also rejects any "last Church" preference outside the session.
- **Cross-Church deep links name the target by id.** `apps/web/src/shared/utils/cross-church-link.ts` reads `?church=<id>` and checks it against the caller's membership ids (`resolveCrossChurchDeepLink`). The outcome is passthrough, auto-select, a confirmation, or a generic access denied that "does not reveal whether the resource exists". Added in `ac74f1205` (#81 under #54). It compares against `memberChurchIds`, so the id is the natural key: the membership list already returns it, and it never changes. **No server-built link emits `?church=` today** (`domain/services/web-link.ts` callers in `db-outbox-drainer.ts`, `scheduling-notification-facts.ts` build bare paths).
- **Invitation links carry the invitation id**, `/invitations/church/<id>` or `/invitations/ministry/<id>` (`domain/services/ministry-invitation-redemption-path.ts`, `provision-church.ts:55`), and never the Church. Redemption resolves the Church server-side.
- Nothing in #54, spec 024 or the ADRs discusses the slug in URLs. The id-only design follows from the facts above (an immutable key, membership checks by id, no slug exposed); no decision rejected slugs.

## 4. Should an admin-editable slug appear in URLs?

| Surface | Slug in URL: for | Against |
|---|---|---|
| **Active Church selection** (`/select-church`, the `_active-church` layout) | A readable, shareable URL such as `/igreja-semente/dashboard`. | It would contradict §1.5, where the session is canonical: a path Church and a session Church can disagree, which needs a whole new resolution rule. It would also mean rewriting every route under a `$churchSlug` segment, putting a readable tenant name in browser history and in request logs (`setup.ts` logs every URL through `redactUrl`), and redirecting after renames. Members belong to 1 or 2 Churches, so readability buys little. |
| **Cross-Church deep link** (`?church=`) | Readable. | The value is compared to membership ids. A slug adds a lookup, and a rename breaks links already in inboxes. No sender exists yet, so nothing gains. |
| **Invitation links** | None really. The recipient sees the Church name on the page. | The link is keyed by the invitation id and must not reveal the Church before the recipient is verified (spec 024 isolation rules). A slug adds leakage and nothing more. |
| **A future public church page** (open question on #973: "who sees the church's public information") | **The one surface where a slug clearly helps**: a stable, human, printable address like `/c/igreja-semente` for service times and contacts, used on bulletins and social bios. | It is only worth anything once a public page exists, and printed URLs are exactly where a rename hurts most. |

### What breaks if a ChurchAdmin changes the slug

**Today, almost nothing in the product breaks**, because nothing user-facing uses the slug. The concrete effects:

1. **`bun run db:init` (dev only)**: `init-system.ts` finds the Church by `system-church`. After a rename, a rerun creates a **second** Church with the seed slug. Pre-production dev data is disposable, so this is low impact.
2. **Seed and E2E fixtures** are keyed by blueprint constants, not database values. They are unaffected, because reseeds reset.
3. **Operator memory**: the operator provisioned by slug and may grep logs or databases by it. That handle now silently changes.
4. **Better Auth `set-active` / `get-full-organization` by slug**: unused by our code, so nothing breaks.

**If the slug were in URLs**, a rename would break every bookmark, printed bulletin, QR code, shared link and stored email or notification link. The fix needs a `church_slug_history` (old slug → church id) table with 301s, plus a rule for reusing a slug that another Church once held (squatting and hijacking risk: a released old slug claimed by another tenant would capture its old traffic). This is the standard cost of editable public handles, and the main reason to keep the slug immutable, or at least slow to change, once it is public.

## 5. The open Better Auth update route (a finding for the spec, independent of the slug decision)

`POST /api/auth/organization/update` currently lets any ChurchAdmin write `name`, `slug`, `logo` and `metadata` with only Better Auth's own checks: non-empty strings and a unique slug. This:

- bypasses `AuthorityService`, which ADR 0009 makes the single gatekeeper. That ADR already blocks the sibling role-change endpoint for the same reason;
- accepts any slug format, and any `logo` string, which matters once the logo becomes an S3 key or URL under #973;
- records nothing about the change.

Related: `POST /organization/check-slug` requires only a session (`requestOnlySessionMiddleware`), so any signed-in user can test whether another Church's slug exists. This is a minor cross-tenant existence oracle.

Options for the Church Settings spec: (a) add `/organization/update` (and probably `/organization/check-slug`, `/organization/delete`, `/organization/set-active` if the app owns that flow) to `disabledPaths`, and write Church identity only through an app endpoint that goes through `AuthorityService` with domain validation. This mirrors how role changes were handled. Or (b) keep the route and add `organizationHooks.beforeUpdateOrganization` validation. Option (a) fits ADR 0009 and the "app-managed changes use trusted server APIs" comment at `packages/auth/src/index.ts:58-60`. **Check before choosing:** whether disabling `/organization/set-active` affects anything. The server calls it through `auth.api`, which does not traverse `disabledPaths`, as noted in that same comment.

## 6. Recommendation for the "Church Settings fields and validation" grilling ticket

This is a decision for the human. The facts above support:

1. **Shown at all? Not on Church Settings for now.** No surface uses it, and an editable field with no visible effect invites edits that later break printed URLs. #973's standing decision lists "slug" as in scope. The grilling should confirm or drop that, given that no URL uses it yet.
2. **Editable? No, not by the ChurchAdmin, until a public church page exists.** Keep it operator-set at provisioning, and close the Better Auth update route (§5) so the policy is enforced and not just a convention. If the public page ships later, decide then between "editable with redirects and slug history" and "immutable, operator-changed on request". The second is cheaper and fits a handle that appears in print.
3. **Format rules: lock them now, whoever writes the slug.** Replace `z.string().trim().min(1)` with a URL-safe rule enforced in `ChurchSlugSchema`, so provisioning, seeds and any future editor share it. A conventional rule: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3 to 63 characters, lowercase ASCII after transliteration (`São` → `sao`), plus a small reserved list (`api`, `admin`, `app`, `login`, `invitations`, `select-church`, ...) for the day it becomes a path. Existing seed and E2E slugs (`igreja-semente`, `e2e-<hex>`, `system-church`) already satisfy it. Early-stage data is disposable, so this needs no migration concern beyond the seeds.
4. **URLs: keep the Active Church in the session and ids in `?church=` and invitation links.** Reserve the slug for a future public church page only, and decide that together with #973's "who sees the church's public information" question.

## Sources

- Code: paths cited inline, all on `origin/develop` `5d187193`.
- Better Auth 1.7.7 organization plugin source: `dist/plugins/organization/routes/crud-org.mjs` (create :14,62; check-slug :151-159; update :160-232; get by slug :296-320; set-active by slug :376-420), `dist/plugins/organization/access/statement.mjs:24-25` (`adminAc`), `requestOnlySessionMiddleware` (`dist/api/routes/session.mjs:316-322`).
- `specs/024-invite-only-registration/spec.md` §1.5 (Active Church), §2.2 and §2.5 (identity on organization, slug collision), SC-004.
- Issue #54 (Active Church selector and switcher), commit `ac74f1205` (cross-Church deep links, #81).
- `docs/adr/0009-authorization-rules-only-gatekeeper-over-module-facts.md`.
- `.specify/memory/sessions/2026-06-21-spec-009-grilling.md` decisions 10 and 18 (`getBySlug`).
