# Grilling Session: Backend Clean Architecture & Monorepo Reshape

Date: 2026-06-30
Status: complete
Source Skill: luna-grill-with-docs
Scope: Decide how to reshape the monorepo — clean architecture enforcement for the backend, use case/service class style, DI strategy, packages boundaries, naming conventions, and linting rules.

---

## Starting Context

**User prompt:** Before moving forward, need to grill me on infrastructure/architecture decisions. Current state is annoying. Want the repo to reflect clean architecture (especially backend): DDD, classes, shared packages that are easy to extract, linting, file naming, imports. Now is the right time before it grows.

**What the codebase shows right now:**

- Monorepo: `apps/` (server, web, desktop, fumadocs) + `packages/` (auth, config, core, db, env, ui)
- Server layers:
  - `domain/` — entities (classes ✅), repository interfaces (✅), domain services, errors
  - `infrastructure/` — Drizzle repo impls + mappers (✅)
  - `services/` — plain functions calling `repositories` global singleton (⚠️ not classes, not DI)
  - `routers/` — tRPC routes (some call repos directly, bypassing service layer ⚠️)
- `packages/core`: `Entity` base class, `BrandedId`, `DomainError`, `NotFoundError`
- Linting: Biome, kebab-case filenames enforced
- No DI container, no use case classes, no value object layer, no application layer name

**Initial reasoning for question order:**
1. Use case style (classes vs functions) is the most load-bearing decision — everything else derives from it
2. DI strategy follows from use case style
3. Layer naming/folder structure follows from DI
4. Packages boundary (what goes in `packages/core` vs server) follows from understanding what stabilizes first
5. Linting/enforcement is last — only lock in rules after structure is agreed

---

## Current Question

Session complete — all questions answered.

---

## Future Questions

None.

---

## Answered Questions

### Q22 — Automated dependency updates

Exact question:
> "Renovate or Dependabot for automated dependency PRs?"

User answer: "Add it."

Decision / takeaway:

- **Renovate** (not Dependabot) — groups patch/minor updates into weekly batch PRs, auto-merges patches that pass CI, keeps major bumps as separate PRs for manual review
- Config: `renovate.json` at repo root
- Covers: `package.json`, `bun.lock`, `docker-compose.yml`, GitHub Actions workflow versions
- Auto-merge rule: patch updates only, must pass full CI gate

Queue impact:

- None — session complete

---

### Q21 — Unleash feature flags

Exact question:
> "(1) Hosting, (2) backend DI placement, (3) frontend access strategy?"

User answer: "Self-hosted everywhere on VPS. Rest as recommended."

Decision / takeaway:

- **Hosting:** Unleash self-hosted Docker, added to `docker-compose.yml` for dev. Same Docker image on VPS for production. No Unleash Cloud.
- **Backend:** `IFeatureFlagService` interface in `application/contracts/`, Unleash Node SDK impl in `infrastructure/services/unleash-feature-flag-service.ts`, injected via tsyringe
- **Frontend:** Backend proxy endpoint `GET /api/v1/feature-flags` — server enriches context with `churchId`/`userId`, Unleash API token stays server-side only
- **Migration:** `VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE` env var flag migrated to Unleash toggle as part of Unleash setup work
- **Env:** `UNLEASH_API_URL` + `UNLEASH_API_TOKEN` added to `packages/env/src/server.ts` schema

Queue impact:

- None

---

### Q20 — Scalar/Swagger in production

Exact question:
> "API docs available in production or dev/staging only?"

User answer: "As recommended."

Decision / takeaway:

- Scalar UI, Swagger UI, and `/openapi.json` gated behind `NODE_ENV !== 'production'`
- `auto-generated-api.yaml` committed to repo for orval — no need to serve live in production
- One `if` block in Fastify setup, zero maintenance cost

Queue impact:

- None

---

### Q19 — UnitOfWork / transaction ownership

Exact question:
> "Managers own transactions with injected UnitOfWork, or repos handle internally?"

User answer: "As recommended."

Decision / takeaway:

- `IUnitOfWork` injected into managers via tsyringe
- Managers call `this.uow.run(async (tx) => { ... })` for multi-step writes
- Repos accept optional `tx` parameter — omit for single-op calls
- Transaction boundaries are explicit and visible at the orchestration layer
- `DrizzleUnitOfWork` remains in `infrastructure/`, `IUnitOfWork` interface in `domain/repositories/`

Queue impact:

- None

---

### Q18 — Structured logging

Exact question:
> "Standard enforced log shape or ad hoc?"

User answer: "As recommended."

Decision / takeaway:

