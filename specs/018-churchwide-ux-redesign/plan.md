# Implementation Plan: Church-wide UX/IA Redesign

**Branch**: `018-churchwide-ux-redesign` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-churchwide-ux-redesign/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Reorganize the existing frontend's navigation, notifications, volunteer dashboard, and scheduling/planning flow around a single deliberate information architecture, without introducing new domain entities or backend contracts. Navigation becomes role-scoped (Volunteer vs. Leader/Sub-leader/Admin) and drops dead links; notifications consolidate into one top-bar bell (replacing the dashboard-embedded inbox); the volunteer dashboard becomes a tabbed single page instead of a vertical stack; the planning-cycle screen becomes a state-driven step sequence instead of an always-visible 4-card grid; the duplicate create-event surface on `/` is removed in favor of the one under `/scheduling/`; and the schedule builder gains a role badge to disambiguate Leader/Sub-leader identity. Visual/theme redesign has been completed as a follow-up pass using the Impeccable tool (integrated in `apps/web/DESIGN.md` and `apps/web/src/index.css`).

Per Constitution Principle VI (Maximum Context Specification), this plan traversed `manual-planning/0001-volunteer-scheduling/specifications-list.md` and its linked docs — `F0-global-ui-framework.md`, `F2-volunteer-dashboard.md`, `F5-routing-state.md`, `CONTEXT.md`, ADR 0001/0002 — before proceeding. Two findings from that traversal materially shape this plan and are recorded in `research.md`: (1) `F0`'s bottom-nav pillars (`Dashboard, Shifts, Alerts, Profile`) and 4px sharp-radius token are the literal source of today's dead links and stale visual theme — this plan supersedes those two specific F0 decisions, nothing else in F0. (2) `F2`'s dashboard section order embeds Notifications Inbox as dashboard section #3 — this plan supersedes that placement only (moving it to the top-bar bell), while keeping F2's ordering intent for the remaining three sections.

## Technical Context

**Language/Version**: TypeScript (repo-wide strict mode), React 19

**Primary Dependencies**: TanStack Router (file-based routing), TanStack Query (server-state/cache), shadcn/ui (Radix-based primitives, Tailwind v4), framer-motion (layout/transition physics), orval-generated typed API clients (`adminApi`, `volunteerApi`) over Fastify + OpenAPI

**Storage**: N/A for this feature — no schema or persistence changes; all data continues to flow through existing `apps/server` endpoints

**Testing**: Vitest (component/unit), Playwright (`test:e2e`) for full user-journey flows; existing `VOLUNTEER_STORAGE_STATE`-based auth fixtures reused for role-scoped nav tests

**Target Platform**: Responsive web (desktop + mobile web/PWA), served from `apps/web`

**Project Type**: Web application — frontend-only feature within an existing full-stack monorepo; no new backend surface required except completing one already-stubbed piece of existing pagination (see `research.md` R3)

**Performance Goals**: No explicit new performance target; must not regress the existing dashboard/planning screens' load characteristics (no new N+1 queries; nav role-gating must not block first paint)

**Constraints**: Must not introduce a new role/permission model (reuse existing `leader | sub_leader | volunteer | admin` `systemRole` union); must follow the repo's mandatory strict shadcn/ui component adherence (no bespoke UI primitives); must not silently drop any DL2/DL3/DL4 scenario from `specs/017-scheduling-reshape/test-plan.md` (FR-014/SC-006)

