# Tasks: Monorepo Architecture Reshape

**Input**: Design documents from `specs/016-architecture-reshape/`

**Prerequisites**: plan.md ✅ · spec.md ✅ · research.md ✅ · data-model.md ✅ · contracts/http-api.md ✅

**Reference implementation**: `/home/tiago/01-dev-env/personal-repos/grocery-store/apps/backend/src/` — check before writing any new file.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this phase)
- **[Story]**: Which user story ([US1]–[US5])

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Cross-cutting config, core abstractions, and domain type scaffolding — no server behaviour changes yet.

- [x] T001 Amend `.specify/memory/constitution.md` — update three locations: (1) Principle II: replace "Use tRPC for API boundaries" with Fastify + orval + OpenAPI; (2) Tech Stack table API row: tRPC → Fastify+orval; (3) Core Rules: replace "import type { AppRouter }" with "import from orval-generated typed functions in `apps/web/src/infrastructure/api/`"; bump version to 1.3.0
- [x] T002 Update `packages/core/src/domain-error.ts` — add `abstract readonly code: string` to `DomainError` base class
- [x] T003 [P] Update `biome.json` — add `useNamingConvention` rule: `camelCase` variables/functions, `PascalCase` classes/types/enums, `SCREAMING_SNAKE_CASE` module-level constants
- [x] T004 [P] Update `lefthook.yml` — add `pre-push` job with two commands: (1) `turbo check-types test` (unit only, parallel); (2) `check-orval: bun run orval && git diff --exit-code apps/web/src/infrastructure/api/` with `fail_text: "orval output stale — run orval and commit the generated files"`
- [x] T005 [P] Create `renovate.json` at repo root — weekly grouped PR for patch/minor, auto-merge patches that pass CI, separate PRs for major bumps
- [x] T006 [P] Update `packages/env/src/server.ts` — add `UNLEASH_API_URL` (string, url) and `UNLEASH_API_TOKEN` (string) to the Zod server schema
- [x] T007 [P] Update `docker-compose.yml` — add Unleash service: `unleashorg/unleash-server` image, Postgres DB for Unleash, health check, env wired to `UNLEASH_API_URL`/`UNLEASH_API_TOKEN`
- [x] T008 [P] Create `apps/server/src/domain/branded-ids/` — 9 files using `BrandedId` from `@church/core`: `event-id.ts`, `church-id.ts`, `ministry-id.ts`, `volunteer-id.ts`, `assignment-id.ts`, `time-slot-id.ts`, `role-id.ts`, `team-id.ts`, `availability-id.ts`; each exports `type XxxId = BrandedId<'XxxId'>` + `namespace XxxId { export function from(raw: string): XxxId }`
- [x] T009 Create `apps/server/src/domain/value-objects/date-range.ts` — `DateRange` VO: private constructor, `static create(start, end)` throws `InvalidDateRangeError` (code `INVALID_DATE_RANGE`) if `end <= start`, `contains(date)`, `overlaps(other)` methods (depends on T002)
- [x] T010 [P] Add `readonly code = 'SPECIFIC_CODE' as const` to all 14 domain error subclasses (depends on T002):
  - `apps/server/src/domain/errors/invalid-date-range.ts` → `INVALID_DATE_RANGE`
  - `apps/server/src/domain/errors/invalid-required-count.ts` → `INVALID_REQUIRED_COUNT`
  - `apps/server/src/domain/errors/isolation-breach-error.ts` → `ISOLATION_BREACH`
  - `apps/server/src/domain/assignment/errors/duplicate-slots-error.ts` → `DUPLICATE_SLOTS`
  - `apps/server/src/domain/assignment/errors/empty-schedule-error.ts` → `EMPTY_SCHEDULE`
  - `apps/server/src/domain/assignment/errors/invalid-event-duration.ts` → `INVALID_EVENT_DURATION`
  - `apps/server/src/domain/assignment/errors/invalid-slot-duration.ts` → `INVALID_SLOT_DURATION`
  - `apps/server/src/domain/assignment/errors/invalid-state-transition-error.ts` → `INVALID_STATE_TRANSITION`
  - `apps/server/src/domain/assignment/errors/past-event-error.ts` → `PAST_EVENT`
  - `apps/server/src/domain/assignment/errors/publish-validation-error.ts` → `PUBLISH_VALIDATION`
  - `apps/server/src/domain/conflict/errors/hard-constraint-error.ts` → `HARD_CONSTRAINT_VIOLATION`
  - `apps/server/src/domain/conflict/errors/invalid-override-reason-error.ts` → `INVALID_OVERRIDE_REASON`
  - `apps/server/src/domain/conflict/errors/unauthorized-override-error.ts` → `UNAUTHORIZED_OVERRIDE`
  - `packages/core/src/not-found-error.ts` → `NOT_FOUND`
