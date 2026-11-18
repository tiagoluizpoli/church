# Feature Specification: Monorepo Architecture Reshape

**Feature Branch**: `016-architecture-reshape`

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "Church monorepo architecture reshape: DDD clean architecture, tsyringe DI, Fastify controllers, tRPC removal, orval client generation, layer boundary enforcement — based on completed grilling session 2026-06-30"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Backend Compiles and Serves Under New Structure (Priority: P1)

The backend server starts successfully under the new clean architecture layout (`api/`, `application/`, `domain/`, `infrastructure/`, `main/`). All existing business logic is present, all aggregates respond to HTTP calls at `/api/v1/`, and no tRPC dependency remains.

**Why this priority**: Without a working server nothing else can ship. This is the gate that proves the architectural migration is complete.

**Independent Test**: Seed the database, start the server, and exercise one endpoint per aggregate (create, read, delete). Each returns the correct HTTP status code (201/200/204). Server logs show structured JSON. No `@trpc/server` appears in the dependency tree.

**Acceptance Scenarios**:

1. **Given** the fully migrated backend, **When** the server starts, **Then** it binds to the configured port with no uncaught exceptions and logs `server ready` in structured JSON
2. **Given** an authenticated admin request to `POST /api/v1/events`, **When** the request body is valid, **Then** the response is `201 Created` with the created event DTO
3. **Given** an authenticated request to `DELETE /api/v1/events/:id`, **When** the event exists, **Then** the response is `204 No Content`
4. **Given** any domain validation failure (e.g. invalid date range), **When** the domain error is thrown, **Then** the response is `400` with body `{ error: 'INVALID_DATE_RANGE', message: '...' }` — no generic error text
5. **Given** an unauthenticated request to any protected route, **When** the request arrives, **Then** the response is `401` before the controller body executes
6. **Given** the dependency tree, **When** inspected for `@trpc/server` or `@trpc/client`, **Then** neither package is present

---

### User Story 2 - Import Boundary Violations Caught at Lint Time (Priority: P2)

Any change that introduces a forbidden import between architectural layers (e.g. `api/` importing directly from `infrastructure/`) fails the lint step immediately — locally via pre-commit and in CI.

**Why this priority**: Without automated enforcement the boundary rules erode over time. This is the guardrail that makes the architecture self-maintaining.

**Independent Test**: Introduce a deliberate boundary violation in a branch (e.g., add an `infrastructure/` import inside `api/controllers/`). Run the boundary linter. It must fail with a clear error identifying the offending import.

**Acceptance Scenarios**:

1. **Given** a file in `api/` that imports from `infrastructure/`, **When** the linter runs, **Then** it reports a boundary violation and exits non-zero
2. **Given** a file in `domain/` that imports from `application/`, **When** the linter runs, **Then** it reports a violation
3. **Given** a file in `main/` that imports from any layer, **When** the linter runs, **Then** no violation is reported (wiring layer is unrestricted)
4. **Given** a clean codebase with no violations, **When** the linter runs, **Then** it exits zero

---

### User Story 3 - CI Gate Passes on Every PR (Priority: P2)

Every pull request triggers a fast CI pipeline (~2 min) that enforces types, formatting, unit tests, and boundary rules. PRs that violate any gate are blocked from merging.

**Why this priority**: Local hooks can be bypassed (`--no-verify`). CI is the non-bypassable enforcement gate.

**Independent Test**: Open a PR with a deliberate type error. The CI `check-types` job must fail and block the merge. Fix the error; CI must go green.

**Acceptance Scenarios**:

1. **Given** a PR with a TypeScript type error, **When** CI runs, **Then** the `check-types` job fails and the PR is blocked
2. **Given** a PR with a Biome formatting violation, **When** CI runs, **Then** the `biome check` job fails
3. **Given** a PR with all checks passing, **When** CI runs, **Then** all jobs complete in under 2 minutes and the PR is unblocked
4. **Given** a merge to `master`, **When** CI runs, **Then** the E2E job runs in addition to the fast gate
5. **Given** a pre-push hook verifying orval output, **When** the server contract changes and orval is not re-run locally, **Then** the push is rejected with "orval output stale — run orval and commit the generated files"; web typecheck in CI runs against committed generated files

---

### User Story 4 - Frontend Typed Client Generated From Server Contract (Priority: P3)

