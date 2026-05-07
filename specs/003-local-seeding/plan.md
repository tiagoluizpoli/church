# Implementation Plan: Local Development Seeding

**Branch**: `003-local-seeding` | **Date**: 2026-05-06 | **Spec**: [003-local-seeding/spec.md](spec.md)
**Input**: Feature specification from `specs/003-local-seeding/spec.md`

## Summary

The feature provides a local development seeding utility to populate a clean database with realistic, interconnected, and deterministic mock data across all entities (Churches, Ministries, Roles, Teams, Volunteers, Events, and Slots). 

> [!NOTE]
> **Refactor Phase (2026-05-06)**: Following a architectural review, the initial monolithic seeder is being refactored into a modular factory-based system to ensure SRP compliance and better maintainability.

## Technical Context

**Language/Version**: Bun (latest), TypeScript 5+
**Primary Dependencies**: Drizzle ORM, Faker.js, @base-fullstack-template/env
**Storage**: PostgreSQL (via Drizzle ORM)
**Testing**: Vitest, Biome
**Project Type**: Monorepo (Turborepo)
**Performance Goals**: Sub-10s execution for seeding
**Constraints**: Type-safe boundaries, domain-driven, strictly multi-tenant (`church_id`)

## Constitution Check

- [x] **I. Domain-First**: The domain model is aligned with the persistence layer schema.
- [x] **II. Type Safety**: Drizzle ORM used with strict infer types.
- [x] **III. Container-Ready**: Uses local PostgreSQL.
- [x] **IV. Env Discipline**: Uses `@base-fullstack-template/env/server`.
- [x] **V. Code Standards**: Adheres to Biome and Karpathy Guidelines.
- [x] **VI. Maximum Context**: Architectural review performed by Backend Specialist.

## Project Structure (Refactored)

### Source Code (`packages/db/`)

```text
packages/db/
├── src/
│   ├── client.ts           # [NEW] Dedicated Drizzle client isolation
│   ├── schema/             # Drizzle schemas
│   ├── seed/
│   │   ├── index.ts        # CLI Entry point & Orchestrator
│   │   ├── constants.ts    # [NEW] Seeding configuration & magic numbers
│   │   ├── utils.ts        # [NEW] Shared utilities (Reset, Logging)
│   │   └── factories/      # [NEW] SRP-compliant entity factories
│   │       ├── church.factory.ts
│   │       ├── ministry.factory.ts
│   │       ├── volunteer.factory.ts
│   │       ├── scheduling.factory.ts
│   │       └── assignment.factory.ts
└── package.json            # Consolidated scripts (removed scripts/seed.ts)
```

## Refactoring Decisions

1. **SRP Factories**: Move logic from `index.ts` to individual files in `factories/` to avoid the "huge file" anti-pattern.
2. **Client Isolation**: Create `src/client.ts` to prevent redundant connections and provide a clean import for the whole package.
3. **Automated Reset**: Replace the manual `db.delete` list with a `TRUNCATE CASCADE` loop for future-proof database clearing.
4. **Functional Completion**: Implement `assignment` and `availability` generation to fulfill FR-006.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Multiple Factories | Ensure SRP | Single file is too large and hard to test/maintain. |
| Automated Truncate | Future-proofing | Manual list requires constant updates when schema changes. |
