# Implementation Plan: Monorepo Architecture Reshape

**Branch**: `016-architecture-reshape` | **Date**: 2026-07-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/016-architecture-reshape/spec.md`

## Summary

Complete architectural migration of `apps/server` from tRPC-based procedural style to clean DDD architecture with tsyringe DI, aggregate managers, raw Fastify HTTP controllers, and static layer boundary enforcement. The frontend client will be regenerated from the OpenAPI spec via orval (typed axios functions, not hooks). Six aggregate batches, each test-first. Tooling additions: GitHub Actions CI, Renovate, pre-push Lefthook job, Biome `useNamingConvention`, coverage thresholds, Unleash feature flags, `eslint-plugin-boundaries`.

Primary reference: `/home/tiago/01-dev-env/personal-repos/grocery-store` (same developer, same stack, working implementation).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Bun runtime

**Primary Dependencies**:
- Transport: Fastify + `fastify-type-provider-zod` + `@fastify/swagger` + `@scalar/fastify-api-reference`
- DI: tsyringe + `reflect-metadata`
- ORM: Drizzle + PostgreSQL
- Auth: Better-Auth
- Linting: Biome + `eslint-plugin-boundaries`
- Testing: Vitest (unit + integration), coverage via v8 provider
- Client gen: orval (`client: 'axios'`, typed async functions only)
- Feature flags: Unleash (self-hosted Docker)

**Storage**: PostgreSQL (existing Drizzle schema — no DB changes in this migration)

**Testing**: Vitest. Two test layers per aggregate: (1) transport-agnostic behavior tests (written before migration), (2) HTTP contract tests (written alongside new Fastify routes). No tRPC wire format captured in any test.

**Target Platform**: Linux server (local: Docker Compose, prod: VPS)

**Project Type**: Monorepo web service — `apps/server` (API) + `apps/web` (React frontend)

**Performance Goals**: CI gate ≤ 2 min per PR. No regression in response time from current tRPC baseline.

**Constraints**:
- No partial states in production — backend ships once all six batches complete
- Frontend migrates after backend ships
- `packages/core` stays minimal (Entity, DomainError, BrandedId utility only)
- No `any` in new code
- Biome + boundary lint must pass on every file

**Scale/Scope**: Single-tenant church deployment. ~7 aggregates, ~30 existing tRPC procedures → ~30 REST endpoints.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Domain-First Architecture | ✅ PASS | Spec starts from domain model; migration preserves all domain entities |
| II. Full-Stack Type Safety — tRPC | ⚠️ JUSTIFIED VIOLATION | This feature explicitly replaces tRPC with typed Fastify + orval. End-to-end type safety is preserved via OpenAPI contract → orval-generated typed functions. Constitution will need amendment after this ships. |
| III. Container-Ready Infrastructure | ✅ PASS | Unleash added to `docker-compose.yml`; server remains Dockerized |
| IV. Environment Discipline | ✅ PASS | `UNLEASH_API_URL` + `UNLEASH_API_TOKEN` added to `@church/env` schema via `packages/env/src/server.ts` |
| V. Automated Code Standards | ✅ PASS | Biome stays; `useNamingConvention` added; pre-push lefthook added; CI enforces all gates |
| VI. Maximum Context Specification | ✅ PASS | Grilling session (2026-06-30) read in full; grocery-store reference consulted |
| Monorepo Boundaries | ✅ PASS | `packages/core` stays generic; domain logic stays in `apps/server` |
| Domain Driven | ✅ PASS | Layer separation enforced at lint time, not just convention |

**Justified Violation Detail**: Constitution II mandates tRPC. The 2026-06-30 grilling session (22 Q&A) is the superseding architectural decision for this repo. tRPC was a template artifact, not an intentional choice. The replacement (typed Fastify + orval) delivers equivalent or superior type safety. The constitution must be amended (Principle II, tech stack table) as part of this feature's completion.

## Project Structure

### Documentation (this feature)

```text
specs/016-architecture-reshape/
├── plan.md              # This file
├── research.md          # Phase 0: decisions + grocery-store findings
├── data-model.md        # Phase 1: key interfaces, VO/branded-id patterns
├── contracts/
│   └── http-api.md      # Phase 1: complete REST endpoint contract
└── tasks.md             # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code — New Layout

