# Implementation Plan: Volunteer Dashboard

**Branch**: `014-volunteer-dashboard` | **Date**: 2026-06-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-volunteer-dashboard/spec.md`

---

## Summary

Build the canonical volunteer dashboard in `apps/web` and back it with a complete volunteer-facing tRPC surface in `apps/server`. The feature is not UI-only: today the repo has a placeholder `/dashboard` route, a standalone availability form route, and only one volunteer procedure (`respondToAssignment`). This plan adds event-scoped availability workflows, dashboard snapshot queries, historical notification inbox persistence, read-only ministry schedule queries, offline-friendly read behavior, and subtle background refresh signaling using the existing tRPC + TanStack Query stack.

---

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Bun runtime

**Primary Dependencies**:
- Frontend: React 19, Vite, TanStack Router v1, TanStack Query v5, `@trpc/tanstack-react-query`, Tailwind CSS v4, shadcn/ui via `@church/ui`, sonner
- Backend: Fastify, tRPC server, Drizzle ORM, Zod, Better Auth
- Shared: `@church/env`, `@church/db`, `@church/core`

**Storage**: PostgreSQL via Drizzle ORM (`packages/db`)

**Testing**:
- Frontend: Vitest + Testing Library
- Backend: Vitest integration / contract tests
- E2E: Playwright in `apps/web/tests`

**Target Platform**: Mobile-first web app / PWA, still usable on larger browsers

**Project Type**: Monorepo web application with split frontend (`apps/web`) and backend (`apps/server`)

**Performance Goals**:
- Volunteer identifies pending availability task in under 10 seconds (SC-001)
- Volunteer responds to pending assignment in under 30 seconds from dashboard open (SC-002)
- Initial dashboard load returns above-the-fold summary data in one primary round trip
- Inbox history loads progressively without blocking first render

**Constraints**:
- Dashboard is canonical volunteer surface; legacy single-purpose availability route must not remain competing primary UX
- Church isolation on every read/write
- UTC storage, display in church / viewer timezone rules already defined by Spec S4
- Volunteer writes remain online-only in MVP
- Background refresh must stay visually silent unless visible data changed
- Existing repo has no feature-flag platform; rollout control must fit current env/config patterns

**Scale/Scope**:
- One authenticated volunteer at a time
- Cross-ministry dashboard aggregation for that volunteer
- Current/upcoming published schedule only
- Notification history retained indefinitely, but rendered in pages / batches

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Domain-First Architecture | ✅ PASS | Planning grounded in F2, A2, 10, 11, roadmap, handoff, backlog |
| II. Full-Stack Type Safety | ✅ PASS | tRPC + Zod + Drizzle remain end-to-end path |
| III. Container-Ready Infrastructure | ✅ PASS | No new runtime infrastructure required for MVP |
| IV. Environment Discipline | ✅ PASS | One new server env flag likely needed; must be added through `@church/env/server` |
| V. Automated Code Standards | ✅ PASS | Existing Biome / Lefthook workflow unchanged |
| VI. Maximum Context Specification | ✅ PASS | Traversed specification list and linked volunteer-dashboard planning artifacts before design |

**No violations. Proceeding.**

---

## Project Structure

### Documentation (this feature)

```text
specs/014-volunteer-dashboard/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── dashboard-ui-contract.md
│   └── trpc-procedures.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code

