<!--
## Sync Impact Report
- Version change: 1.4.0 → 1.4.1
- Modified principle: VII. Explicit Parameter Contracts
- Updated: Core Rules with the expanded named object parameter and no-inline-object-typing requirement
- Templates requiring updates: None; existing Constitution Check is generic
- Follow-up TODOs: None
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

### VII. Explicit Parameter Contracts
Application functions, methods, constructors, and call-facing handlers MUST receive inputs through a
single object parameter when they require data. The object shape MUST use a separately declared,
descriptively named `interface` or `type`. Inline object typing is forbidden in modified application
code, including parameter declarations, variable annotations, return annotations, joined record shapes,
and type assertions or casts such as `value as { ... }`. Zero-argument functions and framework or
collection callbacks whose signatures are controlled by an external API are exempt from the single
object parameter requirement, but any additional object typing in modified code MUST still use a named
type. Existing violations encountered in modified code MUST be corrected as part of the change.

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
- **Named Object Parameters**: Use one object parameter with a separately declared, descriptively named `interface` or `type` for application-facing inputs. Do not use positional data parameters, inline object parameter types, or inline object annotations/assertions in modified application code. External callback signatures are exempt only where the framework controls the signature.
- **Documentation First**: Significant changes must be planned in the `planning/` directory.
- **Maximum Context**: All planning and specifications must traverse the complete tree of documentation linked in `specifications-list.md`.

## Governance

- This constitution is the supreme law of the project.
- Amendments require a version bump and updates to all dependent templates.
- Compliance is verified during code reviews and via automated CI/CD checks.

**Version**: 1.4.1 | **Ratified**: 2026-05-03 | **Last Amended**: 2026-07-03