```text
apps/server/src/
├── api/
│   ├── contracts/
│   │   └── fastify-controller.ts      # abstract FastifyController base class
│   ├── controllers/
│   │   ├── admin-leader-controller.ts # all admin/leader routes (one class)
│   │   ├── volunteer-controller.ts    # all volunteer routes (one class)
│   │   └── feature-flag-controller.ts # GET /api/v1/feature-flags
│   └── dtos/
│       ├── event.dto.ts               # Zod schemas + domain→DTO mappers
│       ├── assignment.dto.ts
│       ├── volunteer.dto.ts
│       ├── ministry.dto.ts
│       ├── church.dto.ts
│       ├── role.dto.ts
│       ├── time-slot.dto.ts
│       └── notification.dto.ts
├── application/
│   ├── contracts/                     # What application NEEDS FROM infrastructure
│   │   ├── event.repository.ts        # IEventRepository (MOVED from domain/repositories/)
│   │   ├── assignment.repository.ts   # IAssignmentRepository
│   │   ├── assignment-audit.repository.ts
│   │   ├── availability.repository.ts
│   │   ├── church.repository.ts
│   │   ├── ministry.repository.ts
│   │   ├── role.repository.ts
│   │   ├── role-template.repository.ts
│   │   ├── team.repository.ts
│   │   ├── time-slot.repository.ts
│   │   ├── volunteer.repository.ts
│   │   ├── volunteer-notification.repository.ts
│   │   ├── unit-of-work.ts            # IUnitOfWork (MOVED from domain/repositories/)
│   │   ├── transaction-context.ts     # ITransactionContext (MOVED from domain/repositories/)
│   │   ├── notification-service.ts    # INotificationService (MOVED from domain/services/)
│   │   └── feature-flag-service.ts    # IFeatureFlagService (NEW)
│   ├── db-event-manager.ts            # implements IEventManager (from domain/contracts/)
│   ├── db-volunteer-manager.ts        # implements IVolunteerManager
│   ├── db-assignment-manager.ts       # implements IAssignmentManager
│   ├── db-church-manager.ts           # implements IChurchManager
│   ├── db-ministry-manager.ts         # implements IMinistryManager
│   └── db-role-manager.ts             # implements IRoleManager
├── domain/
│   ├── contracts/                     # NEW — what the system CAN DO (use-case interfaces)
│   │   ├── event-manager.ts           # IEventManager interface
│   │   ├── volunteer-manager.ts       # IVolunteerManager interface
│   │   ├── assignment-manager.ts      # IAssignmentManager interface
│   │   ├── church-manager.ts          # IChurchManager interface
│   │   ├── ministry-manager.ts        # IMinistryManager interface
│   │   └── role-manager.ts            # IRoleManager interface
│   ├── branded-ids/                   # NEW
│   │   ├── event-id.ts                # type EventId + namespace EventId { from() }
│   │   ├── church-id.ts
│   │   ├── ministry-id.ts
│   │   ├── volunteer-id.ts
│   │   ├── assignment-id.ts
│   │   ├── time-slot-id.ts
│   │   ├── role-id.ts
│   │   ├── team-id.ts
│   │   └── availability-id.ts
│   ├── value-objects/                 # NEW
│   │   └── date-range.ts              # DateRange VO (private ctor + static create())
│   ├── entities/                      # UNCHANGED
│   ├── repositories/                  # DELETE contents — interfaces MOVE to application/contracts/
│   ├── services/                      # DELETE INotificationService — moves to application/contracts/
│   ├── assignment/                    # UNCHANGED (domain service)
│   ├── availability/                  # UNCHANGED (domain engine)
│   ├── conflict/                      # UNCHANGED (domain validation service)
│   └── errors/                        # UPDATE: add abstract code to each error class
├── infrastructure/
│   ├── mappers/                       # MOVED from infrastructure/repositories/*.mapper.ts
│   │   ├── event.mapper.ts
│   │   ├── assignment.mapper.ts
│   │   ├── assignment-audit.mapper.ts
│   │   ├── availability.mapper.ts
│   │   ├── church.mapper.ts
│   │   ├── ministry.mapper.ts
│   │   ├── role.mapper.ts
│   │   ├── role-template.mapper.ts
│   │   ├── slot.mapper.ts
│   │   ├── team.mapper.ts
│   │   ├── volunteer.mapper.ts
│   │   └── volunteer-notification.mapper.ts
│   ├── repositories/                  # UNCHANGED pattern, mappers removed
│   │   ├── drizzle-event.repository.ts
│   │   ├── drizzle-assignment.repository.ts
│   │   ├── drizzle-assignment-audit.repository.ts
│   │   ├── drizzle-availability.repository.ts
│   │   ├── drizzle-church.repository.ts
│   │   ├── drizzle-ministry.repository.ts
│   │   ├── drizzle-role.repository.ts
│   │   ├── drizzle-role-template.repository.ts
│   │   ├── drizzle-team.repository.ts
│   │   ├── drizzle-time-slot.repository.ts
│   │   ├── drizzle-volunteer.repository.ts
│   │   ├── drizzle-volunteer-notification.repository.ts
│   │   ├── drizzle-transaction-context.ts
│   │   ├── drizzle-unit-of-work.ts
│   │   └── helpers.ts
│   └── services/
│       ├── local-notification-service.ts   # UNCHANGED
│       └── unleash-feature-flag-service.ts # NEW
└── main/
    ├── di/
    │   ├── injection-tokens.ts        # NEW: token constants
    │   └── injections.ts              # NEW: all tsyringe registrations
    ├── fastify/
    │   ├── setup.ts                   # NEW: Fastify app factory, pino config, error handler, lifecycle hooks
    │   ├── register-controllers.ts    # NEW: tsyringe resolveAll → app.register
    │   └── types.ts                   # NEW: FastifyTypedInstance type alias
    └── server.ts                      # REPLACES index.ts: registerInjections → registerControllers → listen
```