- Fastify `onResponse` hook in `main/fastify/setup.ts` logs `method`, `url`, `statusCode`, `durationMs` for every request automatically
- Auth middleware decorates `request` with `userId` + `churchId` — pino serializer picks up decorated fields
- No per-controller log boilerplate for base request logging
- Application-level events logged explicitly in managers (`this.logger.info('event.published', { eventId })`) where the event is meaningful for tracing
- Log format: JSON (pino default) in production, pretty-print in dev

Queue impact:

- None

---

### Q17 — API versioning

Exact question:
> "Versioned from day one (`/api/v1/`) or start unversioned?"

User answer: "As recommended."

Decision / takeaway:

- All routes prefixed `/api/v1/` from first Fastify route
- Prefix applied at registration in `main/server.ts` (`app.register(registerControllers, { prefix: '/api/v1' })`) — not inside individual controllers
- orval config `baseUrl` will include `/api/v1`
- When a breaking change comes: register new controllers under `/api/v2` while keeping v1 alive for old clients

Queue impact:

- None

---

### Q16 — Auth middleware pattern

Exact question:
> "Controller-level preHandler, per-route, or mix?"

User answer: "As recommended."

Decision / takeaway:

- Default: `app.addHook('preHandler', authMiddleware)` at top of `registerRoutes()` — protects all routes in the controller
- Role check also at controller level where applicable: `AdminLeaderController` registers both auth + role check hook
- `VolunteerController` registers auth only
- Per-route override for exceptions (public routes inside a protected controller remove the hook explicitly)
- Auth middleware reads session from Better-Auth, attaches `request.user` — same pattern as grocery-store's `authMiddleware`

Queue impact:

- None

---

### Q15 — Migration testing strategy

Exact question:
> "Test-first per batch against tRPC routes, or test-as-you-go?"

User answer: "Two-layer split confirmed: (1) behavior tests before migration, (2) new HTTP contract tests as Fastify routes are built. tRPC wire format not captured."

Decision / takeaway:

- **Layer 1 — behavior tests (written first, per batch):** transport-agnostic. Seed DB → invoke business logic → assert DB state + domain result. Survive the migration because they don't depend on tRPC or Fastify format.
- **Layer 2 — HTTP contract tests (written as each Fastify aggregate is built):** assert new status codes (201, 204, 400, etc.), new error shape (`{ error: 'CODE', message }`), new response DTOs.
- tRPC response format (`{ result: { data: {...} } }`) is **not** captured in any test — it's being replaced, not preserved.
- Migration is safe because Layer 1 proves business behavior didn't change; Layer 2 proves the new HTTP contract is correct.

Queue impact:

- None

---

### Q14 — Naming conventions

Exact question:
> "Which naming conventions enforced by Biome vs documented as hard convention?"

User answer: "As recommended."

Decision / takeaway:

- **Biome `useNamingConvention` (lint-enforced):**
  - `camelCase` — variables, functions, method names
  - `PascalCase` — classes, types, interfaces, enums
  - `SCREAMING_SNAKE_CASE` — module-level `const` constants
- **Hard convention (CLAUDE.md, enforced at review):**
  - `I`-prefix for interfaces: `IEventManager`, `IVolunteerRepository`
  - File suffixes: `.dto.ts`, `.manager.ts`, `.repository.ts`, `.mapper.ts`, `.controller.ts`
  - These are too context-specific for Biome's general rules

Queue impact:

- None

---

### Q13 — Coverage thresholds

Exact question:
> "Hard gate or soft metric? 80% or 100%?"

User answer: "Hard gate. 100% on domain but honest pushback heard — final: 100% branch coverage on `domain/`, 80% line coverage on `application/`."

Decision / takeaway:

- `domain/`: **100% branch coverage** — every if/else path in every VO, entity, domain service must be tested. Dead code is deleted; untested invariant is a bug.
- `application/`: **80% line coverage** — high bar but not a trap for complex repo-interaction paths
- `infrastructure/`: no threshold — covered by contract tests and integration tests, not unit line %
- Vitest coverage config uses `provider: 'v8'`, `include` patterns per layer, `thresholds` per folder

Queue impact:

- None

---

### Q12 — Pre-push hook

Exact question:
> "Add pre-push hook with `check-types` + unit tests?"

User answer: "As recommended."

Decision / takeaway:

- `lefthook.yml` gains a `pre-push` job running `turbo check-types test` in parallel
- Unit tests only — E2E excluded (too slow for local hook)
- `--no-verify` is the explicit escape hatch for WIP pushes

Queue impact:

- None

---

### Q11 — CI pipeline

Exact question:
> "Add GitHub Actions CI or rely on lefthook?"

User answer: "As recommended."

Decision / takeaway:

- GitHub Actions CI on every PR: `check-types` + `biome check` + `test` (unit) + import boundary lint — fast gate ~2 min
- E2E job on merge to `master` only (expensive, not blocking PRs)
- `orval` generation verified in CI pipeline (server build → orval → typecheck web)
- Lefthook remains for local developer DX; CI is the actual enforcement gate

Queue impact:

- Q12 (pre-push hook) follows naturally

---

### Q10 — Migration strategy

Exact question:
> "Incremental (tRPC + Fastify coexist) or big-bang?"

User answer: "Big-bang backend, incremental frontend. But must be done in small batches per aggregate. Tests must be written to capture existing behavior before migration — cannot break what currently works."

Decision / takeaway:

- Backend migration: big-bang in aggregate-sized batches on a dedicated branch
- Each batch: (1) write tests capturing current behavior → (2) migrate aggregate → (3) confirm tests pass → (4) next batch
- Frontend migration: port feature by feature from tRPC client hooks to orval axios functions after backend ships
- No partial server states in production — backend ships once fully migrated

Queue impact:

- Q15 (migration testing strategy) added — must nail down test-first approach

---

### Q9 — Error + success HTTP mapping

Exact question:
> "Centralized or distributed error → HTTP translation?"

User answer: "Centralized. But no generic responses — true domain error code → HTTP code mapping. Same discipline for success: 201 for created, 204 for no content, RESTful throughout."

Decision / takeaway:

**Error side:**
- `DomainError` base class must gain an abstract `readonly code: string` property (currently has none)
- Each concrete error declares its code: `readonly code = 'INVALID_DATE_RANGE' as const`
- Fastify `setErrorHandler` maps `error.code → { httpStatus, responseBody }` — one registration table in `main/fastify/`
- Response shape: `{ error: code, message: string }` — no generic "something went wrong"

**Success side:**
- Controllers own success status codes — they know the HTTP semantics
- `POST` → `reply.status(201).send(dto)`
- `DELETE` / no-body → `reply.status(204).send()`
- `GET` / `PATCH` → `reply.status(200).send(dto)`
- No centralized success mapping needed — RESTful HTTP verbs dictate the code

Queue impact:

- `DomainError` in `packages/core` needs `abstract code` field — part of migration work

---

### Q8 — Application layer naming

Exact question:
> "One class per action (`CreateEventUseCase`) or one class per aggregate (`EventManager`)?"

User answer: "As recommended."

Decision / takeaway:

- Application layer uses aggregate managers: `EventManager` / `IEventManager`, `VolunteerManager` / `IVolunteerManager`, etc.
- Implementation prefix matches grocery-store: `DbEventManager implements IEventManager`
- File naming: `event-manager.ts` (interface) + `db-event-manager.ts` (implementation) in `application/`
- tsyringe token per interface, registered in `main/di/injection-tokens.ts`

Queue impact:

- None

---

### Q7 — Packages boundary

Exact question:
> "`packages/core` stays minimal or grows to include VOs and branded IDs?"

User answer: "As recommended."

Decision / takeaway:

- `packages/core` stays minimal: `Entity` base class, `DomainError`, `BrandedId` utility type only
- Domain-specific VOs (`DateRange`, etc.) and branded IDs (`EventId`, `ChurchId`, etc.) live in `apps/server/src/domain/`
- Promotion rule: only extract to a package when a second real consumer exists — not before

Queue impact:

- None

---

### Q6 — Static import boundary enforcement

Exact question:
> "Enforce architectural layer boundaries with a lint rule, or leave to code review?"

User answer: "As recommended."

Decision / takeaway:

- `eslint-plugin-boundaries` (or equivalent) enforces the import graph at lint time
- Allowed boundary rules: `api/` → `application/` only; `application/` → `domain/` + `infrastructure/` interfaces only; `domain/` → `packages/core` only; `infrastructure/` → `domain/` + `packages/db` + `packages/core` only; `main/` → anything (wiring layer)
- CI fails on boundary violations — same AI-guardrail philosophy as VOs and branded types

Queue impact:

- None

---

### Q5 — Mapper location

Exact question:
> "DB↔domain and domain↔DTO mappers: keep together in infra, split by concern, or something else?"

User answer: "Option B but rename `api/helpers/` → `api/dtos/`. 'Helpers' is vague; DTOs is explicit."

Decision / takeaway:

- `infrastructure/mappers/` — DB row ↔ domain entity (infra concern)
- `api/dtos/` — Zod request/response schemas + domain↔DTO mapper functions, co-located by aggregate (`event.dto.ts`, `volunteer.dto.ts`, etc.)
- `api/helpers/` name rejected — reserved for actual utilities, not DTO definitions

