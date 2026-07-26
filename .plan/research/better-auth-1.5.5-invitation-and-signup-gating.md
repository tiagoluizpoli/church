# Research: better-auth 1.5.5 — invitations, sign-up gating, and fit with this domain

Date: 2026-07-26
Issue: tiagoluizpoli/church#30
Status: capability survey — **no recommendation, no proposed design**
Scope: What better-auth 1.5.5 can and cannot do for invitations and for closing
the public sign-up path, plus a factual collision list against this repo's domain.

## Version verification

| Fact | Value | Source |
| --- | --- | --- |
| Catalog pin | `1.5.5` | `/home/tiago/01-dev-env/personal-repos/church/church/package.json:14` |
| Workspace dep | `"better-auth": "catalog:"` | `/home/tiago/01-dev-env/personal-repos/church/church/packages/auth/package.json:22` |
| Installed package name/version | `better-auth` `1.5.5` | installed `package.json` (see path below) |
| Peer core | `@better-auth/core` `1.5.5` | `node_modules/.bun/@better-auth+core@1.5.5+332e3f01f7f50a17/` |
| Router layer | `better-call` `1.3.2` | `node_modules/.bun/better-call@1.3.2+3c5d820c62823f0b/` |

Install layout is **bun**, not pnpm — there is no `node_modules/.pnpm/`. The real
package resolves through a symlink:

```
packages/auth/node_modules/better-auth
  -> node_modules/.bun/better-auth@1.5.5+4134fd5629124c7f/node_modules/better-auth
```

Citation shorthand used below (all paths relative to the repo root):

- `BA/` = `node_modules/.bun/better-auth@1.5.5+4134fd5629124c7f/node_modules/better-auth/`
- `CORE/` = `node_modules/.bun/@better-auth+core@1.5.5+332e3f01f7f50a17/node_modules/@better-auth/core/`
- `BC/` = `node_modules/.bun/better-call@1.3.2+3c5d820c62823f0b/node_modules/better-call/`

The npm package ships only `dist/` (compiled `.mjs` + `.d.mts`), so source
citations are against `dist/`. Where a `dist` read is corroborated by the
upstream `src/` file, the docs URL is given alongside.

Note on doc versioning: Context7 serves the better-auth docs from `main`
(`/better-auth/better-auth`) and does **not** offer a `1.5.5` snapshot. Every doc
citation below was cross-checked against the installed 1.5.5 `dist/`; where docs
and installed code agree, both are cited. No claim rests on docs alone.

---

## 1. Invitations

### 1.1 Which plugin models this

The first-party `organization` plugin is the only one that models organizations,
members, invitations and roles. It ships at `BA/dist/plugins/organization/` and is
exported from `better-auth/plugins`
(`BA/dist/plugins/index.mjs`; plugin factory at `BA/dist/plugins/organization/organization.mjs:88`).

No other first-party plugin models invitations. The `admin` plugin
(`BA/dist/plugins/admin/`) models a **global** `user.role` and user
administration (ban, impersonate, create-user), not org-scoped membership.

### 1.2 Invite lifecycle and what triggers each transition

Status is a flat string column with four legal values:

```
z.enum(["pending", "accepted", "rejected", "canceled"]).default("pending")
```
— `BA/dist/plugins/organization/schema.mjs:6-11`

| Transition | Endpoint / trigger | Source |
| --- | --- | --- |
| **create** → `pending` | `POST /organization/invite-member`. Caller must be a member of the org and pass the `invitation: ["create"]` permission check. Duplicate pending invite for the same email is rejected unless `resend: true`. | `BA/dist/plugins/organization/routes/crud-invites.mjs:30`, permission check `:83-88`, duplicate guard `:116-120` |
| **resend** (stays `pending`) | Same endpoint with `resend: true` — updates `expiresAt` in place and re-fires `sendInvitationEmail`; does **not** create a new row. | `crud-invites.mjs:123-150` |
| **create supersedes prior** | If `cancelPendingInvitationsOnReInvite` is set, the prior pending invite is moved to `canceled` before the new one is created. | `crud-invites.mjs:151-154` |
| **accept** → `accepted` | `POST /organization/accept-invitation` with `{ invitationId }`. Requires an **authenticated session whose email matches the invite email**. Creates the `member` row and sets `session.activeOrganizationId`. | `crud-invites.mjs:226`, email match `:249`, member creation `:290-295`, active org `:296` |
| **reject** → `rejected` | `POST /organization/reject-invitation` with `{ invitationId }`. Same session + email-match requirement. Returns `{ invitation, member: null }`. | `crud-invites.mjs:309`, email match `:338` |
| **cancel/revoke** → `canceled` | `POST /organization/cancel-invitation` with `{ invitationId }`. Requires a member of the invite's org holding `invitation: ["cancel"]`. | `crud-invites.mjs:362`, permission check `:388-393` |
| **expire** | **There is no expiry job and no `expired` status.** Expiry is enforced lazily at read time by comparing `invitation.expiresAt < new Date()`; an expired row keeps `status: "pending"` forever. | accept: `crud-invites.mjs:248`; get: `crud-invites.mjs:456` |

Expiry window: `invitationExpiresIn` seconds, **default 48 hours**
(`BA/dist/plugins/organization/adapter.mjs:547` — `getDate(options?.invitationExpiresIn || 3600 * 48, "sec")`;
option doc `BA/dist/plugins/organization/types.d.mts:147-152`).

Other invite-time guards:

- `invitationLimit` — max pending invites per org, default `100`, may be a function. `crud-invites.mjs:155-160`
- `membershipLimit` — checked at **accept** time, default `100`, may be a function. `crud-invites.mjs:251-255`
- `requireEmailVerificationOnInvitation` — blocks accept **and** reject when the session user is unverified. `crud-invites.mjs:250`, `:339`
- `sendInvitationEmail(data, request)` — the only outbound-email hook; if unset, **no email is sent and the plugin gives you no token or link** (see 1.3). `crud-invites.mjs:206-216`

Lifecycle hooks (`organizationHooks` option), all optional:
`beforeCreateInvitation` / `afterCreateInvitation` (`crud-invites.mjs:187-201`, `:217-221`),
`beforeAcceptInvitation` / `afterAcceptInvitation` (`:256-260`, `:297-302`),
`beforeRejectInvitation` / `afterRejectInvitation` (`:342-346`, `:351-355`),
`beforeCancelInvitation` / `afterCancelInvitation` (`:396-400`, `:405-409`).
Only `beforeCreateInvitation` can mutate data (it merges a returned `{ data }`).

