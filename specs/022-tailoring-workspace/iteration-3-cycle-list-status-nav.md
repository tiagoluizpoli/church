# Iteration 3: Cycle-List Real Columns, Tailoring-Progress Status, Filters & Row Navigation

**Feature Branch**: `022-tailoring-workspace` (amendment)

**Created**: 2026-07-13

**Status**: Draft — not yet implemented. Spec/plan/tasks/data-model/research updated in place to reconcile this; see each file's Iteration 3 markers.

**Supersedes**: User Story 2's original two-sentence scope (`spec.md`, "Choose which cycle to tailor for a given ministry") and FR-005/FR-006 as originally written. Everything else in the original spec and Iteration 2 (ministry list, tailoring workspace calendar/filters/slot editing, batched availability fire) is unchanged and still authoritative.

**Origin**: User-supplied requirements, processed through the `prompt-optimizer` skill twice (first pass caught a scope/terminology tangle in a voice-transcribed brain-dump; second pass structured a fuller, more precise follow-up spec after live implementation revealed real gaps), then two rounds of `AskUserQuestion` clarification during a live `/impeccable critique` → fix loop on the actual cycle-picker screen. This file is that reconciled request, filed here per the same "don't lose the decision record" convention as `iteration-2-filters-and-row-save.md`.

> **⚠️ Breaks an existing constraint, deliberately**: every prior part of this spec (`plan.md`'s Technical Context, `tasks.md`'s Path Conventions) states "no backend changes" / "frontend-only." Iteration 3 is the first part of this feature that is **not** frontend-only — it requires a new nullable column on `ministry_participation` and a new backend aggregation endpoint. This is called out explicitly wherever it matters (`plan.md`, `tasks.md`, `data-model.md`) rather than silently overridden.

---

## Why this file exists instead of editing `spec.md` directly

Same rationale as `iteration-2-filters-and-row-save.md` §"Why this file exists": `spec.md` documents what was actually built and critiqued. This iteration changes real, already-shipped acceptance criteria for User Story 2 (the cycle-picker screen got a first pass — `Card`/`surface-panel` wrapper, Name/Window/Events/Status columns, a "Cycles N" pill — during this same working session, tracked informally, not yet in `tasks.md` as its own phase). Rather than silently rewriting that shipped-but-unspecified work's history, it's filed here as a dated amendment, then reconciled into `spec.md`/`research.md`/`data-model.md`/`plan.md`/`tasks.md` directly (see each file's Iteration 3 markers) so those five stay the single source of truth.

## Decisions (resolved — do not re-ask)

These were open questions raised during this iteration's own drafting; resolved via `AskUserQuestion` before any spec or code changes were made:

1. **The "Status" column is not `PlanningCycle.state`.** The cycle-picker's Status badge, as first shipped this session, showed `PlanningCycle.state` (`draft`/`locked`/`archived`) — always `locked` here, since this screen already hard-filters to locked cycles server-side. That was a genuine misunderstanding, not a bug in what was asked. The leader actually wants a **tailoring-progress** status: has my ministry not started, started, or finished its tailoring work for this cycle. This is a different axis entirely, sourced from `MinistryParticipation.state`, not `PlanningCycle.state`.
2. **The terminal status is the real domain `published` state**, not `availability_fired`. `MinistryParticipation`'s real lifecycle (`packages/db/src/schema/enums.ts` / `apps/server/src/domain/entities/ministry-participation.ts`) is a strict 4-stage sequence: `tailoring → availability_fired → rostering → published`, and `published` is only reachable once rostering is 100% staffed (or explicitly confirmed below-full) — a phase downstream of and outside this feature. Resolved via `AskUserQuestion`: the leader-facing 3rd status genuinely means this real `published` state, not the earlier `availability_fired` milestone (see research.md R15 for the full domain-model contradiction this surfaced and how it was resolved, including why this makes "In progress" a wide bucket spanning three real states).
3. **A new `touchedAt` column is the right mechanism**, not inference from existing rows. No field distinguishes "this participation has been edited at least once while still in `tailoring` state" today. Resolved via `AskUserQuestion` in favor of a new nullable `touched_at` timestamp on `ministry_participation` (set once, on first write) over inferring "touched" from the existence of `ParticipationSlotInclusion`/`Shift`/`SlotRequirement` rows, which is ambiguous when a leader explicitly excludes every slot (looks identical to never having touched the cycle at all).

## Part A — Status: 3-way, derived, aggregated per cycle

Replace the current `Status` badge (`PlanningCycle.state`, always "locked" on this screen) with a 3-way leader-facing tailoring-progress status, computed per cycle by aggregating **every `MinistryParticipation` this ministry has across every event in that cycle**:

- **Not started**: every participation's `touchedAt` is `null`.
- **Published**: every participation's `state` is `published`.
- **In progress**: everything else — this is the default/middle bucket, and it deliberately spans three real states (touched-but-still-`tailoring`, `availability_fired`, `rostering`) plus any mixed combination across a cycle's multiple events (e.g. one event published, another still in `rostering`).

The aggregation rule for both boundaries is **"all participations must reach X"** — a single un-touched or un-published participation anywhere in the cycle keeps the whole cycle out of "Not started" or "Published" respectively. This is a documented default (research.md R16), not a re-litigated open question; revisit only if it produces a visibly wrong status against real seeded data during implementation.

`PlanningCycle.state` ("locked") may still render somewhere on the row as a secondary, muted indicator if useful during implementation — it must not be confused with, or share a component slot/label with, the new tailoring-progress status again.

## Part B — Batch aggregation endpoint (no per-row fetches)

**Corrected 2026-07-13, post-`/speckit-analyze` (findings I1/I2)** — see the correction banner at the top of data-model.md's "New in Iteration 3" section for the full before/after. One backend call per ministry cycle-list page load returns, for **every locked cycle church-wide** (not only cycles this ministry already participates in — the earlier draft of this iteration scoped the endpoint to ministry-inclusive cycles only, which silently made Part C's "Not part of" filter value impossible to back with real data):