### Infrastructure and Tooling Changes

```text
# New files at repo root / top-level packages
.github/
└── workflows/
    └── ci.yml                         # NEW: fast gate (types + biome + unit + boundaries) + E2E on master
renovate.json                          # NEW: weekly patch/minor batches, auto-merge patches
orval.config.ts                        # NEW (at monorepo root): client: 'axios', input: auto-generated-api.yaml
docker-compose.yml                     # UPDATE: add Unleash service

packages/core/src/
└── domain-error.ts                    # UPDATE: add abstract readonly code: string

packages/env/src/
└── server.ts                          # UPDATE: add UNLEASH_API_URL + UNLEASH_API_TOKEN

biome.json                             # UPDATE: add useNamingConvention rule
lefthook.yml                           # UPDATE: add pre-push job

apps/web/src/infrastructure/api/       # GENERATED by orval (not hand-written)
```

### Files to Delete / Move

```text
# Delete entirely
apps/server/src/trpc.ts
apps/server/src/context.ts
apps/server/src/routers/              # entire directory (all tRPC procedures)
apps/server/src/services/             # entire directory (absorbed into application/ managers)
apps/server/src/index.ts              # replaced by main/server.ts
apps/server/src/infrastructure/repositories/registry.ts  # replaced by tsyringe
apps/server/src/domain/mapper.ts      # replaced by infrastructure/mappers/ + api/dtos/

# Move: mapper files (infrastructure/repositories/*.mapper.ts → infrastructure/mappers/)
apps/server/src/infrastructure/repositories/*.mapper.ts

# Move: repo interfaces (domain/repositories/* → application/contracts/)
apps/server/src/domain/repositories/  # all interface files move; drizzle-* implementations move to infrastructure/repositories/ (already there)

# Move: notification service interface (domain/services/ → application/contracts/)
apps/server/src/domain/services/notification-service.ts  → application/contracts/notification-service.ts
```