### 1.3 Required schema — exact tables and columns

Field definitions are declared by the plugin factory at
`BA/dist/plugins/organization/organization.mjs:247-412`. Types are better-auth's
abstract field types (`"string"`, `"date"`, `"boolean"`), which the drizzle
adapter maps to concrete column types. Every model name and every field name is
overridable via `opts.schema.<model>.modelName` / `.fields.<field>`.

**`organization`** — `organization.mjs:248-282`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | implicit PK |
| `name` | string | yes | sortable |
| `slug` | string | yes | **unique**, indexed |
| `logo` | string | no | |
| `createdAt` | date | yes | |
| `metadata` | string | no | JSON serialized into a string column |

**`member`** — `organization.mjs:285-321`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | |
| `organizationId` | string | yes | FK → `organization.id`, indexed |
| `userId` | string | yes | FK → `user.id`, indexed |
| `role` | string | yes | sortable, `defaultValue: "member"` |
| `createdAt` | date | yes | |

There is **no `teamId` on `member`** and **no uniqueness constraint declared on
`(organizationId, userId)`**.

**`invitation`** — `organization.mjs:323-384`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | |
| `organizationId` | string | yes | FK → `organization.id`, indexed |
| `email` | string | yes | sortable, indexed — **the invite is addressed to an email, not a token** |
| `role` | string | **no** | sortable |
| `teamId` | string | no | **only present when `teams.enabled`** (`organization.mjs:349-354`) |
| `status` | string | yes | sortable, `defaultValue: "pending"` |
| `expiresAt` | date | yes | |
| `createdAt` | date | yes | `defaultValue: () => new Date()` |
| `inviterId` | string | yes | FK → `user.id` |

**There is no `token` column.** Accept is keyed on `invitationId` (the PK) plus a
server-side check that the *session user's email* equals `invitation.email`
(`crud-invites.mjs:249`). The id is what you put in the emailed link.

`invitation.teamId` is a **comma-joined list**, not a single FK — multi-team
invites are flattened into one string column:

```js
teamId: invitation.teamIds.length > 0 ? invitation.teamIds.join(",") : null
```
— `BA/dist/plugins/organization/adapter.mjs:556`, split again on accept at `crud-invites.mjs:267`.

**`session` additions** — `organization.mjs:400-411`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `activeOrganizationId` | string | no | always added by the plugin |
| `activeTeamId` | string | no | **only when `teams.enabled`** |

**`team`** (only when `teams.enabled`) — `organization.mjs:145-176`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | |
| `name` | string | yes | |
| `organizationId` | string | yes | FK → `organization.id`, indexed |
| `createdAt` | date | yes | |
| `updatedAt` | date | no | `onUpdate` |

**`teamMember`** (only when `teams.enabled`) — `organization.mjs:177-206`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | |
| `teamId` | string | yes | FK → `team.id`, indexed |
| `userId` | string | yes | FK → **`user.id`**, indexed — *not* `member.id` |
| `createdAt` | date | no | |

**`teamMember` has no `role` column.** This is the single most load-bearing fact
for section 3.

**`organizationRole`** (only when `dynamicAccessControl.enabled`) — `organization.mjs:208-246`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | |
| `organizationId` | string | yes | FK → `organization.id`, indexed |
| `role` | string | yes | indexed |
| `permission` | string | yes | JSON `Record<string, string[]>` serialized to a string |
| `createdAt` | date | yes | |
| `updatedAt` | date | no | `onUpdate` |

### 1.4 API surface

Server method names are the **keys of the `endpoints` object**
(`BA/dist/plugins/organization/organization.mjs:90-139`), reachable as `auth.api.<key>`.
Client method names are the **camelCased path segments** — the client type is
generated by `PathToObject`, which splits the path on `/` and camelCases each
segment (`BA/dist/client/path-to-object.d.mts:16-17`). So `/organization/invite-member`
→ `authClient.organization.inviteMember`.

#### Organizations

| Path | `auth.api.*` | `authClient.organization.*` | Body / query |
| --- | --- | --- | --- |
| `POST /organization/create` | `createOrganization` | `create` | `{ name, slug, userId?, logo?, metadata?, keepCurrentActiveOrganization? }` — `crud-org.mjs:15-21` |
| `POST /organization/check-slug` | `checkOrganizationSlug` | `checkSlug` | `{ slug }` — `crud-org.mjs:154` |
| `POST /organization/update` | `updateOrganization` | `update` | `{ data: { name?, slug?, logo?, metadata? }, organizationId? }` — `crud-org.mjs:163-166` |
| `POST /organization/delete` | `deleteOrganization` | `delete` | `{ organizationId }` — `crud-org.mjs:240` |
| `GET /organization/get-full-organization` | `getFullOrganization` | `getFullOrganization` | query `{ organizationId?, organizationSlug?, membersLimit? }` — `crud-org.mjs:297-301` |
| `POST /organization/set-active` | `setActiveOrganization` | `setActive` | `{ organizationId?: string \| null, organizationSlug? }` — `crud-org.mjs:340-343` |
| `GET /organization/list` | `listOrganizations` | `list` | — |

`createOrganization`'s `userId` field is documented in-source as
*"Should only be used by admins or when called by the server. server-only."*
(`crud-org.mjs:18`).

#### Invitations — `BA/dist/plugins/organization/routes/crud-invites.mjs`

| Path | `auth.api.*` | `authClient.organization.*` | Body / query |
| --- | --- | --- | --- |
| `POST /organization/invite-member` | `createInvitation` | `inviteMember` | `{ email, role: string \| string[], organizationId?, resend?, teamId?: string \| string[] }` + any `schema.invitation.additionalFields` — `:18-24`, `:34-37` |
| `POST /organization/accept-invitation` | `acceptInvitation` | `acceptInvitation` | `{ invitationId }` — `:225` |
| `POST /organization/reject-invitation` | `rejectInvitation` | `rejectInvitation` | `{ invitationId }` — `:308` |
| `POST /organization/cancel-invitation` | `cancelInvitation` | `cancelInvitation` | `{ invitationId }` — `:361` |
| `GET /organization/get-invitation` | `getInvitation` | `getInvitation` | query `{ id }`; **requires a session** and email match — `:412`, `:452-457` |
| `GET /organization/list-invitations` | `listInvitations` | `listInvitations` | query `{ organizationId? }` — `:472` |
| `GET /organization/list-user-invitations` | `listUserInvitations` | `listUserInvitations` | query `{ email? }` — **`email` is rejected when `ctx.request` is set**, i.e. server-side only — `:497`, `:542` |