- [x] T011 [P] Create `apps/server/src/main/fastify/types.ts` — `FastifyTypedInstance` type alias: `FastifyInstance` parametrised with `ZodTypeProvider` (see grocery-store `main/fastify/types.ts`)
- [x] T012 [P] Create `apps/server/src/api/contracts/fastify-controller.ts` — abstract `FastifyController` base class: `abstract readonly prefix: string`, `abstract registerRoutes(app: FastifyTypedInstance, opts: FastifyPluginOptions): void` (depends on T011)
- [x] T013 [P] Create `apps/server/src/main/di/injection-tokens.ts` — `injection` const with `infra`, `managers`, `controllers` namespaces per data-model.md DI Injection Tokens section

**Checkpoint**: Phase 1 complete — core types, tooling config, and DI token scaffold ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Restructure interfaces, move files to new locations, create Fastify factory and DI wiring, delete tRPC artifacts.

**⚠️ CRITICAL**: All Phase 3+ work depends on this phase being complete.

- [x] T014 Create `apps/server/src/application/contracts/unit-of-work.ts` and `apps/server/src/application/contracts/transaction-context.ts` — move (copy + delete) from `apps/server/src/domain/repositories/`; run `grep -r 'domain/repositories/unit-of-work\|domain/repositories/transaction-context' apps/server/src` and update all import references
- [x] T015 Create all 12 repository interface files in `apps/server/src/application/contracts/` — move from `apps/server/src/domain/repositories/`: `event.repository.ts`, `assignment.repository.ts`, `assignment-audit.repository.ts`, `availability.repository.ts`, `church.repository.ts`, `ministry.repository.ts`, `role.repository.ts`, `role-template.repository.ts`, `team.repository.ts`, `time-slot.repository.ts`, `volunteer.repository.ts`, `volunteer-notification.repository.ts`; run `grep -r 'domain/repositories' apps/server/src` and update all import references (depends on T014)
- [x] T016 [P] Create `apps/server/src/application/contracts/notification-service.ts` — move from `apps/server/src/domain/services/notification-service.ts`; run `grep -r 'domain/services/notification-service' apps/server/src` and update all references
- [x] T017 [P] Create `apps/server/src/application/contracts/feature-flag-service.ts` — new file: `IFeatureFlagService` interface (`isEnabled(flagName, ctx?)`, `getAll(ctx?)`) + `FeatureFlagContext` type per data-model.md
- [x] T018 Move all 13 mapper files from `apps/server/src/infrastructure/repositories/` to `apps/server/src/infrastructure/mappers/` — files: `assignment-audit.mapper.ts`, `assignment.mapper.ts`, `availability.mapper.ts`, `church.mapper.ts`, `event.mapper.ts`, `mapper-utils.ts`, `ministry.mapper.ts`, `role.mapper.ts`, `role-template.mapper.ts`, `slot.mapper.ts`, `team.mapper.ts`, `volunteer.mapper.ts`, `volunteer-notification.mapper.ts`; update `apps/server/src/infrastructure/repositories/index.ts` — remove re-exports of moved mapper files (depends on T015)
- [x] T019 Update all `apps/server/src/infrastructure/repositories/drizzle-*.ts` files — change imports from `domain/repositories/` → `application/contracts/`; change mapper imports to `infrastructure/mappers/` (depends on T015, T018)
- [x] T020 Create `apps/server/src/infrastructure/services/unleash-feature-flag-service.ts` — `UnleashFeatureFlagService implements IFeatureFlagService`, `@injectable()`; initialise Unleash client from `UNLEASH_API_URL`/`UNLEASH_API_TOKEN`; return `false` + log warning when Unleash unreachable (depends on T017, T006)
- [x] T021 Create `apps/server/src/main/fastify/setup.ts` — Fastify app factory: (1) pino config (JSON prod / pretty dev), (2) register `fastify-type-provider-zod` + `@fastify/swagger` + `@scalar/fastify-api-reference` (dev-only, `NODE_ENV !== 'production'`), (3) `setErrorHandler` with `code → { httpStatus, body }` mapping table for all 14 error codes from data-model.md + 500 fallback, (4) `onResponse` hook logging `method`, `url`, `statusCode`, `durationMs`, (5) `GET/POST /api/auth/*` Better-Auth passthrough outside `/api/v1/` prefix (depends on T011, T012)
- [x] T022 Create `apps/server/src/main/fastify/register-controllers.ts` — `registerControllers(app, opts)` Fastify plugin: `container.resolveAll(injection.controllers.fastify)` → `app.register(ctrl.registerRoutes.bind(ctrl), { prefix: ctrl.prefix })` (see grocery-store `main/fastify/register-controllers.ts`)
- [x] T023 Create `apps/server/src/main/di/injections.ts` — exports `registerInjections()` function: registers all 12 Drizzle repo implementations, `DrizzleUnitOfWork` → `IUnitOfWork`, `LocalNotificationService` → `INotificationService`, `UnleashFeatureFlagService` → `IFeatureFlagService`; batch tasks T037/T046/T055/T063/T071/T076 each add `container.register()` calls inside this same function (depends on T013, T014, T015, T016, T017, T019, T020)
- [x] T024 Create `apps/server/src/main/server.ts` — startup: `import 'reflect-metadata'` first, call `registerInjections()`, call `createFastify()`, `app.register(registerControllers, { prefix: '/api/v1' })`, `app.listen({ port, host })`; update `apps/server/package.json` start/main script to point to `src/main/server.ts` (depends on T021, T022, T023)
- [x] T025 Delete `apps/server/src/trpc.ts`, `apps/server/src/context.ts`, `apps/server/src/domain/mapper.ts`, `apps/server/src/infrastructure/repositories/registry.ts` (do AFTER T014–T019 moves complete)
- [x] T026 Delete `apps/server/src/domain/repositories/` directory (all contents moved to `application/contracts/` in T014–T015) and `apps/server/src/domain/services/notification-service.ts` (moved in T016) (do AFTER T014, T016 complete)

