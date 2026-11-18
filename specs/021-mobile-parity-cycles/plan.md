# Implementation Plan: Mobile Parity & Table Bulk-Expand for Cycles

**Branch**: `021-mobile-parity-and-terminology` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-mobile-parity-cycles/spec.md`

## Summary

Five related mobile/UI gaps left after specs 019/020 shipped desktop-only: (1) a bulk expand-all/collapse-all
control for the desktop Calendar review table; (2) mobile-viewport parity for day-event/slot add/edit/delete,
via a `ResponsiveFormSurface` shell (built on the standard shadcn `drawer` component) wrapping the four
existing (desktop-only) forms;
(3) mobile parity for `useTimezone()`-driven date/time formatting, porting the same `format(...)` calls
already used by the desktop table into the mobile card list; (4) a visual-only redesign of the mobile nav
drawer's nested-item hierarchy (connector/indent treatment, no behavior change); (5) a z-index fix for the
theme toggle, which is currently unclickable on mobile because its dropdown portal and the nav drawer's
overlay both use `z-50` and collide when the dropdown opens from inside the drawer. No new backend routes,
no new domain entities — all five items reuse spec 020's already-shipped mutation endpoints and formatting
stack unchanged.

## Technical Context

**Language/Version**: TypeScript (repo-wide strict mode), React 19 (frontend)

**Primary Dependencies**: Frontend — TanStack Router/Query (existing), `vaul` (existing dependency; also the
base of the newly-installed standard shadcn `drawer` component, `apps/web/src/components/ui/drawer.tsx` —
no `package.json` change expected since `vaul` is already installed via the pre-existing bespoke
`mobile-drawer.tsx`), base-ui `Dialog`/`DropdownMenu` (existing, `src/components/ui/dialog.tsx`/
`dropdown-menu.tsx`), `useTimezone()`/`TimezoneProvider` (existing, spec 020) — no new frontend dependency
beyond the shadcn-CLI-installed `drawer.tsx` source file itself.

**Storage**: N/A — no schema/migration change, no new persistence.

**Testing**: Vitest (component tests for `ResponsiveFormSurface`'s desktop/mobile shell swap, extended
`cycle-review-card.component.test.tsx` for expand-all/collapse-all, extended `planning-event-card` tests for
timezone-formatted mobile output, extended `app-shell` tests for drawer hierarchy markup and mode-toggle
click-through at drawer-open state), Playwright (mobile-viewport E2E extending
`apps/web/tests/scheduling/planning-cycles-table-view.spec.ts` and/or a new mobile-scoped spec, using
Playwright's device emulation for viewport width).

**Target Platform**: Responsive web — this feature specifically targets the mobile breakpoint (below the
existing `md:` convention) that specs 019/020 explicitly left out of scope. `apps/web` only (no backend
changes).

**Project Type**: Web application — frontend-only change within the existing monorepo; no new routes/pages,
no new top-level directories, no backend/API changes.

**Performance Goals**: No explicit new performance target; all changes are presentation/interaction-layer
using already-loaded data.

**Constraints**: Must not introduce a new timezone utility — reuse `useTimezone()`. Per Constitution VI's
Mandatory Frontend Rule, the mobile form shell MUST be sourced from the standard shadcn `drawer` registry
component (installed fresh via the shadcn CLI), not hand-built or grafted onto the pre-existing, non-shadcn
bespoke `mobile-drawer.tsx` (that component is left untouched — see research.md R1's Scope note). Must
preserve locked-cycle read-only guarantee on mobile (FR-003), mirroring spec 020 FR-010. Must preserve the
existing lock-transition guard, including the mobile surface actually displaying the resulting error
(FR-010, mirroring spec 020 FR-013). Must follow the Parameter Contract Rule (Constitution VII) in every
touched file — no inline object types, single named-object parameters, including the new
`ResponsiveFormSurfaceProps` contract. The nav drawer redesign (FR-007) must not change any route, item set,
or active-state logic — visual-only, and does not migrate the nav drawer onto the new `Drawer` primitive.
"Expand all"/"Collapse all" (FR-008/FR-009) are two one-shot actions, not a stateful synced toggle, per
spec.md Assumptions.

**Scale/Scope**: ~11 frontend files: `cycle-review-card.tsx` (bulk expand/collapse handlers + toolbar
buttons), `planning-event-card.tsx` (timezone-formatted output + add/edit/delete affordances, wired to the
same handlers `calendar-row.tsx` already uses via `use-planning-admin-mutations.ts`), `ui/drawer.tsx` (new,
installed via shadcn CLI, untouched after install), `hooks/use-media-query.ts` (new, small hook), a new
`responsive-form-surface.tsx`, `quick-create-event-modal.tsx`, `edit-event-dialog.tsx`, `edit-slot-dialog.tsx`,
`create-slot-dialog.tsx` (swap `Dialog` shell for `ResponsiveFormSurface`), `dropdown-menu.tsx` (z-index
bump), `app-shell.tsx` (nav drawer hierarchy markup, still backed by the untouched `mobile-drawer.tsx`).
No new routes, no new top-level directories, no new package (the shadcn CLI install adds a source file, not
a `package.json` dependency, since `vaul` is already present), no backend/API/DB changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Domain-First Architecture** — N/A. No new domain entity or business logic; presentation-layer only.
- **II. Full-Stack Type Safety** — PASS. No new API surface; all data already flows through orval-generated
  typed `adminApi` functions from spec 020. New component prop types (`ResponsiveFormSurfaceProps`) are
  explicit named interfaces, no `any`.
- **III. Container-Ready Infrastructure** — N/A. No infrastructure change.
- **IV. Environment Discipline** — N/A. No new environment variables. (The unrelated cookie `secure`/
  `sameSite` fix in `packages/auth/src/index.ts` was a pre-existing bug fixed ahead of this feature, not
  part of its scope, and introduces no new env var — it derives its branch from the already-existing
  `BETTER_AUTH_URL`.)
- **V. Automated Code Standards** — PASS (gate re-checked at implementation time via Biome + Lefthook, same
  as specs 018/019/020).
- **VI. Maximum Context Specification** — PASS (re-verified after a `/speckit-analyze` pass caught a
  violation in this section's first draft — see Notes below). Traversed
  `manual-planning/0001-volunteer-scheduling/specifications-list.md`; the Mandatory Frontend Rule
  (`specifications-list.md:57-61` — always start from an existing shadcn/ui component, minimal
  modifications only, never hand-invent one) governs this area. Verified via the project's shadcn MCP
  tooling that the standard `drawer` component (`registry:ui`) and shadcn's own `drawer-dialog` "responsive
  dialog" example both exist in the `@shadcn` registry — `ResponsiveFormSurface` is built by installing and
  composing those, not by hand-building a new primitive or generalizing the pre-existing, non-shadcn bespoke
  `mobile-drawer.tsx` (see research.md R1). *Notes*: an earlier draft of this plan proposed generalizing
  `mobile-drawer.tsx` instead and incorrectly self-certified that as rule-compliant; a `/speckit-analyze`
  review caught this before implementation started, and research.md R1/data-model.md/this section were
  corrected to the shadcn-registry-sourced approach above.
- **VII. Explicit Parameter Contracts** — APPLIES. New `ResponsiveFormSurfaceProps` (documented in
  `data-model.md`) is a single named, separately-declared interface. No inline object types introduced in
  any touched file; any pre-existing inline object typing encountered in files this plan modifies must be
  corrected per the constitution's existing-violation rule.

No violations requiring the Complexity Tracking table — this plan adds zero new dependencies and reuses
already-shipped primitives, hooks, and mutation endpoints from specs 013/017/019/020 rather than building
new ones.

## Project Structure

### Documentation (this feature)

```text
specs/021-mobile-parity-cycles/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — R1-R5
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── mobile-ui-components.md   # Phase 1 output — no new routes, component contracts only
└── tasks.md              # Phase 2 output (/speckit-tasks command — not created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/web/src/components/
├── ui/drawer.tsx                 # NEW: installed via `bunx shadcn@latest add @shadcn/drawer`
│                                    (Constitution VI Mandatory Frontend Rule — standard shadcn
│                                    primitive; installed as-is, not modified)
├── responsive-form-surface.tsx   # NEW: Dialog (md:+) / Drawer (<md:) shell swap, following
│                                    shadcn's own drawer-dialog example pattern
├── mobile-drawer.tsx              # UNCHANGED — pre-existing nav drawer, out of scope for this
│                                    feature (see research.md R1 Scope note)
├── app-shell.tsx                 # Mobile nav drawer: redesign nested-child visual hierarchy
│                                    (connector/indent), no route/active-state change, no
│                                    primitive change
└── ui/dropdown-menu.tsx          # z-index bump so DropdownMenuContent stacks above
                                     MobileDrawer's overlay/content when nested

