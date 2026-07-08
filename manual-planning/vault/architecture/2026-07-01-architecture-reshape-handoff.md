# Handoff: Church Monorepo Architecture Reshape

Date: 2026-07-01
From: Architecture grilling session (2026-06-30)
Next focus: Generate implementation plan + begin execution

---

## What Was Decided

A complete architecture grilling session was completed. Every decision is documented with full context in:

**Primary source of truth:**
`/home/tiago/01-dev-env/personal-repos/church/church/manual-planning/2026-06-30-architecture-grill.md`

Read that file first. Do not re-derive decisions from this handoff — the grilling file is authoritative.

**Reference implementation:**
`/home/tiago/01-dev-env/personal-repos/grocery-store`

This is a working repo by the same developer using the exact same stack. It is the gold standard for how things should look. Before implementing anything, check how grocery-store does it. Key files to study:
- `apps/backend/src/main/di/injections.ts` — tsyringe DI wiring
- `apps/backend/src/main/di/injection-tokens.ts` — token constants
- `apps/backend/src/api/contracts/fastify-controller.ts` — abstract controller base
- `apps/backend/src/api/controllers/market-controller.ts` — concrete controller example
- `apps/backend/src/main/fastify/register-controllers.ts` — auto-discovery pattern
- `apps/backend/src/main/fastify/types.ts` — FastifyTypedInstance type
- `apps/backend/src/main/server.ts` — startup sequence
- `orval.config.ts` — orval configuration (church will use `client: 'axios'` variant, not `react-query`)

---

## Decision Summary (22 questions answered)

### Architecture Layers — `apps/server/src/`

```
api/
  contracts/        ← abstract FastifyController base class
  controllers/      ← one class per aggregate (AdminLeaderController, VolunteerController)
  dtos/             ← Zod request/response schemas + domain→DTO mappers, per aggregate (event.dto.ts)
application/
  contracts/        ← IEventManager, IVolunteerManager, IFeatureFlagService interfaces
  db-event-manager.ts   ← implements IEventManager
  db-volunteer-manager.ts
  ...
domain/
  entities/         ← Entity classes (unchanged, already good)
  repositories/     ← IEventRepository etc interfaces + IUnitOfWork (unchanged)
  value-objects/    ← DateRange, SlotDuration, etc. with private constructor + static create()
  branded-ids/      ← EventId, ChurchId etc as branded type + namespace factory (ChurchId.from())
  errors/           ← DomainError subclasses, each with abstract readonly code: string
  services/         ← domain service interfaces
infrastructure/
  mappers/          ← DB row ↔ domain entity mappers (moved out of repositories/)
  repositories/     ← DrizzleEventRepository etc (unchanged pattern, moved here cleanly)
  services/         ← UnleashFeatureFlagService, LocalNotificationService
main/
  di/
    injection-tokens.ts
    injections.ts   ← all tsyringe registrations
  fastify/
    setup.ts        ← Fastify app factory, pino config, error handler, lifecycle hooks
    register-controllers.ts
    types.ts        ← FastifyTypedInstance
  server.ts         ← entrypoint: registerInjections → registerControllers → listen
```

### Key Decisions (verbatim from grilling)

**DI:** tsyringe with `@injectable()` + `@inject()`. Wiring in `main/di/injections.ts`.

**Application layer:** Aggregate managers. `IEventManager` interface + `DbEventManager` implementation. One class per aggregate, not one per action. tsyringe token per interface.

**Transport:** Drop tRPC entirely. Raw Fastify + `fastify-type-provider-zod`. Abstract `FastifyController` with `prefix` + `registerRoutes(app, opts)`. Controllers auto-discovered via tsyringe `resolveAll`.

**Frontend client:** orval with `client: 'axios'` — generates typed async functions, NOT hooks. Output to `apps/web/src/infrastructure/api/`. Frontend hooks remain hand-written calling those typed functions.

**API versioning:** `/api/v1/` prefix from day one. Set at `app.register(registerControllers, { prefix: '/api/v1' })` in server.ts.

