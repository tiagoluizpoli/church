<!--
## Sync Impact Report
- Version change: 1.2.0 → 1.3.0
- List of modified principles:
  - II. Full-Stack Type Safety (tRPC → Fastify + orval + OpenAPI)
- Updated: Tech Stack table API row, Core Rules Monorepo Boundaries import pattern
- Templates requiring updates: None
-->

# Church Constitution

## Core Principles

### I. Domain-First Architecture
Every feature starts with a clear domain definition and planning. Implementation follows the 
agreed-upon domain models and business logic specified in the `planning/` directory.

### II. Full-Stack Type Safety
End-to-end type safety is non-negotiable. Use Fastify + orval + OpenAPI for API boundaries, Zod for runtime 
validation, and Drizzle for database interactions. Avoid `any` at all costs.

### III. Container-Ready Infrastructure
All infrastructure must be reproducible via Docker Compose. The `docker-compose.yml` is the 
single source of truth for the local development environment.

### IV. Environment Discipline
Environment variables must be strictly managed via `.env` files and validated using the 
`@church/env` package. Never commit secrets; always provide `.env.example` 
templates.

### V. Automated Code Standards
Adhere to Biome for linting and formatting. Lefthook manages pre-commit hooks to ensure every 
commit passes quality gates (linting, conventional commits).

### VI. Maximum Context Specification
When planning or specifying a feature (e.g., via the `speckit.specify` or `speckit.plan` commands), the process MUST begin by locating the feature's `manual-planning/[xxxx]-feature/specifications-list.md` file. The specification and plan must traverse and analyze all related documentation files linked within that list to establish maximum context before proceeding.

## Technology Stack

| Category | Tool | Purpose |
|---|---|---|
| Runtime | Bun | High-performance JS runtime and package manager |
| Backend | Fastify | Fast and low overhead web framework for the server |
| Frontend | React 19 + Vite | Modern UI development with fast HMR |
| Documentation | Fumadocs (React Router) | Documentation framework |
| Styling | Tailwind CSS v4 | Utility-first styling with high performance |
| Database | Drizzle ORM + PG | Type-safe SQL and schema management |
| Auth | Better Auth | Unified authentication framework |
| API | Fastify + orval | Type-safe HTTP API via OpenAPI contract and generated typed functions |
| Orchestration | Turborepo | High-performance build system for monorepos |

## Core Rules

- **Domain Driven**: Business logic must be separated from framework-specific code.
- **Monorepo Boundaries**: Shared packages (`packages/*`) must only contain generic, non-application-specific code (e.g., `@church/db` for database connection and schema, `@church/env` for env schemas and parsing, `@church/ui` for generic UI primitives). All application-specific server implementation, domain logic, and routes must live inside the server application (`apps/server`, named `@church/server`). Client applications must import server API definitions via orval-generated typed functions from `apps/web/src/infrastructure/api/`.
- **Workspace Scope**: All package and application names are scoped under the `@church` namespace.
- **Atomic Commits**: Use conventional commits and keep changes small and focused.
- **Strict Linting**: Biome must pass before any commit.
- **Documentation First**: Significant changes must be planned in the `planning/` directory.
- **Maximum Context**: All planning and specifications must traverse the complete tree of documentation linked in `specifications-list.md`.

## Governance

- This constitution is the supreme law of the project.
- Amendments require a version bump and updates to all dependent templates.
- Compliance is verified during code reviews and via automated CI/CD checks.

**Version**: 1.3.0 | **Ratified**: 2026-05-03 | **Last Amended**: 2026-07-01