**Scale/Scope**: 4 user stories touching ~13 files across `apps/web/src/{components,routes,features}` (see Project Structure below) plus one small, additive change to one existing `apps/server` endpoint's query params/response (notification pagination, see Constitution Check II); no new services, no new database tables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Domain-First Architecture** — PASS. No domain change; this is presentation-layer reorganization over the already-specified scheduling domain (`CONTEXT.md`, Spec 017). Reuses existing `specifications-list.md` docs (F0, F2, F5) rather than defining new ones from scratch, per the Maximum Context traversal above.
- **II. Full-Stack Type Safety** — PASS, with one scoped, additive change (corrected during `/speckit-analyze`, 2026-07-06): the domain/manager layer already fully supports cursor pagination (`GetNotificationsInput.cursor/limit`, `NotificationListResult.nextCursor`, and `notificationListResponseSchema` all already exist server-side) — but the Fastify route (`volunteer-controller.ts`'s `/notifications` GET) never reads a querystring and never passes `cursor`/`limit` through, and the orval-generated client (`getNotifications()`, `GetNotifications200`) is stale relative to that response schema (no params, no `nextCursor` field). Closing FR-007 requires: (1) a querystring schema + passthrough on the existing route (no new endpoint, no new manager/repo method — those already exist), (2) an orval regeneration. This is a small, additive surface change on an existing endpoint, still fully typed end-to-end (Zod → orval → typed client) — not a new endpoint, not a new domain concept. See `research.md` R3 (corrected) and `tasks.md` T017-T018.
- **III. Container-Ready Infrastructure** — N/A. No infrastructure change.
- **IV. Environment Discipline** — N/A. No new environment variables.
- **V. Automated Code Standards** — PASS (gate re-checked at implementation time via Biome + Lefthook, as for any change).
- **VI. Maximum Context Specification** — PASS. Traversed `specifications-list.md` → F0, F2, F5, CONTEXT.md, ADR 0001/0002 before this plan was written; supersession points documented above and in `research.md`.
- **VII. Explicit Parameter Contracts** — APPLIES. Every new hook/component this feature introduces (role-nav resolver, dashboard tab controller, planning step-sequence state, notification-bell view-model) MUST take a single named object parameter with a separately declared `interface`/`type`, following the existing `planning-admin-context.tsx` selector-hook pattern (e.g. `CreateCycleCardModel`, `useCreateCycleCard()`). No inline object types in new or modified code.

No violations requiring the Complexity Tracking table — this plan reuses existing architectural patterns throughout.

## Project Structure

### Documentation (this feature)

```text
specs/018-churchwide-ux-redesign/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory: this feature adds no new *endpoint*. It restructures presentation over existing, already-contracted `adminApi`/`volunteerApi` endpoints, with one small additive exception — the existing `/notifications` GET endpoint gains `cursor`/`limit` query params and its already-defined `nextCursor` response field gets exposed through the route and regenerated client (Constitution Check II; `research.md` R3; `tasks.md` T017-T018). Not large enough to warrant a `contracts/` directory of its own, but real enough to require an orval regeneration step.

### Source Code (repository root)

```text
apps/web/src/
├── components/
│   ├── app-shell.tsx                     # MODIFY: role-scoped nav item sets, bell slot (desktop topbar + mobile top header)
│   └── notification-bell/                # NEW: bell trigger, dropdown list, unread badge (top-bar, shared across roles)
├── routes/
│   ├── index.tsx                          # MODIFY: remove ASCII banner + <EventList />; becomes a real landing surface
│   ├── notifications.tsx                  # NEW: full notification history route ("View all" target)
│   ├── dashboard.tsx                      # unchanged route; renders restructured VolunteerDashboard
│   └── scheduling/
│       ├── index.tsx                      # MODIFY: hardened as the sole EventList + create-event entry point (no other page renders EventList after US1 removes it from `/`)
│       └── planning.tsx                   # unchanged route; renders restructured PlanningAdmin
├── features/
│   ├── volunteers/
│   │   ├── components/
│   │   │   ├── volunteer-dashboard.tsx    # MODIFY: tabs (Upcoming Assignments default, Availability Needed badge, Ministry Schedule) replacing the flat stack; Notifications section removed
│   │   │   └── notifications-inbox-section.tsx  # REPURPOSE: becomes the shared list renderer used by both the bell dropdown and the new /notifications page
│   │   └── hooks/
│   │       └── use-notification-inbox.ts # MODIFY: complete the stubbed cursor pagination (research.md R3) so /notifications can page through full history
│   └── scheduling/
│       └── components/
│           ├── planning-admin.tsx         # MODIFY: 4 cards → state-driven step sequence (create → template/review → locked review); CycleListCard becomes secondary history panel
│           ├── event-list.tsx             # MODIFY: becomes the one canonical create-event entry point (QuickCreateEventModal retained here only)
│           └── builder/                   # MODIFY: volunteer/assignee list rows gain a role badge (Leader/Sub-leader) alongside the existing name rendering
└── shared/
    └── hooks/
        └── use-caller-roles.ts            # NEW: resolves which nav/feature surfaces the current caller may see (research.md R1)

apps/server/src/
├── api/
│   ├── controllers/volunteer-controller.ts       # MODIFY: `/notifications` GET route gains a cursor/limit querystring schema, passes both through to the already-capable manager call (Constitution II)
│   └── dtos/notification.dto.ts                  # unchanged — `notificationListResponseSchema` already includes `nextCursor`; nothing to add here
# No changes below the controller: `db-volunteer-manager.ts`'s `getNotifications` and the notification repository already accept/return cursor/limit/nextCursor.

apps/web/tests/ (or co-located *.test.tsx per existing convention)
├── unit/                                   # Vitest: nav role-gating, tab default/badge logic, step-sequence state transitions
└── e2e/                                     # Playwright: role-scoped nav visibility, bell → deep-link, dashboard tab switch, planning step progression, DL2/DL3/DL4 regression pass (FR-014)
```

**Structure Decision**: Single existing web application (`apps/web`), no new services or packages. Nearly all changes are additive/restructuring within `apps/web/src/{components,routes,features}`; the one exception is a small, additive querystring change to `apps/server`'s existing `/notifications` route (Constitution II) — no new service, no new manager/repo method, no new database access, since the domain layer already supports cursor pagination end-to-end.

## Complexity Tracking

*No entries — Constitution Check reported no violations requiring justification.*

## Constitution Check (Post-Design Re-check)

Re-evaluated after Phase 1 (`research.md`, `data-model.md`, `quickstart.md`):

- **II. Full-Stack Type Safety** — Corrected during `/speckit-analyze` (2026-07-06): `research.md` R3 originally claimed no orval regeneration was required; verified against the actual route/schema/generated-client code, this was wrong — the route never reads a querystring and the generated client is stale relative to the server's own (already-defined) response schema. Still PASS, but via a small additive query-param change + orval regen (`tasks.md` T017-T018), not "nothing to do."
- **VII. Explicit Parameter Contracts** — Confirmed still PASS: every new shape in `data-model.md` (`CallerNavVisibility`, `PlanningStep`, `NotificationBellViewModel`, `DashboardTabId`, `AssigneeIdentityBadge`) is specified as a named type, none inline.
- No new violations surfaced during design. Gate remains PASS.
