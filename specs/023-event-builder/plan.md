# Implementation Plan: Event Builder (Cycle-Centric)

**Branch**: `023-event-builder` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/023-event-builder/spec.md`, itself charted by the wayfinder map [Event Builder (cycle-centric) (#1)](https://github.com/tiagoluizpoli/church/issues/1) and its six resolved decision tickets.

## Summary

Replace the orphaned, per-`MinistryParticipation` `RosterBuilderPage` and retire the legacy event-scoped `ScheduleBuilder` / `/scheduling/builder-events` flow with a single **cycle-centric Event Builder**: one whole-cycle, per-ministry volunteer-assignment canvas at `/scheduling/rostering/$ministryId/$cycleId`. The builder is **pure assignment** — it assigns volunteers against the slots/shifts/requirements the tailoring workspace (`022`) already locked in, and never creates or edits that structure. It loads the entire cycle in **one batched read** (`getCycleBuilderData`, R1), ranks who to assign next per shift/role (R4), publishes the whole cycle in **one batched, transactional action** with confirm-below-full (R7), exposes a **batched cycle-wide audit read** (R5), and is reached from the ministry cycle list via a relabeled **Assign** button gated on *any* availability having fired (R6). Layout is the approved "Cycle board" (R2), genuinely responsive on mobile (the old desktop-only interstitial is deleted).

Backend surface is **three new endpoints on `LeaderRosteringController`** (builder read, cycle audit, batched publish) plus **one derived boolean** (`availabilityFiredForAny`) added down the existing tailoring cycle-summary chain — **no new persisted entities and no schema migration** (data-model.md). Frontend rebuilds the 10 grid-structural builder components for the cycle board, reuses 7 presentational ones as-is, rewires 3 pool-dependent ones + `audit-log-panel`, and retires the legacy routes/entries per the [Legacy builder retirement inventory (#5)](https://github.com/tiagoluizpoli/church/issues/5) cutover ordering.

**Provenance**: every design decision here was resolved during the wayfinder map before planning; research.md consolidates those ticket resolutions (R1–R8) rather than re-deriving them.

## Technical Context

**Language/Version**: TypeScript 5+, React 19

**Primary Dependencies**: Fastify + Zod DTOs (backend), Drizzle ORM + PostgreSQL, TanStack Router (file-based routing) + TanStack Query, shadcn/ui + Tailwind CSS v4, orval-generated typed client (`apps/web/src/infrastructure/api/`), Unleash (feature flag for R4 ministry-only fairness scope)

**Storage**: PostgreSQL via Drizzle (`packages/db`) — **no schema changes** (all new reads/writes operate on existing tables; `availabilityFiredForAny` is computed, not stored)

**Testing**: Vitest + React Testing Library (component/interaction), Playwright (E2E, incl. migrating 5 legacy builder specs), Vitest integration against a Dockerized Postgres for new repository methods incl. two-church (A/B) isolation (R8)

**Target Platform**: Web (responsive — genuine desktop + mobile parity; no interstitial, R2/R6)

**Project Type**: Web application (monorepo: `apps/web` frontend, `apps/server` backend, `packages/db` shared schema) — this feature touches `apps/web` and `apps/server`; `packages/db` is **untouched** (no migration)

**Performance Goals**: whole-cycle initial paint from **one** batched request replacing the legacy flow's three loads (SC-002); eligible volunteers batched (never N+1) (R1); recommendations recompute from already-fetched draft data (no per-interaction round-trip), with revalidation on mutation/focus/~30s (R4)

**Constraints**: builder is pure-assignment — MUST NOT write slots/shifts/requirements (FR-006); reuse existing single-assignment mutation endpoints unchanged (data-model.md); batched publish reuses the existing per-participation publish rule (confirm-below-full) applied atomically; every new query church-isolated per R2; route follows the ministry-first nesting convention (`/scheduling/rostering/$ministryId/$cycleId`); **exactly three** new backend endpoints permitted (builder read, cycle audit, cycle publish) — no further endpoint without an amendment

**Scale/Scope**: 3 new backend endpoints + 1 derived field (4 backend layers each: DTO, controller, manager, repository); 0 migrations; ~10 rebuilt + 3 rewired + 7 reused-as-is frontend components; 1 new route level; 3 legacy routes + 5 delete files retired; 5 e2e specs migrated

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Check | Status |
|---|---|---|
| I. Domain-First Architecture | Reuses the Spec 017 reshape domain (`MinistryParticipation`, `TimeSlot`, `Shift`, `SlotRequirement`, `Assignment`, `AvailabilityCheck`, `AssignmentAudit`); new logic lives in domain/application layers (manager methods, `aggregateCycleTailoringStatus` extension), not bolted onto infrastructure. Traversed `CONTEXT.md`, `specifications-list.md`, ADR 0001/0002 context before planning | PASS |
| II. Full-Stack Type Safety | 3 new endpoints follow the existing `LeaderRosteringController` Fastify + Zod-DTO pattern (`getCycleParticipation`/`publishParticipation` precedents); new DTOs compose existing atomic schemas; frontend consumes via orval regen — no hand-maintained types, no `any`/`unknown` | PASS |
| III. Container-Ready Infrastructure | No infra changes; integration tests use the Dockerized Postgres already in `docker-compose.yml` | PASS (N/A) |
| IV. Environment Discipline | No new env vars (the R4 fairness-scope flag is an existing Unleash flag, not a new env secret) | PASS (N/A) |
| V. Automated Code Standards | Biome/Lefthook gates apply; no suppression directives (agents.local.md) | PASS |
| VI. Maximum Context Specification | Traversed `manual-planning/0001-volunteer-scheduling/specifications-list.md` and its linked `specifications/R2-drizzle-repos.md` before finalizing backend design; applicable R2 rules folded into research.md R8 (church isolation, relational-query-where-possible, transactions for the publish write, mandatory Dockerized integration + two-church isolation tests) | PASS |
| VII. Explicit Parameter Contracts | All new manager/repository/controller functions and new React hooks/components take a single named-`interface`/`type` object parameter; no inline object typing or `as { … }` in touched files; existing violations in touched files corrected | PASS (enforced at `/speckit-implement` + review) |
| Mandatory Frontend Rule (Strict shadcn/ui) | Cycle board, lanes, cards, volunteer rail, recommendation lists, publish/override dialogs compose existing shadcn primitives (reuse the 7 presentational builder components as-is; rebuilt components stay shadcn-based) — no from-scratch primitives (R2) | PASS |

No violations — Complexity Tracking section omitted.

## Project Structure

### Documentation (this feature)

```text
specs/023-event-builder/
├── plan.md              # This file
├── research.md          # Phase 0 — R1–R8, consolidating map tickets #1–#8
├── data-model.md        # Phase 1 — no migration; derived field + new read/write shapes
├── quickstart.md        # Phase 1 — build order, verify, per-story smoke
├── contracts/
│   └── leader-rostering-endpoints.md  # Phase 1 — 3 new endpoints + derived-field delta
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
apps/server/src/
├── domain/
│   ├── entities/ministry-participation.ts          # CHANGED: aggregateCycleTailoringStatus emits availabilityFiredForAny (R6)
│   └── contracts/
│       ├── application/participation-manager.ts     # CHANGED: getCycleBuilderData + publishCycle signatures/views; availabilityFiredForAny on cycle-summary view
│       ├── application/assignment-manager.ts         # CHANGED: listAuditLogForCycle signature (R5)
│       └── infrastructure/
│           ├── ministry-participation.repository.ts  # CHANGED: builder-read aggregation types; availabilityFiredForAny on summary view; batched-publish tx method
│           └── assignment-audit.repository.ts         # CHANGED: listByCycle/listByAssignmentIds (R5)
├── application/
│   ├── db-participation-manager.ts                   # CHANGED: getCycleBuilderData (Query A+B), publishCycle (batched tx over existing publish rule)
│   └── db-assignment-manager.ts                      # CHANGED: listAuditLogForCycle
├── infrastructure/repositories/
│   ├── drizzle-ministry-participation.repository.ts  # CHANGED: church-isolated builder aggregation; batched publish tx; firedOrLaterCount>0 surfaced
│   └── drizzle-assignment-audit.repository.ts         # CHANGED: listByCycle (church-isolated)
└── api/
    ├── dtos/
    │   ├── cycle-builder.dto.ts                       # NEW: cycleBuilder*Schema (composes existing atomic schemas) + publishCycle body/response
    │   └── participation.dto.ts                       # CHANGED: availabilityFiredForAny on cycle-summary schema+mapper (R6)
    └── controllers/leader-rostering-controller.ts     # CHANGED: 3 new routes (getCycleBuilderData, getCycleAuditLog, publishCycle), canManageMinistry guard