**Value Objects:** Full VO layer. Private constructor + static `create()` owns invariants. Branded IDs use type + namespace: `type ChurchId = string & { __brand: 'ChurchId' }` + `namespace ChurchId { export function from(raw: string): ChurchId }`. First VO target: `DateRange`.

**packages/core:** Stays minimal — `Entity` base class, `DomainError` (gains `abstract readonly code: string`), `BrandedId` utility. All domain-specific types stay in `apps/server/src/domain/`.

**Mappers:** Split. `infrastructure/mappers/` for DB↔domain. `api/dtos/` for domain↔HTTP response (co-located with Zod schemas).

**Error handling:** Centralized Fastify `setErrorHandler`. Domain errors carry `readonly code` (e.g. `'INVALID_DATE_RANGE'`). One mapping table: `error.code → { httpStatus, body }`. Controllers never touch error translation. Success: controllers set explicit status codes (201 POST, 204 DELETE, 200 GET/PATCH).

**Auth:** Controller-level `preHandler` hook as default. `AdminLeaderController` registers auth + role check. `VolunteerController` registers auth only. Per-route override for exceptions.

**Import boundaries:** `eslint-plugin-boundaries` enforces the layer graph at lint time:
- `api/` → `application/` only
- `application/` → `domain/` + `infrastructure/` interfaces only
- `domain/` → `packages/core` only
- `infrastructure/` → `domain/` + `packages/db` + `packages/core` only
- `main/` → anything (wiring layer)

**UnitOfWork:** Managers own transactions. `IUnitOfWork` injected via tsyringe. Repos accept optional `tx` param.

**Logging:** Fastify `onResponse` hook logs `method`, `url`, `statusCode`, `durationMs` automatically. Auth middleware decorates `request.userId` + `request.churchId`. Pino serializer picks them up. JSON in prod, pretty-print in dev. Application-level events logged explicitly in managers.

**Scalar/Swagger:** Dev/staging only. Gated `NODE_ENV !== 'production'`. `auto-generated-api.yaml` committed to repo.

**Feature flags:** Unleash, self-hosted Docker everywhere (docker-compose for dev, VPS for prod). `IFeatureFlagService` in `application/contracts/`. `UnleashFeatureFlagService` in `infrastructure/services/`. Frontend reads flags via backend proxy `GET /api/v1/feature-flags` — Unleash token never client-side. Migrate existing `VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE` env var to Unleash toggle.

**CI/CD:** GitHub Actions (no `.github/` exists yet — must create). Fast gate on every PR: `check-types` + `biome check` + unit tests + boundary lint (~2 min). E2E on merge to `master` only. Also verify: server build → orval → web typecheck.

**Lefthook additions:** Add `pre-push` job: `turbo check-types test` (unit only, parallel). `--no-verify` for WIP.

**Coverage:** `domain/` → 100% branch coverage. `application/` → 80% line coverage. `infrastructure/` → no threshold (contract tests cover it).

**Naming (Biome-enforced):** `camelCase` variables/functions, `PascalCase` classes/types/enums, `SCREAMING_SNAKE_CASE` module-level constants. Add `useNamingConvention` rule to `biome.json`.

**Naming (CLAUDE.md convention):** `I`-prefix for interfaces (`IEventManager`). File suffixes: `.dto.ts`, `.manager.ts`, `.repository.ts`, `.mapper.ts`, `.controller.ts`.

**Renovate:** Add `renovate.json`. Group patch/minor into weekly batch PR, auto-merge patches that pass CI, major bumps as separate PRs.

**Env vars:** Already good. `packages/env` uses `@t3-oss/env-core` + Zod. Add `UNLEASH_API_URL` + `UNLEASH_API_TOKEN` to `packages/env/src/server.ts` when Unleash is set up.

---

## Migration Strategy

**Backend:** Big-bang, aggregate-sized batches, on a dedicated branch. Nothing ships until fully migrated.