**Checkpoint**: Foundation ready — Fastify skeleton, DI container, interface locations resolved.

---

## Phase 3: User Story 1 — Backend Compiles and Serves Under New Structure (Priority: P1) 🎯 MVP

**Goal**: All 31 endpoints respond at `/api/v1/`; zero `@trpc/server` in dependency tree; all 6 aggregate batches green.

**Independent Test**: Seed DB → start server → hit one endpoint per aggregate → verify correct HTTP status per contracts/http-api.md → `grep -r '@trpc/server' .` returns nothing.

### Batch 1 — Auth/Session Bootstrap

- [x] T027 [US1] Write transport-agnostic behavior tests for server bootstrap in `apps/server/tests/behavior/server.behavior.test.ts` — verify server starts without uncaught exceptions; `/api/auth/*` passthrough delegates to Better-Auth handler (write + confirm tests pass BEFORE deletions)
- [x] T028 [US1] Delete `apps/server/src/routers/` directory (all 21 tRPC procedure files) and `apps/server/src/services/` directory (availability.ts + volunteer-dashboard/) — tRPC router + legacy service layer removed (depends on T024 server.ts wiring)
- [x] T029 [US1] Delete `apps/server/src/index.ts` — replaced by `main/server.ts` (depends on T024)
- [x] T030 [US1] Run `bun remove @trpc/server @trpc/client` in `apps/server/` — remove tRPC server packages from `apps/server/package.json` and `bun.lock`; verify `grep '@trpc' apps/server/package.json` returns nothing
- [x] T031 [US1] Write HTTP contract tests for auth passthrough in `apps/server/tests/http/auth.http.test.ts` — verify `GET/POST /api/auth/*` delegates to Better-Auth and responds (not 404); auth gate tests (`401`/`403`) deferred to T038 once first protected route exists

**Batch 1 Checkpoint**: Server starts. Auth passthrough works. No tRPC packages in server.

---

### Batch 2 — Ministry

- [x] T032 [P] [US1] Write behavior tests for Ministry operations in `apps/server/tests/behavior/ministry.behavior.test.ts` — seed DB, verify `listByLeader` returns only ministries where given volunteer is a leader (transport-agnostic, no tRPC wire format)
- [x] T033 [P] [US1] Create `apps/server/src/domain/contracts/ministry-manager.ts` — `IMinistryManager` interface: `listByLeader(input: { leaderId: VolunteerId; churchId: ChurchId }): Promise<Ministry[]>`
- [x] T034 [P] [US1] Create `apps/server/src/application/db-ministry-manager.ts` — `DbMinistryManager implements IMinistryManager`, `@injectable()`, inject `IMinistryRepository` (depends on T033)
- [x] T035 [P] [US1] Create `apps/server/src/api/dtos/ministry.dto.ts` — Zod response schemas + `ministryMapper.toResponse(ministry: Ministry)` and `toResponseList` (depends on T008 branded IDs)
- [x] T036 [US1] Create `apps/server/src/api/controllers/admin-leader-controller.ts` — `AdminLeaderController extends FastifyController`, `prefix = '/admin'`; `registerRoutes` adds a `preHandler` that: (1) reads Better-Auth session, (2) decorates `request.userId` and `request.churchId` from session, (3) checks role is `admin` or `leader`, returns `401`/`403` otherwise; implement `GET /admin/ministries` delegating to `IMinistryManager.listByLeader` (depends on T012, T033, T035)
- [x] T037 [US1] Update `apps/server/src/main/di/injections.ts` — register `IMinistryRepository` → `DrizzleMinistryRepository`, `IMinistryManager` → `DbMinistryManager`, `AdminLeaderController` (depends on T034, T036)
- [x] T038 [P] [US1] Write HTTP contract tests in `apps/server/tests/http/admin-ministry.http.test.ts` — verify `GET /api/v1/admin/ministries` returns `200` + correct DTO shape; verify `401` when no auth; verify `403` when authenticated but wrong role
- [x] T039 [US1] Verify Batch 2: `bun test` passes ministry behavior + HTTP tests

