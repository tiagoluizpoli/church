# Implementation Plan: Timezone & Date Policy

**Branch**: `004-timezone-date-policy` | **Date**: 2026-05-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-timezone-date-policy/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary
Implement a system-wide "UTC-First" policy for date and timezone management. This includes migrating the database to `timestamptz`, enforcing UTC normalization in the tRPC layer, and providing a contextual display toggle (Church-local vs. User-local) on the frontend.

## Technical Context

**Language/Version**: Bun (latest), TypeScript 5+
**Primary Dependencies**: date-fns, date-fns-tz, tRPC, Drizzle ORM, React 19
**Storage**: PostgreSQL (via Drizzle ORM)
**Testing**: Vitest (Unit/Integration), Playwright (E2E)
**Target Platform**: Web (Vite CSR)
**Project Type**: Monorepo (Turborepo)
**Performance Goals**: Zero-overhead timezone conversions at render time.
**Constraints**: Absolute UTC persistence, IANA name enforcement.
**Scale/Scope**: affects all date/time fields across 6+ schema files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Domain-First**: Spec S4 is part of the Persistence Layer phase.
- [x] **II. Type Safety**: Zod validation for IANA names and ISO UTC strings.
- [x] **III. Container-Ready**: No changes needed to docker-compose.
- [x] **IV. Env Discipline**: No new env vars required.
- [x] **V. Code Standards**: Biome used for all new files.
- [x] **VI. Maximum Context**: Traversed `specifications-list.md`.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/db/
├── src/schema/          # [MODIFY] Conversion to timestamptz
└── drizzle/             # [NEW] Migrations

packages/api/
└── src/                 # [MODIFY] UTC enforcement middleware

apps/web/src/
├── shared/
│   ├── components/      # [NEW] TimezoneProvider.tsx
│   ├── hooks/           # [NEW] useTimezone.ts
│   └── utils/           # [MODIFY] date.ts (date-fns-tz)
└── features/            # [MODIFY] Applying useTimezone to views
```

**Structure Decision**: Monorepo structure following the existing pattern.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Full Schema Migration | Consistency | Partial migration leads to calculation errors and confusion. |