apps/web/src/
├── routes/scheduling/
│   ├── rostering/$ministryId/$cycleId.tsx            # NEW: cycle board builder route (ministry-first)
│   ├── builder-events.tsx                            # DELETE: retired legacy entry route (R3)
│   └── events/$eventId/builder.tsx                   # DELETE: retired legacy per-event builder route (R3)
├── features/scheduling/components/
│   ├── builder/                                      # REBUILD 10 / REWIRE 3 / REUSE-AS-IS 7 / DELETE 4 per R3 inventory
│   │   ├── schedule-builder.tsx …                    #   (see legacy-builder-retirement-inventory.md for the file-by-file classification)
│   │   ├── audit-log-panel.tsx                       # REWIRE: swap Promise.all N+1 → getCycleAuditLog (R5)
│   │   └── mobile-interstitial.tsx                   # DELETE: mobile-parity decision (R2/R6)
│   └── tailoring/ministry-cycle-list.tsx             # CHANGED: "Assign" button, gate on availabilityFiredForAny, new copy/testids (R6)
└── infrastructure/api/                               # CHANGED: orval-regenerated client picks up 3 endpoints + availabilityFiredForAny — do not hand-edit
```

(The orphaned per-participation `rostering/$cycleId/$ministryId/$participationId.tsx` and its `RosterBuilderPage` are removed/superseded by the new `$ministryId/$cycleId` route; exact deletions tracked in the R3 inventory.)

**Structure Decision**: Follows the existing layered backend (Drizzle repo → application manager → Fastify controller/DTO, mirroring `getCycleParticipation`/`publishParticipation`) and the Bulletproof-React frontend (`features/scheduling/components/builder/` for the canvas, ministry-first route nesting matching tailoring's `$ministryId/$cycleId`). No new architectural shape; `packages/db` untouched.

## Phase 0 — Research

Complete: [research.md](./research.md). All decisions pre-resolved by the map; R1–R8 consolidate tickets #1–#8 and ground them against current code. No open `NEEDS CLARIFICATION`.

## Phase 1 — Design & Contracts

Complete: [data-model.md](./data-model.md), [contracts/leader-rostering-endpoints.md](./contracts/leader-rostering-endpoints.md), [quickstart.md](./quickstart.md).

**Post-design Constitution re-check**: no new violations. The design adds no persisted entity and no migration (Principle I/III unaffected beyond reuse); the three endpoints and derived field all follow existing typed patterns (Principle II); backend layering respects domain/application/infrastructure boundaries with named object parameters throughout (Principle I/VII); every new query is church-isolated with mandatory Dockerized two-church integration tests (Principle VI / R2 / R8); frontend stays shadcn-based (Mandatory Frontend Rule). **Constitution Check: PASS (post-design).**

## Phase 2 — Task planning approach

`/speckit-tasks` will generate `tasks.md`. Expected shape, following the R3 cutover ordering (backend → new route additively → repoint → migrate e2e → delete legacy) and mapping to the spec's prioritized user stories:

1. **Backend read + publish + audit** (US1/US2/US5 foundation): the 3 endpoints across all 4 layers each, DTOs, orval regen — each with Dockerized integration + two-church isolation tests (R8).
2. **Derived field** (US4): `availabilityFiredForAny` down the chain + orval regen.
3. **Canvas** (US1): rebuild 10 grid-structural components for the cycle board, reuse 7 as-is, rewire 3 pool-dependent; new `$ministryId/$cycleId` route (additive).
4. **Recommendations** (US3): shift/role ranking + Needs-response/Conflict grouping + Accept, on already-fetched data + revalidation.
5. **Publish UI** (US2): single Publish action + below-full confirmation.
6. **Audit panel rewire** (US5): `getCycleAuditLog` + client-side name join.
7. **Entry + retirement** (US4): Assign button/gating/copy/testids; repoint 4 entry points; migrate 5 e2e specs; delete 3 legacy routes + 4 slot-management files + `mobile-interstitial`.
8. **Mobile parity** (US6): responsive board scroll + stacked rail (interstitial already deleted).

Each phase ends with the `agents.local.md` quality-gate loop (`bun run check` / `check-types` / `test` / `test:e2e`) + `/review` before proceeding.

## Complexity Tracking

*No Constitution Check violations — section not applicable.*
