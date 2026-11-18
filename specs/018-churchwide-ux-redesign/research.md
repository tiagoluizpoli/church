# Phase 0 Research: Church-wide UX/IA Redesign

All Technical Context items in `plan.md` were resolvable from the existing codebase and the prior grilling session (`.plan/grilling/2026-07-06-bl014-churchwide-ux-redesign.md`) — no `NEEDS CLARIFICATION` markers remain. This file records the non-obvious decisions found during that research.

## R1: How does the client know which nav items a caller may see?

**Decision**: Resolve caller-visible nav surfaces the same way `use-planning-admin.ts` already resolves planning access — reactively, from whether a role-gated query succeeds or returns 403 (`isForbiddenError`) — rather than adding a new "my roles" endpoint.

**Rationale**: There is no existing client-side source of "which roles does this user hold" today. `apps/web/src/lib/auth-client.ts`'s `authClient.useSession()` exposes basic identity only; `systemRole` (`leader | sub_leader | volunteer | admin`) is a per-Ministry-membership attribute server-side, not a session claim. The codebase already has a working precedent for this exact problem: `use-planning-admin.ts`'s `isAccessDenied` is derived from `isForbiddenError({ error: cyclesQuery.error })` on an admin-scoped query, not from a pre-fetched role. Reusing that pattern for nav-gating (e.g., a lightweight, already-role-gated query such as `adminApi.listMinistries()`) avoids introducing a new backend surface for a UI-only feature (keeps Constitution II's "no new API without need" implicit default, and Constitution VI's principle of reusing what's already specified).

**Alternatives considered**:
- Add a new `/me/roles` (or similar) endpoint returning the caller's aggregate roles across all Ministry memberships. Rejected for this feature: it's real backend work (new route, new Zod schema, new orval regeneration) for a presentation-only concern, and the reactive pattern already exists and is proven in production planning-admin code.
- Encode role in the better-auth session/JWT claim. Rejected: roles are Ministry-scoped (a user can be a Leader in one Ministry and a plain Volunteer in another), so a single flat session claim can't represent it correctly without further modeling work outside this feature's scope.

**Implementation shape**: `apps/web/src/shared/hooks/use-caller-roles.ts` (new) wraps the existing reactive-403 pattern behind a single named-object-parameter hook (Constitution VII), returning a `CallerNavVisibility` shape (`{ canSeeScheduling: boolean }`) that `app-shell.tsx` consumes to pick between the Volunteer and Leader/Sub-leader/Admin nav sets. A brief "assume hidden until proven visible" loading state avoids nav flicker before the gating query resolves.

## R2: Tabs primitive for the volunteer dashboard

**Decision**: Add shadcn/ui's standard `Tabs` component to `packages/ui/src/components/` before building the dashboard restructuring.

**Rationale**: `packages/ui/src/components/` currently has `badge.tsx`, `dropdown-menu.tsx`, `popover.tsx`, etc., but no `tabs.tsx`. Per the repo's mandatory shadcn/ui rule (`specifications-list.md` §"Mandatory Frontend Rule"), this is not a custom invention — `Tabs` is a standard shadcn component and must be added via the normal shadcn CLI flow, not built by hand.

**Alternatives considered**: A hand-rolled section switcher (buttons + conditional render). Rejected — directly violates the repo's "always start with an existing shadcn component" rule when a standard one already covers this exact need.

## R3: Notification history pagination — corrected during `/speckit-analyze` (2026-07-06)

**Original decision (superseded)**: This section originally claimed pagination could be completed purely client-side, with "no orval regeneration required." That claim was **wrong** and was caught by cross-referencing `plan.md`/`tasks.md` against the actual server code during analysis — recorded here rather than silently fixed, so the correction is auditable.

**What's actually true, verified against code**:
- The **domain/application layer already fully supports cursor pagination**: `GetNotificationsInput` (`apps/server/src/domain/contracts/application/volunteer-manager.ts:212-216`) already has `cursor?: Date` and `limit`; `NotificationListResult` already has `nextCursor?: Date`; `db-volunteer-manager.ts:933-947`'s `getNotifications` already threads `cursor`/`limit` through to `notificationRepo.listByVolunteer`; `notification.dto.ts`'s `notificationListResponseSchema` already includes `nextCursor: z.string().optional()`. **Nothing needs to change below the HTTP route.**
- The **Fastify route is the actual gap**: `volunteer-controller.ts`'s `/notifications` GET handler (line ~278-294) never reads `request.query` (verified: zero query access anywhere in the controller file) and calls `this.volunteerManager.getNotifications({ volunteerId, churchId })` — no `cursor`, no `limit`. The already-correct response schema is being computed and returned correctly today, just always for page 1.
- The **generated client is stale**: `apps/web/src/infrastructure/api/volunteer.ts`'s `getNotifications()` takes zero parameters, and `churchAPI.schemas.ts`'s `GetNotifications200` type has only `items` — no `nextCursor` — because the client was generated before (or without) the route exposing the param. This is why `use-notification-inbox.ts`'s `nextCursor`/`hasMore` client state reads as "already scaffolded" — it's dead scaffolding with no real data source, not a 90%-complete implementation.

**Corrected decision**: Close the gap at the actual layer it exists — the HTTP route — not by inventing new client-side pagination logic:
1. Add a querystring Zod schema (`cursor`, `limit`) to the `/notifications` route and pass both through to the existing, already-capable `volunteerManager.getNotifications` call.
2. Regenerate the orval client so `getNotifications({ cursor?, limit? })` and `GetNotifications200.nextCursor` exist client-side.
3. *Then* `use-notification-inbox.ts`'s `loadMore` stub and the cursor-overwrite bug become straightforward to fix, because real data will finally back that state.

This remains a **small, additive change to an existing endpoint** — no new endpoint, no new manager/repo method, no new domain concept — so Constitution II ("Full-Stack Type Safety... Fastify + orval + OpenAPI") stays satisfied end-to-end; it is not, however, a purely client-side fix as originally stated.

**Alternatives considered**: Build a separate, purpose-built history-fetching hook/endpoint for `/notifications` only. Rejected — duplicates domain-layer pagination logic that already exists in `db-volunteer-manager.ts`; wiring the existing route serves both the bell dropdown and the full-history page from one contract.

## R4: Deriving the planning-cycle "current step" from existing state

**Decision**: Derive the active step directly from data already computed in `use-planning-admin.ts` (`cycles`, `selectedCycleId`, `selectedCycle`, template/apply state) — no new state machine or status field.

**Rationale**: The cycle's lifecycle (draft → template applied → events generated → locked) is already observable from existing query results (`cycles.length === 0` ⇒ step 1; `selectedCycleId` set but no templates applied ⇒ step 2; templates applied ⇒ step 3; `selectedCycle.status === 'locked'` ⇒ read-only review). `planning-admin-context.tsx`'s existing selector-hook pattern (`useCreateCycleCard`, `useCycleReviewCard`, etc.) is preserved; only `planning-admin.tsx`'s top-level render swaps the always-visible 2×2 grid for a conditional render keyed off this derived step.

**Alternatives considered**: Add a persisted `currentStep` field to `PlanningCycle`. Rejected — the step is a pure function of existing data (Constitution I: domain-first; no reason to add derived state to the domain model for a presentation concern).

## R5: Visual/theme follow-up is `/impeccable polish`, specifically

**Decision**: The visual-design follow-up referenced in `spec.md`'s Assumptions is the `polish` sub-command of the already-installed `impeccable` skill (`.claude/skills/impeccable/`), not a generic "pick a tool later" placeholder.

**Rationale**: Per `impeccable`'s own command table, `polish [target]` is described as a "final quality pass before shipping" that explicitly reads the latest `critique` snapshot as its backlog when one exists. `.impeccable/critique/2026-07-06T06-12-06Z__web-src-routes-scheduling-src-features-scheduling.md` already exists for the scheduling feature and contains two P1 items this spec resolves directly (duplicate create-event UI, Leader/Sub-leader name collision) plus two P2 items this spec does **not** touch (raw UTC "Z" timestamps in the planning admin's Calendar Review panel; raw event UUID in the builder breadcrumb). Those two P2s remain open and are natural `/impeccable polish` candidates once this IA redesign lands, alongside the broader theme/token pass (radius, color, typography) called out in `spec.md`'s Assumptions.