**Batch 2 Checkpoint**: `GET /admin/ministries` returns 200. Auth gate (401/403) works.

---

### Batch 3 — Volunteer

- [x] T040 [P] [US1] Write behavior tests in `apps/server/tests/behavior/volunteer.behavior.test.ts` — seed DB, verify: `getDashboard`, `getUpcomingAssignments`, `getAvailability`, `upsertAvailability`, `deleteAvailability`, `respondToAssignment`, `getNotifications`, `markNotificationRead`, `markAllNotificationsRead`
- [x] T041 [US1] Create `apps/server/src/domain/contracts/volunteer-manager.ts` — `IVolunteerManager` interface with all 10 methods per data-model.md (depends on T008)
- [x] T042 [US1] Create `apps/server/src/application/db-volunteer-manager.ts` — `DbVolunteerManager implements IVolunteerManager`, `@injectable()`, inject `IVolunteerRepository`, `IAvailabilityRepository`, `IVolunteerNotificationRepository`, `IUnitOfWork`, `INotificationService`; port logic from `apps/server/src/services/volunteer-dashboard/` (depends on T041)
- [x] T043 [P] [US1] Create `apps/server/src/api/dtos/volunteer.dto.ts` — Zod schemas + mappers for dashboard snapshot, upcoming assignments, availability, respond-to-assignment body (depends on T008)
- [x] T044 [P] [US1] Create `apps/server/src/api/dtos/notification.dto.ts` — Zod schemas + mappers for volunteer notifications (depends on T008)
- [x] T045 [US1] Create `apps/server/src/api/controllers/volunteer-controller.ts` — `VolunteerController extends FastifyController`, `prefix = '/volunteer'`; `preHandler` reads Better-Auth session, decorates `request.userId` and `request.churchId`, returns `401` if unauthenticated (no role check); all 10 `/volunteer/*` routes per contracts/http-api.md delegating to `IVolunteerManager` (depends on T012, T041, T043, T044)
- [x] T046 [US1] Update `apps/server/src/main/di/injections.ts` — register `IVolunteerRepository`, `IAvailabilityRepository`, `IVolunteerNotificationRepository`, `IVolunteerManager` → `DbVolunteerManager`, `VolunteerController` (depends on T042, T045)
- [x] T047 [P] [US1] Write HTTP contract tests in `apps/server/tests/http/volunteer.http.test.ts` — verify `200` GET, `200` PUT availability, `204` DELETE availability, `200` PATCH respond-to-assignment, `201` POST notifications/read-all; `401` for all without auth
- [x] T048 [US1] Verify Batch 3: `bun test` passes all volunteer behavior + HTTP tests

**Batch 3 Checkpoint**: All 10 `/volunteer/*` endpoints functional.

---

### Batch 4 — Event + TimeSlot

