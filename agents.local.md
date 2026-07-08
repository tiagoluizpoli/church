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
- **Parameter Contract Rule**: Application functions, methods, constructors, and call-facing handlers that receive data must use one object parameter, even for a single value. Every object shape used for parameters, variables, return values, joined records, or type assertions/casts MUST be declared separately with a descriptive `interface` or `type`; inline object typing is forbidden in touched files. This includes patterns such as `input: { ... }`, `const value: { ... }`, and `request.params as { ... }`. Zero-argument functions and callbacks whose signatures are controlled by an external API are exempt from the single-object-parameter rule, but any additional object typing in touched files still must use a named type. Fix existing violations in any code you modify.
- **Backend Development**:
  - Always engage `backend-specialist` and `test-backend` skills for architectural decisions and validation.
  - Prioritize known, solid Design Patterns (refer to Refactoring Guru) for complex logic rather than custom abstractions.
  - Enforce clean boundaries between layers (persistence, domain, infrastructure).
- **Frontend Development**:
  - Components must be built on top of shadcn/ui.
  - Do not create custom UI components from scratch if they exist in shadcn.
  - Adhere to Bulletproof React structure and unidirectional architecture.
- **Linter & Code Guidelines Compliance**:
  - Never use linter, formatter, or compiler bypass/suppression directives (such as `// biome-ignore`, `// eslint-disable`, `// @ts-ignore`, etc.) without the user's explicit prior permission. All guidelines must be strictly satisfied by refactoring the code or file structure.
- **Phase-by-Phase Implementation Loop (CRITICAL)**:
  - Feature implementation, bug fixes, or plans for the current volunteer-dashboard lane MUST progress phase by phase.
  - The agent should complete the whole current phase before stopping for manual review, unless blocked by an approval, failing safeguard, or a material product decision.
  - Within each phase (after coding but before declaring the phase complete):
    - Run tests targeting the modified files.
    - Execute the project's verification and safeguard commands:
      1. `bun run check` (Linter and formatter)
      2. `bun run check-types` (TypeScript compilation checks)
      3. `bun run test` (Vitest unit/integration tests)
      4. `bun run test:e2e` (Playwright E2E tests)
    - Immediately after executing the safeguards, run a code review focusing on the modified files (using the `/review` workflow or `code-review` skill).
    - If any lint issue, type-checking mismatch, test failure, or code review finding is discovered, it MUST be patched and resolved immediately within the current task iteration.

## Current Plan Reference
<!-- SPECKIT START -->
- Current Plan: [specs/020-cycle-review-editing/plan.md](specs/020-cycle-review-editing/plan.md)
<!-- SPECKIT END -->
