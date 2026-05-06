# Implementation Plan: Local Development Seeding

**Branch**: `003-local-seeding` | **Date**: 2026-05-06 | **Spec**: [003-local-seeding/spec.md](spec.md)
**Input**: Feature specification from `specs/003-local-seeding/spec.md`

## Summary

The feature provides a local development seeding utility to populate a clean database with realistic, interconnected, and deterministic mock data across all entities (Churches, Ministries, Roles, Teams, Volunteers, Events, and Slots). This allows the frontend team to build and test the UI effectively without manual data entry. The technical approach involves creating a CLI tool leveraging Drizzle ORM and Faker.js to generate deterministic mock data.

## Technical Context

**Language/Version**: Bun (latest), TypeScript 5+
**Primary Dependencies**: Fastify, React 19, tRPC, Better Auth, Drizzle ORM, Faker.js
**Storage**: PostgreSQL (via Drizzle ORM)
**Testing**: Biome (Linting/Formatting)
**Target Platform**: Web / CLI
**Project Type**: Monorepo (Turborepo)
**Performance Goals**: High-performance runtime with Bun, sub-10s execution for seeding
**Constraints**: Type-safe boundaries, domain-driven, strictly multi-tenant (`church_id`)
**Scale/Scope**: Local development environment. 3 distinct churches, each with 2+ ministries, 10+ volunteers, and 5+ scheduled events.

**Unknowns**: 
- NEEDS CLARIFICATION: Where should the seeding script reside within the monorepo structure? (e.g., inside a specific package like `packages/db`, or a dedicated `apps/cli` application?)
- NEEDS CLARIFICATION: Which Faker.js instance approach should be used to guarantee true determinism across multiple interconnected relational inserts?

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Domain-First**: The domain model is aligned with the persistence layer schema defined in S1.
- [x] **II. Type Safety**: Drizzle ORM ensures type safety for DB operations.
- [x] **III. Container-Ready**: Local DB is assumed to be running via `docker-compose.yml`.
- [x] **IV. Env Discipline**: DB URL and Seeding configs will use `.env`.
- [x] **V. Code Standards**: Code will adhere to Biome.
- [x] **VI. Maximum Context**: `specifications-list.md` and related files have been traversed.

## Project Structure

### Documentation (this feature)

```text
specs/003-local-seeding/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/db/
├── src/
│   ├── schema/
│   ├── seed/
│   │   ├── index.ts        # Main seeder CLI entry point
│   │   ├── factories/      # Faker-based entity factories
│   │   └── data/           # Any static seed configurations
└── package.json
```

**Structure Decision**: The seeding utility will reside within the `packages/db` workspace, alongside the Drizzle schema and migrations, as it directly depends on the database schema definitions.