**Per-batch order:**
1. Write **behavior tests** (transport-agnostic) — seed DB, call business logic, assert DB state + domain result. These capture current behavior without encoding tRPC wire format.
2. Migrate the aggregate — new folder structure, tsyringe DI, Fastify controller.
3. Write **HTTP contract tests** — assert new status codes (201/204/400/etc.) and new error shape `{ error: 'CODE', message }`.
4. Green → move to next batch.

**DO NOT** write tests that capture tRPC's response format (`{ result: { data: {...} } }`) — that format is being replaced, not preserved.

**Frontend:** After backend ships. Port feature by feature from `trpc.x.queryOptions()` → orval-generated axios functions. Hooks stay hand-written.

**Suggested batch order (aggregates):**
1. Auth/session (smallest surface, needed for all others)
2. Church + Ministry (read-heavy, few writes)
3. Volunteer (dashboard, availability, notifications)
4. Event + TimeSlot (core scheduling domain)
5. Assignment (depends on Event + Volunteer)
6. Role + Team + RoleTemplate (supplementary)

---

## What the Next Session Should Do

1. **Read the grilling session file first:**
   `manual-planning/2026-06-30-architecture-grill.md`

2. **Generate a spec / implementation plan** covering:
   - Full file structure for `apps/server/src/` under the new layout
   - Migration batch breakdown with explicit file-by-file mapping (what moves where)
   - New files to create: `main/di/injections.ts`, `main/di/injection-tokens.ts`, `main/fastify/setup.ts`, `main/fastify/register-controllers.ts`, `api/contracts/fastify-controller.ts`, etc.
   - `DomainError` change: add `abstract readonly code: string`
   - `biome.json` additions: `useNamingConvention`
   - `lefthook.yml` additions: `pre-push`
   - `.github/workflows/ci.yml` creation
   - `renovate.json` creation
   - `eslint-plugin-boundaries` config
   - Unleash docker-compose entry + `IFeatureFlagService` interface
   - orval config for `client: 'axios'`

3. **Implementation should use `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`** workflow or equivalent. Each batch should be a separate branch and PR.

4. **Before writing any code**, check how grocery-store implements the equivalent piece. It is the reference. Deviate only when the church codebase has a legitimate reason.

---

## Suggested Skills

- `/speckit-plan` — generate the implementation plan from the grilling session decisions
- `/speckit-tasks` — break the plan into ordered, dependency-aware tasks
- `/speckit-implement` — execute tasks one by one
- `/tdd` — for each migration batch: write behavior tests first, then migrate
- `/backend-specialist` — enforce clean arch and transactional integrity during implementation
- `/commit` — semantic commits per batch

---

## Files to Read Before Starting

```
# Primary decisions
manual-planning/2026-06-30-architecture-grill.md

# Current server structure (what we're migrating FROM)
apps/server/src/
packages/core/src/
packages/env/src/server.ts
biome.json
lefthook.yml
commitlint.config.js
turbo.json

# Reference implementation (what we're migrating TOWARD)
/home/tiago/01-dev-env/personal-repos/grocery-store/apps/backend/src/main/
/home/tiago/01-dev-env/personal-repos/grocery-store/apps/backend/src/api/
/home/tiago/01-dev-env/personal-repos/grocery-store/apps/backend/src/application/
/home/tiago/01-dev-env/personal-repos/grocery-store/orval.config.ts
```

---

## Critical Constraints — Must Not Violate

- `domain/` must never import from `infrastructure/`, `api/`, or `application/`
- `api/` must never import from `infrastructure/` directly — only through injected interfaces
- Every domain error must have `readonly code: string` — no generic error responses
- Every POST returns 201, every DELETE with no body returns 204, never 200 for creation
- Controllers never call repositories directly — always through injected manager
- VOs always use private constructor + static `create()` — no `new DateRange(...)` at call sites
- Branded IDs always use namespace factory — no raw `as EventId` casts outside the factory
- tRPC must be fully removed — no `@trpc/server`, `@trpc/client`, no `protectedProcedure`
- Unleash API token never reaches the frontend
