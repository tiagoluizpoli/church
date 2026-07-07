# Implementation Plan: Church-wide UX/IA Redesign

**Branch**: `018-churchwide-ux-redesign` | **Date**: 2026-07-07 (amended; originally 2026-07-06) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-churchwide-ux-redesign/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Reorganize the existing frontend's navigation, notifications, volunteer dashboard, and scheduling/planning flow around a single deliberate information architecture, without introducing new domain entities or backend contracts. Navigation becomes role-scoped (Volunteer vs. Leader/Sub-leader/Admin) and drops dead links; notifications consolidate into one top-bar bell (replacing the dashboard-embedded inbox); the volunteer dashboard becomes a tabbed single page instead of a vertical stack; the planning-cycle screen becomes a state-driven step sequence instead of an always-visible 4-card grid; the duplicate create-event surface on `/` is removed in favor of the one under `/scheduling/`; and the schedule builder gains a role badge to disambiguate Leader/Sub-leader identity. Visual/theme redesign has been completed as a follow-up pass using the Impeccable tool (integrated in `apps/web/DESIGN.md` and `apps/web/src/index.css`).

**2026-07-07 amendment**: A second grilling session surfaced two further planning-cycle-screen fixes that fit this feature's frontend-only boundary — route-level role guards + a `planning-cycles`/`builder-events` rename for the already-existing `/scheduling/planning`, `/scheduling/tailoring`, `/scheduling` routes, promoting that screen's internal view-state to URL segments, and deduplicating/splitting the "locked" status chip. A third fix from that same session (day/event-level forced-override editing with a leader-ack gate) needs a new domain entity and is deliberately excluded from this spec — see `spec.md`'s 2026-07-07 Amendment note and backlog entry BL-016.

Per Constitution Principle VI (Maximum Context Specification), this plan traversed `manual-planning/0001-volunteer-scheduling/specifications-list.md` and its linked docs — `F0-global-ui-framework.md`, `F2-volunteer-dashboard.md`, `F5-routing-state.md`, `CONTEXT.md`, ADR 0001/0002 — before proceeding. Two findings from that traversal materially shape this plan and are recorded in `research.md`: (1) `F0`'s bottom-nav pillars (`Dashboard, Shifts, Alerts, Profile`) and 4px sharp-radius token are the literal source of today's dead links and stale visual theme — this plan supersedes those two specific F0 decisions, nothing else in F0. (2) `F2`'s dashboard section order embeds Notifications Inbox as dashboard section #3 — this plan supersedes that placement only (moving it to the top-bar bell), while keeping F2's ordering intent for the remaining three sections.

## Technical Context

**Language/Version**: TypeScript (repo-wide strict mode), React 19

**Primary Dependencies**: TanStack Router (file-based routing), TanStack Query (server-state/cache), shadcn/ui (Radix-based primitives, Tailwind v4), framer-motion (layout/transition physics), orval-generated typed API clients (`adminApi`, `volunteerApi`) over Fastify + OpenAPI

**Storage**: N/A for this feature — no schema or persistence changes; all data continues to flow through existing `apps/server` endpoints

**Testing**: Vitest (component/unit), Playwright (`test:e2e`) for full user-journey flows; existing `VOLUNTEER_STORAGE_STATE`/`LEADER_STORAGE_STATE`-based auth fixtures reused for role-scoped nav tests

**Target Platform**: Responsive web (desktop + mobile web/PWA), served from `apps/web`

**Project Type**: Web application — frontend-only feature within an existing full-stack monorepo; no new backend surface required except completing one already-stubbed piece of existing pagination (see `research.md` R3)

**Performance Goals**: No explicit new performance target; must not regress the existing dashboard/planning screens' load characteristics (no new N+1 queries; nav role-gating must not block first paint)

**Constraints**: Must not introduce a new role/permission model (reuse existing `leader | sub_leader | volunteer | admin` `systemRole` union); must follow the repo's mandatory strict shadcn/ui component adherence (no bespoke UI primitives); must not silently drop any DL2/DL3/DL4 scenario from `specs/017-scheduling-reshape/test-plan.md` (FR-014/SC-006); Phase 8's route-level role guards must reuse the existing reactive 403 precedent's underlying role model, not invent a new client-side permission check

