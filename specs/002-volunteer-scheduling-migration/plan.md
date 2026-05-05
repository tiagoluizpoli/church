# Implementation Plan: Volunteer Scheduling Migration

**Branch**: `002-volunteer-scheduling-migration` | **Date**: 2026-05-04 | **Spec**: [spec.md](file:///home/tiagoluizpoli/01-dev-env/personal/church/church/specs/002-volunteer-scheduling-migration/spec.md)
**Input**: Feature specification from `/specs/002-volunteer-scheduling-migration/spec.md`

## Summary

This plan establishes the migration and initialization strategy to transition from a pure Better Auth user system to a multi-tenant domain model. It introduces a system initialization script for bootstrapping the first Church and Admin using a local `seed-data.json` file, and implements a "Soft Registration" mechanism via Better Auth hooks to lazily create Volunteer profiles upon user login.

## Technical Context

**Language/Version**: JS/TS, Bun (latest)
**Primary Dependencies**: Fastify, tRPC, Better Auth, Drizzle ORM
**Storage**: PostgreSQL
**Testing**: Vitest (Integration) [E2E deferred]
**Target Platform**: Backend Infrastructure
**Project Type**: Monorepo (Turborepo)
**Performance Goals**: Sub-500ms soft registration on login.
**Constraints**: Zero session loss during migration, strict multi-tenant isolation.
**Scale/Scope**: ~10 core tables involved in the initial domain structure.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Domain-First**: Is the domain model clearly defined in `manual-planning/`?
- [x] **II. Type Safety**: Are tRPC/Zod/Drizzle used for all new boundaries?
- [x] **III. Container-Ready**: Does `docker-compose.yml` need updates for this feature? (Postgres exists)
- [x] **IV. Env Discipline**: Are new environment variables added to `.env.example`?
- [x] **V. Code Standards**: Does the new code adhere to Biome and SOLID?
- [x] **VI. Maximum Context**: Has the full `specifications-list.md` tree been traversed and analyzed?

## Project Structure

### Documentation (this feature)

```text
specs/002-volunteer-scheduling-migration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── test-plan.md         # Phase 2 output
└── checklists/
    └── requirements.md  # Quality validation
```

### Source Code (repository root)

```text
packages/
├── auth/
│   └── src/
│       └── index.ts     # Better Auth hooks for soft registration
└── database/
    └── src/
        └── scripts/
            └── init-system.ts # Initialization script
```

**Structure Decision**: Logic is split between `packages/auth` for runtime onboarding and `packages/database` for one-time initialization.