Queue impact:

- None — confirms `api/` subfolder naming: `controllers/`, `contracts/`, `dtos/`

---

### Q4 — Value Objects

Exact question:
> "Selective VOs only when duplication forces it, or full VO layer for all meaningful domain concepts?"

User answer: "Full VO/branded approach for everything. Reason: most code written by AI — maximum safeguards prevent type misuse. Every ID is a branded type. Concepts like DateRange are VOs with private constructor + static `create()`. Branded types get namespace factory helpers (e.g. `ChurchId.from(string)`)."

Decision / takeaway:

- All domain IDs: branded type + `namespace` with `from()` / `parse()` factory — lives in `packages/core` or domain layer
- All meaningful domain concepts: full VO class, private constructor, static `create()` that owns the invariant
- `DateRange` is the first concrete VO target (used in Event, TimeSlot, SlotRequirement)
- Invariants must never appear in constructors *and* router validation simultaneously — one source of truth: the VO/branded factory
- This also acts as an AI guardrail: the type system rejects raw primitives at call sites

Queue impact:

- Q5 (mapper location) still relevant — mappers now also translate VOs ↔ primitives for DB/API layers

---

### Q3b — Frontend typed client strategy

Exact question:
> "orval full hooks (A), orval typed axios functions only (B), or openapi-typescript + openapi-fetch (C)?"

User answer: "B."

Decision / takeaway:

- orval configured with `client: 'axios'` — generates typed async functions, not hooks
- Frontend hand-written hooks call those typed functions (same as today but typed against OpenAPI contract instead of tRPC types)
- orval runs in the Turbo pipeline after server build; reads `auto-generated-api.yaml`
- Output: `apps/web/src/infrastructure/api/` (functions + types)

Queue impact:

- No infinite query or hook-level overrides needed in orval config — keeps it simple

---

### Q3 — Folder structure / layer naming

Exact question:
> "Replicate grocery-store folder structure verbatim or adapt naming?"

User answer: "Keep exactly as is. `api/`, `application/`, `domain/`, `infrastructure/`, `main/`. Golden naming."

Decision / takeaway:

- `apps/server/src/` will mirror grocery-store: `api/`, `application/`, `domain/`, `infrastructure/`, `main/`
- Current `routers/` → `api/controllers/` + `api/contracts/`
- Current `services/` → `application/`
- Current `infrastructure/` → `infrastructure/`
- Current `domain/` → `domain/`
- New `main/` folder: DI wiring (`di/injections.ts`, `di/injection-tokens.ts`), Fastify setup, server bootstrap

Queue impact:

- Q3b (frontend typed client strategy) elevated — must decide before migration plan is complete

---

### Q2b — tRPC vs raw Fastify controllers

Exact question:
> "Do you want to keep tRPC or move to raw Fastify HTTP controllers (classes implementing a controller interface)?"

User answer: "Definitely makes more sense. tRPC was there from a template — prefer standard Fastify. Reference: grocery-store repo."

Decision / takeaway:

- Drop tRPC entirely
- Use raw Fastify with `fastify-type-provider-zod` for typed routes + OpenAPI generation
- Abstract `FastifyController` class (same shape as grocery-store: `prefix` + `registerRoutes(app, opts)`)
- Controllers registered in tsyringe under a shared token, auto-discovered at startup
- OpenAPI spec generated from Zod schemas on routes; serve both Scalar and Swagger UI
- `orval` config (noted — queued for discussion)

Queue impact:

- Q3 (layer naming) elevated to current — must settle folder structure before migration starts

---

### Q2 — DI strategy

Exact question:
> "Manual wiring, shared registry, or proper IoC container?"

User answer: "Full DI with tsyringe. Already have experience with it."

Decision / takeaway:

- tsyringe as IoC container
- `@injectable()` + `@inject()` decorators on use cases and controllers
- DI wiring centralized in `main/di/injections.ts` (mirrors grocery-store pattern)

Queue impact:

- Q2b (tRPC vs Fastify) immediately followed — class-based DI requires class-based controllers

---

### Q1 — Use case style

Exact question:
> "The `services/` folder currently holds plain functions that call a global `repositories` singleton. You said you want everything to be classes. Do you want use cases as classes with repositories injected via constructor, or are you OK with the current procedural function style — just renamed to something like `use-cases/`?"

User answer: "As recommended."

Decision / takeaway:

- Use cases are classes with repositories injected via constructor
- No more plain function orchestrators in `services/`
- Application layer must be OOP, mirroring the entity and repository patterns already in place

Queue impact:

- Q2 (DI strategy) remains — now more concrete since we confirmed class-based use cases

---

## Pruned Questions

*(none yet)*
