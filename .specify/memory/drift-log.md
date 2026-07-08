# Drift Log

## 2026-07-08 Drift sync — vibe-changes

**Phase**: N/A (full-feature sync — active feature is 018-churchwide-ux-redesign)

### Artifact changes
| Artifact | Divergence | Action taken |
|---|---|---|
| specs/018-churchwide-ux-redesign/spec.md | None — all FR-001–FR-019 and SC-001–SC-008 match shipped code | No patch needed |
| specs/018-churchwide-ux-redesign/plan.md | None — Phases 3-9 match `apps/web/src` structure as documented | No patch needed |
| specs/018-churchwide-ux-redesign/tasks.md | None — all tasks T001-T068 marked `[x]`, checkpoints confirmed | No patch needed |

### Notes
018 is fully implemented and checked in; zero drift found between its spec/plan/tasks and the built code.

The current request (replace list views with expandable-row table views on Planning Cycles screens, using the Intent UI shadcn-registry Table component) is **not covered by 018's scope** — 018's User Story 4 addressed the planning-cycle step-sequence, route restructuring, and header-chip dedup, but never touched list-vs-table presentation. This is new, unrelated scope. Proceeding to `speckit-specify` to open a new feature spec rather than amending 018.

## 2026-07-08 Drift sync — 019-planning-cycles-table-view

**Phase**: N/A (pre-implementation sync, invoked via `/speckit-implement`)

### Artifact changes
| Artifact | Divergence | Action taken |
|---|---|---|
| specs/019-planning-cycles-table-view/spec.md | None — no code built yet, nothing to diverge | No patch needed |
| specs/019-planning-cycles-table-view/plan.md | None — target files (`cycle-list-card.tsx`, `template-manager-card.tsx`, `cycle-review-card.tsx`, `planning-admin.types.ts`, `planning-admin.utils.ts`) exist as described; `apps/web/components.json` `registries` field confirmed empty `{}` matching T001's precondition | No patch needed |
| specs/019-planning-cycles-table-view/tasks.md | None — confirmed `src/components/ui/table.tsx` not yet installed (T001 pending) and no `*.component.test.tsx` files yet exist for the three target components (T006/T007/T015 preconditions hold) | No patch needed |

### Notes
Feature 019 spec/plan/tasks were authored this session and no implementation has started — verified zero drift between docs and repo state. Proceeding directly to Step 5 (`speckit-implement`).

## 2026-07-08 Drift sync — 019 post-implementation follow-on

**Phase**: N/A (new follow-on request: header merge, timezone formatting, draft-cycle day/slot editing, manual-entry restyle)

### Artifact changes
| Artifact | Divergence | Action taken |
|---|---|---|
| agents.local.md | `<!-- SPECKIT START/END -->` pointer still referenced `specs/018-churchwide-ux-redesign/plan.md`, while `CLAUDE.md`'s own pointer (and actual active work) had already moved to `specs/019-planning-cycles-table-view/plan.md`. Feature 019's own T030 checked `CLAUDE.md` only and found it already correct, missing that `agents.local.md` carries a second, separate copy of the same pointer block that had gone stale. | Updated `agents.local.md`'s pointer to `specs/019-planning-cycles-table-view/plan.md` to match `CLAUDE.md`. |
| specs/019-planning-cycles-table-view/spec.md, plan.md, tasks.md | All tasks (T001-T030) confirmed `[x]` and match shipped code (`cycle-review-card.tsx` table branch, Intent UI `table.tsx`, etc.) — feature 019 itself has no drift. | No patch needed. |

### Notes
This turn's request (merge review-body stats into the page header, church-timezone-aware date/time formatting, draft-cycle day/slot delete-and-edit UI, de-emphasize "manual exceptions" styling) is **new scope beyond 019's FRs** (019 was presentation-only: card→table, no editing affordances, no timezone handling). Investigated during sync: backend has event-level create/update/cancel (`createPlanningEvent`, `updatePlanningEvent`, `cancelPlanningEvent`) but **no slot-level delete/update endpoint exists** — user chose "full stack now" to build slot-level CRUD in this same pass rather than backlog it. Proceeding to open a new spec for this follow-on work rather than amending 019 (019 is closed/shipped).
