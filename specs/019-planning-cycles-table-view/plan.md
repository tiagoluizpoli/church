# Implementation Plan: Planning Cycles Table View (Desktop, Expandable Rows)

**Branch**: `019-planning-cycles-table-view` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-planning-cycles-table-view/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Replace the desktop-width presentation of three existing Planning Cycles screens with table layouts, while leaving the current card/list layout untouched below the desktop breakpoint. The Planning cycles index and Template library become flat tables (no structural change to their data). The selected cycle's Calendar review section becomes a table with expandable rows: one collapsed row per weekday/date entry, expanding to reveal its individual time-slot rows — the one screen in this pass that needs nesting. All three screens reuse their existing data-fetching hooks unchanged (`research.md` R5); this is a presentation-only change, no new domain entities, no new API surface. The table primitive is Intent UI's registry `Table` component (shadcn CLI, `@intentui/table`), installed because no expandable-row-capable table exists in this repo's shadcn set today, per the project's Mandatory Frontend Rule (strict shadcn/ui adherence — source a community implementation rather than hand-roll a missing primitive). Scope is deliberately limited to these 3 screens; no other list-bearing screen in the app is touched.

## Technical Context

**Language/Version**: TypeScript (repo-wide strict mode), React 19

**Primary Dependencies**: TanStack Router (existing `/scheduling/planning-cycles*` routes from spec 018, unchanged), TanStack Query (existing cache/selector hooks in `planning-admin-context.tsx`, unchanged), shadcn/ui `base-lyra` style (this repo's existing primitives), **new**: Intent UI's `Table` component (shadcn-registry, installed via `npx shadcn@latest add @intentui/table` — `research.md` R1/R2) and its peer dependency `react-aria-components` (`research.md` R3)

**Storage**: N/A — no schema or persistence changes; all three screens already fetch their data via existing `adminApi` calls

**Testing**: Vitest (component tests for the new table-rendering branches in `cycle-list-card.tsx`, `template-manager-card.tsx`, `cycle-review-card.tsx`), Playwright (extend/adapt existing `apps/web/tests/scheduling/*.spec.ts` specs that already exercise these 3 screens, to assert table markup at desktop width and unchanged card markup below it)

**Target Platform**: Responsive web (desktop breakpoint `md:` / 768px+ gets the table; below it, unchanged existing mobile/tablet card layout), `apps/web`

**Project Type**: Web application — frontend-only feature within the existing full-stack monorepo; no backend change

**Performance Goals**: No explicit new performance target; must not regress the existing planning-cycles screens' load characteristics (same queries, same data volume — only the rendering path changes)

**Constraints**: Must not introduce a new breakpoint value — reuse the existing `md:` convention already used by `app-shell.tsx` (`research.md` R4); must not touch any list-bearing screen outside Planning Cycles (FR-010); must follow the repo's mandatory strict shadcn/ui component adherence — the Intent UI table is this feature's one sanctioned new primitive, not a precedent for hand-rolling others; locked-cycle read-only behavior must be preserved unchanged (FR-009)

**Scale/Scope**: 3 screens touching 3 existing components (`cycle-list-card.tsx`, `template-manager-card.tsx`, `cycle-review-card.tsx`) plus 1 new shadcn-registry component install (`table.tsx` + its Intent UI composed parts) and a handful of new presentation-only view-model types (`data-model.md`). No new routes, no new backend surface, no new persisted state.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Domain-First Architecture** — PASS. No domain change; pure presentation-layer change over already-shipped data (spec 017/018).
- **II. Full-Stack Type Safety** — PASS. No API/schema change. New view-model types (`data-model.md`) are typed aliases/derivations of already-typed orval schemas (`PlanningCycleSummary`, `PlanningTemplateSummary`, `PlanningCycleEventGroup`) — no `any`.
- **III. Container-Ready Infrastructure** — N/A. No infrastructure change.
- **IV. Environment Discipline** — N/A. No new environment variables.
- **V. Automated Code Standards** — PASS (gate re-checked at implementation time via Biome + Lefthook; the newly-generated Intent UI component file will need the same `biome check --write` normalization pass spec 018 required for its `tabs`/`breadcrumb` installs — `research.md` R1).
- **VI. Maximum Context Specification** — PASS. Traversed `manual-planning/0001-volunteer-scheduling/specifications-list.md` before this plan was written; found and applied its Mandatory Frontend Rule (strict shadcn/ui adherence — source missing primitives from the community rather than hand-build them), which directly justifies this feature's one new dependency (Intent UI's table). No specification in that list documents list/table presentation conventions to supersede — this is new ground, not a conflict with F0/F2/F5's existing decisions from spec 018.
- **VII. Explicit Parameter Contracts** — APPLIES. The new view-model types (`PlanningCyclesTableRow`, `TemplateLibraryTableRow`, `CycleCalendarTableRow`, `CycleCalendarSlotRow`, `ExpandedCalendarRowsState` — `data-model.md`) are each a separately declared, descriptively named `interface`/`type`, not inline object types. Any new row-mapping helper function takes a single named object parameter, matching this repo's existing `formatCycleDate({ date })`/`describeTemplate({ template })` convention already used in `planning-admin.utils.ts`.

No violations requiring the Complexity Tracking table — this plan adds exactly one new dependency (Intent UI's table, sanctioned by the project's own Mandatory Frontend Rule) and otherwise reuses existing patterns (existing hooks, existing breakpoint convention, existing row-mapping-util style).

## Project Structure

### Documentation (this feature)

```text
specs/019-planning-cycles-table-view/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — R1-R6
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks command — not created by /speckit-plan)
```

No `contracts/` directory: this feature adds no new API endpoint or external interface — it is a pure rendering-path change over already-contracted `adminApi` data.

### Source Code (repository root)

```text
apps/web/src/
├── components/ui/
│   └── table.tsx                                       # NEW — Intent UI registry install (+ any composed sub-parts the CLI emits alongside it)
└── features/scheduling/components/planning-admin/
    ├── cycle-list-card.tsx                              # US1: add md:-gated table-rendering branch (Planning cycles index)
    ├── template-manager-card.tsx                        # US1: add md:-gated table-rendering branch (Template library)
    ├── cycle-review-card.tsx                             # US2: add md:-gated expandable-row table branch (Calendar review)
    ├── planning-admin.types.ts                           # US1/US2: new view-model types (data-model.md)
    └── planning-admin.utils.ts                           # US1/US2: any new row-mapping helpers (named-object-param, per Constitution VII)

apps/web/tests/scheduling/
└── (extend existing specs, e.g. us1-admin-plan.spec.ts and/or a new planning-cycles-table-view.spec.ts)  # US1/US2/US3: desktop-table + narrow-viewport-unchanged assertions
```

**Structure Decision**: Frontend-only change within the existing `apps/web` app, entirely inside the already-established `features/scheduling/components/planning-admin/` directory from specs 017/018 — no new route files, no new top-level directories. The one new file is the Intent UI table primitive itself, installed into this repo's existing `apps/web/src/components/ui/` convention (where `tabs.tsx`, `breadcrumb.tsx`, and the rest of this repo's shadcn primitives already live, post the `packages/ui` dissolution — confirmed via directory listing).

## Complexity Tracking

*No violations — table not needed.*