- [x] T049 [P] [US1] Write behavior tests in `apps/server/tests/behavior/event.behavior.test.ts` — seed DB, verify: `createEvent`, `listEvents`, `publishEvent`, `cancelEvent`, `createSlot`, `updateSlot`, `deleteSlot`, `generateSlots`, `upsertSlotRequirement`, `sendReminder`, `getScheduleBuilderData`; verify `INVALID_DATE_RANGE` thrown on bad date range
- [x] T050 [US1] Create `apps/server/src/domain/contracts/event-manager.ts` — `IEventManager` interface with all 11 methods per data-model.md (depends on T008, T009)
- [x] T051 [US1] Create `apps/server/src/application/db-event-manager.ts` — `DbEventManager implements IEventManager`, `@injectable()`, inject `IEventRepository`, `ITimeSlotRepository`, `IUnitOfWork`, `INotificationService`; use `DateRange.create()` for date validation; port logic from existing router procedures (depends on T050, T009)
- [x] T052 [P] [US1] Create `apps/server/src/api/dtos/event.dto.ts` — Zod schemas (`createEventBody`, `listEventsQuery`, `eventResponse`, `scheduleBuilderDataResponse`) + domain→DTO mappers (depends on T008)
- [x] T053 [P] [US1] Create `apps/server/src/api/dtos/time-slot.dto.ts` — Zod schemas for slot create/update/generate bodies + `slotRequirementBody` + `timeSlotResponse` + mappers (depends on T008)
- [x] T054 [US1] Extend `apps/server/src/api/controllers/admin-leader-controller.ts` — add all event + slot routes: `GET /admin/schedule-builder`, `GET/POST /admin/events`, `POST /admin/events/:id/publish|cancel|reminders|apply-template`, `POST /admin/events/:id/slots`, `PATCH /admin/events/:id/slots/:slotId`, `DELETE /admin/events/:id/slots/:slotId`, `POST /admin/events/:id/slots/generate`, `PUT /admin/events/:id/slots/:slotId/requirements`; delegate to `IEventManager` (depends on T050, T052, T053)
- [x] T055 [US1] Update `apps/server/src/main/di/injections.ts` — register `IEventRepository` → `DrizzleEventRepository`, `ITimeSlotRepository` → `DrizzleTimeSlotRepository`, `IEventManager` → `DbEventManager` (depends on T051)
- [x] T056 [P] [US1] Write HTTP contract tests in `apps/server/tests/http/admin-events.http.test.ts` — verify `201` POST events/slots/publish/cancel/reminders/generate/apply-template, `204` DELETE slot, `200` GET, `200` PATCH slot, `200` PUT requirement; verify `400` with body `{ error: 'INVALID_DATE_RANGE' }` on bad dates
- [x] T057 [US1] Verify Batch 4: `bun test` passes all event behavior + HTTP tests

**Batch 4 Checkpoint**: All 12 admin event/slot endpoints functional.

---

### Batch 5 — Assignment

- [x] T058 [P] [US1] Write behavior tests in `apps/server/tests/behavior/assignment.behavior.test.ts` — seed DB, verify: `createAssignment`, `deleteAssignment`, `listAuditLog`; verify `HARD_CONSTRAINT_VIOLATION` thrown when assigning conflicting volunteer
- [x] T059 [US1] Create `apps/server/src/domain/contracts/assignment-manager.ts` — `IAssignmentManager` interface: `createAssignment`, `deleteAssignment`, `listAuditLog` per data-model.md (depends on T008)
- [x] T060 [US1] Create `apps/server/src/application/db-assignment-manager.ts` — `DbAssignmentManager implements IAssignmentManager`, `@injectable()`, inject `IAssignmentRepository`, `IAssignmentAuditRepository`, `IUnitOfWork`; use domain assignment + conflict validation services (depends on T059)
- [x] T061 [P] [US1] Create `apps/server/src/api/dtos/assignment.dto.ts` — Zod schemas for `createAssignmentBody`, `assignmentResponse`, `assignmentAuditResponse` + mappers (depends on T008)
- [x] T062 [US1] Extend `apps/server/src/api/controllers/admin-leader-controller.ts` — add: `POST /admin/assignments` (201), `DELETE /admin/assignments/:assignmentId` (204), `GET /admin/assignments/:assignmentId/audit` (200); delegate to `IAssignmentManager` (depends on T059, T061)
- [x] T063 [US1] Update `apps/server/src/main/di/injections.ts` — register `IAssignmentRepository`, `IAssignmentAuditRepository`, `IAssignmentManager` → `DbAssignmentManager` (depends on T060)
- [x] T064 [P] [US1] Write HTTP contract tests in `apps/server/tests/http/admin-assignments.http.test.ts` — verify `201` POST, `204` DELETE, `200` GET audit; verify `409` with `{ error: 'HARD_CONSTRAINT_VIOLATION' }` on conflict
- [x] T065 [US1] Verify Batch 5: `bun test` passes all assignment behavior + HTTP tests

**Batch 5 Checkpoint**: All 3 admin assignment endpoints functional.

---

### Batch 6 — Role + Team

