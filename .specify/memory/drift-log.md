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

## 2026-07-09 Drift sync — 020-cycle-review-editing post-implementation

### Artifact changes
| Artifact | Divergence | Action taken |
|---|---|---|
| specs/020-cycle-review-editing/spec.md, plan.md, tasks.md | All tasks (T001-T040) confirmed `[x]`; spot-checked `cycle-review-card.tsx`/`planning-cycle-header.tsx` — `selected-cycle-summary`/"Manual exceptions" markers absent (removed per FR-002/FR-012), `eventCount`/`slotCount` chips present (FR-001). No drift. | No patch needed. |

### Notes
This turn's request is new scope beyond 020 (020 was desktop-only editing/timezone/header work). New asks: (1) rename "Planning Cycle" -> "Cycle" in UI copy app-wide (i18n prep), (2) table-view expand-all/collapse-all for roles, (3) mobile parity for slot/event CRUD, (4) mobile timezone formatting/auto-update parity, (5) mobile drawer nested-hierarchy visual redesign, (6) bug: theme toggle non-functional on mobile, (7) bug: 401 on volunteer/notifications after LAN-IP same-origin env change, blocking sign-in on mobile testing. Item 7 handled as immediate hotfix (blocks testing items 3-6). Item 1 handled as a mechanical copy-only sweep. Items 2-6 opened as a new spec (021) rather than amending 020 (020 is closed/shipped).

## [2026-07-11] Drift sync — develop

**Phase**: pre-check before starting new feature (021-mobile-parity-cycles active pointer)

### Artifact changes
| Artifact | Divergence | Action taken |
|---|---|---|
| specs/021-mobile-parity-cycles/spec.md | none found | no change |
| specs/021-mobile-parity-cycles/plan.md | none found (scope explicitly excludes new entities/routes; matches built code) | no change |
| specs/021-mobile-parity-cycles/tasks.md | none found | no change |

### Notes
Explore agent confirmed 021 is unrelated to the incoming tailoring-redesign work (mobile parity for cycle/event/slot CRUD only) and has zero drift from what's built. New feature "tailoring redesign" has no prior spec at all (participation-tailoring.tsx built ad hoc, pre-speckit). Proceeding to Step 4a to branch a fresh feature (022) for the tailoring reorg.
