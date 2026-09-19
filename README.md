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

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/server/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

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

To cut an environment over to seam-correct data:

1. Apply any pending schema migrations: `bun run db:migrate`.
2. Reset and reseed from clean:
   ```bash
   bun run db:seed:reset          # truncates every table, then reseeds
   bun run db:seed:dev-users      # (optional) attaches dev login users
   ```
   (`bun run db:seed:reset:dev-users` runs both in sequence.)
3. Spot-check a church-local Instant: the seed churches carry distinct real
   IANA timezones (`America/New_York`, `America/Sao_Paulo`,
   `America/Los_Angeles`), and each gets one day-based Event (`"<Church> Day
   Retreat"`) spanning church-local midnight to end of day. For the
   `America/Sao_Paulo` church, that Event's stored `start` should read as
   `00:00` when converted to that zone, not to UTC or the machine's local
   zone — `packages/db/tests/seed.test.ts` (`#171: Cutover spot-check`)
   asserts this automatically on every `bun run test:integration` run.

E2E has its own, separate seeding path (`apps/web/tests/global-setup.ts` →
`apps/server/src/test-support/e2e-seed.ts`, invoked via
`bun run --cwd apps/server seed:e2e`) that provisions its own Churches and
fixtures per Playwright run; it needs no manual reset step beyond running the
suite (`bun run test:e2e`), which calls
`globalSetup` before every run.

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
- `bun run db:clean`: Wipe all tables (truncate) for a fresh state
- `cd apps/web && bun run generate-pwa-assets`: Generate PWA assets
- `bun run dev:desktop`: Start the Electrobun desktop app with HMR
- `bun run build:desktop`: Build the stable Electrobun desktop app
- `bun run build:desktop:canary`: Build the canary Electrobun desktop app