- [x] T066 [P] [US1] Write behavior tests in `apps/server/tests/behavior/role.behavior.test.ts` — seed DB, verify: `listTemplates`, `upsertTemplate`, `applyTemplate`, `deleteTemplate`
- [x] T067 [US1] Create `apps/server/src/domain/contracts/role-manager.ts` — `IRoleManager` interface with 4 methods per data-model.md (depends on T008)
- [x] T068 [US1] Create `apps/server/src/application/db-role-manager.ts` — `DbRoleManager implements IRoleManager`, `@injectable()`, inject `IRoleRepository`, `IRoleTemplateRepository`, `ITeamRepository` (depends on T067)
- [x] T069 [P] [US1] Create `apps/server/src/api/dtos/role.dto.ts` — Zod schemas for `upsertRoleTemplateBody`, `roleTemplateResponse` + mappers (depends on T008)
- [x] T070 [US1] Extend `apps/server/src/api/controllers/admin-leader-controller.ts` — add: `GET /admin/role-templates` (200), `PUT /admin/role-templates/:templateId` (200), `DELETE /admin/role-templates/:templateId` (204); delegate to `IRoleManager` (depends on T067, T069)
- [x] T071 [US1] Update `apps/server/src/main/di/injections.ts` — register `IRoleRepository`, `IRoleTemplateRepository`, `ITeamRepository`, `IRoleManager` → `DbRoleManager` (depends on T068)
- [x] T072 [P] [US1] Write HTTP contract tests in `apps/server/tests/http/admin-roles.http.test.ts` — verify `200` GET list, `200` PUT upsert, `204` DELETE
- [x] T073 [US1] Verify Batch 6: `bun test` passes all role behavior + HTTP tests

**Batch 6 Checkpoint**: All 3 role-template endpoints functional.

---

### Feature Flags (cross-cutting)

- [x] T074 [P] [US1] Create `apps/server/src/api/controllers/feature-flag-controller.ts` — `FeatureFlagController extends FastifyController`, `prefix = '/feature-flags'`, no auth `preHandler`; `GET /feature-flags` → `IFeatureFlagService.getAll(ctx)` enriched with `userId`/`churchId` from session if authenticated (depends on T012, T017)
- [x] T075 [P] [US1] Create `apps/server/src/api/dtos/feature-flags.dto.ts` — response schema `z.object({ flags: z.record(z.string(), z.boolean()) })`
- [x] T076 [US1] Update `apps/server/src/main/di/injections.ts` — register `FeatureFlagController` (depends on T074)
- [x] T077 [US1] Generate and commit `apps/server/auto-generated-api.yaml` — start server, export OpenAPI spec via Scalar/Swagger endpoint (`GET /documentation/yaml` or equivalent), commit file to repository (this file is the orval input)

**US1 Checkpoint**: All 31 endpoints respond correctly. `grep -r '@trpc/server' .` returns nothing.

---

## Phase 4: User Story 2 — Import Boundary Violations Caught at Lint Time (Priority: P2)

**Goal**: Biome `noRestrictedImports` overrides in `biome.json` enforce the 5-layer directed graph; `biome check` surface violations with verbose, actionable error messages.

**Independent Test**: Add `import ... from '../../infrastructure/repositories/drizzle-event.repository'` inside `apps/server/src/api/controllers/admin-leader-controller.ts` → run `biome check apps/server/src` → exits non-zero with `lint/style/noRestrictedImports` error message naming the violated rule → revert → exits 0.

- [x] T078 [US2] Add `overrides` blocks to `biome.json` — four blocks enforcing the directed layer graph via `noRestrictedImports` with verbose `message` fields:
  - `include: ["apps/server/src/api/**"]` → restrict `**/infrastructure/**` ("api/ → domain/ only. Direct infrastructure import forbidden.") and `**/application/**` ("api/ → domain/ only. Import manager interface from domain/contracts/ instead.")
  - `include: ["apps/server/src/domain/**"]` → restrict `**/infrastructure/**`, `**/application/**`, `**/api/**` (all forbidden from domain/)
  - `include: ["apps/server/src/application/**"]` → restrict `**/infrastructure/**` and `**/api/**`
  - `include: ["apps/server/src/infrastructure/**"]` → restrict `**/api/**`
  - `main/` has no override — unrestricted as wiring layer
- [x] T079 [US2] Run `biome check apps/server/src` — inspect output; fix any existing boundary violations surfaced by the new rules
- [x] T080 [US2] Verify boundary enforcement: temporarily add forbidden import in `apps/server/src/api/controllers/admin-leader-controller.ts` → confirm `biome check` exits non-zero with specific `noRestrictedImports` error → revert → confirm clean exit

**US2 Checkpoint**: `biome check` is the single command covering formatting + naming conventions + boundary enforcement.

---

## Phase 5: User Story 3 — CI Gate Passes on Every PR (Priority: P2)

**Goal**: GitHub Actions fast gate on every PR: type-check + `biome check` (which now includes boundary lint) + unit tests. E2E on master only. Lefthook pre-push enforces types + tests + orval freshness locally.

**Independent Test**: Open PR with deliberate TypeScript type error → `check-types` job fails and blocks merge. Fix error → all jobs green in under 2 minutes.