```text
# Database / shared schema
packages/db/src/schema/
├── assignments.ts                 [MODIFY] extend availability with optional event scope
├── enums.ts                       [MODIFY] add notification type enum
├── volunteer-notifications.ts     [NEW] inbox persistence tables
└── index.ts                       [MODIFY] export new schema

# Shared env
packages/env/src/
└── server.ts                      [MODIFY] add server-side overlap rollout flag

# Backend
apps/server/src/
├── domain/
│   ├── entities/
│   │   ├── availability.ts                [MODIFY] support optional event scope semantics
│   │   ├── volunteer-notification.ts      [NEW]
│   │   └── index.ts                       [MODIFY]
│   └── repositories/
│       ├── volunteer-notification.repository.ts   [NEW]
│       └── index.ts                                [MODIFY]
├── infrastructure/
│   └── repositories/
│       ├── drizzle-availability.repository.ts     [MODIFY]
│       ├── drizzle-volunteer-notification.repository.ts [NEW]
│       ├── registry.ts                            [MODIFY]
│       └── index.ts                               [MODIFY]
├── routers/
│   ├── volunteer.ts                       [MODIFY] register full volunteer surface
│   └── volunteer/
│       ├── delete-availability.ts        [NEW]
│       ├── get-ministry-schedule.ts      [NEW]
│       ├── get-my-availability.ts        [NEW]
│       ├── get-my-notifications.ts       [NEW]
│       ├── get-my-upcoming-assignments.ts [NEW]
│       ├── get-volunteer-dashboard.ts    [NEW]
│       ├── mark-all-notifications-read.ts [NEW]
│       ├── mark-notification-read.ts     [NEW]
│       ├── respond-to-assignment.ts      [MODIFY] enforce in-progress guard + undo contract if needed
│       └── upsert-availability.ts        [NEW]
├── services/
│   └── volunteer-dashboard/
│       ├── build-dashboard-snapshot.ts   [NEW]
│       ├── compute-availability-task.ts  [NEW]
│       └── map-notification-link.ts      [NEW]

# Backend tests
apps/server/tests/
├── integration/
│   └── routers/                          [MODIFY] volunteer dashboard router integration coverage
└── contract/
    └── repositories/                     [MODIFY] notification repository contract coverage if added

# Frontend
apps/web/src/
├── routes/
│   ├── dashboard.tsx                    [MODIFY] replace placeholder with real route
│   └── availability.tsx                [MODIFY] legacy compatibility redirect / entry point
├── features/
│   └── volunteers/
│       ├── components/
│       │   ├── availability-form.tsx          [MODIFY] make event-scoped and dashboard-ready
│       │   ├── volunteer-dashboard.tsx        [NEW]
│       │   ├── availability-needed-section.tsx [NEW]
│       │   ├── upcoming-assignments-section.tsx [NEW]
│       │   ├── notifications-inbox-section.tsx [NEW]
│       │   ├── ministry-schedule-section.tsx   [NEW]
│       │   ├── dashboard-offline-banner.tsx    [NEW]
│       │   ├── background-refresh-indicator.tsx [NEW]
│       │   └── notification-detail-sheet.tsx   [NEW]
│       ├── hooks/
│       │   ├── use-volunteer-dashboard.ts      [NEW]
│       │   ├── use-dashboard-refresh.ts        [NEW]
│       │   └── use-notification-inbox.ts       [NEW]
│       └── lib/
│           ├── dashboard-query-options.ts      [NEW]
│           ├── dashboard-mappers.ts            [NEW]
│           └── assignment-grouping.ts          [NEW]
└── __tests__/
    └── volunteer-dashboard/              [NEW] component / integration harness tests

# E2E
apps/web/tests/
└── volunteer-dashboard/
    ├── us1-availability.spec.ts         [NEW]
    ├── us2-assignments.spec.ts          [NEW]
    ├── us3-notifications.spec.ts        [NEW]
    ├── us4-ministry-schedule.spec.ts    [NEW]
    └── us5-offline.spec.ts              [NEW]
```

**Structure Decision**: Option 2 (web app + backend). All dashboard UI stays under `apps/web/src/features/volunteers`. All volunteer-facing API work stays under `apps/server/src/routers/volunteer`. New notification persistence is shared schema / repository work because the inbox is a real durable domain concern, not frontend-only state.

---

## Complexity Tracking

No constitution violations. No complexity justification needed.

---

## Phase 0: Research

See [research.md](./research.md).

### Key Decisions Resolved

| Unknown | Decision | Rationale |
|---------|----------|-----------|
| Event-scoped availability storage | Extend existing `availability` records with optional `eventId` | Reuses current availability engine and overlap logic while giving dashboard exact event ownership |
| Dashboard data fetching shape | One `getVolunteerDashboard` summary query + section-specific queries for inbox / schedule pagination | Fast first render, still supports progressive loading and manual refresh |
| Notification inbox persistence | Add durable `volunteer_notification` table + repository | Current notification service is transient only; inbox requires history, read state, deep-link metadata |
| Rollout control for overlap-save path | Add thin server config flag via `@church/env/server`, keep adapter seam for future feature-flag provider | Repo has no existing flag infra; env-backed gate fits current project today |
| Refresh behavior | Keep tRPC on TanStack Query, use reconnect + interval refetch with changed-data indicator | Stack already in use; no need to replace tRPC to get React Query behavior |
| Legacy `/availability` route fate | Keep as compatibility entry that routes into dashboard event-specific flow | Preserves links while making dashboard canonical |

---

## Phase 1: Design & Contracts

Artifacts produced in this phase:

- [data-model.md](./data-model.md)
- [contracts/trpc-procedures.md](./contracts/trpc-procedures.md)
- [contracts/dashboard-ui-contract.md](./contracts/dashboard-ui-contract.md)
- [quickstart.md](./quickstart.md)

### Post-Design Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Domain-First Architecture | ✅ PASS | New persistence entities map directly to dashboard domain concepts |
| II. Full-Stack Type Safety | ✅ PASS | Contracts define typed tRPC boundaries and typed UI snapshot shapes |
| III. Container-Ready Infrastructure | ✅ PASS | No extra infra beyond existing app + DB |
| IV. Environment Discipline | ✅ PASS | New flag routed through `packages/env/src/server.ts` |
| V. Automated Code Standards | ✅ PASS | Plan includes frontend, backend, integration, and E2E tests |
| VI. Maximum Context Specification | ✅ PASS | Design explicitly grounded in manual-planning artifacts and handoff |

**No violations after design. Ready for `/speckit-tasks`.**