apps/web/src/hooks/
└── use-media-query.ts            # NEW: small window.matchMedia hook, per shadcn's drawer-dialog
                                     example — a utility hook, not a UI component

apps/web/src/features/scheduling/components/
├── quick-create-event-modal.tsx  # Swap Dialog shell for ResponsiveFormSurface
└── planning-admin/
    ├── cycle-review-card.tsx     # Add expandAll/collapseAll handlers + desktop toolbar buttons
    ├── planning-event-card.tsx   # Mobile card list: add useTimezone()-formatted date/time,
    │                                add/edit/delete affordances wired to existing mutation hooks
    ├── edit-event-dialog.tsx     # Swap Dialog shell for ResponsiveFormSurface
    ├── edit-slot-dialog.tsx      # Swap Dialog shell for ResponsiveFormSurface
    └── create-slot-dialog.tsx    # Swap Dialog shell for ResponsiveFormSurface

apps/web/tests/scheduling/
└── (extend planning-cycles-table-view.spec.ts and/or a new mobile-viewport spec)  # bulk
    expand/collapse, mobile add/edit/delete, mobile timezone formatting, locked-cycle no-affordance,
    nav-drawer hierarchy markup, mobile theme-toggle click-through
```

**Structure Decision**: Frontend-only change entirely inside `apps/web/src/{components,features/scheduling,hooks}`
— no backend files, no new routes/pages, no new top-level directories, no new package. `responsive-form-surface.tsx`
is deliberately the smallest indirection needed: it swaps an existing `Dialog` shell for the newly-installed
standard shadcn `Drawer` shell based on viewport, rather than building parallel mobile-only form components
or extending a non-standard primitive.

## Complexity Tracking

*No violations — table not needed.*