- [x] T081 [US3] Update `turbo.json` — add `check-types` and `test` pipeline tasks if not present; add `lint` task that runs `biome check` (includes boundary enforcement from T078); ensure tasks have correct dependencies so `turbo lint` works from root
- [x] T082 [US3] Create `.github/workflows/ci.yml` — **fast gate** (every PR): `turbo check-types`, `turbo lint` (biome check including boundary rules), `turbo test` (unit only); target ≤ 2 minutes; **E2E gate** (master merges only): separate job running E2E suite; web typecheck (`turbo check-types --filter=@church/web`) runs on committed orval-generated files — no orval regeneration in CI
- [x] T083 [US3] Verify lefthook pre-push: create a test commit on a clean branch, observe pre-push output — confirm both `turbo check-types test` and the orval freshness check (`bun run orval && git diff --exit-code`) execute and pass

**US3 Checkpoint**: CI green on clean branch; type error blocks PR; biome boundary check runs in CI.

---

## Phase 6: User Story 4 — Frontend Typed Client Generated From Server Contract (Priority: P3)

**Goal**: orval generates typed async functions (no hooks) locally; generated files committed; lefthook pre-push hook (T004) enforces they stay current; tRPC client fully removed from web.

**Independent Test**: Change a response field name in one endpoint's Zod schema → run orval locally → generated type in `apps/web/src/infrastructure/api/admin.ts` reflects the change → `turbo check-types --filter=@church/web` catches callers using old name. Attempting to push without regenerating → pre-push hook aborts with "orval output stale."

**Depends on T077 (`auto-generated-api.yaml` must be committed).**

- [x] T084 [US4] Create `orval.config.ts` at monorepo root — `client: 'axios'`, `mode: 'tags'`, `input: './apps/server/auto-generated-api.yaml'`, `output` target `'./apps/web/src/infrastructure/api/'`, `clean: true`; no `override.query` block (typed async functions only, not hooks)
- [x] T085 [US4] Run `bun run orval` at monorepo root — generates `apps/web/src/infrastructure/api/admin.ts`, `volunteer.ts`, `feature-flags.ts`; commit generated files (depends on T084, T077)
- [x] T086 [US4] Run `bun remove @trpc/client` in `apps/web/` — remove tRPC client packages from `apps/web/package.json` and `bun.lock`; verify `grep '@trpc' apps/web/package.json` returns nothing
- [x] T087 [US4] Port all tRPC query/mutation calls in `apps/web/src/` to orval-generated axios functions — hand-written hooks replace `trpc.*.queryOptions()` / `trpc.*.useMutation()` with calls to generated typed functions from `@/infrastructure/api/admin`, `@/infrastructure/api/volunteer`, `@/infrastructure/api/feature-flags` (depends on T085, T086)
- [x] T088 [US4] Run `turbo check-types --filter=@church/web` — verify zero TypeScript errors in migrated frontend (depends on T087)

**US4 Checkpoint**: Web builds with zero type errors using orval-generated client. No `@trpc` imports remain in `apps/web/`.

---

## Phase 7: User Story 5 — Domain Logic Protected By Coverage Thresholds (Priority: P3)

**Goal**: `domain/` 100% branch, `application/` 80% line — both hard gates in CI.

**Independent Test**: Remove the `end <= start` branch test from `DateRange` → `bun run test --coverage` fails with threshold violation before commit.

- [ ] T089 [US5] Update `apps/server/vitest.config.ts` — add `coverage: { provider: 'v8', thresholds: { 'src/domain': { branches: 100 }, 'src/application': { lines: 80 } } }`
- [ ] T090 [US5] Run `bun run test --coverage` in `apps/server/` — inspect report; write missing domain branch tests (VOs, error code paths) until `domain/` hits 100% branch; write missing application tests until `application/` hits 80% line
- [ ] T091 [US5] Add coverage gate to `.github/workflows/ci.yml` fast gate — `turbo test --coverage` step; fails PR if thresholds not met (depends on T089, T082)

