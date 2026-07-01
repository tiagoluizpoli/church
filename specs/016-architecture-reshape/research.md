# Research: Monorepo Architecture Reshape

**Phase**: 0 | **Feature**: [plan.md](plan.md) | **Date**: 2026-07-01

All decisions pre-resolved by the 2026-06-30 grilling session (22 Q&A). No unknowns remain. This file documents each decision with its rationale and the grocery-store evidence confirming viability.

---

## Decision 1 — Use case style: aggregate managers (classes, one per aggregate)

- **Decision**: Application layer uses OOP manager classes (`DbEventManager implements IEventManager`), one per aggregate, not one per action.
- **Rationale**: Avoids proliferation of 30+ use-case files; natural grouping maps to domain aggregates; grocery-store validates this at production scale.
- **Grocery-store evidence**: `apps/backend/src/application/usecases/db-market-manager.ts`, `db-group-manager.ts`, etc. — each manager handles all operations for one aggregate.
- **Layer placement (refined post-grilling)**:
  - `domain/contracts/` — use-case interfaces (`IEventManager`, `IVolunteerManager`, etc.): domain owns "what the system CAN DO"
  - `application/` — use-case implementations (`DbEventManager`): orchestration that fulfills the domain contracts
  - `application/contracts/` — infrastructure interfaces (`IEventRepository`, `IUnitOfWork`, `INotificationService`, `IFeatureFlagService`): application owns "what it NEEDS FROM infrastructure"
  - `infrastructure/` — concrete implementations of `application/contracts/` interfaces
- **Church deviation from grocery-store**: Grocery-store puts both manager interfaces and repo interfaces in `application/contracts/`. Church puts manager interfaces in `domain/contracts/` instead, keeping domain as the authority over use-case contracts. Repo interfaces move from `domain/repositories/` (current) to `application/contracts/` (new).

---

## Decision 2 — DI: tsyringe with @injectable / @inject

- **Decision**: tsyringe IoC container. Decorators on all managers and controllers. Wiring centralized in `main/di/injections.ts`.
- **Rationale**: Developer already has tsyringe experience. Grocery-store is the reference — same container, same token pattern.
- **Grocery-store evidence**: `main/di/injections.ts` — `container.register<IMarketManager>(usecases.marketManager, DbMarketManager)` pattern. Token constants in `main/di/injection-tokens.ts`.
- **Biome note**: `biome.json` already has `"unsafeParameterDecoratorsEnabled": true` in the JS parser config — tsyringe decorators will work without changes.

---

## Decision 3 — Transport: raw Fastify + fastify-type-provider-zod (drop tRPC)

- **Decision**: Delete `trpc.ts`, `context.ts`, `routers/`. Replace with abstract `FastifyController` base class. Auto-discovery via `container.resolveAll(controllers.fastify)`.
- **Rationale**: tRPC was a template artifact. Raw Fastify gives standard HTTP semantics (status codes, REST paths), native OpenAPI spec generation, and standard tooling (orval, Scalar, Swagger).
- **Grocery-store evidence**: `api/contracts/fastify-controller.ts` — abstract class with `prefix` + `registerRoutes(app, opts)`. `main/fastify/register-controllers.ts` — loops over `resolveAll` and calls `app.register(ctrlr.registerRoutes.bind(ctrlr), { prefix: ctrlr.prefix })`.
- **Church deviation**: The `prefix` in grocery-store is auto-derived from class name; church will set it manually or keep the same auto-derive approach — either is fine.
- **API versioning**: `app.register(registerControllers, { prefix: '/api/v1' })` in `main/server.ts`. Individual controllers do not repeat the version prefix.

---

## Decision 4 — Folder structure: api / application / domain / infrastructure / main

- **Decision**: Mirror grocery-store exactly. No renaming.
- **Rationale**: Developer uses this repo as the gold standard. Reusing the exact names means mental model transfers directly.
- **Grocery-store evidence**: `apps/backend/src/` has exactly these five top-level directories.
- **Current → new mappings**:
  - `routers/` → `api/controllers/` + `api/contracts/` + `api/dtos/`
  - `services/` → `application/` (absorbed into manager classes)
  - `infrastructure/repositories/*.mapper.ts` → `infrastructure/mappers/`
  - `infrastructure/repositories/registry.ts` → DELETE (tsyringe replaces)
  - `domain/mapper.ts` → split: DB mappers to `infrastructure/mappers/`, DTO mappers to `api/dtos/`
  - `context.ts` → logic absorbed into `main/fastify/setup.ts`
  - `index.ts` → `main/server.ts`

