# Implementation Plan: Scheduling Reshape — Church-Owned Cycles, Templates & Shifts

**Branch**: `017-scheduling-reshape` | **Date**: 2026-07-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/017-scheduling-reshape/spec.md`

## Summary

Re-centre scheduling from the ministry-owned, single-event model onto a **church-owned calendar planned in cycles**. A `ChurchAdmin` drafts a `PlanningCycle` (arbitrary non-overlapping date range), applies reusable `EventTemplate`s to generate church-owned `Event`s (one per matching weekday, one `TimeSlot` per `TimeBlock`), and **locks** the cycle. Each ministry then tailors a `MinistryParticipation` — opting into `TimeSlot`s (stored as inclusions), subdividing them into `Shift`s, setting per-`Shift` `SlotRequirement`s, and firing `AvailabilityCheck`s. Volunteers are available-by-default and confirm; leaders roster and **publish per participation**. Notifications move to per-cycle. `RoleTemplate` is removed; `Event.ministryId` is removed.

This ships as a **greenfield schema reset** (Assumption: no production data) on top of the completed 016 clean-architecture foundation (Fastify + DDD layers + tsyringe DI + orval). It is delivered aggregate-by-aggregate, test-first, following the same batch discipline as 016.

Authoritative background (do not re-litigate): [CONTEXT.md](../../CONTEXT.md), [ADR 0001](../../docs/adr/0001-church-owned-events-and-planning-cycles.md), [ADR 0002](../../docs/adr/0002-church-timeslots-ministry-shifts.md), [refinement-02-scheduling-reshape.md](../../manual-planning/0001-volunteer-scheduling/refinement-02-scheduling-reshape.md), [BACKLOG.md](../../manual-planning/0001-volunteer-scheduling/BACKLOG.md) (BL-008…BL-010).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Bun runtime

**Primary Dependencies**:
- Transport: Fastify + `fastify-type-provider-zod` + `@fastify/swagger` + `@scalar/fastify-api-reference`
- DI: tsyringe + `reflect-metadata`
- ORM: Drizzle + PostgreSQL
- Auth: Better-Auth
- Validation: Zod (DTOs)
- Client gen: orval (`client: 'axios'`, typed async functions) → `apps/web/src/infrastructure/api/`
- Feature flags: Unleash (self-hosted) — flags `PARTICIPATION_DEFAULT_ALL_IN`, `VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE`
- Linting/boundaries: Biome (`useNamingConvention` + `noRestrictedImports` layer boundaries)
- Testing: Vitest (unit + integration), Playwright (E2E)

**Storage**: PostgreSQL via Drizzle. **Greenfield reset** — new tables (`planning_cycle`, `event_template`, `time_block`, `ministry_serving_profile`, `ministry_participation`, `participation_slot_inclusion`, `shift`, `availability_check`), altered tables (`event` drops `ministry_id`, gains `planning_cycle_id`; `slot_requirement`/`assignment`/`availability` re-key to `shift_id`; `ministry` gains `default_direction`), removed tables (`role_template`, `role_template_item`). No migration of existing scheduling data.

**Testing**: Vitest — two layers per aggregate: (1) transport-agnostic manager/domain behaviour tests written first; (2) HTTP contract tests alongside new Fastify routes. Integration tests hit a real DB (`packages/db` test harness). Playwright E2E for the five user-story journeys. Per `agents.local.md`, every phase runs `bun run check`, `bun run check-types`, `bun run test`, `bun run test:e2e`, then a code review.

**Target Platform**: Linux server (local: Docker Compose; prod: VPS). Frontend React 19 + Vite (CSR), shadcn/ui.

**Project Type**: Monorepo web service — `apps/server` (API, `@church/server`) + `apps/web` (React) + `packages/db`, `packages/env`, `packages/core`.

**Performance Goals**: Cycle event-generation for a full month (≈4–5 weekday templates × ~30 dates) completes inside one request/transaction well under the CI gate; no regression vs current baseline. SC targets: admin plan+lock < 10 min, leader → fired availability < 5 min, volunteer acknowledge < 30 s.

**Constraints**:
- 100% type safety — no `any`/`unknown` casts in new code.
- Church isolation — every query filters by `church_id`.
- **Named Object Parameters** (Constitution VII): every manager/domain method takes one separately-declared, descriptively-named input `interface`.
- Domain layer imports `@church/core` only; boundaries enforced by Biome at lint time.
- Cycle date ranges per church must not overlap (DB + domain invariant); `Shift` must lie entirely within its parent `TimeSlot` (DB check + domain invariant).
- Two independent overlap controls: availability-confirm (global flag) vs assignment (per-ministry `enforcementType` soft/hard + audited override).

**Scale/Scope**: Single-tenant church deployment. 8 new aggregates/entities, ~2 reshaped (`Event`, `Availability`, `Assignment`, `SlotRequirement`, `TimeSlot`), 1 removed (`RoleTemplate`). ~25–30 new/changed REST endpoints across a `ChurchAdmin` surface, a reshaped leader surface, and a reshaped volunteer surface.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Domain-First Architecture | ✅ PASS | Plan starts from CONTEXT.md glossary + ADR 0001/0002; entities precede code. |
| II. Full-Stack Type Safety | ✅ PASS | Fastify + orval + OpenAPI boundary (post-016 constitution), Zod DTOs, Drizzle. No `any`. |
| III. Container-Ready Infrastructure | ✅ PASS | No new infra services; existing Docker Compose (PG + Unleash) unchanged. |
| IV. Environment Discipline | ✅ PASS | Reuses existing Unleash flags; no new secrets. |
| V. Automated Code Standards | ✅ PASS | Biome + Lefthook + CI gates unchanged; boundary lint applies to new layers. |
| VI. Maximum Context Specification | ✅ PASS | `specifications-list.md` tree traversed: refinement-02, ADR 0001/0002, CONTEXT.md, BACKLOG BL-008…010, existing entities/schema read. |
| VII. Explicit Parameter Contracts | ✅ PASS | All new manager/domain methods use single named-object inputs; existing violations in touched files corrected. |
| Monorepo Boundaries | ✅ PASS | `packages/*` stay generic; all domain logic in `apps/server`; client imports via orval. |
| Domain Driven | ✅ PASS | Layer separation (api/application/domain/infrastructure/main) preserved; boundary-linted. |

**No violations.** Complexity Tracking table intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/017-scheduling-reshape/
├── plan.md              # This file
├── research.md          # Phase 0: decisions resolving open questions
├── data-model.md        # Phase 1: entities, VOs, branded IDs, invariants, state machines
├── contracts/
│   └── http-api.md      # Phase 1: REST endpoint contract (admin / leader / volunteer)
├── quickstart.md        # Phase 1: end-to-end walkthrough of the five user stories
├── checklists/          # existing (author-supplied)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code — changes on the 016 layout

```text
apps/server/src/
├── domain/
│   ├── branded-ids/                     # NEW ids
│   │   ├── planning-cycle-id.ts
│   │   ├── event-template-id.ts
│   │   ├── time-block-id.ts
│   │   ├── ministry-serving-profile-id.ts
│   │   ├── ministry-participation-id.ts
│   │   ├── shift-id.ts
│   │   ├── availability-check-id.ts
│   │   └── (index.ts updated)
│   ├── value-objects/
│   │   └── date-range.ts                # REUSE (contains/overlaps already fit cycle rules)
│   ├── entities/
│   │   ├── planning-cycle.ts            # NEW — draft→locked→archived, no-overlap guard hook
│   │   ├── event-template.ts            # NEW — weekday + ordered TimeBlocks
│   │   ├── time-block.ts                # NEW — {label,startTime,endTime}, stable id
│   │   ├── ministry-serving-profile.ts  # NEW — per-TimeBlock serve/split/headcount
│   │   ├── ministry-participation.ts    # NEW — tailoring→availability_fired→rostering→published
│   │   ├── participation-slot-inclusion.ts # NEW — opt-in row
│   │   ├── shift.ts                     # NEW — bounds-within-slot invariant
│   │   ├── availability-check.ts        # NEW — pending→confirmed, confirmedAt
│   │   ├── event.ts                     # EDIT — drop ministryId, add planningCycleId, status enum
│   │   ├── availability.ts              # EDIT — unavailability mark keyed to shiftId + checkId
│   │   ├── slot-requirement.ts          # EDIT — re-key to shiftId + participationId
│   │   ├── assignment.ts                # EDIT — re-key to shiftId + participationId
│   │   ├── time-slot.ts                 # EDIT — add sourceTemplateBlockId
│   │   ├── ministry.ts                  # EDIT — add defaultDirection
│   │   └── role-template.ts             # DELETE
│   ├── contracts/
│   │   ├── application/                 # NEW manager interfaces (named-object inputs)
│   │   │   ├── planning-cycle-manager.ts
│   │   │   ├── event-template-manager.ts
│   │   │   ├── participation-manager.ts
│   │   │   ├── availability-check-manager.ts
│   │   │   ├── event-manager.ts         # EDIT — cycle/template generation, per-participation publish
│   │   │   ├── volunteer-manager.ts     # EDIT — availability-check + confirm
│   │   │   └── role-manager.ts          # EDIT — drop template methods
│   │   ├── infrastructure/              # NEW repo interfaces per aggregate
│   │   └── contract-tests/              # NEW repo contract tests
│   ├── services/                        # domain services
│   │   ├── cycle-event-generator.ts     # NEW — EventTemplate×dates → Events+TimeSlots
│   │   ├── shift-splitter.ts            # NEW — equal-N / manual, bounds-enforced
│   │   ├── profile-seeder.ts            # NEW — profile → inclusions+shifts+requirements
│   │   └── availability-overlap.ts      # NEW/EXTEND — cross-ministry same-date overlap
│   └── errors/                          # NEW domain errors (overlapping cycle, shift-out-of-bounds, …)
├── application/                         # NEW/EDIT Db*Manager implementations
│   ├── db-planning-cycle-manager.ts
│   ├── db-event-template-manager.ts
│   ├── db-participation-manager.ts
│   ├── db-availability-check-manager.ts
│   ├── db-event-manager.ts             # EDIT
│   ├── db-volunteer-manager.ts         # EDIT
│   └── db-role-manager.ts              # EDIT (drop template ops)
├── infrastructure/
│   ├── mappers/                         # NEW mappers per new entity + EDIT reshaped ones
│   └── repositories/                    # NEW drizzle-* repos + EDIT reshaped ones
├── api/
│   ├── controllers/
│   │   ├── church-admin-controller.ts  # NEW — cycles, templates
│   │   ├── admin-leader-controller.ts  # EDIT — participation/shift/roster, drop role-template routes
│   │   └── volunteer-controller.ts     # EDIT — availability-check + confirm + cancel-own
│   └── dtos/                            # NEW dtos for new aggregates + EDIT reshaped ones
└── main/di/injections.ts               # EDIT — register new managers/repos; drop RoleTemplate

packages/db/src/
├── schema/
│   ├── enums.ts                         # EDIT — event status (drop 'published', add 'scheduled'/'past'),
│   │                                    #        participation_state, cycle_state, availability_check_state,
│   │                                    #        default_direction; keep enforcement_type
│   ├── planning.ts                      # NEW — planning_cycle, event_template, time_block, serving_profile
│   ├── scheduling.ts                    # EDIT — event(-ministry_id,+planning_cycle_id), time_slot(+source_template_block_id),
│   │                                    #        + shift, re-FK slot_requirement→shift
│   ├── participation.ts                 # NEW — ministry_participation, participation_slot_inclusion
│   ├── assignments.ts                   # EDIT — re-FK assignment→shift+participation; availability→shift+check
│   ├── availability-checks.ts           # NEW — availability_check
│   ├── core.ts                          # EDIT — ministry.default_direction
│   ├── role-templates.ts                # DELETE
│   └── index.ts                         # EDIT — export new, drop role-templates
└── src/seed/factories/scheduling.factory.ts  # EDIT — cycles/templates/participations demo data

apps/web/src/
├── features/scheduling/                 # EDIT/NEW — cycle admin, participation tailoring, shift split, availability
└── infrastructure/api/                  # REGENERATED by orval
```

**Structure Decision**: Extends the 016 five-layer DDD layout (`api / application / domain / infrastructure / main`) inside `apps/server` — no new top-level structure. New aggregates follow the existing entity → branded-id → repo-interface (`domain/contracts/infrastructure`) → manager-interface (`domain/contracts/application`) → `Db*Manager` → drizzle repo → mapper → controller → DTO pipeline. Schema is split into cohesive files under `packages/db/src/schema` mirroring aggregate boundaries. Boundary lint rules from 016 apply unchanged.

## Complexity Tracking

> No Constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| — | — | — |