**Scale/Scope**: 4 user stories (Phases 3-6) touching ~13 files across `apps/web/src/{components,routes,features}`, plus one small additive backend change (notification pagination, `research.md` R3) — plus Phase 8 (the 2026-07-07 amendment): 3 existing routes renamed/split/role-guarded, ~1 new route file, `planning-cycles`' internal view-state promoted to URL segments, and one header component's chip cluster split. No new services, no new database tables in either the original scope or the amendment.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Domain-First Architecture** — PASS. No domain change; this is presentation-layer reorganization over the already-specified scheduling domain (`CONTEXT.md`, Spec 017). Reuses existing `specifications-list.md` docs (F0, F2, F5) rather than defining new ones from scratch, per the Maximum Context traversal above. The amendment's route restructuring and chip-dedup are equally presentation-only — no domain model change.
- **II. Full-Stack Type Safety** — PASS, with one scoped, additive change (corrected during `/speckit-analyze`, 2026-07-06): the domain/manager layer already fully supports cursor pagination (`GetNotificationsInput.cursor/limit`, `NotificationListResult.nextCursor`, and `notificationListResponseSchema` all already exist server-side) — but the Fastify route (`volunteer-controller.ts`'s `/notifications` GET) never reads a querystring and never passes `cursor`/`limit` through, and the orval-generated client (`getNotifications()`, `GetNotifications200`) is stale relative to that response schema (no params, no `nextCursor` field). Closing FR-007 requires: (1) a querystring schema + passthrough on the existing route (no new endpoint, no new manager/repo method — those already exist), (2) an orval regeneration. This is a small, additive surface change on an existing endpoint, still fully typed end-to-end (Zod → orval → typed client) — not a new endpoint, not a new domain concept. See `research.md` R3 (corrected) and `tasks.md` T017-T018. The amendment's Phase 8 introduces zero backend surface — role guards are a client-side route-level check reusing the existing server-enforced `systemRole` model (`research.md` R1/R6); no new endpoint, no new schema.
- **III. Container-Ready Infrastructure** — N/A. No infrastructure change.
- **IV. Environment Discipline** — N/A. No new environment variables.
- **V. Automated Code Standards** — PASS (gate re-checked at implementation time via Biome + Lefthook, as for any change).
- **VI. Maximum Context Specification** — PASS. Traversed `specifications-list.md` → F0, F2, F5, CONTEXT.md, ADR 0001/0002 before this plan was written; supersession points documented above and in `research.md`. The 2026-07-07 amendment traversed the same tree again plus `specs/017-scheduling-reshape/spec.md` and this spec's own already-shipped Phase 6 (US4) work before scoping Phase 8 (see `research.md` R6's correction, caught precisely by this re-traversal).
- **VII. Explicit Parameter Contracts** — APPLIES. Every new hook/component this feature introduces (role-nav resolver, dashboard tab controller, planning step-sequence state, notification-bell view-model, and — from the amendment — the route-level role-guard check and the split header-chip view-model) MUST take a single named object parameter with a separately declared `interface`/`type`, following the existing `planning-admin-context.tsx` selector-hook pattern (e.g. `CreateCycleCardModel`, `useCreateCycleCard()`). No inline object types in new or modified code.

No violations requiring the Complexity Tracking table — this plan reuses existing architectural patterns throughout, including the amendment's route restructuring (TanStack Router file-based routes, same pattern as every other route in `apps/web/src/routes/`).

## Project Structure

### Documentation (this feature)

```text
specs/018-churchwide-ux-redesign/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — R1-R5 original, R6 added 2026-07-07 (amendment correction)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command) — Phases 1-7 original, Phase 8 added 2026-07-07
```

No `contracts/` directory: this feature adds no new *endpoint*. It restructures presentation over existing, already-contracted `adminApi`/`volunteerApi` endpoints, with one small additive exception — the existing `/notifications` GET endpoint gains `cursor`/`limit` query params and its already-defined `nextCursor` response field gets exposed through the route and regenerated client (Constitution Check II; `research.md` R3; `tasks.md` T017-T018). Not large enough to warrant a `contracts/` directory of its own, but real enough to require an orval regeneration step. The 2026-07-07 amendment (Phase 8) adds no endpoint either — it is pure routing/presentation.

### Source Code (repository root)

```text
apps/web/src/
├── components/
│   └── app-shell.tsx                          # US1: role-scoped nav sets
├── routes/
│   ├── index.tsx                              # US1: real landing surface, no scaffolding
│   ├── todos.tsx                               # US1: removed (dead stub)
│   ├── dashboard.tsx                           # US3: tabbed sections
│   ├── notifications.tsx                       # US2: full history page
│   └── scheduling/
│       ├── index.tsx                           # Phase 8: becomes/redirects to builder-events.tsx
│       ├── planning.tsx                        # Phase 8: renamed → planning-cycles.tsx (+ new.tsx, $cycleId.tsx children)
│       ├── tailoring.tsx                       # Phase 8: role guard added, no rename
│       └── builder-events.tsx                  # Phase 8: new file (was the bare index above)
├── features/
│   ├── notifications/                          # US2: bell + dropdown + history view-model
│   ├── volunteers/components/volunteer-dashboard.tsx  # US3: tabbed layout
│   └── scheduling/components/
│       ├── planning-admin.tsx                  # US4 step-sequence; Phase 8: breadcrumb nav, header chip split
│       ├── planning-admin/                     # US4 + Phase 8 sub-components (cards, header, context)
│       ├── scheduling-nav.tsx                  # Phase 8: NAV_ITEMS path updates
│       ├── quick-create-event-modal.tsx        # US4: single canonical create-event UI
│       └── builder/volunteer-card.tsx          # US4: role-badge disambiguation
└── shared/hooks/use-caller-roles.ts            # US1: new, reactive nav-visibility hook

apps/web/tests/
├── desktop-layout.spec.ts                      # US1: role-scoped nav assertions
├── home-landing.spec.ts                        # US1: new
├── scheduling/
│   ├── us1-admin-plan.spec.ts                  # US4: step-sequence + locked-review assertions
│   ├── single-create-event-ui.spec.ts          # US4: new
│   ├── planning-nav-restructure.spec.ts        # Phase 8: new
│   └── planning-role-guards.spec.ts            # Phase 8: new
└── volunteer-dashboard/                        # US3

apps/server/src/api/controllers/volunteer-controller.ts  # US2: notification pagination querystring (small, additive)
```

**Structure Decision**: Frontend-only feature within the existing `apps/web` app; reuses the existing file-based route tree (TanStack Router) rather than introducing a separate frontend project. Phase 8 (the amendment) is a routing/renaming/role-guard change within `apps/web/src/routes/scheduling/`, not a new top-level structure — it capitalizes on the 3 route files that already exist there (`research.md` R6).

## Complexity Tracking

*No violations — table not needed.*
