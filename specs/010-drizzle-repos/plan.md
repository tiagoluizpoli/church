# Implementation Plan: Drizzle Repository Implementations (Spec R2)

**Branch**: `010-drizzle-repos` | **Date**: 2026-06-23 | **Spec**: [specs/010-drizzle-repos/spec.md](spec.md)

**Input**: Feature specification from `/specs/010-drizzle-repos/spec.md`

## Summary

Implement the concrete Drizzle ORM repositories for all domain repository contracts (from Spec R1) in `@church/server` (inside `apps/server/src/infrastructure/repositories`). These repositories will handle strict tenant isolation via `church_id` filtering, transactional integrity via a custom `DrizzleUnitOfWork` wrapping Drizzle's transaction client, and seamless mapping between Drizzle tables and pure domain entities.

## Technical Context

**Language/Version**: TypeScript / Bun (v1.1+)

**Primary Dependencies**: Drizzle ORM, PG (`pg` package), Vitest, `@church/db`, `@church/core`

**Storage**: PostgreSQL (local / docker-compose environment)

**Testing**: Vitest (integration tests against PostgreSQL)

**Target Platform**: Bun runtime

**Project Type**: Server Application Module (`apps/server`)

**Performance Goals**: Sub-10ms query execution for standard lookups; efficient relational queries using Drizzle query API

**Constraints**: Implicit `churchId` validation on all operations, UTC-only dates, Biome linting & formatting compliance

**Scale/Scope**: 9 concrete repositories, 1 unit of work, and matching integration contract tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Rule | Compliance Status | Rationale |
|------------------|-------------------|-----------|
| **Domain-First Architecture** | **Compliant** | Repositories implement domain-defined interfaces and return pure domain entities. |
| **Full-Stack Type Safety** | **Compliant** | End-to-end typing using TypeScript, Zod, and Drizzle ORM schemas. |
| **Container-Ready Infrastructure** | **Compliant** | Local PostgreSQL running in Docker Compose is utilized for running integration tests. |
| **Environment Discipline** | **Compliant** | Database credentials and env settings parsed via `@church/env`. |
| **Automated Code Standards** | **Compliant** | Biome is used for linting and formatting; pre-commit hooks verify code hygiene. |
| **Monorepo Boundaries** | **Compliant** | Schemas are shared in `@church/db`; repository implementations reside in the application server (`apps/server`). |

## Project Structure

### Documentation (this feature)

```text
specs/010-drizzle-repos/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Specification quality checklist
```

### Source Code

```text
apps/server/
├── src/
│   ├── domain/
│   │   └── repositories/
│   │       ├── contract-tests/          # Existing contract tests
│   │       └── ...                      # Existing interface definitions
│   └── infrastructure/
│       └── repositories/
│           ├── drizzle-church.repository.ts
│           ├── drizzle-ministry.repository.ts
│           ├── drizzle-volunteer.repository.ts
│           ├── drizzle-role.repository.ts
│           ├── drizzle-event.repository.ts
│           ├── drizzle-time-slot.repository.ts
│           ├── drizzle-assignment.repository.ts
│           ├── drizzle-availability.repository.ts
│           ├── drizzle-assignment-audit.repository.ts
│           ├── drizzle-unit-of-work.ts
│           ├── helpers.ts               # withChurchIsolation helper
│           ├── mappers.ts               # Domain-to-DB and DB-to-Domain mappers
│           └── index.ts                 # Export repositories
└── tests/
    └── integration/
        └── repositories/
            ├── drizzle-repos.test.ts    # Wire up & run contract tests against Drizzle
            └── setup.ts                 # Truncation and container connection setup
```

**Structure Decision**: Place all concrete implementations under `apps/server/src/infrastructure/repositories` to separate application-level infrastructure from domain interfaces, preserving the strict monorepo and DDD architectural boundaries.

## Complexity Tracking

*No violations detected.*