After backend ships, the frontend accesses all server data through orval-generated typed async functions (not tRPC query hooks). Hand-written React hooks call these typed functions. No raw fetch or untyped axios calls bypass the generated contract.

**Why this priority**: Provides type safety between frontend and backend without tRPC coupling. Depends on P1 completing first.

**Independent Test**: Add a new field to an existing endpoint's response schema. Run orval. The frontend type for that response must include the new field without any manual edits. A frontend call passing the wrong type must fail at compile time.

**Acceptance Scenarios**:

1. **Given** the backend OpenAPI spec, **When** orval runs, **Then** typed async functions are generated in `apps/web/src/infrastructure/api/` with no manual edits required
2. **Given** a generated function, **When** called from a hand-written hook with the wrong argument type, **Then** TypeScript compilation fails
3. **Given** a breaking change in the server contract, **When** orval regenerates, **Then** the web typecheck step fails, surfacing the mismatch before merge
4. **Given** the generated output, **When** inspected, **Then** no React Query hooks are present — only plain async functions

---

### User Story 5 - Domain Logic Protected By Coverage Thresholds (Priority: P3)

The `domain/` layer has 100% branch coverage enforced as a hard gate. The `application/` layer has 80% line coverage. Any PR that drops coverage below these thresholds fails CI.

**Why this priority**: Domain invariants are the core of the system. Untested invariants are latent bugs. Hard gates prevent coverage erosion over time.

**Independent Test**: Remove a test that covers a branch in a value object. Run the test suite with coverage. The coverage report must show the threshold violated and exit non-zero.

**Acceptance Scenarios**:

1. **Given** a PR removing a domain branch test, **When** coverage runs, **Then** the `domain/` threshold check fails
2. **Given** all domain branches tested, **When** coverage runs, **Then** the threshold check passes
3. **Given** `application/` at exactly 80% line coverage, **When** coverage runs, **Then** the check passes
4. **Given** `infrastructure/`, **When** coverage runs, **Then** no coverage threshold is applied

---

### Edge Cases