#### Members — `BA/dist/plugins/organization/routes/crud-members.mjs`

| Path | `auth.api.*` | `authClient.organization.*` | Body / query |
| --- | --- | --- | --- |
| *(no HTTP path)* | `addMember` | **none — server-only** | `{ userId, role: string \| string[], organizationId?, teamId? }` — `:15-19` |
| `POST /organization/remove-member` | `removeMember` | `removeMember` | `{ memberIdOrEmail, organizationId? }` — `:105-108` |
| `POST /organization/update-member-role` | `updateMemberRole` | `updateMemberRole` | `{ role: string \| string[], memberId, organizationId? }` — `:201-205` |
| `POST /organization/leave` | `leaveOrganization` | `leave` | `{ organizationId }` — `:351` |
| `GET /organization/get-active-member` | `getActiveMember` | `getActiveMember` | — |
| `GET /organization/get-active-member-role` | `getActiveMemberRole` | `getActiveMemberRole` | query `{ userId?, organizationId?, organizationSlug? }` — `:429-433` |
| `GET /organization/list-members` | `listMembers` | `listMembers` | query filters |

`addMember` is defined with the **pathless** `createAuthEndpoint(options, handler)`
overload (`crud-members.mjs:26`; overload declared at `CORE/dist/api/index.d.mts:277`,
implemented at `CORE/dist/api/index.mjs:18-30`). A pathless endpoint is registered
in `auth.api` but is not routed over HTTP, and the client type generator produces
nothing for it. The docs describe it the same way — *"can only be invoked on the
server"* (`docs/content/docs/plugins/organization.mdx`, Members > Add Member).

`addMember` is also the one member endpoint that tolerates a headerless call:
it only fetches a session when `ctx.body.userId` is absent
(`crud-members.mjs:41` — `ctx.body.userId ? await getSessionFromCtx(ctx)... : null`).

#### Teams (only registered when `teams.enabled`) — `crud-team.mjs`, gated at `organization.mjs:113,125-128`

`createTeam` (`/organization/create-team`, `{ name, organizationId? }` — `:16-18`),
`removeTeam` (`{ teamId, organizationId? }` — `:134-137`),
`updateTeam` (`/organization/update-team`),
`listOrganizationTeams` (`/organization/list-teams`),
`setActiveTeam` (`{ teamId?: string \| null }` — `:375`),
`listUserTeams` (`/organization/list-user-teams`),
`listTeamMembers` (`/organization/list-team-members`),
`addTeamMember` (`{ teamId, userId }` — `:502-505`),
`removeTeamMember` (`{ teamId, userId }` — `:598-601`).

#### Dynamic roles (only when `dynamicAccessControl.enabled`) — `crud-access-control.mjs`, gated at `organization.mjs:136-139`

`createOrgRole` (`/organization/create-role`), `deleteOrgRole`, `listOrgRoles`,
`getOrgRole`, `updateOrgRole`.

#### Permission check

`POST /organization/has-permission` → `auth.api.hasPermission` /
`authClient.organization.hasPermission`, body
`{ organizationId?, permissions: Record<string, string[]> }` — `organization.mjs:23-29, 396`.
Client-side, non-network variant: `authClient.organization.checkRolePermission({ role, permissions })`
(`BA/dist/plugins/organization/client.mjs:38-47`).

### 1.5 How roles work

**Roles are flat strings, stored per organization membership, on `member.role`.**

- The role schema is literally `z.string()` — `BA/dist/plugins/organization/schema.mjs:5`.
- Storage: `member.role`, `type: "string"`, `defaultValue: "member"` — `organization.mjs:308-314`.
- **Multiple roles are comma-joined into that single string**:
  `parseRoles(roles) { return Array.isArray(roles) ? roles.join(",") : roles }`
  — `organization.mjs:20-22`; split back with `.split(",")` at `crud-invites.mjs:91`.
- Built-in roles are `admin`, `member`, `owner` — `schema.mjs:59-63`.
- Permission catalog is a closed statement set: `organization: [update, delete]`,
  `member: [create, update, delete]`, `invitation: [create, cancel]`,
  `team: [create, update, delete]`, `ac: [create, read, update, delete]`
  (`BA/dist/plugins/organization/access/statement.mjs`; upstream
  `packages/better-auth/src/plugins/organization/access/statement.ts`).
  Custom roles are merged in via `opts.roles` at `organization.mjs:140-143`.
- Org creator gets `creatorRole`, default `"owner"` (`crud-invites.mjs:89`;
  option doc in upstream `plugins/organization/types.ts`).
- `dynamicAccessControl.enabled` moves *role definitions* into the DB
  (`organizationRole` table, per-organization), but the **assignment** is still
  the same flat `member.role` string. Dynamic roles change where a role's
  permission map lives, not the granularity at which a role is attached.

**Is there any role scoped narrower than the organization?** No.

- `teamMember` has columns `id`, `teamId`, `userId`, `createdAt` and **nothing
  else** — `organization.mjs:177-206`, mirrored by
  `teamMemberSchema` at `schema.mjs:45-50`. There is no per-team role.
- `member` has no `teamId` — `organization.mjs:285-321`.
- `hasPermission` resolves permissions from `member.role` looked up by
  `(userId, organizationId)` only; no team is consulted —
  `organization.mjs:71-81`, `BA/dist/plugins/organization/has-permission.mjs`.
- The one place `teamId` touches roles is `invitation.teamId`, which only decides
  which `teamMember` rows to create on accept (`crud-invites.mjs:266-289`); the
  `role` on that same invitation is still applied to the org-wide `member` row
  (`crud-invites.mjs:290-295`).

**Does the plugin have a `teams` feature, and what does it model?** Yes, off by
default, enabled with `teams: { enabled: true }` (`organization.mjs:113`).
It models a **flat, single-level partition of one organization into named
groups**, plus a many-to-many `user ↔ team` link with no attributes:

- `team` belongs to exactly one `organization`; there is no parent-team column,
  so teams cannot nest. `organization.mjs:145-176`