---

## Decision 5 — Frontend client: orval with client: 'axios'

- **Decision**: orval generates typed async functions (not hooks) into `apps/web/src/infrastructure/api/`. Hand-written React hooks call these functions.
- **Rationale**: Avoids coupling to React Query in generated code. Frontend hooks stay hand-written, giving full control. Same pattern used in church frontend today (hooks call tRPC) — just swapping the typed call site.
- **Grocery-store evidence**: `orval.config.ts` uses `client: 'react-query'` — church will use `client: 'axios'` instead (simpler, no hook generation).
- **Church orval config**: Input: `./apps/server/auto-generated-api.yaml`. Output target: `./apps/web/src/infrastructure/api/`. Mode: `tags` (one file per OpenAPI tag). `clean: true`. No `override.query` block needed.
- **Turbo pipeline**: `orval` step runs after `@church/server#build` and before `@church/web#check-types`.

---

## Decision 6 — Value Objects and Branded IDs

- **Decision**: Full VO layer. `DateRange` is the first VO target. All domain IDs become branded types with namespace factories.
- **Rationale**: AI generates most code — maximum type system safeguards prevent ID misuse. VOs own invariants (no duplication in Zod schemas and constructors simultaneously).
- **Pattern**:
  ```typescript
  // Branded ID
  type EventId = string & { __brand: 'EventId' };
  namespace EventId {
    export function from(raw: string): EventId { return raw as EventId; }
  }

  // Value Object
  class DateRange {
    private constructor(readonly start: Date, readonly end: Date) {}
    static create(start: Date, end: Date): Result<DateRange, DomainError> { ... }
  }
  ```
- **BrandedId utility** in `packages/core/branded-id.ts` already exists — church domain IDs can use it or use the inline `type + namespace` pattern. The namespace pattern is preferred for the factory method.

---

## Decision 7 — Mapper location

- **Decision**: `infrastructure/mappers/` for DB↔domain. `api/dtos/` for domain↔HTTP (Zod schemas co-located with mappers by aggregate).
- **Rationale**: Keeps infra concern (DB row translation) separate from API concern (HTTP shape). `api/helpers/` name rejected as vague.
- **Current state**: Mappers live alongside repos in `infrastructure/repositories/`. Moving them to `infrastructure/mappers/` is a pure file move with import path updates.

---

## Decision 8 — Import boundary enforcement: Biome `noRestrictedImports` overrides

- **Decision**: Biome v2 `noRestrictedImports` rule with `overrides` per layer directory enforces the directed layer graph at lint time. Runs as part of `biome check` — no separate tool, no ESLint.
- **Allowed graph (refined)**:
  - `api/` → `domain/` only (for IEventManager and other use-case interface types injected into controllers; never imports `infrastructure/` or `application/` directly)
  - `application/` → `domain/` + `application/contracts/` (self-layer, for infra interfaces)
  - `domain/` → `packages/core` only
  - `infrastructure/` → `application/contracts/` (for repo/service interfaces to implement) + `domain/` (for entity types used in mappers) + `packages/db` + `packages/core`
  - `main/` → unrestricted (wiring layer, no override)
- **Implementation**: four `overrides` blocks in `biome.json`, each with `noRestrictedImports` patterns using gitignore-style globs (`**/infrastructure/**`, `**/application/**`, etc.) and verbose `message` fields so violations are AI-readable. Violation output names the exact layer rule broken.
- **Key difference from grilling session memo**: Original grilling said `api/ → application/ only`. With manager interfaces now in `domain/`, controllers import IEventManager from `domain/`, making `api/ → domain/` the correct rule.
- **ESLint not used**: No `eslint-plugin-boundaries`, no `eslint.config.mjs`. Biome handles formatting, naming conventions, and now boundary enforcement in one command.

---

## Decision 9 — Error handling: centralized Fastify setErrorHandler