**US5 Checkpoint**: Coverage gate passes. Removing a domain test causes CI to fail.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T092 [P] Migrate `VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE` env var to Unleash toggle: remove from `packages/env/src/server.ts`, replace all usages with `IFeatureFlagService.isEnabled('volunteer-dashboard-allow-overlap-save')` in DbVolunteerManager (FR-025)
- [ ] T093 [P] Document `volunteer-dashboard-allow-overlap-save` Unleash feature flag in docker-compose setup — add init script or README note so toggle exists with `false` default on first Unleash start
- [ ] T094 Final full verification: `turbo check-types && turbo lint && turbo test --coverage` all pass; `grep -r '@trpc/server' .` and `grep -r '@trpc/client' .` return nothing; all 31 HTTP endpoints respond with correct status codes; CI green on a push

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Phase 1 (T001–T013)         no dependencies — start immediately
Phase 2 (T014–T026)         depends on Phase 1 complete
Phase 3 US1 (T027–T077)     depends on Phase 2 complete
Phase 4 US2 (T078–T080)     depends on Phase 3 (needs new folder structure in place)
Phase 5 US3 (T081–T083)     depends on Phase 3 + Phase 4 (CI yaml uses biome check including boundaries)
Phase 6 US4 (T084–T088)     depends on Phase 3 (T077 auto-generated-api.yaml required)
Phase 7 US5 (T089–T091)     depends on Phase 3 + behavior tests from batches in place
Phase 8 Polish (T092–T094)  depends on all phases complete
```

### Within-Phase Key Dependencies

- T002 → T009, T010 (DomainError abstract code before subclasses)
- T011 → T012 (FastifyTypedInstance before FastifyController)
- T014 → T015 (unit-of-work before repo interfaces — repos import ITransactionContext)
- T015, T018 → T019 (move interfaces + mappers before updating Drizzle repo imports)
- T019 → T023 (injections.ts registers Drizzle repos — needs clean imports)
- T021, T022, T023 → T024 (server.ts depends on all three)
- T014–T019 → T025, T026 (deletions after moves)
- T036 (AdminLeaderController, Batch 2) grows through T054, T062, T070 (Batches 4–6)
- T023 (injections.ts) grows incrementally — T037, T046, T055, T063, T071, T076 each add to it
- T077 (auto-generated-api.yaml) → T084 (orval config) → T085 (orval run)
- T081 → T082 (turbo.json pipeline entries before CI yaml references them)

### Parallel Opportunities

**Phase 1**: T003–T008, T011, T013 run in parallel. T009 + T010 run in parallel after T002.

**Phase 2**: T014–T017 run in parallel (different new files). T018 after T015. T019 after T015+T018. T020–T022 run in parallel after their deps.

**Each Batch**: Per-aggregate behavior tests [P] and DTO files [P] run in parallel. Manager interface before implementation (sequential). HTTP tests [P] run after controller exists.

**US4 + US5**: Run in parallel with each other once US1 is complete.

---

## Parallel Execution Example: Batch 4 (Event + TimeSlot)

```text
# Run in parallel:
T049: Write event behavior tests
T052: Create event.dto.ts
T053: Create time-slot.dto.ts

# Then sequentially:
T050: Create event-manager.ts (interface)
T051: Create db-event-manager.ts (depends on T050)
T054: Extend admin-leader-controller.ts (depends on T050, T052, T053)
T055: Update injections.ts (depends on T051)
T056: Write HTTP contract tests (depends on T054 routes existing)
T057: Verify — run all tests
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Phase 1 → 2: Core types + skeleton
2. Batch 1: Server boots, auth passthrough works
3. **VALIDATE**: `bun run dev` shows no errors
4. Batches 2–6 + Feature Flags in priority order
5. **STOP AND VALIDATE** after T077: all 31 endpoints respond, no `@trpc/server`

### Incremental Delivery

1. Batch 1 → Server boots (no routes yet)
2. Batch 2 → Ministries endpoint + auth gate live
3. Batch 3 → Full volunteer surface live
4. Batches 4–6 → Full admin surface live
5. US2 → Boundary enforcement on (runs as part of biome check)
6. US3 → CI gate live
7. US4 → Frontend migrated, orval committed
8. US5 → Coverage gates enforced

---

## Notes

- `[P]` = different files, no incomplete-task dependencies — safe to parallelize
- Behavior tests (T027, T032, T040, T049, T058, T066) MUST be written and passing BEFORE the corresponding deletion/migration tasks
- Each batch completes before moving to next — `bun test` green at every checkpoint
- No test may capture tRPC wire format `{ result: { data: {...} } }` (FR-023)
- `AdminLeaderController` grows across Batches 2–6 (T036 → T054 → T062 → T070): all additions are additive within one file
- `main/di/injections.ts` grows across Batches 1–6 and Feature Flags: always append inside `registerInjections()`, never replace
- Boundary enforcement runs as part of `biome check` — no separate lint command; same CI step, same pre-commit hook
- orval-generated files are committed to the repo; the pre-push hook (T004) enforces they stay current; CI does not regenerate them
- Check grocery-store equivalent file before writing any new file in `api/`, `application/`, `main/`
- `IChurchManager` deferred — no current HTTP endpoint or FR drives it; add when a concrete use case exists