- Cycle name and date span (`PlanningCycle.name`/`startDate`/`endDate`) — folded into this endpoint so it is the *sole* data source for the list, not split across this endpoint plus the existing `listEvents`/`listPlanningCycles` calls.
- `isPartOf`: whether this ministry has ≥1 event in the cycle at all — backs all three Ministry Involvement filter values (All / Part of / Not part of), not just the "excluded from the list" case the first draft assumed.
- Event count and slot count (slot count = `ParticipationSlotInclusion` rows across every `MinistryParticipation` this ministry has in that cycle, not the event's total slot count) — both `0` when `isPartOf` is false.
- The 3-way status from Part A — `'not_started'` when `isPartOf` is false.
- A separate, finer boolean: whether availability has been fired for **every** participation in the cycle — needed by Part D's Builder-unlock rule, which sits at an earlier lifecycle boundary than "Published" and cannot be derived from the 3-way status alone. **Explicitly `false` (not vacuously true) when `isPartOf` is false or event count is `0`** — a cycle the ministry has no involvement in must never show an enabled Builder Events button.

Explicitly **not** in scope for this endpoint: N individual `getCycleParticipation` calls per visible row. That pattern already exists one screen deeper (`$cycleId.tsx`) for a single cycle at a time; replicating it once per row on a list screen is the anti-pattern this endpoint exists to avoid.

## Part C — Filters

- **Date range** (start–end), replacing the current no-filter state. **Corrected 2026-07-13, post-`/speckit-analyze` (finding U2)**: no shared date-range filter component exists in this codebase (verified via `grep -rn "date.*range" apps/web/src/{components,features}` — the only hit was an unrelated code comment). Compose it from two instances of the existing `DatePickerField` (research.md R3's cited single-date picker, already used for cycle bounds elsewhere), one for start and one for end — do not spend implementation time hunting for a shared range component that isn't there.
- **Ministry Involvement**, 3-way: All / Part of / Not part of — backed by Part B's `isPartOf` boolean (now real for all three values, including "Not part of," per the Part B correction above).
- **Status**, using Part A's 3-way value: Not started / In progress / Published.

## Part D — Header stat pills

Add Events-total and Slots-total pills next to the existing "Cycles N" pill (shipped this session), matching the `StatChip` pattern already used in `$cycleId.tsx`'s header (bordered chip, label + value). Totals reflect the currently-filtered set, consistent with how a flat pill was deliberately chosen last session specifically because no filters existed yet — now that Part C ships filters in the same iteration, the pills should be filter-aware from the start rather than shipping flat and needing a second pass.

## Part E — Padding/token consistency

The `Card` wrapping the cycle-list table (shipped this session) currently uses shadcn's own default `CardContent` padding (`px-4 py-4` — flat 1rem, non-responsive, `card.tsx:75`). The page header (`WorkspaceIntroPanel`) uses the `workspace-panel-lg` design token (`padding: var(--workspace-panel-pad-lg)` — 1.25rem, 1.5rem at `md`+, `index.css:49,92,100`). Bring the Card onto the same token. This is enforcing an already-documented `DESIGN.md` standard, not introducing a new rule — apply the same fix anywhere else in this feature area with the same mismatch, not just this one screen, without going out and auditing unrelated screens outside this feature as part of this iteration.

## Part F — Row-level navigation

A dedicated action column, one row per cycle, two buttons:

- **Tailoring**: always enabled. Navigates to `/scheduling/tailoring/$ministryId/$cycleId` — formalizes what row-click already does today as an explicit, visible button (row-click MAY remain in addition to the button; it must not be the only way to navigate).
- **Builder Events**: navigates to `/scheduling/builder-events?ministryId=...` — ministry-scoped only, matching the existing single "Open builder" link already shipped in `$cycleId.tsx`'s header (`$cycleId.tsx:501-507`). Every row's Builder Events button therefore points at the same ministry-scoped destination regardless of which cycle's row it's on, since Builder Events is not cycle-aware. **Disabled** until Part B's finer "availability fired for every participation in this cycle" boolean is true — not the Part A "Published" status, which sits at a much later lifecycle boundary and would leave the button disabled long after the leader's actual reason to visit Builder Events has arrived.

Explicitly out of scope: making Builder Events itself cycle-aware (a future iteration would need its own spec to accept a `cycleId` and scope its own screen to it). Do not touch `apps/web/src/routes/scheduling/builder-events/` in this iteration beyond confirming the existing `?ministryId=` query param contract still works from a new call site.

## Part G — Nav/breadcrumb label: "Tailoring" → "Rostering" *(retroactively documented, 2026-07-14 code-review follow-up)*

The sidebar nav item and breadcrumb label for the `/scheduling/tailoring` route family were renamed from "Tailoring" to "Rostering" in `apps/web/src/components/app-shell.tsx` (`SCHEDULING_NAV_ITEM` and the new `STATIC_BREADCRUMB_OVERRIDES` map) during this iteration's implementation session, but the change shipped without a corresponding entry in this decision record — a gap caught during code review. The URL segment, route file names, e2e test IDs, and every internal reference stay `tailoring` deliberately; only the leader-facing label changed, because the product now calls this flow "Rostering" everywhere a leader actually reads it. No FR covers this rename since it's copy-only, not a behavior change — recorded here purely so it isn't undocumented drift.

## Workflow

1. Reconcile this file's decisions into `spec.md` (`## Clarifications` new session, User Story 2 rewrite, new FRs), `research.md` (R15, R16), `data-model.md` (§5 `touchedAt` field, new endpoint, new frontend aggregate), and `plan.md`/`tasks.md` (both must stop saying "no backend changes" for this iteration specifically, without changing that framing for Iterations 1–2, which remain frontend-only as shipped) — this is being done directly as part of filing this document, not deferred.
2. Backend first, test-first: schema migration (`packages/db/src/schema/participation.ts` + `db:generate`), domain entity (`MinistryParticipation.touchedAt` + a `touch()`-style method), repository/mapper updates, the new aggregation query/manager method, the new DTO + `LeaderController` route — each layer gets its own tests per this repo's existing layered-architecture test conventions (see `domain/contracts/contract-tests` for the pattern) before the frontend consumes it.
3. Regenerate the orval-generated frontend API client (`apps/web/src/infrastructure/api/`) against the new endpoint once it exists server-side — check the repo's actual codegen script before hand-writing types that would just be overwritten.
4. Frontend: `participation-tailoring.utils.ts` (new aggregation-consuming helpers, replacing `buildCycleOptions`'s current events-only derivation), `ministry-cycle-list.tsx` (new columns/filters/pills/nav buttons), `$ministryId/index.tsx` (wire the new endpoint, filters, pills).
5. Rewrite (not append to) the now-stale parts of `ministry-cycle-list.component.test.tsx` and `$ministryId/index.component.test.tsx` that assert the pre-Iteration-3 Status/columns/pill behavior shipped earlier this session — same "rewrite, don't layer" discipline `iteration-2-filters-and-row-save.md`'s Workflow step 5 already established for this feature.
6. Constitution Principle VII (Explicit Parameter Contracts) applies to every new/modified function across all four backend layers plus the frontend helpers.
7. Drive the real flow in the browser (`verify` skill) against the actual dev server — Local Ops ministry has real seeded data across multiple cycles/states useful for exercising all three status buckets and both filter axes.
8. `code-review` skill pass before commit, given this is the feature's first backend-touching change.

## Acceptance criteria

- The Status column/badge never shows `PlanningCycle.state` again on this screen; it shows one of Not started / In progress / Published, correctly aggregated across every event the ministry has in that cycle per the all-participations rule in Part A.
- No individual `getCycleParticipation`-style call fires once per visible row; the whole table's status/slot data comes from one batch response per page load.
- Date-range, Ministry Involvement, and Status filters all narrow the visible cycle list; combining more than one filter is a logical AND, not OR.
- Header pills for Cycles/Events/Slots update to reflect the currently-filtered set whenever a filter changes.
- The Card wrapping the table and the page's `WorkspaceIntroPanel` header use the same padding token; the two panels stop having visually different edge spacing.
- Every row shows a Tailoring button (always enabled) and a Builder Events button (disabled until availability has fired for every participation in that cycle), both navigating correctly.
- All rewritten tests pass; no regression in Iteration 1/2 behavior (ministry list, tailoring workspace calendar/filters/slot editing, batched fire) — none of that is touched by this iteration.

## Do not

- Do not fetch per-row participation data in a loop — this is the exact anti-pattern Part B exists to avoid.
- Do not map the leader-facing terminal status to `availability_fired` — it is the real `published` state (Decision 2). Do not map the Builder-unlock rule to `published` either — it is the availability-fired boolean (Part B/F), an earlier and distinct boundary from the status label.
- Do not infer "touched" from side-table row existence — use the new `touchedAt` column (Decision 3).
- Do not make Builder Events cycle-aware in this iteration — ministry-scoped only, matching what already exists.
- Do not silently drop the "no backend changes" framing for Iterations 1–2 when updating `plan.md`/`tasks.md` — scope the correction to Iteration 3 specifically.
- Do not overwrite or delete any existing spec/research/data-model/plan/tasks content for Iterations 1–2 while reconciling this iteration in — additive and corrective only, per explicit user instruction.