- **Decision**: `DomainError` gains `abstract readonly code: string`. One mapping table in `main/fastify/setup.ts`: `code → { httpStatus, body }`. Response shape: `{ error: code, message }`.
- **Current state**: `packages/core/src/domain-error.ts` has no `code` property. Each subclass in `apps/server/src/domain/errors/` must add `readonly code = 'SPECIFIC_CODE' as const` after the base class is updated.
- **Current domain errors** that need codes:
  - `invalid-date-range.ts` → `'INVALID_DATE_RANGE'`
  - `invalid-required-count.ts` → `'INVALID_REQUIRED_COUNT'`
  - `isolation-breach-error.ts` → `'ISOLATION_BREACH'`
  - `assignment/errors/duplicate-slots-error.ts` → `'DUPLICATE_SLOTS'`
  - `assignment/errors/empty-schedule-error.ts` → `'EMPTY_SCHEDULE'`
  - `assignment/errors/invalid-event-duration.ts` → `'INVALID_EVENT_DURATION'`
  - `assignment/errors/invalid-slot-duration.ts` → `'INVALID_SLOT_DURATION'`
  - `assignment/errors/invalid-state-transition-error.ts` → `'INVALID_STATE_TRANSITION'`
  - `assignment/errors/past-event-error.ts` → `'PAST_EVENT'`
  - `assignment/errors/publish-validation-error.ts` → `'PUBLISH_VALIDATION'`
  - `conflict/errors/hard-constraint-error.ts` → `'HARD_CONSTRAINT_VIOLATION'`
  - `conflict/errors/invalid-override-reason-error.ts` → `'INVALID_OVERRIDE_REASON'`
  - `conflict/errors/unauthorized-override-error.ts` → `'UNAUTHORIZED_OVERRIDE'`
  - `packages/core/not-found-error.ts` → `'NOT_FOUND'` (will need code in base NotFoundError or per-subclass)

---

## Decision 10 — Auth middleware: controller-level preHandler

- **Decision**: `app.addHook('preHandler', authMiddleware)` at top of `registerRoutes()`. `AdminLeaderController` adds auth + role check. `VolunteerController` adds auth only. Per-route override for public exceptions.
- **Better-Auth integration**: Current `index.ts` routes `GET/POST /api/auth/*` to `auth.handler`. This passthrough stays — it becomes a dedicated `AuthController` or a raw route in `main/fastify/setup.ts` outside the versioned prefix.
- **Grocery-store evidence**: `market-controller.ts` — `app.addHook('preHandler', authMiddleware)` at top of `registerRoutes()`.

---

## Decision 11 — Logging: pino + onResponse hook

- **Decision**: Fastify `onResponse` hook in `main/fastify/setup.ts` logs `method`, `url`, `statusCode`, `durationMs`. Auth middleware decorates `request.userId` + `request.churchId`. JSON in prod, pretty-print in dev.
- **Current state**: `index.ts` creates `Fastify({ logger: true })` — basic pino. No structured request fields. No userId/churchId decoration.
- **Change**: `setup.ts` configures pino with custom serializers + `onResponse` hook.

---

## Decision 12 — UnitOfWork: managers own transactions

- **Decision**: `IUnitOfWork` injected into managers via tsyringe. Managers call `this.uow.run(async (tx) => { ... })` for multi-step writes. Repos accept optional `tx` param.
- **Current state**: `IUnitOfWork` already at `domain/repositories/unit-of-work.ts`. `DrizzleUnitOfWork` at `infrastructure/repositories/drizzle-unit-of-work.ts`. Both stay in place. Managers get `@inject(tokens.unitOfWork) private readonly uow: IUnitOfWork`.

---

## Decision 13 — CI/CD: GitHub Actions

- **Fast gate** (every PR): `check-types` + `biome check` + unit tests + boundary lint. Target: ≤ 2 min.
- **E2E gate** (merge to master only): Playwright or equivalent.
- **orval verification**: In fast gate — server build → orval generate → web check-types.
- **No `.github/` directory exists yet** — must create from scratch.
- **Turbo integration**: CI runs `turbo check-types`, `turbo test`, `turbo build` — all turborepo-aware for caching.

---

## Decision 14 — Renovate

