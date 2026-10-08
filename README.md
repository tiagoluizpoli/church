# church

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, Fastify, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Fastify** - Fast, low-overhead web framework
- **tRPC** - End-to-end type-safe APIs
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Biome** - Linting and formatting
- **Electrobun** - Lightweight desktop shell for web frontends
- **PWA** - Progressive Web App support
- **Timezone Policy** - Strict "UTC-First" storage with `timestamptz` and contextual local-time rendering
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM, run from the root
`docker-compose.yml` and shared by every worktree.

Each worktree gets its own generated `.env.local` (ports, URL set, secret,
and its development, integration, and E2E databases). Creating a worktree
with Worktrunk (`wt switch --create <branch>`) prepares it automatically; in
the primary checkout, run once:

```bash
bun run worktree:bootstrap
```

Machine-shared values (Unleash, optional Resend) live in `church-shared.env`
in the shared Git directory. The committed `.env.schema` files declare every
variable; there are no per-package value files. See
[docs/agents/tooling.md](docs/agents/tooling.md), "Worktree bootstrap".

Then, run the development server:

```bash
bun run dev
```

The web application and the API listen on the worktree's `CHURCH_WEB_PORT`
and `CHURCH_SERVER_PORT` (see its `.env.local`), on its private
`church-<worktree>.dev.home.arpa` hostname.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@church/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Git Hooks and Formatting

- Check formatting and lint: `bun run lint`
- Apply formatting and lint fixes: `bun run lint:fix`

## Project Structure

```
church/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
│   └── server/      # Backend API (Fastify, tRPC, domain & routers)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Data Cutover: Date & Time Seam (#171)

The `@church/time` seam (ADR-0003) changed how `Event.start`/`Event.end` and
related bounds are constructed. No live production data exists yet, so the
cutover for this change is a **reset and reseed**, not a data-repair
migration — schema changes (the TimeBlock crosses-midnight constraint drop,
the `_date` column rename) already shipped as ordinary migrations in
`packages/db/src/migrations/`.

To cut a worktree's development database over to seam-correct data,
rebuild it from clean:

```bash
bun run db:reseed:dev
```

It resets and migrates this worktree's development database, loads the
deterministic development scenario, and verifies it (see
[tooling](docs/agents/tooling.md)). Its Churches use the real Church
Timezone `America/Sao_Paulo`, so their gatherings are stored as church-local
Instants.

E2E needs no manual step: `bun run test:e2e` resets its own database before
every run, and each journey loads its own data from the server's E2E recipes
(`apps/server/seeds/e2e/`).

## Test Policy: What To Run

See [ADR-0004](docs/adr/0004-test-strategy-and-ci-gate-policy.md) for the full
policy and its trade-offs. Day to day, pick the command by what changed:

| Change type | Command |
| --- | --- |
| One file, while iterating | `bun run --cwd <app or package> test <path>` |
| Any local change, before a PR | `bun run validate:affected` |
| A story's own E2E spec, once done | `bun run test:e2e -- tests/[path].spec.ts` |
| Task branch → `develop` PR (CI) | fast gate + `validate:affected --daily-gate` |
| `develop` → `master` PR (CI) | release gate (complete validation, incl. full E2E) |
| Final handoff / merge validation | `bun run validate` |
| New Playwright spec | only if critical-journey (ADR-0004); add its `JOURNEY_MAP` entry |

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run typecheck`: Check TypeScript types across all apps
- `bun run test:unit`: Run unit and component tests
- `bun run test:integration`: Run integration tests
- `bun run validate:date-time-seam`: Fail on date-time seam suppressions and
  `date-fns` locale format tokens before pushing
- `bun run test:e2e -- tests/[path].spec.ts`: Run an affected end-to-end journey
- `bun run test`: Run the complete test suite
- `bun run validate:affected`: Validate the changed files and their affected workspaces
- `bun run validate`: Run the full final validation gate
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run db:init`: Initialize system with church, admin, and administration ministry
- `bun run db:reseed:dev`: Rebuild this worktree's development database with the development scenario
- `bun run db:clean`: Wipe all tables (truncate) for a fresh state
- `cd apps/web && bun run generate-pwa-assets`: Generate PWA assets
- `bun run dev:desktop`: Start the Electrobun desktop app with HMR
- `bun run build:desktop`: Build the stable Electrobun desktop app
- `bun run build:desktop:canary`: Build the canary Electrobun desktop app
