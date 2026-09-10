# Volunteer Scheduling — Feature Backlog

This directory tracks features and improvements that were explicitly identified and understood during the specification and grilling process, but were deferred from the MVP due to scope, complexity, or missing infrastructure.

For instructions on how to add new backlog items or edit existing ones, see the [Backlog Management Guide](./README.md).

**This file is the source of truth for order.** The backlog was reconciled against shipped code and the ordering locked by the wayfinder map [Volunteer scheduling backlog: reconcile, rank, and commit an ordering](https://github.com/tiagoluizpoli/church/issues/9) on 2026-07-26. Every ranked item below also exists as a `backlog`-labelled GitHub issue; parked and closed items are markdown-only.

---

## How to read this

- **Rank** is a strict ordinal over the whole ranked set. It is the queue.
- **Wave** restates the tier of the ordering criterion — *pain now → rework cost → new capability* — and nothing more. **No dates, no sprint sizing, no effort estimates.**
  - **Wave 1** — tier 1: broken or degraded for real users today.
  - **Wave 2** — tier 2: work that gets strictly more expensive the longer it waits.
  - **Wave 3** — tier 3: genuinely new capability.
- **Blocked by** is a real dependency, mirrored as a native GitHub `blocked by` relationship on the linked issue. Ordering preference is *not* recorded as a dependency.
- **Parked** items deliberately carry **no rank** — a rank would assert they are scheduled, which is false. Each carries a falsifiable promotion trigger instead.

> **Wave 1 is not the only thing in flight.** Spec 023's remainder — task `T058` (the full safeguard suite green plus a final `/review` across the diff) and the `023-event-builder` → `develop` merge — is a standing claim on the same delivery capacity and is deliberately unranked. `specs/023-event-builder/HANDOFF.md` is stale and must not be used to size it.

---

## Ranked Backlog

| Rank | ID | Title | Category | Wave | Blocked by | Issue |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | [BL-021](./items/BL-021.md) | Auth route protection & sign-up suppression | Authentication & Routing | 1 | — | [#18](https://github.com/tiagoluizpoli/church/issues/18) |
| 2 | [BL-007](./items/BL-007.md) | ✅ ~~Volunteer-authenticated E2E specs for the volunteer dashboard~~ — **delivered** (see [Delivered](#delivered)) | Volunteer Dashboard | 1 | — | [#19](https://github.com/tiagoluizpoli/church/issues/19) |
| 3 | [BL-017](./items/BL-017.md) | `sub_leader` role detection for nav and route guards | Backend Architecture / Auth | 1 | [BL-021](./items/BL-021.md) | [#20](https://github.com/tiagoluizpoli/church/issues/20) |
| 4 | [BL-020](./items/BL-020.md) | ✅ ~~Deleting a draft cycle event must hard-delete, not soft-cancel~~ — **delivered** (see [Delivered](#delivered)) | Scheduling / Planning (Bug) | 1 | — | [#21](https://github.com/tiagoluizpoli/church/issues/21) |
| 5 | [BL-022](./items/BL-022.md) | Cycles table: single-selection semantics | Frontend UX/IA | 1 | — | [#22](https://github.com/tiagoluizpoli/church/issues/22) |
| 6 | [BL-011](./items/BL-011.md) | Restructure controller auth and route ownership | Backend Architecture | 2 | — | [#23](https://github.com/tiagoluizpoli/church/issues/23) |
| 7 | [BL-012](./items/BL-012.md) | OpenAPI `summary`/`description` metadata across controller routes | API Documentation | 2 | [BL-011](./items/BL-011.md) | [#24](https://github.com/tiagoluizpoli/church/issues/24) |
| 8 | [BL-023](./items/BL-023.md) | `DataTable` convention wrapper over the react-aria table | Frontend Architecture | 2 | [BL-022](./items/BL-022.md) | [#25](https://github.com/tiagoluizpoli/church/issues/25) |
| 9 | [BL-024](./items/BL-024.md) | `WorkspaceHeader` primitive + Cycles header parity | Frontend Architecture | 2 | — | [#26](https://github.com/tiagoluizpoli/church/issues/26) |
| 10 | [BL-016](./items/BL-016.md) | Day/event-level forced-override editing on locked planning cycles | Scheduling / Planning | 3 | [BL-020](./items/BL-020.md) | [#27](https://github.com/tiagoluizpoli/church/issues/27) |
| 11 | [BL-015](./items/BL-015.md) | Church-wide time-format configuration | Frontend UX/IA | 3 | — | [#28](https://github.com/tiagoluizpoli/church/issues/28) |

---

## Parked

Real gaps that are **not queued**. Each has a written promotion trigger: a falsifiable condition that, when it happens, moves the item into the ranked table. The threshold for usage-gated items is deliberately the **second occurrence** — one request is an anecdote, two is a pattern.

Parked items have no rank and no GitHub issue.

| ID | Title | Category | Promotion trigger |
| :--- | :--- | :--- | :--- |
| [BL-003](./items/BL-003.md) | Volunteer exclusion from the cycle rail by leader | Schedule Builder | A leader asks to hide a specific volunteer from the rail, **or** is observed repeatedly assigning someone who turns out to be unavailable-but-unmarked. One real instance promotes it. |
| [BL-004](./items/BL-004.md) | Separate "Now Serving" section for in-progress assignments | Volunteer Dashboard | A volunteer reports confusion about what is happening *now* versus later, **or** the dashboard gains a third competing section — at which point the hierarchy has to be revisited anyway and the split rides along. |
| [BL-005](./items/BL-005.md) | Configurable cooldown for repeated availability reminders | Volunteer Dashboard | A volunteer complains about reminder frequency, **or** a report shows repeated resends to the same `(volunteer, cycle)` pair within a short window. |
| [BL-008](./items/BL-008.md) | `MinistryServingProfile` authoring UX polish | Scheduling Reshape (017) | A leader or admin hand-copies the same block matrix onto a **third** ministry or template, **or** a cycle generation seeds something the author says they did not expect — that second case is the deferred preview asking for itself. |
| [BL-009](./items/BL-009.md) | Free-standing role-count presets (ex-`RoleTemplate`) | Scheduling Reshape (017) | A leader wants the same named `(role → count)` bundle on a **second** dynamic event and copy-from-profile does not reach it. |
| [BL-010](./items/BL-010.md) | Per-ministry `Shift` model refinements | Scheduling Reshape (017) | **Two triggers, one per half.** *Reusable shift layouts*: a ministry hand-recreates the same non-default split on a second cycle. *Cross-ministry visibility*: two ministries sharing one `TimeSlot` mis-coordinate their splits and one asks to see the other's. Either trigger promotes only its own half — this item never returns whole. |
| [BL-019](./items/BL-019.md) | Volunteer response health report for leaders | Volunteer Scheduling / Leader Operations | **Decision-gated, not usage-gated.** Requires both open product decisions settled — retention period for response history, and which follow-up actions belong in the product — **plus** at least three planning cycles of real response history to report on. |
| [BL-025](./items/BL-025.md) | Dedup `denyParticipationScope`/`denyShiftScope` across `leader-controller.ts` and `leader-rostering-controller.ts` | Backend Architecture | A third controller needs the identical scope-guard shape, **or** [BL-011](./items/BL-011.md)'s auth-hook-factory work lands and touches either file anyway. |
| [BL-026](./items/BL-026.md) | Volunteer dashboard has no visible state for zero Church access | Volunteer Dashboard | A User reports (or QA observes) a blank dashboard after losing Church access, **or** [#54](https://github.com/tiagoluizpoli/church/issues/54) lands and defines the system-wide no-access presentation. |
| [BL-027](./items/BL-027.md) | No `AbortSignal` wiring for in-flight requests | Frontend Architecture / Data Layer | A confirmed incident (or reproducible test) where a stale-context request lands after an Active Church switch, **or** a second, unrelated need for true request cancellation shows up. |
| [BL-028](./items/BL-028.md) | Centralize test trees and make repository rules agent-enforceable | Repository Architecture / Test Infrastructure / Agent Governance | The next planned implementation that adds, moves, or substantially rewrites a unit, component, integration, contract, or test-support file, **or** one additional test file is added beside production code after 2026-08-11. |
| [BL-029](./items/BL-029.md) | Planning managers read wall-clock `new Date()`, so time-relative tests rot | Test Infrastructure / Scheduling (Planning managers) | A **second** time-rot failure lands on `master` or blocks a PR (a dated test failing only because the wall clock moved past its fixtures), **or** a planned change needs a clock injected into `DbPlanningEventManager` / `DbPlanningCycleManager` for a feature reason. |

---

## Closed during reconciliation

Items that left the active table on 2026-07-25/26. Their files remain in `items/` with the verdict recorded at the top, so the history is not lost.

| ID | Title | Verdict | Evidence |
| :--- | :--- | :--- | :--- |
| [BL-001](./items/BL-001.md) | Real-time builder updates on availability change | **Already resolved** — shipped | `use-cycle-builder.ts:314-319` sets `refetchInterval: 30_000` + `refetchOnWindowFocus: true` on the whole cycle-builder payload, which carries `eligibleVolunteers` availability status. Polling was one of the item's own named options; badges now self-refresh within 30s with no reload, which is its stated success condition. |
| [BL-013](./items/BL-013.md) | Split controllers/routes by domain instead of by caller-role | **Absorbed into [BL-011](./items/BL-011.md)** | The two items rewrite the structure of the same six controller files and each invalidates the other's diff. Merged by [Controller cluster (BL-011/012/013): one effort or three?](https://github.com/tiagoluizpoli/church/issues/11); every success criterion carried over. |
| [BL-018](./items/BL-018.md) | Native `<input type="date">` instead of a shadcn date-picker | **Already resolved** — shipped as asked | `apps/web/src/components/date-picker-field.tsx` is exactly the shared shadcn `Calendar` + `Popover` field requested, and the sweep is complete: **zero** `type="date"` inputs remain in `apps/web/src` or `packages/ui/src`. |

---

## Delivered

Ranked items completed through implementation. The rank ordinal is kept in the table above (struck through) so the queue history stays intact.

| ID | Title | Delivered | Evidence |
| :--- | :--- | :--- | :--- |
| [BL-007](./items/BL-007.md) | Volunteer-authenticated E2E specs for the volunteer dashboard | 2026-09-10 | Storage-state swap + seed change shipped in `e3bf3b8`, merged via `8c7cc38`. All five `apps/web/tests/volunteer-dashboard/` specs run under `VOLUNTEER_STORAGE_STATE`; verified **5 passed** under volunteer auth. No authorization defect surfaced — no follow-up tier-1 item. |
| [BL-020](./items/BL-020.md) | Deleting a draft cycle event must hard-delete, not soft-cancel | 2026-09-10 | Decided delete/cancel split shipped in `230e308`, merged via #113 / `1c2b943`. `cancelEvent` hard-deletes on `status === 'draft'` through the new `PlanningEventRepository.deleteEvent` (cascade-safe), soft-cancels otherwise; generator untouched. Regression tests cover delete-then-regenerate, idempotent re-run, partial delete, non-resurrection; `validate:affected` + full unit/integration green. Unblocks [BL-016](./items/BL-016.md); time-rot cause parked as [BL-029](./items/BL-029.md). |

---

## Ordering criterion

Locked before ranking, and applied to every item above:

1. **Pain now** — what is broken or degraded for real users today.
2. **Rework cost** — work that gets strictly more expensive the longer it waits.
3. **New capability** — genuinely new surface nobody is blocked on.

Per-item reasoning lives in the map's closed tickets: [reconciliation](https://github.com/tiagoluizpoli/church/issues/10) · [late arrivals](https://github.com/tiagoluizpoli/church/issues/16) · [controller cluster](https://github.com/tiagoluizpoli/church/issues/11) · [volunteer-facing cluster](https://github.com/tiagoluizpoli/church/issues/13) · [delete vs cancel](https://github.com/tiagoluizpoli/church/issues/12) · [frontend table/header cluster](https://github.com/tiagoluizpoli/church/issues/17) · [the ranking itself](https://github.com/tiagoluizpoli/church/issues/14).