- **Config**: `renovate.json` at repo root.
- **Behavior**: Weekly PR for grouped patch/minor; auto-merge patches that pass CI; major bumps as separate PRs.
- **Covers**: `package.json`, `bun.lock`, `docker-compose.yml`, GitHub Actions workflow versions.

---

## Decision 15 — Feature Flags: Unleash self-hosted

- **Architecture**: `IFeatureFlagService` in `application/contracts/feature-flag-service.ts`. `UnleashFeatureFlagService` in `infrastructure/services/unleash-feature-flag-service.ts`.
- **Frontend access**: `GET /api/v1/feature-flags` backend proxy. Unleash token never client-side.
- **Env**: `UNLEASH_API_URL` + `UNLEASH_API_TOKEN` added to `packages/env/src/server.ts`.
- **Migration**: `VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE` env var replaced by Unleash toggle `volunteer-dashboard-allow-overlap-save`.
- **Docker**: Unleash service added to `docker-compose.yml` (official `unleashorg/unleash-server` image).
- **Fallback**: `UnleashFeatureFlagService.isEnabled()` returns `false` and logs a warning when Unleash is unreachable.

---

## Decision 16 — Coverage thresholds

- **`domain/`**: 100% branch coverage (hard gate).
- **`application/`**: 80% line coverage (hard gate).
- **`infrastructure/`**: no threshold (covered by contract tests).
- **Tool**: Vitest with `provider: 'v8'`, per-directory `thresholds` config.

---

## Decision 17 — Naming conventions

- **Biome `useNamingConvention`** (to add to `biome.json`): `camelCase` vars/functions, `PascalCase` classes/types/enums, `SCREAMING_SNAKE_CASE` module-level consts.
- **Hard convention** (CLAUDE.md): `I`-prefix for interfaces, file suffixes `.dto.ts`, `.manager.ts`, `.repository.ts`, `.mapper.ts`, `.controller.ts`.

---

## Decision 18 — packages/core boundary

- **Stays minimal**: `Entity`, `DomainError` (gains `abstract readonly code: string`), `BrandedId` utility type, `NotFoundError`.
- **Domain-specific types** (`EventId`, `DateRange`, etc.) stay in `apps/server/src/domain/`.
- **Promotion rule**: Only extract to a package when a second real consumer exists.

---

## Spec Coverage Audit (Grilling Q&A vs Spec FR)

| Grilling Q | Spec FR | Covered |
|-----------|---------|---------|
| Q1 — Use case classes | FR-002 | ✅ |
| Q2 — tsyringe | FR-002 | ✅ |
| Q2b — Drop tRPC, Fastify | FR-003 | ✅ |
| Q3 — Folder structure | FR-001 | ✅ |
| Q3b — orval axios | FR-015 | ✅ |
| Q4 — Full VO/branded | FR-009 | ✅ |
| Q5 — Mapper location | FR-010 | ✅ |
| Q6 — Boundary lint | FR-008 | ✅ |
| Q7 — packages/core minimal | FR-024 | ✅ |
| Q8 — Aggregate managers naming | Key Entities section | ✅ |
| Q9 — Centralized error handler + status codes | FR-005, FR-006 | ✅ |
| Q10 — Big-bang per aggregate | FR-021 | ✅ |
| Q11 — GitHub Actions CI | FR-016 | ✅ |
| Q12 — Pre-push lefthook | FR-017 | ✅ |
| Q13 — Coverage thresholds | FR-018 | ✅ |
| Q14 — Naming conventions | FR-019 + Key Entities | ✅ |
| Q15 — Migration testing (behavior + HTTP) | FR-021, FR-023 | ✅ |
| Q16 — Auth preHandler | FR-007 | ✅ |
| Q17 — API versioning /api/v1/ | FR-004 | ✅ |
| Q18 — Structured logging | FR-012 | ✅ |
| Q19 — UnitOfWork / transactions | FR-011 | ✅ |
| Q20 — Scalar/Swagger dev-only | FR-013 | ✅ |
| Q21 — Unleash feature flags | FR-014, FR-025 | ✅ |
| Q22 — Renovate | FR-020 | ✅ |

**Result**: All 22 grilling decisions are covered in the spec. No gaps found.
