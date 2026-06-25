# Local Agent Context

## Project Architecture
- **Backend**: Domain-Driven Design (DDD) + Clean Architecture. All domain logic, routers, and services are implemented inside the server application (`apps/server`, named `@church/server`).
- **Frontend**: Vite + React 19 (CSR). Follow [Bulletproof React](https://github.com/alan2207/bulletproof-react) structure:
  - `src/app`: Application-level routes, providers, and router.
  - `src/features/[name]`: Feature-specific logic (api, components, hooks, types).
  - `src/components`, `src/hooks`, `src/lib`, `src/utils`: Shared modules.
- **Unidirectional Architecture**: Flow moves from `shared` -> `features` -> `app`.
  - `shared` cannot import from `features` or `app`.
  - `features` cannot import from `app` or other `features`.
  - `app` can import from anything.
- **Security**: Use server-side actions/functions for backend-sensitive operations to prevent credential leaks.
- **Isolation**: Strict multi-tenant isolation via `church_id`.

## Tech Stack
- Bun, TypeScript 5+
- Fastify, React 19, Vite, tRPC, Better Auth
- PostgreSQL (via Drizzle ORM)
- Biome (Linting/Formatting)

## Specific Guidelines
- **General**: 100% Type Safety. Strictly follow Karpathy Guidelines (Simple, Pragmatic, No Speculation).
- **Typing Rule**: No inline object typing in function signatures, method parameters, or similar call-facing contracts. Every non-trivial parameter shape must be named as a separately declared `type` or `interface`. When touching existing code that violates this rule, fix it as part of the change instead of deferring it.
- **Backend Development**:
  - Always engage `backend-specialist` and `test-backend` skills for architectural decisions and validation.
  - Prioritize known, solid Design Patterns (refer to Refactoring Guru) for complex logic rather than custom abstractions.
  - Enforce clean boundaries between layers (persistence, domain, infrastructure).
- **Frontend Development**:
  - Components must be built on top of shadcn/ui.
  - Do not create custom UI components from scratch if they exist in shadcn.
  - Adhere to Bulletproof React structure and unidirectional architecture.

## Current Plan Reference
<!-- SPECKIT START -->
- Current Plan: [specs/011-admin-leader-api/plan.md](specs/011-admin-leader-api/plan.md)
<!-- SPECKIT END -->