- `teamMember` links `team.id` to **`user.id` directly** — not to `member.id` —
  so team membership is not structurally derived from org membership.
  `organization.mjs:189-199`
- Options: `maximumTeams`, `maximumMembersPerTeam` (both may be async
  functions), `allowRemovingAllTeams` — `BA/dist/plugins/organization/types.d.mts:~130-152`,
  enforced at `crud-invites.mjs:161-177` and in `crud-team.mjs`.
- A session may carry one `activeTeamId` — `organization.mjs:406-410`.

---

## 2. Sign-up gating

Three mechanisms exist in 1.5.5. They differ in *where* the check runs, and that
placement is exactly what decides whether server-side `auth.api.signUpEmail(...)`
still works.

### 2.0 The structural fact that drives every answer

`auth.api` and `auth.handler` are **two different entry points built from the
same endpoint set**:

```js
const { api } = getEndpoints(authContext, options);
return {
  handler: async (request) => { ... const { handler } = router(handlerCtx, options); ... },
  api,
  ...
};
```
— `BA/dist/auth/base.mjs:11-51`

- `auth.handler(request)` goes through `router(...)` — `base.mjs:48`.
- `auth.api.signUpEmail(...)` calls the wrapped endpoint **directly**, never
  touching `router` — `base.mjs:11, 51`.

Both go through `toAuthEndpoints`, which runs `hooks.before` / `hooks.after`
around every call (`BA/dist/api/to-auth-endpoints.mjs:16-96`, hooks collected at
`:162-193`, before-hooks executed at `:34-35`).

The server/client discriminator used by better-auth itself is **`ctx.request`**,
which is only populated when the call came in over HTTP. First-party precedent:

```js
if (ctx.request && ctx.query?.email)
  throw APIError.fromStatus("BAD_REQUEST", { message: "User email cannot be passed for client side API calls." });
```
— `BA/dist/plugins/organization/routes/crud-invites.mjs:542`
(query field documented as *"This only works for server side API calls."* at `:497`)

and

```js
if (!session && (ctx.request || ctx.headers)) throw ctx.error("UNAUTHORIZED");
```
— `BA/dist/plugins/admin/routes.mjs:151`

`internalContext` is spread from whatever the caller passed
(`to-auth-endpoints.mjs:22-32`), so `request` is `undefined` for a plain
`auth.api.signUpEmail({ body })`. `EndpointContext` declares both `path` and
`request` (`BC/dist/endpoint.d.mts:224-263`).

### 2.1 `emailAndPassword.disableSignUp`

**Exists in 1.5.5.** Confirmed in three places:

- Type: `disableSignUp?: boolean;` with `@default false` —
  `CORE/dist/types/init-options.d.mts:536-540`
- Enforcement: `BA/dist/api/sign-up.mjs` → `BA/dist/api/routes/sign-up.mjs:144-147`

```js
if (!ctx.context.options.emailAndPassword?.enabled || ctx.context.options.emailAndPassword?.disableSignUp)
  throw APIError.from("BAD_REQUEST", {
    message: "Email and password sign up is not enabled",
    code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
  });
```

- Docs: `docs/content/docs/reference/options.mdx` and
  `docs/content/docs/authentication/email-password.mdx` (`disableSignUp`, boolean,
  default `false`) — both retrieved via Context7 from
  `https://github.com/better-auth/better-auth/blob/main/docs/`.

**What it blocks:** only the `/sign-up/email` handler. It is the first statement
inside the handler body, before any body parsing.

**Does `auth.api.signUpEmail(...)` still work? NO.**
The guard is inside the endpoint handler at `sign-up.mjs:144`, downstream of the
`auth.api` / `auth.handler` fork at `base.mjs:11-51`. It reads only
`ctx.context.options`, never `ctx.request`, `ctx.headers`, or any context flag.
There is no conditional, no bypass parameter, and `asResponse` only changes
serialization of the result (`to-auth-endpoints.mjs:78-91`) — it is applied after
the handler throws.

**Documented escape hatches** (all bypass `/sign-up/email` rather than unlock it):

1. **`auth.api.createUser` from the `admin` plugin.** Its handler never reads
   `disableSignUp`; it calls `internalAdapter.createUser` and then `linkAccount`
   with a `credential` password directly —
   `BA/dist/plugins/admin/routes.mjs:131` (endpoint `/admin/create-user`),
   `:163-168` (`internalAdapter.createUser`), `:170-178` (`linkAccount` with
   `providerId: "credential"`, only when `ctx.body.password` is supplied).
   Its own authorization check is skipped entirely for a headerless server-side
   call — `admin/routes.mjs:150-159`:

   ```js
   const session = await getSessionFromCtx(ctx);
   if (!session && (ctx.request || ctx.headers)) throw ctx.error("UNAUTHORIZED");
   if (session) {
     if (!hasPermission({ userId: session.user.id, role: session.user.role, options: opts,
                          permissions: { user: ["create"] } }))
       throw APIError.from("FORBIDDEN", ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS);
   }
   ```

   With no session, no `ctx.request` and no `ctx.headers`, both branches are
   skipped and the user is created unauthenticated. Context7 returned the
   upstream `main` version of this route with the explicit note that it *"has no
   reference to `emailAndPassword.disableSignUp`"* and that the public sign-up
   endpoint is the only place `disableSignUp` is enforced; the installed 1.5.5
   `dist` agrees on that point, though its permission-check block is shorter than
   `main`'s (1.5.5 checks only `user: ["create"]`; `main` additionally gates
   `set-role` and `ban`). Adopting this hatch means adding the `admin` plugin,
   which also introduces a **global** `user.role` column — a third role axis on
   top of the two in §3.3.
2. **`ctx.context.internalAdapter.createUser(...)` + `.linkAccount(...)` directly.**
   This is exactly what both `/sign-up/email` (`sign-up.mjs:220-240`) and
   `/admin/create-user` (`admin/routes.mjs:163+`) do internally.
   `internalAdapter.createUser` is a thin wrapper over `createWithHooks`
   (`BA/dist/db/internal-adapter.mjs:58-65`), so it **still runs
   `databaseHooks.user.create.before`**.

### 2.2 `hooks.before` / `createAuthMiddleware`

Option type: `hooks?: { before?: AuthMiddleware; after?: AuthMiddleware }` —
`CORE/dist/types/init-options.d.mts:1301-1310`.
`createAuthMiddleware` is exported from `better-auth/api`, defined at
`CORE/dist/api/index.mjs:14-16`.

