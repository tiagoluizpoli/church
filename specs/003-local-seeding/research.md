# Phase 0: Research & Architecture Decisions

**Feature**: Local Development Seeding

## 1. Seeding Script Location

**Decision**: The seeding utility will reside entirely within the `packages/db` workspace. The entry point will be `packages/db/src/seed/index.ts`, executed via a dedicated package script (`bun run seed`).

**Rationale**: The seeder is deeply coupled with the database schema and Drizzle ORM. By placing it inside `packages/db`, it has direct access to the raw schema definitions and connection utilities without creating circular dependencies. It also simplifies the turborepo orchestration, as other apps (like a future `apps/api` or `apps/admin`) can depend on a pre-seeded database without owning the seeding logic.

**Alternatives considered**:
- *Dedicated `apps/cli` workspace*: Rejected because it would require exposing the entire schema and write-operations from `packages/db` purely for local seeding, increasing boundary complexity unnecessarily.

## 2. Deterministic Mock Data Generation

**Decision**: We will use `@faker-js/faker` combined with a fixed global seed initialized at the start of the script. We will explicitly call `faker.seed(12345)` (or similar constant) before any factory execution. 

**Rationale**: Calling `faker.seed()` guarantees that the pseudo-random number generator produces the exact same sequence of values on every execution. This ensures that generated entity IDs, names, dates, and relational bindings are 100% reproducible across different developer machines and CI environments.

**Alternatives considered**:
- *Drizzle Seed (`drizzle-seed` plugin)*: While newer and built for Drizzle, it can sometimes be restrictive for highly specific business logic (like ensuring a volunteer is only assigned to a slot that matches their role). `faker.js` provides the granular control needed for complex domain structures.
- *Static JSON files*: Rejected because maintaining static data for 3 churches with dozens of entities becomes brittle and hard to update when the schema changes. Code-based factories are much more maintainable.