### Import Boundary Rules (updated)

```text
api/           → domain/ only (IEventManager types for controller constructor params)
application/   → domain/ + application/contracts/ (self-layer)
infrastructure/→ application/contracts/ + domain/ + packages/db + packages/core
domain/        → packages/core only
main/          → unrestricted (wiring layer)
```

Key change from grilling session: repo interfaces move from `domain/repositories/` to `application/contracts/`, so `infrastructure/` no longer imports from `domain/` for interfaces — only for entity types used in mappers.

### Migration Map — tRPC Procedures → REST Endpoints → Manager Methods

| tRPC Procedure | HTTP Method + Path | Manager Method |
|---|---|---|
| `adminLeader.getScheduleBuilderData` | `GET /api/v1/admin/schedule-builder` | `IEventManager.getScheduleBuilderData` |
| `adminLeader.createEvent` | `POST /api/v1/admin/events` | `IEventManager.createEvent` |
| `adminLeader.listEvents` | `GET /api/v1/admin/events` | `IEventManager.listEvents` |
| `adminLeader.publishEvent` | `POST /api/v1/admin/events/:eventId/publish` | `IEventManager.publishEvent` |
| `adminLeader.cancelEvent` | `POST /api/v1/admin/events/:eventId/cancel` | `IEventManager.cancelEvent` |
| `adminLeader.createSlot` | `POST /api/v1/admin/events/:eventId/slots` | `IEventManager.createSlot` |
| `adminLeader.updateSlot` | `PATCH /api/v1/admin/events/:eventId/slots/:slotId` | `IEventManager.updateSlot` |
| `adminLeader.deleteSlot` | `DELETE /api/v1/admin/events/:eventId/slots/:slotId` | `IEventManager.deleteSlot` |
| `adminLeader.generateSlots` | `POST /api/v1/admin/events/:eventId/slots/generate` | `IEventManager.generateSlots` |
| `adminLeader.upsertSlotRequirement` | `PUT /api/v1/admin/events/:eventId/slots/:slotId/requirements` | `IEventManager.upsertSlotRequirement` |
| `adminLeader.listMyMinistries` | `GET /api/v1/admin/ministries` | `IMinistryManager.listByLeader` |
| `adminLeader.createAssignment` | `POST /api/v1/admin/assignments` | `IAssignmentManager.createAssignment` |
| `adminLeader.deleteAssignment` | `DELETE /api/v1/admin/assignments/:assignmentId` | `IAssignmentManager.deleteAssignment` |
| `adminLeader.listAuditLog` | `GET /api/v1/admin/assignments/:assignmentId/audit` | `IAssignmentManager.listAuditLog` |
| `adminLeader.sendReminder` | `POST /api/v1/admin/events/:eventId/reminders` | `IEventManager.sendReminder` |
| `adminLeader.listRoleTemplates` | `GET /api/v1/admin/role-templates` | `IRoleManager.listTemplates` |
| `adminLeader.upsertRoleTemplate` | `PUT /api/v1/admin/role-templates/:templateId` | `IRoleManager.upsertTemplate` |
| `adminLeader.applyRoleTemplate` | `POST /api/v1/admin/events/:eventId/apply-template` | `IRoleManager.applyTemplate` |
| `adminLeader.deleteRoleTemplate` | `DELETE /api/v1/admin/role-templates/:templateId` | `IRoleManager.deleteTemplate` |
| `volunteer.getVolunteerDashboard` | `GET /api/v1/volunteer/dashboard` | `IVolunteerManager.getDashboard` |
| `volunteer.getMyUpcomingAssignments` | `GET /api/v1/volunteer/assignments` | `IVolunteerManager.getUpcomingAssignments` |
| `volunteer.getMinistrySchedule` | `GET /api/v1/volunteer/ministries/:ministryId/schedule` | `IVolunteerManager.getMinistrySchedule` |
| `volunteer.upsertAvailability` | `PUT /api/v1/volunteer/availability` | `IVolunteerManager.upsertAvailability` |
| `volunteer.deleteAvailability` | `DELETE /api/v1/volunteer/availability/:availabilityId` | `IVolunteerManager.deleteAvailability` |
| `volunteer.getMyAvailability` | `GET /api/v1/volunteer/availability` | `IVolunteerManager.getAvailability` |
| `volunteer.respondToAssignment` | `PATCH /api/v1/volunteer/assignments/:assignmentId` | `IVolunteerManager.respondToAssignment` |
| `volunteer.getMyNotifications` | `GET /api/v1/volunteer/notifications` | `IVolunteerManager.getNotifications` |
| `volunteer.markNotificationRead` | `PATCH /api/v1/volunteer/notifications/:notificationId` | `IVolunteerManager.markNotificationRead` |
| `volunteer.markAllNotificationsRead` | `POST /api/v1/volunteer/notifications/read-all` | `IVolunteerManager.markAllNotificationsRead` |
| *(new)* | `GET /api/v1/feature-flags` | `IFeatureFlagService.getAll` |

