# Implementation Plan: Admin & Leader API (Spec A1)

**Branch**: `011-admin-leader-api` | **Date**: 2026-06-25 | **Spec**: [spec.md](file:///home/tiago/01-dev-env/personal-repos/church/church/specs/011-admin-leader-api/spec.md)

## Summary

Implement a type-safe tRPC router `adminLeaderRouter` under `apps/server/src/routers/admin-leader.ts` providing management functions for Ministry Leaders and Church Admins. The router exposes endpoints for fetching schedule builder grids, updating slot requirement staffing counts, assigning volunteers with conflict validation checks, deleting/cancelling volunteer assignments, and publishing or cancelling event schedules.

It integrates with:
- `ConflictValidationService` and `AssignmentManagerService` under a PostgreSQL transaction Unit of Work context.
- **Row Locking**: Employs `SELECT ... FOR UPDATE` row locks on the `volunteer` table to prevent concurrent overlapping assignments.
- **Error Formatting**: Implements human-friendly error wrappers on validation failures (e.g. inactive volunteer status) for clear, non-technical copy.
- **Notification Boundaries**: MVP uses standard Fastify/Node event emitters wrapped behind a `NotificationService` interface to allow seamless transition to a transactional database outbox queue in future scaling.
- **Idempotency**: Publishing logic targets ONLY `'draft'` assignments, safeguarding accepted or declined invitations from resets.

## Technical Context

**Language/Version**: TypeScript / Bun 1.1+

**Primary Dependencies**: Fastify, tRPC v10+, Zod v3+, Drizzle ORM

**Storage**: PostgreSQL (via `@church/db`)

**Testing**: Vitest (via `apps/server/vitest.config.ts`)

**Target Platform**: Linux / Docker Compose container dev environment

**Project Type**: tRPC Web API / Backend Service

**Performance Goals**: <50ms response time for local reads and writes

**Constraints**: Strict multi-tenant isolation (`churchId`) and contextual RBAC check (Ministry Leader or Church Admin).

**Scale/Scope**: ~6 new endpoints inside a new tRPC router with exhaustive integration tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Domain-First Architecture**: Enforced. All business logic delegates to `ConflictValidationService` and `AssignmentManagerService`.
- **Full-Stack Type Safety**: Enforced. Endpoints take validated Zod inputs and return strict TypeScript types.
- **Monorepo Boundaries**: Enforced. The API implementation and router live inside `apps/server`. Only type definitions are shared with the client.
- **Environment Discipline**: Enforced. Tenancy and secrets are managed via context and `@church/env`.
- **Automated Code Standards**: Enforced. Biome rules will be checked and formatted.

## Project Structure

### Documentation (this feature)

```text
specs/011-admin-leader-api/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (generated next)
```

### Source Code (repository root)

```text
apps/server/
├── src/
│   ├── routers/
│   │   ├── admin-leader.ts
│   │   └── index.ts
│   └── services/
└── tests/
    └── integration/
        └── routers/
            └── admin-leader.test.ts
```

**Structure Decision**: Created a new tRPC router `admin-leader.ts` under `apps/server/src/routers/` and integration tests under `apps/server/tests/integration/routers/admin-leader.test.ts`.

## Complexity Tracking

*No violations detected.*