**Sequencing** (confirmed during grilling, Q-tool-timing): run `/impeccable polish` after this feature's screens are implemented and stable, not before or in parallel — polishing screens mid-restructure means re-running the pass once they change anyway.

## R6: Scheduling nav restructure (Phase 8 amendment, 2026-07-07) — corrected after checking actual route files

**Original claim (superseded)**: The 2026-07-07 grilling session (`.plan/grilling/2026-07-07-planning-cycle-lock-unlock-and-nav.md`) stated "no file-based nested routes per tab were found... consistent with the user's complaint that the URL never changes." That claim was **wrong** — caught during `/speckit-plan` by actually reading `apps/web/src/routes/scheduling/`, not just re-deriving from screenshots. Recorded here rather than silently fixed, same as R3's correction.

**What's actually true, verified against code**:
- `apps/web/src/routes/scheduling.tsx` is a layout route (`beforeLoad` checks session only, no role check) with an `<Outlet/>`.
- `/scheduling/planning`, `/scheduling/tailoring`, and `/scheduling` (index) **already are three distinct, real TanStack Router file routes**, wired together by `scheduling-nav.tsx`'s `<Link>`-based tab bar (`NAV_ITEMS` array) — clicking between the top-level Planning/Tailoring/"Builder events" tabs **already changes the URL** today. The "Builder events" tab label is misleading, though: it points at the bare `/scheduling` index route, not a `/scheduling/builder-events` path.
- The part of the complaint that **is** accurate: inside `/scheduling/planning`, the "Back to cycles" / "Template library" / "Create cycle" button row (`planning-admin.tsx` lines ~175-247) toggles `activeView` (`'cycles' | 'review' | 'templates'`) and `selectedCycleId`/`templateReturnView` — all plain `useState`, never reflected in the URL. This is the actual, narrower gap: one route's internal view-state isn't URL-addressable, not "everything is one flat route."