### Migration Batch Breakdown

| Batch | Aggregates | Key New Files | Behavior Tests Before | HTTP Tests After |
|-------|-----------|---------------|----------------------|-----------------|
| **1 — Foundation** | Auth/session + server bootstrap | `main/`, `api/contracts/fastify-controller.ts`, CI yml, lefthook, biome, renovate, DomainError update | n/a (infra batch) | Health check, auth passthrough |
| **2 — Ministry** | Ministry | `IMinistryManager`, `DbMinistryManager`, ministry dtos | `listMyMinistries` | `GET /admin/ministries` |
| **3 — Volunteer** | Volunteer, Availability, Notifications | `IVolunteerManager`, `DbVolunteerManager`, volunteer/notification dtos | dashboard, availability, assignment response | All `GET/PUT/PATCH/DELETE /volunteer/*` |
| **4 — Event + TimeSlot** | Event, TimeSlot, SlotRequirement | `IEventManager`, `DbEventManager`, event/slot dtos, `DateRange` VO | create event, publish, cancel, slots CRUD | All admin event endpoints |
| **5 — Assignment** | Assignment, AssignmentAudit | `IAssignmentManager`, `DbAssignmentManager`, assignment dtos | create/delete assignment, audit log | `POST/DELETE /admin/assignments/*` |
| **6 — Role + Team** | Role, RoleTemplate, Team | `IRoleManager`, `DbRoleManager`, role dtos | role template CRUD, apply | All role-template endpoints |
| **Tooling** | *(cross-cutting)* | Biome `noRestrictedImports` overrides (boundary lint), orval config, Unleash docker-compose + `IFeatureFlagService` | n/a | `GET /feature-flags` |

Note: Tooling items (boundary linter via Biome overrides, orval, Unleash) should be set up in Batch 1 or as a separate preparatory commit before Batch 2. Boundary enforcement runs as part of `biome check` — no separate tool. orval-generated files are committed locally; pre-push hook enforces freshness via `bun run orval && git diff --exit-code apps/web/src/infrastructure/api/`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Constitution II — tRPC replacement | tRPC was a template artifact; Fastify+orval provides cleaner HTTP semantics and is the same developer's own gold standard (grocery-store) | Keeping tRPC means no REST HTTP status codes, no OpenAPI spec, no standard tooling |
| 5-layer folder structure (api/application/domain/infrastructure/main) | DDD: enforces that domain has zero framework deps; enables boundary linting | Flat structure cannot be boundary-linted; grocery-store proves this works |