- What happens when a domain error has no registered mapping in the error handler? System must return `500` with a generic message and log the unmapped code.
- What happens when orval cannot reach `auto-generated-api.yaml`? CI step must fail with a clear error, not silently emit empty output.
- What happens when a VO invariant is violated inside a DB mapper (e.g., persisted data no longer satisfies the VO)? The VO `create()` throws; the mapper must propagate as an infrastructure error, not a domain error.
- What happens when the Unleash server is unreachable? The feature flag service must fall back to the default value (feature off) and log a warning — never throw.
- What happens when a controller calls a manager method that doesn't exist in the interface? TypeScript compilation fails at build time.
- What happens when a branded ID is cast directly with `as EventId` outside the factory? The boundary lint rule or code review must catch it — no raw casts at call sites.
- What happens when a request body fails Zod schema validation? `setErrorHandler` catches the `ZodError` and returns `400` with body `{ error: 'VALIDATION_ERROR', message: '<zod summary>' }` — same envelope as domain errors; no Fastify default validation format leaks to clients.
- What happens when `FRONTEND_URL` is not set in production? CORS rejects all cross-origin requests — this is the safe default; `packages/env` Zod schema MUST make `FRONTEND_URL` required in production.
- What happens when `auth.api.getSession()` returns null (no session or expired)? The `preHandler` MUST reply `401` immediately; the handler body MUST NOT execute. HTTP test mocks achieve this by mocking `auth.api.getSession` via `vi.mock` to return a preset session or null per test.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The backend MUST be restructured into five top-level layers under `apps/server/src/`: `api/`, `application/`, `domain/`, `infrastructure/`, `main/`
- **FR-002**: All dependency injection MUST use tsyringe with `@injectable()` and `@inject()` decorators; DI wiring MUST be centralized in `main/di/injections.ts`
- **FR-003**: All HTTP transport MUST use raw Fastify with `fastify-type-provider-zod`; tRPC MUST be fully removed from both server and client packages
- **FR-004**: The API MUST be versioned under `/api/v1/` from the first route; controllers MUST be auto-discovered via tsyringe `resolveAll`
- **FR-005**: Every domain error MUST carry `abstract readonly code: string`; the Fastify error handler MUST map each code to a specific HTTP status and response body `{ error: code, message }`; Zod request-body validation errors (thrown by `fastify-type-provider-zod`) MUST also be caught by `setErrorHandler` and returned as `400` with body `{ error: 'VALIDATION_ERROR', message: '<zod error summary>' }` — clients handle one error shape across the entire API
- **FR-006**: Controllers MUST set explicit success status codes: `POST → 201`, `DELETE (no body) → 204`, `GET/PATCH → 200`; `200` is never used for creation
- **FR-007**: Auth enforcement MUST use controller-level `preHandler` hooks; `AdminLeaderController` applies auth + role check; `VolunteerController` applies auth only; per-route override is available for exceptions; session MUST be validated via `auth.api.getSession({ headers: request.headers })` — the Better-Auth server-side API call; `request.userId` and `request.churchId` MUST be decorated from the returned session before the handler runs
- **FR-008**: Layer import rules MUST be enforced by a static linting tool at CI time: `domain/` imports only from `packages/core`; `application/` imports only from `domain/` and `application/contracts/`; `api/` imports only from `domain/`; `infrastructure/` imports only from `application/contracts/`, `domain/`, `packages/db`, and `packages/core`; `main/` is unrestricted
- **FR-009**: All meaningful domain IDs MUST be branded types with a namespace factory (`ChurchId.from(raw)`); all meaningful domain concepts MUST be value objects with private constructor + static `create()`
- **FR-010**: DB↔domain mappers MUST live in `infrastructure/mappers/`; domain↔HTTP mappers and Zod schemas MUST live in `api/dtos/` per aggregate
- **FR-011**: Transaction boundaries MUST be owned by aggregate managers via an injected `IUnitOfWork`; repositories MUST accept an optional `tx` parameter
- **FR-012**: Fastify MUST log `method`, `url`, `statusCode`, `durationMs` for every request via `onResponse` hook; auth middleware MUST decorate `request` with `userId` and `churchId` for log serialization
- **FR-013**: API documentation (Scalar/Swagger) MUST be gated behind `NODE_ENV !== 'production'`; `auto-generated-api.yaml` MUST be committed to the repository
- **FR-014**: Feature flags MUST be served via Unleash self-hosted Docker; the frontend MUST access flags through `GET /api/v1/feature-flags` only — Unleash API token MUST never reach the client
- **FR-015**: orval MUST generate typed async functions (not React Query hooks) into `apps/web/src/infrastructure/api/` from the committed OpenAPI spec; generation MUST run in the Turbo pipeline after server build
- **FR-016**: GitHub Actions CI MUST run on every PR: type check, Biome lint, unit tests, boundary lint — completing in under 2 minutes; E2E MUST run on merge to `master` only
- **FR-017**: `lefthook.yml` MUST gain a `pre-push` job running `turbo check-types test` (unit tests only, parallel); `--no-verify` is the documented escape hatch
- **FR-018**: Test coverage MUST enforce 100% branch coverage on `domain/` and 80% line coverage on `application/` as hard gates; `infrastructure/` has no coverage threshold
- **FR-019**: Biome `useNamingConvention` MUST enforce `camelCase` for variables/functions, `PascalCase` for classes/types/enums, `SCREAMING_SNAKE_CASE` for module-level constants
- **FR-020**: `renovate.json` MUST be added at repo root; patch/minor updates MUST be grouped into weekly PRs; patches that pass CI MUST auto-merge; major bumps MUST be separate PRs
- **FR-021**: The backend migration MUST proceed in aggregate-sized batches; for each batch: (1) write transport-agnostic behavior tests, (2) migrate the aggregate, (3) write HTTP contract tests, (4) pass all tests before moving to the next batch
- **FR-022**: The migration batch order MUST follow: Auth/session → Ministry → Volunteer → Event + TimeSlot → Assignment → Role + Team + RoleTemplate; `IChurchManager` is deferred — no concrete HTTP endpoint or FR drives it in this branch; add when a use case exists
- **FR-023**: No test MUST capture tRPC response format (`{ result: { data: {...} } }`) — that format is being replaced, not preserved
- **FR-024**: `packages/core` MUST remain minimal: `Entity` base class, `DomainError` (with `abstract readonly code: string`), and `BrandedId` utility only; domain-specific types MUST stay in `apps/server/src/domain/`
- **FR-025**: The `VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE` environment variable flag MUST be migrated to an Unleash feature toggle during Unleash setup
- **FR-026**: Fastify MUST register `@fastify/cors`; allowed origin MUST be `localhost:*` when `NODE_ENV !== 'production'` and the value of `FRONTEND_URL` env var in production; `FRONTEND_URL` MUST be added to `packages/env/src/server.ts`; wildcard `*` origin MUST NOT be used in production

