# Implementation Plan: Tailoring Workspace Reorganization

**Branch**: `022-tailoring-workspace` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/022-tailoring-workspace/spec.md`

## Summary

Replace the flat, single-page, desktop-only `participation-tailoring.tsx` with a three-level, URL-addressable flow — ministry list → cycle list (scoped to that ministry, auto-advancing when only one cycle is open, R7) → tailoring workspace (ministry+cycle) — matching the existing `planning-cycles` nested-route convention. The tailoring workspace adds a bounded calendar built on the shadcn range-picker variant, using three distinct visual layers (fixed cycle-bounds band, event-day dot markers, and a ring/outline day-filter — never the solid "committed date" fill used elsewhere, R3), plus client-side name/time-of-day filters, on top of a flat, day-grouped slot list (`tailoring-slot-list.tsx`, which fully replaces the old nested-card `ParticipationEventCard` rendering, R2) for slot-inclusion, shift-split, and headcount editing. The workspace also guards unsaved edits with a navigation-blocking confirm (R8). No backend changes: existing mutation shapes (`setParticipationInclusions`, `splitParticipationShifts`, headcount upsert, `fireAvailability`) are reused verbatim; the "one notification per save" requirement is already satisfied server-side via the `(planningCycleId, ministryVolunteerId)` uniqueness on `AvailabilityCheck` (see research.md R4) — the fix is frontend orchestration (one user-facing save action calling `fireAvailability` per touched participation), not a new bulk endpoint. This feature also fixes a pre-existing, unrelated design-system bug (`surface-panel`'s resting box-shadow, R9) so new cards don't inherit it. One data-model note (not a migration) is recorded for a future feature: distinguishing "self-reported unavailable" from "claimed by another ministry" does not exist in the domain today and should be derived at query time, not stored (research.md R6).

**Design critique**: This plan went through an `/impeccable` pre-build critique (`.impeccable/critique/2026-07-11T21-00-35Z__kspace-tailoring-workspace-redesign-plan-pre-build.md`, score 19/40 pre-fixes) before implementation. All 2 P0s, both P1s, and the actionable P2 were resolved into R3/R2/R7/R8/R9 above per explicit user decisions; see that file for the full report.

## Technical Context

**Language/Version**: TypeScript, React 19

**Primary Dependencies**: TanStack Router (file-based routing), shadcn/ui + Tailwind CSS v4, `react-day-picker` (via existing `components/ui/calendar.tsx`), TanStack Query, orval-generated `adminApi` client

**Storage**: PostgreSQL via Drizzle ORM (`packages/db`) — no schema changes in this feature

**Testing**: Vitest + React Testing Library (component/interaction), Playwright (E2E), per constitution Quality Gates

**Target Platform**: Web (responsive: desktop table / mobile card parity, per existing `cycle-list-card.tsx` pattern)

**Project Type**: Web application (monorepo: `apps/web` frontend, `apps/server` backend, `packages/db` shared schema) — this feature touches `apps/web` only

**Performance Goals**: Calendar/filter interactions must feel instant — no network round-trip for day-click, name, or time-of-day filtering (SC-002); all filtering operates on already-fetched data

**Constraints**: Reuse existing mutation payload shapes and validation (`validateManualSpans`) unchanged; no new backend endpoints; route structure must follow the `planning-cycles` layout+index+`$id` nesting convention

**Scale/Scope**: 3 new/restructured route levels, ~6 extracted/new components, 0 schema migrations, 1 documented (not implemented) future data-model note

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Domain-First Architecture | Feature reuses the already-specified Spec 017 domain (`MinistryParticipation`, `TimeSlot`, `Shift`, `AvailabilityCheck`); traversed `manual-planning/0001-volunteer-scheduling/specifications-list.md`, `ministry-tailoring-flow.md`, ADR 0001/0002, and `CONTEXT.md` glossary before writing this plan, per Principle VI (Maximum Context) | PASS |
| II. Full-Stack Type Safety | No new API surface; continues using orval-generated `adminApi` types. No `any`/`unknown` introduced | PASS |
| III. Container-Ready Infrastructure | No infra changes | PASS (N/A) |
| IV. Environment Discipline | No env var changes | PASS (N/A) |
| V. Automated Code Standards | Biome/Lefthook gates apply as normal; no exemptions requested | PASS |
| VI. Maximum Context Specification | See row I — traversed linked docs before finalizing spec/plan | PASS |
| VII. Explicit Parameter Contracts | New components/hooks introduced by this feature (calendar day-marker builder, client-side filter predicates, ministry-list aggregate view-model) will use named `interface`/`type` object parameters, no inline object typing, per constitution | PASS (enforced during implementation, verified at `/speckit-implement` + review) |
| Phase 5 Mandatory Frontend Rule (Strict shadcn/ui Adherence) | Calendar built on the shadcn range-picker variant of `components/ui/calendar.tsx` (react-day-picker), not a from-scratch component (research.md R3, revised post-critique); `ManualSplitEditor`'s rewritten DOM uses shadcn `Select`; all other controls (checkboxes, inputs, cards, tables) reuse existing shadcn primitives | PASS |

No violations — Complexity Tracking section omitted.

## Project Structure

### Documentation (this feature)

```text
specs/022-tailoring-workspace/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

