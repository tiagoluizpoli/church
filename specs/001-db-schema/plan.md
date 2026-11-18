# Implementation Plan: Database Schema (Phase 1)

**Branch**: `001-db-schema` | **Date**: 2026-05-03 | **Spec**: [spec.md](file:///home/tiago/01-dev-env/personal-repos/church/church/specs/001-db-schema/spec.md)
**Input**: Feature specification from `/specs/001-db-schema/spec.md`

## Summary

Implementation of the foundational database schema for the Church Volunteer Scheduling platform. This phase establishes the multi-tenant core using a `church_id` on all domain entities and defines the structural hierarchy for scheduling (Events -> TimeSlots -> Requirements). The implementation leverages Drizzle ORM for type-safe PostgreSQL schema management and migration tracking.

> [!NOTE]
> **Contextual Leadership Update (2026-05-06)**: Following an update to the DB Schema spec, leadership is no longer bound to a column (like `leader_id` on Teams), but relies entirely on the `system_role` (`leader`, `sub_leader`, `volunteer`) within the `ministry_volunteer` join table.

## Technical Context

**Language/Version**: Bun (latest), TypeScript 5+
**Primary Dependencies**: Drizzle ORM, PostgreSQL, Zod
**Storage**: PostgreSQL (via Drizzle ORM)
**Testing**: Biome (Linting/Formatting), Vitest (Integration tests)
**Target Platform**: Backend Infrastructure
**Project Type**: Monorepo (Turborepo)
**Performance Goals**: Sub-millisecond query performance for indexed tenant lookups
**Constraints**: All entities MUST include `church_id` for strict multi-tenant isolation.
**Scale/Scope**: ~15-20 core entities establishing the domain foundation.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Domain-First**: Is the domain model clearly defined in `data-model.md`?
- [x] **II. Type Safety**: Are tRPC/Zod/Drizzle used for all new boundaries?
- [x] **III. Container-Ready**: Does `docker-compose.yml` need updates for this feature? (Postgres container already exists)
- [x] **IV. Env Discipline**: Are new environment variables added to `.env.example`?
- [x] **V. Code Standards**: Does the new code adhere to Biome and SOLID?
- [x] **VI. Maximum Context**: Has the full `specifications-list.md` tree been traversed and analyzed?

## Project Structure

### Documentation (this feature)

```text
specs/001-db-schema/
├── spec.md              # Feature specification
├── plan.md              # Implementation plan (this file)
├── research.md          # Multi-tenancy and cascading delete decisions
├── data-model.md        # Drizzle entity definitions
├── quickstart.md        # Setup and migration guide
├── contracts/           # N/A (Internal DB schema)
└── tasks.md             # Implementation tasks
```

### Source Code (repository root)

```text
packages/database/
├── src/
│   ├── schema/          # Modular Drizzle schema definitions
│   │   ├── core.ts      # Church, Ministry, Team, Volunteer, Role
│   │   ├── scheduling.ts# Event, TimeSlot, SlotRequirement
│   │   ├── assignments.ts# Assignment, Availability, Audit
│   │   ├── onboarding.ts # MinistryInvitation
│   │   └── index.ts     # Main schema export
│   └── index.ts         # Client and DB connection logic
└── tests/
    └── schema/          # Integration tests for constraints and isolation
```

**Structure Decision**: Monorepo structure using `packages/database` for centralized schema management, enabling shared types across apps/services.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Contextual Leadership Update Decisions

1. **Schema Refactor**: Remove `leader_id` from the `Team` entity. `system_role` in the `ministry_volunteer` table becomes the sole source of truth for leadership designation.
2. **Integration Test Verification**: Implement SC-004 to verify that Team leadership queries successfully join through `ministry_volunteer` and rely on `system_role` instead of a dedicated team column.