Wiring: a configured `hooks.before` is registered with `matcher: () => true`, so
it runs for **every** endpoint (`to-auth-endpoints.mjs:166-173`), invoked at
`:35` via `runBeforeHooks` (`:102-136`). Throwing an `APIError` inside it aborts
the call; returning a non-`{ context }` object short-circuits and becomes the
response (`:51-54`).

Canonical doc pattern (Context7, `docs/content/docs/concepts/hooks.mdx`):

```typescript
hooks: {
  before: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/sign-up/email") return;
    if (!ctx.body?.email.endsWith("@example.com"))
      throw new APIError("BAD_REQUEST", { message: "Email must end with @example.com" });
  }),
}
```

**Does `auth.api.signUpEmail(...)` still work? BY DEFAULT NO — but this mechanism
has a first-party escape hatch.**

`toAuthEndpoints` wraps *both* entry points, so an unconditional `before` hook
that throws will reject the server-side call too (`base.mjs:11` → `to-auth-endpoints.mjs:34-35`).

The escape hatch is `ctx.request`: it is `undefined` for
`auth.api.signUpEmail({ body })` because `internalContext` is spread from the
caller-supplied context (`to-auth-endpoints.mjs:22-32`), and the hook receives
that same context (`:114-117`). Guarding the throw with `if (ctx.request)` — or
equivalently checking `ctx.headers` — narrows the block to HTTP traffic only.
This is the same discriminator better-auth uses internally at
`crud-invites.mjs:542` and `admin/routes.mjs:151`, and the same
`ctx.path` field the docs use in the pattern above. Note this is a *convention
built on an observable context field*, not a dedicated bypass flag; I found no
doc page that states "`ctx.request` is undefined for `auth.api` calls" in those
words — the evidence is the two first-party call sites plus the context spread.

### 2.3 `databaseHooks.user.create.before`

Type — `CORE/dist/types/init-options.d.mts:1056-1064`:

```
before?: (user: User & Record<string, unknown>, context: GenericEndpointContext | null)
  => Promise<boolean | void | { data: Optional<User> & Record<string, any> }>;
```
with the doc comment *"if the hook returns false, the user will not be created."*

Enforcement — `BA/dist/db/with-hooks.mjs:9-19`:

```js
for (const hook of hooks || []) {
  const toRun = hook[model]?.create?.before;
  if (toRun) {
    const result = await toRun(actualData, context);
    if (result === false) return null;
    ...
```

**Does `auth.api.signUpEmail(...)` still work? NO — and this net is wider than
`disableSignUp`.**

`createWithHooks` sits underneath `internalAdapter.createUser`
(`BA/dist/db/internal-adapter.mjs:58-65`), so returning `false` kills user
creation for:

- `/sign-up/email` over HTTP,
- `auth.api.signUpEmail(...)` server-side (`sign-up.mjs:220` → same path; the
  `null` return is then converted to `UNPROCESSABLE_ENTITY / FAILED_TO_CREATE_USER`
  at `sign-up.mjs:227` and `:234`),
- `auth.api.createUser` from the admin plugin (`admin/routes.mjs:163`),
- **and any of your own code that calls `ctx.context.internalAdapter.createUser`.**

**Escape hatches:**

1. **Discriminate inside the hook.** The second parameter is
   `GenericEndpointContext | null` (`init-options.d.mts:1062`), which is the live
   endpoint context: `getCurrentAuthContext()` returns the object passed to
   `runWithEndpointContext` (`CORE/dist/context/endpoint-context.mjs:21-27`),
   and `to-auth-endpoints.mjs:33` passes `internalContext`. So the hook can read
   `context.path` (`"/sign-up/email"`) and `context.request` — both declared on
   `EndpointContext` (`BC/dist/endpoint.d.mts:224-263`) — and only return `false`
   for HTTP calls. Caveat: the context is `| null` by type, and
   `with-hooks.mjs:7` explicitly swallows the lookup failure
   (`getCurrentAuthContext().catch(() => null)`), so the hook must handle a null
   context.
2. **Bypass the hook layer entirely** by writing through the raw adapter:
   `ctx.context.adapter.create({ model: "user", data })`. `createWithHooks` is the
   only thing that consults `databaseHooks`; `adapter.create` is called *from*
   it (`with-hooks.mjs:21-25`). Using the raw adapter also skips better-auth's
   own defaults (`createdAt`/`updatedAt`/email lowercasing applied at
   `internal-adapter.mjs:59-64`) and does not create the `credential` account row.

### 2.4 `disabledPaths` — the one mechanism that is HTTP-only by construction

Option type — `CORE/dist/types/init-options.d.mts:1311-1316`:
`disabledPaths?: string[]` — *"Paths you want to disable."*

Enforcement — `BA/dist/api/index.mjs:159-163`, inside `createRouter(...)`'s
`onRequest`:

```js
async onRequest(req) {
  const disabledPaths = ctx.options.disabledPaths || [];
  const normalizedPath = normalizePathname(req.url, basePath);
  if (disabledPaths.includes(normalizedPath)) return new Response("Not Found", { status: 404 });
```

**Does `auth.api.signUpEmail(...)` still work? YES.**
`onRequest` belongs to the router returned by `router(...)`, which only
`auth.handler` constructs (`base.mjs:48`). `auth.api` is `getEndpoints(...).api`
(`base.mjs:11, 51`) and never enters the router. Listing `/sign-up/email` in
`disabledPaths` makes the public HTTP route return `404 Not Found` while leaving
`auth.api.signUpEmail(...)` fully functional. Of the four mechanisms this is the
only one whose block is structurally scoped to HTTP rather than scoped by a
convention the caller must remember to honour.

### 2.5 Summary table

