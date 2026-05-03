<!--
## Sync Impact Report
- Version change: [CONSTITUTION_VERSION] → 1.0.0
- List of modified principles:
  - [PRINCIPLE_1_NAME] → I. Domain-First Architecture
  - [PRINCIPLE_2_NAME] → II. Full-Stack Type Safety
  - [PRINCIPLE_3_NAME] → III. Container-Ready Infrastructure
  - [PRINCIPLE_4_NAME] → IV. Environment Discipline
  - [PRINCIPLE_5_NAME] → V. Automated Code Standards
- Added sections: Technology Stack, Core Rules, Governance
- Removed sections: None
- Templates requiring updates:
  - .specify/templates/plan-template.md (✅ updated)
  - .specify/templates/spec-template.md (✅ updated)
  - .specify/templates/tasks-template.md (✅ updated)
-->

# Church Constitution

## Core Principles

### I. Domain-First Architecture
Every feature starts with a clear domain definition and planning. Implementation follows the 
agreed-upon domain models and business logic specified in the `planning/` directory.

### II. Full-Stack Type Safety
End-to-end type safety is non-negotiable. Use tRPC for API boundaries, Zod for runtime 
validation, and Drizzle for database interactions. Avoid `any` at all costs.

### III. Container-Ready Infrastructure
All infrastructure must be reproducible via Docker Compose. The `docker-compose.yml` is the 
single source of truth for the local development environment.

### IV. Environment Discipline
Environment variables must be strictly managed via `.env` files and validated using the 
`@base-fullstack-template/env` package. Never commit secrets; always provide `.env.example` 
templates.

### V. Automated Code Standards
Adhere to Biome for linting and formatting. Lefthook manages pre-commit hooks to ensure every 
commit passes quality gates (linting, conventional commits).

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
| API | tRPC | End-to-end type-safe API communication |
| Orchestration | Turborepo | High-performance build system for monorepos |

## Core Rules

- **Domain Driven**: Business logic must be separated from framework-specific code.
- **Atomic Commits**: Use conventional commits and keep changes small and focused.
- **Strict Linting**: Biome must pass before any commit.
- **Documentation First**: Significant changes must be planned in the `planning/` directory.

## Governance

- This constitution is the supreme law of the project.
- Amendments require a version bump and updates to all dependent templates.
- Compliance is verified during code reviews and via automated CI/CD checks.

**Version**: 1.0.0 | **Ratified**: 2026-05-03 | **Last Amended**: 2026-05-03
