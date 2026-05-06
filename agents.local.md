# Local Agent Context

## Project Architecture
- Domain-Driven Design (DDD) with clear persistence, domain, and infrastructure layers.
- Strict multi-tenant isolation via `church_id`.

## Tech Stack
- Bun, TypeScript 5+
- Fastify, React 19, tRPC, Better Auth
- PostgreSQL (via Drizzle ORM)
- Biome (Linting/Formatting)

## Specific Guidelines
- 100% Type Safety.
- Components must be built on top of shadcn/ui.
- Do not create custom UI components from scratch if they exist in shadcn.

## Current Plan Reference
<!-- SPECKIT START -->
- Current Plan: [/home/tiago/01-dev-env/personal-repos/church/church/specs/003-local-seeding/plan.md]
<!-- SPECKIT END -->