| Mechanism | Where the check runs | Blocks public HTTP | Blocks `auth.api.signUpEmail` | Escape hatch |
| --- | --- | --- | --- | --- |
| `emailAndPassword.disableSignUp` | inside the endpoint handler — `sign-up.mjs:144` | yes (`400 EMAIL_PASSWORD_SIGN_UP_DISABLED`) | **yes** | none on this endpoint; use `auth.api.createUser` (admin plugin, `admin/routes.mjs:131,151,163`) or `internalAdapter.createUser` + `linkAccount` |
| `hooks.before` (`createAuthMiddleware`) | endpoint wrapper, before the handler — `to-auth-endpoints.mjs:34-35, 102-136` | yes | **yes, unless guarded** | guard on `ctx.request` being undefined (first-party idiom: `crud-invites.mjs:542`, `admin/routes.mjs:151`) |
| `databaseHooks.user.create.before → false` | DB write layer — `with-hooks.mjs:9-19` | yes | **yes** — and also blocks `internalAdapter.createUser` from *any* caller | guard on `context.path` / `context.request` (`init-options.d.mts:1062`, `endpoint-context.mjs:21-27`), or write via raw `ctx.context.adapter.create` |
| `disabledPaths: ["/sign-up/email"]` | router `onRequest`, HTTP only — `api/index.mjs:159-163` | yes (`404`) | **no** | not needed |

Also relevant but not a gate on credential sign-up: `emailAndPassword.enabled: false`
disables the endpoint through the same branch as `disableSignUp` (`sign-up.mjs:144`)
**and** disables credential sign-*in*. Social providers have their own separate
`disableSignUp` / `disableImplicitSignUp` (`BA/dist/api/routes/callback.mjs:156`,
`BA/dist/api/routes/sign-in.mjs:123`, `BA/dist/oauth2/link-account.mjs:74`) — out of
scope here since this repo configures no social providers
(`packages/auth/src/index.ts:11-33`).

---

## 3. Fit with this repo's domain

### 3.1 Repo state as read