**Corrected decision**: Phase 8 is a smaller change than originally scoped — role-guard the 3 existing routes, rename `/scheduling/planning` → `/scheduling/planning-cycles` (per the user's explicit slug preference) and give "Builder events" its own `/scheduling/builder-events` route (today's bare `/scheduling` index becomes this, or redirects to it), and promote `planning.tsx`'s internal `activeView`/`selectedCycleId` state to URL segments (`/scheduling/planning-cycles/new`, `/scheduling/planning-cycles/:cycleId`) — not "build nested routing from scratch."

**Alternatives considered**: Leave the top-level 3 routes as-is (they already work) and only fix the internal Planning state. Rejected — the missing route-level role guard is still a real gap: checked `use-planning-admin.ts` and confirmed access denial today happens the same reactive way R1 already established for nav visibility (`isAccessDenied` derived from `isForbiddenError` on the cycles/templates queries after they round-trip and fail) — the server does enforce it, but only a Ministry-membership-scoped `systemRole` check inside those specific endpoints, not a route-level guard. A plain Volunteer hitting `/scheduling/planning-cycles` by URL today would briefly load the route shell before the queries resolve and flip to an access-denied state, instead of being redirected before render — worth closing at the route level (`beforeLoad`) for a cleaner experience, consistent with treating Planning-cycles as admin-only by design, not just by accident of which endpoints happen to gate. The `planning-cycles` rename remains an explicit, deliberate user preference regardless, not optional polish.