### Key Entities

- **Aggregate Manager**: Application-layer class implementing one interface per aggregate (e.g., `IEventManager` → `DbEventManager`); owns transaction boundaries; injected into controllers
- **FastifyController**: Abstract base class with `prefix: string` and `registerRoutes(app, opts)` contract; all concrete controllers extend it and register via tsyringe token
- **Value Object**: Domain type with private constructor and static `create()` that owns all invariants; first target is `DateRange`
- **Branded ID**: TypeScript `type + namespace` pair providing a typed factory (`ChurchId.from(raw)`); prevents raw string misuse at call sites
- **DomainError**: Base class with `abstract readonly code: string`; every subclass declares a specific code constant used for HTTP error mapping
- **IUnitOfWork**: Domain interface for transaction scope; injected into managers; implemented by `DrizzleUnitOfWork` in `infrastructure/`
- **IFeatureFlagService**: Application-layer interface for feature flag evaluation; implemented by `UnleashFeatureFlagService` in `infrastructure/services/`

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All existing business functionality works correctly after migration — zero regressions in behavior tests across all six aggregate batches
- **SC-002**: Every HTTP endpoint returns the correct status code (201/204/200/400/401/403/500) for each scenario — verified by HTTP contract tests per aggregate
- **SC-003**: The fast CI gate completes in under 2 minutes on every PR
- **SC-004**: A deliberate boundary violation (e.g., `api/` importing `infrastructure/`) causes CI to fail with a specific, actionable error message
- **SC-005**: A deliberate removal of a domain branch test causes the coverage gate to fail before merge
- **SC-006**: The frontend typechecks successfully after each orval regeneration, with zero manual type edits required
- **SC-007**: A breaking server contract change causes the CI typecheck step to fail, surfacing the mismatch before merge
- **SC-008**: Zero occurrences of `@trpc/server` or `@trpc/client` in the final dependency tree
- **SC-009**: Zero raw `as EventId` (or equivalent branded ID) casts appear outside their namespace factory definitions
- **SC-010**: All six migration batches pass their combined behavior + HTTP contract test suites before the branch is merged to `master`

## Assumptions

- The grocery-store reference repo at `/home/tiago/01-dev-env/personal-repos/grocery-store` remains available and reflects the target implementation pattern for all backend structure decisions
- The migration runs on a dedicated branch and does not ship incrementally to production — the backend ships once fully migrated
- Frontend migration from tRPC hooks to orval-generated functions occurs after backend migration is complete and merged
- `packages/env` already uses `@t3-oss/env-core` + Zod; `UNLEASH_API_URL` and `UNLEASH_API_TOKEN` will be added to `packages/env/src/server.ts` during the Unleash setup batch
- Better-Auth remains the session/auth library; auth middleware reads from Better-Auth and attaches `request.user` — same pattern as grocery-store
- Biome remains the primary linter/formatter; layer import boundary enforcement is implemented via Biome v2 `noRestrictedImports` overrides in `biome.json` — no ESLint or `eslint-plugin-boundaries` used
- No existing production data migrations are required — this is a structural and transport layer change only
- Docker Compose is already in use for local development; Unleash will be added as a new service to the existing compose file
- The desktop app (`apps/desktop`) and docs app (`apps/fumadocs`) are out of scope for this migration

---

## Clarifications

### Session 2026-07-01

- Q: When a request body fails Zod schema validation, what format should the 400 response body have? → A: Unified domain format `{ error: 'VALIDATION_ERROR', message: '<zod error summary>' }`; `setErrorHandler` catches `ZodError` — clients handle one error envelope across the entire API (applied to FR-005 + Edge Cases)
- Q: Does Fastify need CORS configured, and what origins are allowed? → A: `@fastify/cors` with env-var origin; dev allows `localhost:*`, prod allows `FRONTEND_URL` env var only; no wildcard in production (applied to FR-026 + Edge Cases + packages/env)
- Q: How does the auth `preHandler` validate the Better-Auth session? → A: `auth.api.getSession({ headers: request.headers })` server-side API call per request; null response → 401; HTTP tests mock `auth.api.getSession` via `vi.mock` (applied to FR-007 + Edge Cases)