- `CONTEXT.md` — ubiquitous language. Church = *"The root tenant representing a
  distinct congregation"*, with an explicit `_Avoid_: Organization, tenant,
  customer`. Ministry = department within a Church. Team = *"A specific group of
  volunteers within a Ministry"*. `ChurchAdmin` is *"A church-level role, above
  all Ministries… Distinct from the ministry-scoped `leader` role, though one
  person may hold both."*
- `packages/db/src/schema/core.ts` — `ministry` (`:20`), `volunteer` (`:43`),
  `team` (`:63`), `ministryVolunteer` (`:88`), `role` (`:107`),
  `ministryVolunteerRole` (`:131`), `ministryVolunteerTeam` (`:162`),
  `churchAdmin` (`:187`).
- `packages/db/src/schema/onboarding.ts` — `ministryInvitation` (`:5-21`), 21 lines total.
- `packages/auth/src/index.ts` — `betterAuth({...})` with `plugins: []` (`:33`) and
  one `databaseHooks.session.create.after` (`:34-45`).
- `packages/auth/src/hooks/soft-registration.ts` — 46 lines.
- `packages/db/src/schema/enums.ts` — `systemRoleEnum = ['leader','sub_leader','volunteer']`.
- `packages/db/src/schema/auth.ts` — better-auth's four base tables only:
  `user`, `session`, `account`, `verification`. **No `organization`, `member`,
  `invitation`, `team`, or `teamMember` table exists today**, and `session` has
  no `activeOrganizationId`.

Nesting depth, side by side:

```
this repo:      church → ministry → team → (ministryVolunteer + ministryVolunteerTeam)
better-auth:    organization → team → teamMember
```

The repo has **four** levels; better-auth's org plugin has **three**, and its
middle level (`team`) is a direct child of the org with no further nesting
(`organization.mjs:145-176` declares `organizationId` and no parent-team column).

### 3.2 Verdict: impedance mismatch

Not a partial match. The plugin's core proposition — *a role is a property of
(user, organization)* — is the exact proposition this repo's schema comment
explicitly rejects:

> **Contextual Leadership Model**: Leadership is NOT stored as a column on
> `team` or `ministry`. Instead, `system_role` on this join table is the
> sole mechanism for designating leadership within a ministry/team context.
> — `packages/db/src/schema/core.ts:80-83`

The collisions below are structural, not cosmetic.

### 3.3 Collision: flat org roles vs per-ministry-membership `systemRole`

better-auth stores exactly one role string per `(userId, organizationId)` pair —
`member.role`, `organization.mjs:308-314`, schema `roleSchema = z.string()` at
`schema.mjs:5`. This repo stores `systemRole` on `ministryVolunteer`, i.e. one
role per `(volunteerId, ministryId)` pair — `core.ts:100`.

If `organization` maps to `church`, the arity is wrong by exactly one dimension.
Concretely:

- **A person who is `leader` of Worship and `volunteer` in Kids cannot be
  expressed.** `member.role` has one value for the whole org. The plugin's
  multi-role support does not rescue this: multiple roles are comma-joined into
  the *same* string (`parseRoles`, `organization.mjs:20-22`), so `"leader,volunteer"`
  loses which ministry each applies to. `hasPermission` reads that flat string
  with no ministry parameter (`organization.mjs:71-81`).
- **`hasPermission` can never answer the question this app asks.** Its inputs are
  `(userId, organizationId, permissions)` — `organization.mjs:69-81`. Every
  authorization decision here is of the form "is this person a leader *of this
  ministry*". That predicate cannot be expressed in the plugin's permission
  model, so `/organization/has-permission`, `authClient.organization.checkRolePermission`,
  and the whole `access` statement system (`access/statement.mjs`) would sit
  unused while the real check is hand-written against `ministryVolunteer`.
- **The plugin's own endpoints would enforce the wrong thing.** `invitation: ["create"]`
  is checked against the flat `member.role` at `crud-invites.mjs:83-88`. Under an
  org=church mapping, granting a Worship leader the right to invite into Worship
  necessarily grants them the right to invite into Kids, because the permission
  is org-wide. `cancelInvitation` has the same shape (`:388-393`).
- **Encoding ministry into the role string** (e.g. `"leader:worship-uuid"`) would
  defeat the static role catalog: `createInvitation` validates every role against
  `defaultRoles ∪ opts.roles`, and rejects unknown roles unless
  `dynamicAccessControl.enabled` (`crud-invites.mjs:92-110`). With dynamic AC on,
  each ministry-role pair needs a row in `organizationRole` (`organization.mjs:208-246`),
  i.e. `ministries × roles` rows per church, kept in sync with the `ministry` table.
- **`ministryVolunteer` carries more than a role** — `status: membershipStatusEnum`
  and `joinedAt` (`core.ts:101-104`). `member` has only `role` and `createdAt`
  (`organization.mjs:285-321`). A `status` column would have to be added via
  `schema.member.additionalFields`, and nothing in the plugin reads it.
- **`ministryVolunteerRole` has no analogue at all.** Qualification ("which Roles
  can this member fill") is a second, orthogonal role axis — `role` /
  `ministryVolunteerRole` (`core.ts:107-154`) — distinct from `systemRole`. The
  plugin has exactly one role axis. `CONTEXT.md` reserves the word "Role" for
  the *scheduling* concept ("Vocalist", "Sound Tech"), which collides by name
  with `member.role` while being a different thing entirely.

The cost is therefore: `member.role` cannot carry the repo's role, the plugin's
permission engine cannot evaluate the repo's authorization predicate, and
`ministryVolunteer` must continue to exist as the real source of truth — leaving
`member` as a duplicated, permanently-out-of-band row per user per church.

### 3.4 Collision: does `teams` map onto `ministry` or `team`? Neither.

The plugin has one intermediate level; the repo has two (`ministry`, then `team`).

**Mapping `betterauth.team` → `ministry`:**
- Nesting fits (`ministry.churchId` → `team.organizationId`).
- But then the repo's `team` has nowhere to live — `betterauth.team` has no
  parent-team column (`organization.mjs:145-176`), so ministries cannot contain teams.
- And `teamMember` has **no role column** (`organization.mjs:177-206`), which is
  precisely where `systemRole` needs to live. This mapping puts the membership at
  the right grain and then provides no field to store the thing that makes the
  grain matter.
- `teamMember.userId` references `user.id`, not `member.id` (`organization.mjs:189-199`),
  whereas `ministryVolunteer.volunteerId` references `volunteer.id` (`core.ts:93-95`).
  Membership would key off a different entity than the rest of the schema, which
  hangs off `volunteer` (`ministryVolunteerRole.ministryVolunteerId`, `core.ts:138-140`;
  `ministryVolunteerTeam.ministryVolunteerId`, `core.ts:169-171`).
- `ministry` also carries `enforcementType`, `defaultDirection`, `deletedAt`
  (`core.ts:27-33`) — additional fields on a table the plugin owns and migrates.

**Mapping `betterauth.team` → `team`:**
- Then `ministry` has nowhere to live: `team.organizationId` would point at the
  church, dropping the ministry level entirely — and `ministry` is the unit that
  owns `MinistryParticipation`, `MinistryServingProfile`, `defaultDirection` and
  every leadership decision in `CONTEXT.md`.
- `ministryVolunteerTeam` is already a many-to-many with a `churchId` and a
  unique index on `(ministryVolunteerId, teamId)` (`core.ts:162-185`), and it
  hangs off the *membership*, not the user. `teamMember` hangs off the user
  (`organization.mjs:189-199`), so a person in two ministries that both use the
  same team would be indistinguishable.

Either way one of the repo's two levels is unmodelled, and `systemRole` has no
column in the plugin's schema regardless of which mapping is chosen.

### 3.5 Collision: `volunteer.userId` is `.unique()`

```ts
userId: text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
churchId: uuid('church_id').notNull().references(() => church.id, ...),
```
— `packages/db/src/schema/core.ts:45-51`

The unique constraint is on `userId` alone, not on `(userId, churchId)`. One
`user` row can therefore have **at most one `volunteer` row**, i.e. belong to at
most one church, database-enforced.

better-auth's model is the opposite by design:

- `member` declares no uniqueness at all (`organization.mjs:285-321`), and
  multi-org membership is the plugin's premise: `GET /organization/list` returns
  the caller's organizations (`crud-org.mjs`, `listOrganizations`),
  `session.activeOrganizationId` exists to disambiguate *which* org a request
  targets (`organization.mjs:400-405`), and `POST /organization/set-active` exists
  to switch between them (`crud-org.mjs:340-343`).
- `acceptInvitation` unconditionally creates a `member` row and then sets the
  session's active org (`crud-invites.mjs:290-296`) — it has no notion of "you
  already belong somewhere else".

Consequences as facts:

- The plugin's org-switching surface (`setActive`, `list`, `activeOrganizationId`,
  the `$activeOrgSignal` client atom at `client.mjs:18, 56`) is dead weight under
  a one-user-one-church constraint.
- If a `member` row is created for a second church while `volunteer.userId`
  remains unique, better-auth's tables and the domain tables disagree: the user
  is a member of two orgs per `member`, and a volunteer of one church per
  `volunteer`. Nothing in the plugin enforces or is aware of the constraint.
- Conversely, keeping the constraint means every `acceptInvitation` for a second
  church succeeds at the better-auth layer and then fails (or is silently
  ignored) at the domain layer, because `acceptInvitation` has no hook that can
  veto — `beforeAcceptInvitation` is fire-and-forget: its return value is
  discarded (`crud-invites.mjs:256-260`), unlike `beforeCreateInvitation` which
  merges a returned `{ data }` (`:187-201`).
- Whether the unique constraint is deliberate or vestigial is **not determinable
  from the schema alone** — there is no comment on it, and `CONTEXT.md` does not
  state whether a person may serve two churches. Flagged rather than assumed.

### 3.6 What `soft-registration.ts` does, and what happens to it

`packages/auth/src/hooks/soft-registration.ts` (46 lines), fired from
`packages/auth/src/index.ts:34-45` as `databaseHooks.session.create.after`:

1. Looks up `church` by the hardcoded slug `'system-church'` (`:6`, `:9-11`).
2. If absent, `console.warn` and returns — no error surfaces (`:13-18`).
3. Checks for an existing `volunteer` on `(userId, church.id)` (`:21-26`); returns if found (`:28-30`).
4. Otherwise inserts `volunteer { userId, churchId: systemChurch.id, status: 'active' }`,
   wrapped in try/catch that only logs (`:33-45`).

Behavioural facts worth recording:

- It is keyed on **session creation**, not user creation. It therefore runs on
  every sign-in, not just once — idempotent only because of the step-3 lookup.
- It is an `after` hook, so it is queued to run **after the transaction commits**
  (`with-hooks.mjs:29-31` — `queueAfterTransactionHook`). A failure cannot roll
  back the session.
- Every failure path is swallowed (`:14-17`, `:40-45`). A user can end up with a
  session and no `volunteer` row, silently.
- It hard-codes one global `'system-church'` — every user who signs up lands in
  the same church. This is the "soft registration" behaviour: the public sign-up
  path auto-provisions a volunteer in a placeholder church.
- It creates a `volunteer` only. It creates **no** `ministryVolunteer`, so a
  soft-registered user has no ministry, no team, and no `systemRole`.

Under an org-plugin model, the following are facts about what changes:

- **The auto-provisioning premise is the thing an invite flow removes.** The hook
  exists because sign-up is open and every new user must land somewhere; an
  invitation determines the church, so the `'system-church'` fallback and the
  hook's reason to exist go away together. If the hook stayed as-is, every
  invited user would *also* get a `volunteer` row in `system-church` on first
  sign-in — and because `volunteer.userId` is unique (`core.ts:45-47`), that row
  would then **block** the correct `volunteer` row for their real church. The
  insert at `soft-registration.ts:35-39` would win or lose purely on ordering.
- **`acceptInvitation` does not create anything domain-side.** It creates a
  `member` row (`crud-invites.mjs:290-295`) and, when `teams.enabled` and
  `invitation.teamId` is set, `teamMember` rows (`:266-289`). It does not and
  cannot create `volunteer` / `ministryVolunteer` — those tables are unknown to
  it. The only extension point at that moment is `afterAcceptInvitation`
  (`:297-302`), which is fire-and-forget and runs after the member row is
  already written.
- **The hook's trigger point is wrong for an invite flow.** `session.create.after`
  fires on every sign-in; invite redemption is a one-shot event. The plugin's
  own equivalents (`afterAcceptInvitation`) fire once, but only for invites
  redeemed through `/organization/accept-invitation`.

### 3.7 `ministryInvitation` vs better-auth `invitation`, column by column

`packages/db/src/schema/onboarding.ts:5-21` vs `organization.mjs:323-384`.

| repo `ministry_invitation` | better-auth `invitation` | Verdict |
| --- | --- | --- |
| `id` uuid PK | `id` string PK | equivalent (uuid vs better-auth's generated string id) |
| `churchId` uuid → `church.id` cascade (`:7-9`) | `organizationId` string → `organization.id` (`:326-335`) | same role **only if** organization=church |
| `ministryId` uuid → `ministry.id` cascade, **NOT NULL** (`:10-12`) | — | **no counterpart.** better-auth's invite is org-scoped; there is no required sub-scope. Would need `schema.invitation.additionalFields` (`organization.mjs:382`) |
| `teamId` uuid → `team.id`, nullable (`:13`) | `teamId` string, nullable, **only when `teams.enabled`** (`:349-354`) | shape looks similar, **semantics differ**: better-auth stores a *comma-joined list* of team ids in one column with no FK (`adapter.mjs:556`; re-split at `crud-invites.mjs:267`). The repo's is a real single FK with cascade |
| `token` varchar(255) **NOT NULL UNIQUE** (`:14`) | — | **no counterpart.** better-auth has no token column; redemption is keyed on the invitation `id` plus a server-side check that the session user's email equals `invitation.email` (`crud-invites.mjs:249`, `:338`, `:457`) |
| — | `email` string, required, sortable, indexed (`:336-342`) | **no counterpart in the repo.** better-auth invitations are *addressed to a specific email address*; the repo's are bearer tokens with no recipient |
| `type` varchar(50) NOT NULL — `one-time` / `multi-use` (`:15`) | — | **no counterpart.** better-auth invitations are strictly one-time: accept flips `status` to `accepted` (`crud-invites.mjs:261-264`) and any later accept fails the `status !== "pending"` guard (`:248`). A multi-use invite has no representation |
| `status` varchar(50) default `'active'` — `active` / `used` / `expired` (`:16`) | `status` string default `'pending'` — `pending` / `accepted` / `rejected` / `canceled` (`schema.mjs:6-11`, `organization.mjs:355-361`) | **different vocabularies and different cardinality.** No repo value for `rejected` or `canceled`; no better-auth value for `expired` (better-auth computes expiry from `expiresAt` at read time — `:248`, `:456`) |
| `expiresAt` timestamptz NOT NULL (`:17-20`) | `expiresAt` date, required (`:362-366`) | equivalent |
| — | `role` string, **optional** (`:343-348`) | **no counterpart.** The repo's invite carries no role; `systemRole` is set on `ministryVolunteer` at join time (`core.ts:100`) |
| — | `inviterId` string → `user.id`, required (`:373-381`) | **no counterpart.** The repo's invite records no author |
| — | `createdAt` date, required (`:367-372`) | **no counterpart** |

Net: the two tables overlap on `expiresAt` and roughly on `status`, and diverge
on the two fields that define each design — the repo's `token` + `type`
(anonymous, possibly-reusable bearer link scoped to a ministry) versus
better-auth's `email` + `role` + `inviterId` (named, single-use invitation of one
person into one org at one org-wide role). They are two different invitation
concepts that happen to share a name.

`ministryInvitation` has **zero application code** referencing it. Grep across
`apps/` and `packages/` at the time of writing returns exactly four hits, all
non-application:

- `packages/db/src/schema/onboarding.ts:5` — the declaration itself
- `packages/db/tests/schema/core.test.ts:6, 91, 94` — one schema test that
  inserts two rows sharing `token: 'common-token'` and asserts the unique
  constraint on `token` rejects the second (`core.test.ts:75-99`)

So the only thing exercising the table is a constraint test on `token` — the one
column better-auth's `invitation` does not have.

---

## Questions not answerable from primary sources

1. **Whether `volunteer.userId`'s `.unique()` is intentional.** No comment in
   `core.ts:45-47`, and `CONTEXT.md` does not say whether one person may serve
   two churches. Recorded as an observed constraint, not as an intent.
2. **Whether `ministryInvitation.type = 'multi-use'` is a committed requirement.**
   The column exists with an inline comment (`onboarding.ts:15`) but has no code,
   no spec reference found, and no test. Its status as a real requirement is
   undetermined.
3. **A better-auth docs page stating "`ctx.request` is undefined for `auth.api`
   calls" verbatim.** Not found. The claim in §2.2 rests on the context spread at
   `to-auth-endpoints.mjs:22-32` plus two first-party call sites that rely on the
   behaviour (`crud-invites.mjs:542`, `admin/routes.mjs:151`) — strong but
   inferential-by-construction rather than a documented guarantee.
4. **Version-pinned docs.** Context7 serves better-auth docs from `main`, not a
   1.5.5 tag. Every doc-sourced claim above was verified against the installed
   1.5.5 `dist/`; nothing rests on docs alone.