No `contracts/` directory: this feature introduces no new API contracts (all mutations reuse existing orval-generated `adminApi` functions unchanged).

### Source Code (repository root)

```text
apps/web/src/
├── routes/scheduling/
│   ├── tailoring.tsx                          # CHANGED: becomes a layout route (outlet only)
│   └── tailoring/
│       ├── index.tsx                          # NEW: Story 1 — ministry list
│       └── $ministryId.tsx                    # NEW: layout route (outlet only)
│           └── $ministryId/
│               ├── index.tsx                  # NEW: Story 2 — cycle list for one ministry
│               └── $cycleId.tsx                # NEW: Story 3+4 — tailoring workspace
│
├── features/scheduling/components/
│   ├── participation-tailoring.tsx             # CHANGED: reduced to orchestration only, or removed once split
│   ├── participation-tailoring.utils.ts        # CHANGED: extended with calendar/filter pure helpers, existing exports untouched
│   ├── tailoring/
│   │   ├── ministry-tailoring-list.tsx         # NEW: Story 1 table/card list
│   │   ├── ministry-cycle-list.tsx             # NEW: Story 2 cycle picker (route auto-advances past this when only 1 cycle open, R7)
│   │   ├── tailoring-calendar.tsx              # NEW: range-picker-based calendar — fixed cycle-bounds band + event-day dots + ring-style day-filter (R3)
│   │   ├── tailoring-filters.tsx               # NEW: name + time-of-day filter controls
│   │   ├── tailoring-slot-list.tsx             # NEW: flat, day-grouped slot list — fully replaces ParticipationEventCard's rendering role (R2), no card-in-card
│   │   └── manual-split-editor.tsx             # EXTRACTED from participation-tailoring.tsx: validation/payload logic unchanged, DOM rewritten to shadcn Select + touch-sized inputs (R2)
│   └── planning-admin/cycle-list-card.tsx      # REFERENCE ONLY: responsive pattern reused, not modified
│
├── components/ui/calendar.tsx                  # REFERENCE ONLY: range-picker variant extended, not modified
└── index.css                                   # CHANGED: remove resting box-shadow from `.surface-panel` (R9)
```

**Structure Decision**: Frontend-only change inside `apps/web`. Route tree follows the existing `planning-cycles` nested layout+index+`$id` convention one directory over (`scheduling/planning-cycles.tsx` → mirrored here as `scheduling/tailoring.tsx`). Components move from one monolithic file into a dedicated `features/scheduling/components/tailoring/` directory, consistent with how other multi-component scheduling sub-features (`planning-admin/`) are already organized. No backend (`apps/server`, `packages/db`) directories are touched.

## Complexity Tracking

*No Constitution Check violations — section not applicable.*
